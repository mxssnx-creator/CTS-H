import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { REPLAY_SYMBOLS } from "../src/lib/desk/constants.ts";
import { HOUR_MS } from "../src/lib/desk/intervals.ts";
import { defaultForInterval, normalizeStrategies } from "../src/lib/desk/strategies.ts";
import { captureReplay, runReplay } from "./cts-h-replay.ts";

// Paper forward test of the frozen x01 configuration. No orders are sent and no account keys are read: every candle comes
// from BingX public market data. The configuration is the one in the x01 report: the coordinated profile with Axis,
// Block, DCA and Relate, on 1-hour candles.
//
// Each closed 4-hour period is run once, with the replay window ending on that period's close and 72 hours of
// prehistory before the period. A period is therefore scored only with data that existed when it closed, and the
// result is appended to the ledger the first time it is known. Nothing already in the ledger is rewritten.
//
//   run   <outDir>   freeze the configuration now and keep recording periods as they close
//   once  <outDir>   run the most recent closed period and print it, without writing the ledger (plumbing check)

const PERIOD_MS = 4 * HOUR_MS;
const SETTLE_MS = 5 * 60_000;
const PREHOURS = 72;
const HOLDOUT_HOURS = 4;
const HISTORY_HOURS = 132;
const SLIP_BPS = 1;
const CONNECTION = "bingx-x01" as const;

const [mode = "once", outDir = "reports/forward-axis"] = process.argv.slice(2);
if (mode !== "run" && mode !== "once") throw new Error("Choose run or once.");
const settings = normalizeStrategies({ ...defaultForInterval("1h"), axis: true, block: true, dca: true, relate: true });
const configHash = createHash("sha256").update(JSON.stringify(settings)).digest("hex");
const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

const ledgerPath = join(outDir, "ledger.jsonl");
const freezePath = join(outDir, "freeze.json");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const floorTo = (t: number, step: number) => Math.floor(t / step) * step;

type LedgerRow = {
  periodStart: number;
  periodEnd: number;
  net: number;
  closes: number;
  grossProfit: number;
  grossLoss: number;
  pf: number;
  drawdown: number;
  markets: number;
  configHash: string;
  commit: string;
  recordedAt: number;
};

async function scorePeriod(end: number): Promise<LedgerRow> {
  const capture = await captureReplay(CONNECTION, REPLAY_SYMBOLS, end, HISTORY_HOURS, "1h");
  const markets = capture.books.filter((book) => !book.error && book.bars.length > 0).length;
  const run = runReplay(capture, HOLDOUT_HOURS, SLIP_BPS, "coordinated", settings, {
    preHours: PREHOURS,
    selectedOnly: true,
  });
  const replay = run.variants[0]!.replay;
  return {
    periodStart: end - PERIOD_MS,
    periodEnd: end,
    net: replay.net,
    closes: replay.samples,
    grossProfit: replay.grossProfit,
    grossLoss: replay.grossLoss,
    pf: replay.pf,
    drawdown: replay.drawdown,
    markets,
    configHash,
    commit,
    recordedAt: Date.now(),
  };
}

function lastRecorded(): number | null {
  if (!existsSync(ledgerPath)) return null;
  const lines = readFileSync(ledgerPath, "utf8").trim().split("\n").filter(Boolean);
  return lines.length ? (JSON.parse(lines[lines.length - 1]!) as LedgerRow).periodEnd : null;
}

async function main(): Promise<void> {
  if (mode === "once") {
    const end = floorTo(Date.now() - SETTLE_MS, PERIOD_MS);
    const row = await scorePeriod(end);
    console.log(JSON.stringify({ ...row, note: "plumbing check, not written to the ledger" }, null, 1));
    return;
  }
  mkdirSync(outDir, { recursive: true });
  if (!existsSync(freezePath)) {
    writeFileSync(
      freezePath,
      JSON.stringify({ frozenAt: new Date().toISOString(), commit, configHash, connection: CONNECTION, profile: "coordinated", settings, prehours: PREHOURS, holdoutHours: HOLDOUT_HOURS, slipBps: SLIP_BPS, symbols: REPLAY_SYMBOLS.length }, null, 1),
    );
  }
  // Periods that close after the freeze are the only ones recorded. The first is the first boundary after the freeze.
  // Ceiling: the first recorded period starts at or after the freeze, so no period straddles it.
  let last = lastRecorded() ?? Math.ceil(Date.now() / PERIOD_MS) * PERIOD_MS;
  console.log(`forward run from ${new Date(last).toISOString()}, config ${configHash.slice(0, 12)}, commit ${commit.slice(0, 9)}`);
  for (;;) {
    const due = floorTo(Date.now() - SETTLE_MS, PERIOD_MS);
    if (due > last) {
      for (let end = last + PERIOD_MS; end <= due; end += PERIOD_MS) {
        try {
          const row = await scorePeriod(end);
          appendFileSync(ledgerPath, `${JSON.stringify(row)}\n`);
          console.log(`${new Date(end).toISOString()} net ${row.net.toFixed(3)} closes ${row.closes} PF ${row.pf.toFixed(3)} markets ${row.markets}`);
          last = end;
        } catch (error) {
          // A failed period is retried on the next pass, and is never written as if it had run.
          console.error(`${new Date(end).toISOString()} failed: ${error instanceof Error ? error.message : String(error)}`);
          break;
        }
      }
    }
    const nextAt = floorTo(Date.now(), PERIOD_MS) + PERIOD_MS + SETTLE_MS;
    await sleep(Math.max(60_000, nextAt - Date.now()));
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : "forward run failed");
  process.exitCode = 1;
});
