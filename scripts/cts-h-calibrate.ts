import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { BOOK, DEFAULT_FLOORS } from "../src/lib/desk/constants.ts";
import type { CalibratedConnection } from "../src/lib/desk/config-policy.ts";
import { HOUR_MS } from "../src/lib/desk/market.server.ts";
import { simulateSessions, type QualifiedReplay } from "../src/lib/desk/process.ts";
import { replayCosts, type Capture } from "./cts-h-replay.ts";

const PERIOD = 48;
const TRADE_FLOOR = 24;
const WINDOW_TRADE_FLOOR = 6;
const LOSING_WINDOW_FLOOR = 3;
const PF_CEILING = 0.8;

type Tally = { samples: number; grossProfit: number; grossLoss: number };
const blank = (): Tally => ({ samples: 0, grossProfit: 0, grossLoss: 0 });

function add(tally: Tally, row: QualifiedReplay) {
  tally.samples += row.samples;
  tally.grossProfit += row.grossProfit;
  tally.grossLoss += row.grossLoss;
}

export function assessCalibration(capture: Capture, ends: number[], slipBps: number) {
  const totalByKey = new Map<string, Tally>();
  const { costs } = replayCosts(capture, slipBps);
  const windows = ends.map((end) => {
    const byKey = new Map<string, Tally>();
    const replay = simulateSessions(capture.books, BOOK, DEFAULT_FLOORS, {
      end,
      costs,
      hours: PERIOD,
      size: "base",
      onQualified(row) {
        if (!row.samples) return;
        const marketKey = `${row.symbol}|${row.key}`;
        const local = byKey.get(marketKey) ?? blank();
        const total = totalByKey.get(marketKey) ?? blank();
        add(local, row);
        add(total, row);
        byKey.set(marketKey, local);
        totalByKey.set(marketKey, total);
      },
    });
    if (!replay.ready || replay.unavailable.length) {
      throw new Error(
        `${capture.connection} lacks calibration coverage on ${new Date(end).toISOString()}: ${replay.unavailable.join(", ")}.`,
      );
    }
    return { end, byKey, symbols: replay.symbols };
  });

  const configurations = [...totalByKey]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([marketKey, tally]) => {
      const evidence = windows.map(({ end, byKey }) => ({
        end,
        ...(byKey.get(marketKey) ?? blank()),
      }));
      const sufficient = evidence.filter((w) => w.samples >= WINDOW_TRADE_FLOOR);
      const losingWindows = sufficient.filter((w) => w.grossLoss > w.grossProfit + 1e-9).length;
      const winningWindows = sufficient.filter((w) => w.grossProfit > w.grossLoss + 1e-9).length;
      const excluded =
        tally.samples >= TRADE_FLOOR &&
        losingWindows >= LOSING_WINDOW_FLOOR &&
        winningWindows === 0 &&
        tally.grossLoss > 0 &&
        tally.grossProfit <= tally.grossLoss * PF_CEILING;
      return { marketKey, ...tally, losingWindows, winningWindows, excluded, evidence };
    });
  return {
    connection: capture.connection,
    symbols: capture.books.length,
    selected: configurations.filter((row) => row.excluded).map((row) => row.marketKey),
    configurations,
  };
}

function checkEnds(ends: number[], capture: Capture[]) {
  const sorted = [...ends].sort((a, b) => a - b);
  if (
    sorted.length < LOSING_WINDOW_FLOOR ||
    sorted.some(
      (end, i) =>
        !Number.isSafeInteger(end) ||
        end <= 0 ||
        end % HOUR_MS !== 0 ||
        (i > 0 && end - sorted[i - 1]! < PERIOD * 2 * HOUR_MS) ||
        capture.some((history) => end > history.end),
    )
  )
    throw new Error(
      "Supply at least three UTC cutoffs with non-overlapping 48h pre + 48h replay windows within the capture.",
    );
  return sorted;
}

async function main() {
  const { values } = parseArgs({
    options: {
      input: { type: "string" },
      end: { type: "string", multiple: true },
      policy: { type: "string" },
    },
  });
  if (!values.input || !values.end?.every((end) => end.endsWith("Z"))) {
    throw new Error(
      "Use --input candles.json and repeated --end ISO-UTC. Use --policy FILE to export TS defaults.",
    );
  }
  const history = JSON.parse(await readFile(values.input, "utf8")) as Capture[];
  const venues: CalibratedConnection[] = ["bingx-x01", "bingx-x02"];
  if (
    history.length !== venues.length ||
    venues.some((venue) => !history.some((v) => v.connection === venue))
  ) {
    throw new Error("Supply one continuous history capture per BingX signed connection.");
  }
  const ends = checkEnds(values.end.map(Date.parse), history);
  const effectiveFrom = ends.at(-1)!;
  const assessments = history.map((venue) => assessCalibration(venue, ends, 1));
  const exclusions = Object.fromEntries(
    assessments.map((item) => [item.connection, item.selected]),
  );
  const summaries = Object.fromEntries(
    assessments.map((item) => [
      item.connection,
      item.configurations
        .filter((row) => row.excluded)
        .map((row) => ({
          key: row.marketKey,
          samples: row.samples,
          pf: Number((row.grossProfit / row.grossLoss).toFixed(4)),
          losingWindows: row.losingWindows,
        })),
    ]),
  );
  if (values.policy) {
    const policy = [
      "// Generated by scripts/cts-h-calibrate.ts from closed BingX candles.",
      `export const CALIBRATION_END = ${effectiveFrom};`,
      `export const CALIBRATION_CUTOFFS = ${JSON.stringify(ends)} as const;`,
      `export const CALIBRATED_EXCLUSIONS: Record<"bingx-x01" | "bingx-x02", readonly string[]> = ${JSON.stringify(exclusions, null, 2)};`,
      `export const CALIBRATION_EVIDENCE: Record<"bingx-x01" | "bingx-x02", readonly { key: string; samples: number; pf: number; losingWindows: number }[]> = ${JSON.stringify(summaries, null, 2)};`,
      "",
    ].join("\n");
    await writeFile(values.policy, policy, { flag: "wx" });
  }
  console.log(JSON.stringify({ effectiveFrom, ends, assessments }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "CTS-H calibration failed.");
    process.exitCode = 1;
  });
}
