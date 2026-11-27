import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Bingx } from "../src/lib/desk/bingx.server.ts";
import { requireConnection } from "../src/lib/desk/connections.ts";
import { BOOK, INDICATIONS, POSITION_RT_COST_PCT, type Indication } from "../src/lib/desk/constants.ts";
import { CANDLE_INTERVALS, HOUR_MS, type CandleInterval } from "../src/lib/desk/intervals.ts";
import { positionNotional } from "../src/lib/desk/math.ts";
import { buildSeries, signalAt, type Bar, type Side } from "../src/lib/desk/process.ts";
import {
  buildMicroBook,
  enumerateMicroSets,
  type Fill,
  MICRO_GRID,
  type MicroAcc,
  MicroRun,
  type MicroSet,
  newMicroAcc,
  simulateMicro,
  summarizeMicro,
} from "../src/lib/desk/micro.ts";

// Forward runner for micro sets on a BingX connection.
//   live|replay <connection> <outDir> <interval> <setIdsFile> <symbols> <cycles> <history> <volumeFactor>
// live waits for each candle boundary before it fetches. replay walks the same candles without waiting, one candle per
// cycle, for a fast plumbing check. Both feed every closed candle through MicroRun, the state machine and accounting the
// batch simulator uses. At the end the batch simulator runs on the stored candles and each fill is compared with the
// streamed fill. The accumulator carries the bar-close equity, so the drawdown includes open positions.

const [mode = "live", connection = "bingx-x02", outDir = "", intervalText = "5m", setsPath = "", symbolsText = "100", cyclesText = "12", historyText = "300", volumeText = "0.1"] = process.argv.slice(2);
if (mode !== "live" && mode !== "replay") throw new Error("Choose live or replay.");
const interval = intervalText as CandleInterval;
const step = CANDLE_INTERVALS[interval];
const cycles = Number(cyclesText);
const history = Number(historyText);
const symbolCount = Number(symbolsText);
const notional = positionNotional(BOOK) * Number(volumeText);
const SETTLE_MS = 20_000;
const SPACING_MS = 1_250;
const HOURS = 24 * 40;
const SLOTS = (HOURS * HOUR_MS) / step;

const client = new Bingx(requireConnection(connection));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let nextSlot = 0;
async function pace(): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + SPACING_MS;
  if (slot > now) await sleep(slot - now);
}

type Rows = Record<string, string | number>[];
const rowsOf = (raw: unknown): Rows => (Array.isArray(raw) ? raw : ((raw as { data?: unknown[] }).data ?? [])) as Rows;

async function universe(count: number): Promise<string[]> {
  await pace();
  const rows = rowsOf(await client.publicGet<unknown>("/openApi/swap/v2/quote/ticker"));
  return rows
    .map((row) => ({ symbol: String(row.symbol ?? ""), quoteVolume: Number(row.quoteVolume) }))
    .filter((row) => row.symbol.endsWith("-USDT") && Number.isFinite(row.quoteVolume) && row.quoteVolume > 0)
    .sort((a, b) => b.quoteVolume - a.quoteVolume)
    .slice(0, count)
    .map((row) => row.symbol);
}

// Closed candles in [startTime, endTime), oldest first. Retries rate limits with backoff; a 400 or 404 is final.
async function klines(symbol: string, startTime: number, endTime: number, limit: number): Promise<Bar[]> {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      await pace();
      const rows = rowsOf(await client.publicGet<unknown>("/openApi/swap/v3/quote/klines", { symbol, interval, startTime, endTime, limit }));
      return rows
        .map((row) => ({ t: Number(row.time), o: Number(row.open), h: Number(row.high), l: Number(row.low), c: Number(row.close), v: Number(row.volume), closed: true }))
        .filter((bar) => bar.t >= startTime && bar.t < endTime && bar.t % step === 0 && Number.isFinite(bar.c))
        .sort((a, b) => a.t - b.t);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/\b(400|404)\b/.test(message) && !/429|100410|100429/.test(message)) throw error;
      await sleep(Math.min(60_000, 2_000 * 2 ** attempt));
    }
  }
  throw new Error(`${symbol}: klines failed after retries`);
}

type Live = {
  symbol: string;
  bars: Bar[];
  // Signals of the newest closed bar, and its ATR, delivered to every run when the next bar arrives.
  pending: Record<Indication, Side | 0>;
  pendingAtr: number;
  runs: MicroRun[];
  tradeFrom: number;
  gaps: number;
};

const wantedIds = new Set<string>(JSON.parse(readFileSync(setsPath, "utf8")) as string[]);
const sets: MicroSet[] = enumerateMicroSets({ ...MICRO_GRID, intervals: [interval] }).filter((set) => wantedIds.has(set.id));
if (sets.length === 0) throw new Error("No set ids matched the interval.");

mkdirSync(outDir, { recursive: true });
const decisionsPath = join(outDir, "decisions.jsonl");
writeFileSync(decisionsPath, "");
const statusPath = join(outDir, "status.json");
const errors: string[] = [];
const liveAcc = new Map<string, MicroAcc>();
const liveFills = new Map<string, Fill[]>();
let firedFills = 0;

function sinkFor(symbol: string, set: MicroSet): (fill: Fill) => void {
  const key = `${symbol}|${set.id}`;
  const fills = liveFills.get(key) ?? [];
  liveFills.set(key, fills);
  return (fill: Fill) => {
    fills.push(fill);
    firedFills += 1;
    appendFileSync(decisionsPath, `${JSON.stringify({ symbol, set: set.id, ...fill })}\n`);
  };
}

// The signals and the ATR of the newest closed bar. The ATR is the one the batch simulator reads at the signal bar.
function signalsOf(bars: Bar[]): { signals: Record<Indication, Side | 0>; atr: number } {
  const series = buildSeries(bars);
  const last = bars.length - 1;
  const signals = {} as Record<Indication, Side | 0>;
  for (const indication of INDICATIONS) signals[indication] = signalAt(indication, bars, series, last);
  return { signals, atr: series.atr[last] ?? Number.NaN };
}

// Feeds one closed candle. Each run sees the signal of the previous candle, then the new candle's signals are computed
// for the next one. Only candles up to this one are read, so a live run and a batch run agree.
function feed(live: Live, bar: Bar): void {
  if (live.bars.length > 0 && bar.t !== live.bars[live.bars.length - 1]!.t + step) live.gaps += 1;
  live.bars.push(bar);
  const index = live.bars.length - 1;
  for (const run of live.runs) {
    const set = run.state.set;
    run.step(bar, index, live.pending[set.indication] ?? 0, false, null, liveAcc.get(set.id)!, undefined, live.pendingAtr);
  }
  const next = signalsOf(live.bars);
  live.pending = next.signals;
  live.pendingAtr = next.atr;
}

function openCount(lives: Live[]): number {
  return lives.reduce((n, live) => n + live.runs.filter((run) => !run.flat).length, 0);
}

async function main(): Promise<void> {
  const started = Date.now();
  const currentStart = Math.floor(Date.now() / step) * step;
  // replay: history ends `cycles` candles before the current one, and each cycle replays one of those candles.
  const anchor = mode === "replay" ? currentStart - cycles * step : currentStart;
  for (const set of sets) liveAcc.set(set.id, newMicroAcc(anchor, step, SLOTS));
  const symbols = await universe(symbolCount);
  console.log(`${mode} ${connection} ${interval}: ${symbols.length} symbols, ${sets.length} sets, notional ${notional.toFixed(4)} per position, anchor ${new Date(anchor).toISOString()}`);

  const lives: Live[] = [];
  for (const symbol of symbols) {
    try {
      const bars = await klines(symbol, anchor - history * step, anchor, history);
      if (bars.length < 60) {
        errors.push(`${symbol}: only ${bars.length} history candles`);
        continue;
      }
      const live: Live = { symbol, bars: [], pending: {} as Record<Indication, Side | 0>, pendingAtr: Number.NaN, runs: [], tradeFrom: 0, gaps: 0 };
      live.bars.push(...bars);
      const first = signalsOf(live.bars);
      live.pending = first.signals;
      live.pendingAtr = first.atr;
      live.tradeFrom = live.bars.length;
      live.runs = sets.map((set) => new MicroRun(set, interval, { notional, cost: POSITION_RT_COST_PCT, sink: sinkFor(symbol, set) }));
      lives.push(live);
    } catch (error) {
      errors.push(`${symbol}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(`history loaded for ${lives.length} symbols`);

  for (let cycle = 1; cycle <= cycles; cycle++) {
    const target = anchor + cycle * step;
    if (mode === "live") {
      const wait = target + SETTLE_MS - Date.now();
      if (wait > 0) await sleep(wait);
    }
    for (const live of lives) {
      try {
        const since = live.bars[live.bars.length - 1]!.t + step;
        if (since >= target) continue;
        const fresh = await klines(live.symbol, since, target, 5);
        for (const bar of fresh) feed(live, bar);
      } catch (error) {
        errors.push(`cycle ${cycle} ${live.symbol}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const perSet = Object.fromEntries(sets.map((set) => [set.id, summarizeMicro(liveAcc.get(set.id)!)]));
    writeFileSync(
      statusPath,
      JSON.stringify(
        { mode, connection, interval, cycle, cycles, symbols: lives.length, fills: firedFills, open: openCount(lives), gaps: lives.reduce((n, live) => n + live.gaps, 0), errors: errors.length, perSet, elapsedSeconds: Math.round((Date.now() - started) / 1000) },
        null,
        1,
      ),
    );
    console.log(`cycle ${cycle}/${cycles}: fills ${firedFills}, open ${openCount(lives)}, errors ${errors.length}`);
  }

  // Batch check: the same bars through the batch simulator, compared fill by fill with what the stream produced.
  // The batch's final-bar closes are a window artifact, so they are dropped from the comparison and only the streamed
  // open positions are checked against them.
  let matched = 0;
  let mismatched = 0;
  const mismatches: string[] = [];
  const batchNet = new Map<string, { net: number; legs: number }>();
  for (const live of lives) {
    const book = buildMicroBook(live.bars, interval);
    for (const set of sets) {
      const trace: Fill[] = [];
      simulateMicro(book, set, live.tradeFrom, live.bars.length, newMicroAcc(anchor, step, SLOTS), { notional, cost: POSITION_RT_COST_PCT, trace });
      const batch = trace.filter((fill) => fill.reason !== "end");
      const streamed = liveFills.get(`${live.symbol}|${set.id}`) ?? [];
      const same = streamed.length === batch.length && streamed.every((fill, i) => {
        const other = batch[i]!;
        return fill.reason === other.reason && fill.exitBar === other.exitBar && Math.abs(fill.price - other.price) < 1e-9 && Math.abs(fill.pnl - other.pnl) < 1e-9 && fill.side === other.side;
      });
      const entry = batchNet.get(set.id) ?? { net: 0, legs: 0 };
      for (const fill of batch) {
        entry.net += fill.pnl;
        entry.legs += 1;
      }
      batchNet.set(set.id, entry);
      if (same) matched += 1;
      else {
        mismatched += 1;
        if (mismatches.length < 10) mismatches.push(`${live.symbol} ${set.id}: streamed ${streamed.length} batch ${batch.length}`);
      }
    }
  }

  const summary = Object.fromEntries(
    sets.map((set) => [set.id, { live: summarizeMicro(liveAcc.get(set.id)!), batchBookedNet: batchNet.get(set.id)?.net ?? 0, batchBookedLegs: batchNet.get(set.id)?.legs ?? 0 }]),
  );
  const report = { mode, connection, interval, notional, symbols: lives.length, sets: sets.length, cycles, comparisons: { matched, mismatched, mismatches }, gaps: lives.reduce((n, live) => n + live.gaps, 0), errors, summary, elapsedSeconds: Math.round((Date.now() - started) / 1000) };
  writeFileSync(join(outDir, "comparison.json"), JSON.stringify(report, null, 1));
  console.log(`streamed fills ${firedFills}; sim-vs-live (symbol x set) matched ${matched}, mismatched ${mismatched}; errors ${errors.length}`);
  for (const set of sets) {
    const s = summarizeMicro(liveAcc.get(set.id)!);
    console.log(`${set.id}: positions ${s.positions} net ${s.net.toFixed(4)} PF ${s.pf.toFixed(2)} max DD ${s.maxDrawdown.toFixed(4)} equity ${s.equityEnd.toFixed(4)} hourly ${s.hourlySuccess.toFixed(0)}%`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : "live run failed");
  process.exitCode = 1;
});
