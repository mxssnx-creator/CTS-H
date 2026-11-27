import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_FLOORS } from "../src/lib/desk/constants.ts";
import { CANDLE_INTERVALS, HOUR_MS, type CandleInterval } from "../src/lib/desk/intervals.ts";
import { buildPlan, DEFAULT_LANE_POLICY, verdict } from "../src/lib/desk/lanes.ts";
import {
  aggregateBars,
  barIndexAt,
  buildMicroBook,
  type Closes,
  enumerateMicroSets,
  MICRO_GRID,
  type MicroBook,
  type MicroGrid,
  type MicroSet,
  newMicroAcc,
  resetMicroAcc,
  simulateMicro,
  summarizeMicro,
  trailLabel,
} from "../src/lib/desk/micro.ts";
import { gateState, gateStateOf, type Bar } from "../src/lib/desk/process.ts";
import { normalizeStrategies } from "../src/lib/desk/strategies.ts";

// Micro study over one-minute captures.
//   run <captureDirs> <outDir> <interval> [markets]           full grid, ungated, every 10-day window the data allows
//   gated <captureDirs> <outDir> <interval> <topN> [markets]  candidates behind a lane gate (GATE=validated|noveto|lastnet|legacy)
//   merge <outDir> <interval>                                 join SHARD outputs into the interval file
//   walk <outDir> <interval> [suffix]                         walk-forward selection, rule fixed in advance
//
// captureDirs is one directory or several separated by commas: an older and a newer segment of the same markets are
// merged by symbol. Windows are anchored to the latest capture end on a four-hour grid. The last window is the holdout
// H. The others are research windows R1, R2, ... oldest first. Each window has 240 hours, and every window keeps 48
// hours of history before it, so indicator series have converged. Environment: SHARD=i/n splits the grid, GRID=quick
// runs a reduced grid for timing, COST=0 measures gross edge, MIN_POSITIONS sets the eligibility floor.

const WINDOW_HOURS = 240;
const WINDOW_MS = WINDOW_HOURS * HOUR_MS;
const ANCHOR_MS = 4 * HOUR_MS;
const WARMUP_MS = 48 * HOUR_MS;
const MIN_POSITIONS = Number(process.env.MIN_POSITIONS ?? 100);
// Volatility gate, fixed in advance: an entry needs the last closed bar's 14-bar ATR at least 4 x the 0.12% round trip.
const VOL_MIN_PCT = Number(process.env.VOL_MIN_PCT ?? 0.48);

type CaptureFile = {
  symbol: string;
  start: number;
  end: number;
  complete: boolean;
  bars: { time: number; open: number; high: number; low: number; close: number; volume: number }[];
};
type Market = { symbol: string; end: number; bars1m: Bar[] };
type Window = { name: string; start: number; end: number; research: boolean };
type Row = Record<string, string>;

const QUICK_GRID: MicroGrid = {
  ...MICRO_GRID,
  tp: [0.2, 0.5, 0.8],
  sl: [0.2, 0.5, 0.8],
  retrace: [0.3, 0.6],
};

const HEADER = [
  "id",
  "interval",
  "indication",
  "direction",
  "tp",
  "sl",
  "trail",
  "hold",
  "partial",
  "window",
  "positions",
  "legs",
  "net",
  "pf",
  "winRate",
  "maxDD",
  "hourlySuccess",
  "activeHours",
  "markets",
  "marketsWithLegs",
  "marketsPositive",
  "shadows",
  "shadowNet",
  "exitTp",
  "exitPartial",
  "exitSl",
  "exitTime",
  "exitEnd",
  "grossProfit",
  "grossLoss",
  "equityEnd",
].join(",");

function loadMarkets(dirs: string[], limit: number): { markets: Market[]; excluded: string[] } {
  const bySymbol = new Map<string, { end: number; bars: Bar[] }>();
  for (const dir of dirs) {
    for (const name of readdirSync(dir).filter((item) => item.endsWith(".json") && item !== "_summary.json").sort()) {
      const file = JSON.parse(readFileSync(join(dir, name), "utf8")) as CaptureFile;
      if (!file.complete) continue;
      const entry = bySymbol.get(file.symbol) ?? { end: 0, bars: [] };
      entry.end = Math.max(entry.end, file.end);
      for (const row of file.bars) entry.bars.push({ t: row.time, o: row.open, h: row.high, l: row.low, c: row.close, v: row.volume, closed: true });
      bySymbol.set(file.symbol, entry);
    }
  }
  const markets: Market[] = [];
  const excluded: string[] = [];
  for (const symbol of [...bySymbol.keys()].sort()) {
    if (markets.length >= limit) break;
    const entry = bySymbol.get(symbol)!;
    entry.bars.sort((a, b) => a.t - b.t);
    const bars: Bar[] = [];
    for (const bar of entry.bars) if (bars.length === 0 || bars[bars.length - 1]!.t !== bar.t) bars.push(bar);
    const expected = (entry.end - bars[0]!.t) / 60_000;
    // A market with more than 1% of its minutes missing is excluded, so every window stays comparable.
    if (bars.length < 0.99 * expected) {
      excluded.push(symbol);
      continue;
    }
    markets.push({ symbol, end: entry.end, bars1m: bars });
  }
  return { markets, excluded };
}

// The holdout H is the last window before the anchor. Research windows are added while their history allows.
function windowsFor(end: number, dataStart: number): Window[] {
  const anchor = Math.floor(end / ANCHOR_MS) * ANCHOR_MS;
  const windows: Window[] = [{ name: "H", start: anchor - WINDOW_MS, end: anchor, research: false }];
  let start = anchor - 2 * WINDOW_MS;
  while (start - WARMUP_MS >= dataStart) {
    windows.unshift({ name: "", start, end: start + WINDOW_MS, research: true });
    start -= WINDOW_MS;
  }
  let r = 0;
  for (const window of windows) {
    if (window.research) {
      r += 1;
      window.name = `R${r}`;
    }
  }
  return windows;
}

function bookFor(market: Market, interval: CandleInterval): MicroBook {
  const bars = interval === "1m" ? market.bars1m : aggregateBars(market.bars1m, CANDLE_INTERVALS[interval]);
  return buildMicroBook(bars, interval);
}

function csvRow(set: MicroSet, window: Window, summary: ReturnType<typeof summarizeMicro>, markets: number, withLegs: number, positive: number): string {
  return [
    set.id,
    set.interval,
    set.indication,
    set.direction,
    set.tp,
    set.sl,
    trailLabel(set.trail),
    set.holdMinutes,
    set.partial,
    window.name,
    summary.positions,
    summary.legs,
    summary.net.toFixed(4),
    summary.pf.toFixed(4),
    summary.winRate.toFixed(2),
    summary.maxDrawdown.toFixed(4),
    summary.hourlySuccess.toFixed(2),
    summary.activeHours,
    markets,
    withLegs,
    positive,
    summary.shadows,
    summary.shadowNet.toFixed(4),
    summary.exits.tp,
    summary.exits.partial,
    summary.exits.sl,
    summary.exits.time,
    summary.exits.end,
    summary.grossProfit.toFixed(4),
    summary.grossLoss.toFixed(4),
    summary.equityEnd.toFixed(4),
  ].join(",");
}

function loadRows(path: string): Row[] {
  if (!existsSync(path)) throw new Error(`Missing ${path}. Run the study first.`);
  const lines = readFileSync(path, "utf8").trim().split("\n");
  const keys = lines[0]!.split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(keys.map((key, i) => [key, cells[i] ?? ""])) as Row;
  });
}

function shardOf(): { index: number; count: number } | null {
  const value = process.env.SHARD;
  if (!value) return null;
  const [index, count] = value.split("/").map(Number);
  if (!Number.isInteger(index) || !Number.isInteger(count) || count < 1 || index! < 0 || index! >= count!) throw new Error("SHARD must be i/n with 0 <= i < n.");
  return { index: index!, count: count! };
}

function run(dirs: string[], outDir: string, interval: CandleInterval, limit: number): void {
  const started = Date.now();
  const { markets, excluded } = loadMarkets(dirs, limit);
  if (markets.length === 0) throw new Error("No complete markets in the capture directories.");
  const end = Math.min(...markets.map((market) => market.end));
  const dataStart = Math.max(...markets.map((market) => market.bars1m[0]!.t));
  const windows = windowsFor(end, dataStart);
  const step = CANDLE_INTERVALS[interval];
  const slots = WINDOW_MS / step;
  const quick = process.env.GRID === "quick";
  const grid: MicroGrid = { ...(quick ? QUICK_GRID : MICRO_GRID), intervals: [interval] };
  let sets = enumerateMicroSets(grid);
  const shard = shardOf();
  if (shard) sets = sets.filter((_, index) => index % shard.count === shard.index);
  const books = markets.map((market) => bookFor(market, interval));
  const ranges = books.map((book) => windows.map((window) => ({ from: barIndexAt(book.bars, window.start), to: barIndexAt(book.bars, window.end) })));
  const portfolio = windows.map((window) => newMicroAcc(window.start, step, slots));
  const costOption = process.env.COST === undefined ? {} : { cost: Number(process.env.COST) };
  const suffix = `${process.env.COST === undefined ? "" : "-gross"}${shard ? `.shard${shard.index}` : ""}`;
  const rows: string[] = [HEADER];
  console.log(
    `${interval}${suffix}: ${markets.length} markets (excluded ${excluded.length}), ${sets.length} sets, windows ${windows.map((w) => `${w.name} ${new Date(w.start).toISOString()}`).join(", ")}`,
  );

  sets.forEach((set, index) => {
    windows.forEach((window, w) => {
      const acc = portfolio[w]!;
      resetMicroAcc(acc, window.start);
      let withLegs = 0;
      let positive = 0;
      books.forEach((book, m) => {
        const range = ranges[m]![w]!;
        if (range.to - range.from < 2) return;
        const legsBefore = acc.legs;
        const netBefore = acc.net;
        simulateMicro(book, set, range.from, range.to, acc, costOption);
        if (acc.legs > legsBefore) withLegs += 1;
        if (acc.net - netBefore > 0) positive += 1;
      });
      rows.push(csvRow(set, window, summarizeMicro(acc), markets.length, withLegs, positive));
    });
    if ((index + 1) % 2000 === 0) console.log(`  ${index + 1}/${sets.length} sets, ${((Date.now() - started) / 1000).toFixed(0)}s`);
  });

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${interval}${suffix}.csv`), `${rows.join("\n")}\n`);
  console.log(`${interval}${suffix}: wrote ${rows.length - 1} rows in ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

// Gated run: each market's cell keeps its own evidence (every closed leg, booked or shadow), replayed in time order
// from the earliest available bar. Entries are gated by the chosen rule, using only evidence that closed before them.
function gated(dirs: string[], outDir: string, interval: CandleInterval, topN: number, limit: number): void {
  const started = Date.now();
  const ungated = loadRows(join(outDir, `${interval}.csv`));
  const byId = new Map<string, Partial<Record<string, Row>>>();
  for (const row of ungated) {
    const entry = byId.get(row.id!) ?? {};
    entry[row.window!] = row;
    byId.set(row.id!, entry);
  }
  // Candidates are ranked on research windows only; the holdout H never chooses anything.
  const researchNames = [...new Set(ungated.map((row) => row.window!))].filter((name) => name !== "H");
  const ranked = [...byId.entries()]
    .flatMap(([id, windowsByName]) => {
      const rows = researchNames.map((name) => windowsByName[name]);
      if (rows.some((row) => !row || Number(row.positions) < MIN_POSITIONS)) return [];
      return [{ id, score: Math.min(...rows.map((row) => Number(row!.pf))) }];
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
  const wanted = new Set(ranked.map((item) => item.id));
  const sets = enumerateMicroSets({ ...MICRO_GRID, intervals: [interval] }).filter((set) => wanted.has(set.id));

  const { markets } = loadMarkets(dirs, limit);
  const end = Math.min(...markets.map((market) => market.end));
  const dataStart = Math.max(...markets.map((market) => market.bars1m[0]!.t));
  const windows = windowsFor(end, dataStart);
  const step = CANDLE_INTERVALS[interval];
  const slots = WINDOW_MS / step;
  const books = markets.map((market) => bookFor(market, interval));
  const ranges = books.map((book) => windows.map((window) => ({ from: barIndexAt(book.bars, window.start), to: barIndexAt(book.bars, window.end) })));
  const atrs = books.map((book) => atrPctOf(book.bars));
  const finalLanes = buildPlan(2, DEFAULT_LANE_POLICY).at(-1)!.lanes;
  const settings = normalizeStrategies();
  const gateName = process.env.GATE ?? "validated";
  // validated: no veto and at least one confirmation (the shipped lane rule). noveto: only a veto blocks. lastnet: the
  // cell's last 20 closes, shadows included, net positive. legacy: the per-cell last-N gate the coordinated engine uses.
  // vol: the last closed bar's ATR percent must clear VOL_MIN_PCT. The other variants read the closes only.
  const makeGate = (atrPct: Float64Array) => (closes: Closes, index: number): boolean => {
    if (gateName === "vol") return atrPct[index - 1]! * 100 >= VOL_MIN_PCT;
    if (gateName === "lastnet") {
      const n = closes.pnls.length;
      if (n < 4) return false;
      let sum = 0;
      for (let i = Math.max(0, n - 20); i < n; i++) sum += closes.pnls[i]!;
      return sum > 0;
    }
    if (gateName === "legacy") return gateState(gateStateOf(closes.pnls), DEFAULT_FLOORS, settings).validExec;
    const verdicted = verdict(closes, finalLanes, true);
    return gateName === "noveto" ? verdicted.vetoed === 0 : verdicted.validated;
  };

  const rows: string[] = [HEADER];
  console.log(`${interval} gated ${gateName}: ${sets.length} candidate sets, ${markets.length} markets`);
  for (const set of sets) {
    const portfolio = windows.map((window) => newMicroAcc(window.start, step, slots));
    const withLegs = windows.map(() => 0);
    const positive = windows.map(() => 0);
    const throwaway = newMicroAcc(0, step, 1);
    books.forEach((book, m) => {
      const gate = makeGate(atrs[m]!);
      const closes: Closes = { pnls: [], costs: [] };
      const first = ranges[m]![0]!;
      // Evidence from the bars before the first window: simulated, not booked.
      if (first.from > 0) {
        resetMicroAcc(throwaway, 0);
        simulateMicro(book, set, 0, first.from, throwaway, { closes, gate });
      }
      windows.forEach((window, w) => {
        const range = ranges[m]![w]!;
        if (range.to - range.from < 2) return;
        const acc = portfolio[w]!;
        const legsBefore = acc.legs;
        const netBefore = acc.net;
        simulateMicro(book, set, range.from, range.to, acc, { closes, gate });
        if (acc.legs > legsBefore) withLegs[w] = withLegs[w]! + 1;
        if (acc.net - netBefore > 0) positive[w] = positive[w]! + 1;
      });
    });
    windows.forEach((window, w) => {
      rows.push(csvRow(set, window, summarizeMicro(portfolio[w]!), markets.length, withLegs[w]!, positive[w]!));
    });
  }
  writeFileSync(join(outDir, `${interval}-gated-${gateName}.csv`), `${rows.join("\n")}\n`);
  console.log(`${interval} gated ${gateName}: wrote ${rows.length - 1} rows in ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

// ATR as a percent of price, causal: entry i uses the bars up to the last closed bar. Simple mean of true range over 14 bars.
function atrPctOf(bars: Bar[], period = 14): Float64Array {
  const tr = new Float64Array(bars.length);
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]!;
    const previousClose = i > 0 ? bars[i - 1]!.c : b.o;
    tr[i] = Math.max(b.h - b.l, Math.abs(b.h - previousClose), Math.abs(b.l - previousClose));
  }
  const out = new Float64Array(bars.length);
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += tr[i]!;
    if (i >= period) sum -= tr[i - period]!;
    if (i >= period - 1) out[i] = sum / period / bars[i]!.c;
  }
  return out;
}

function merge(outDir: string, interval: CandleInterval): void {
  const shards = readdirSync(outDir)
    .filter((name) => name.startsWith(`${interval}.shard`) && name.endsWith(".csv"))
    .sort();
  if (shards.length === 0) throw new Error(`No shards for ${interval} in ${outDir}.`);
  const lines = [HEADER];
  for (const name of shards) {
    const body = readFileSync(join(outDir, name), "utf8").trim().split("\n").slice(1);
    lines.push(...body);
  }
  writeFileSync(join(outDir, `${interval}.csv`), `${lines.join("\n")}\n`);
  console.log(`${interval}: merged ${shards.length} shards, ${lines.length - 1} rows`);
}

// The walk-forward rule, fixed before any walk result is read:
//   - Test windows are every window after the first two, so each has at least two windows of training.
//   - A set is eligible for a test window when every training window has at least MIN_POSITIONS booked positions,
//     positive booked net, and a PF of at least 1.00.
//   - The score is the lowest PF across the training windows. Ties go to the lower largest drawdown.
//   - The selected set runs on the test window, and that result is reported without change.
function walk(outDir: string, interval: CandleInterval, suffix: string): void {
  const rows = loadRows(join(outDir, `${interval}${suffix}.csv`));
  const names = [...new Set(rows.map((row) => row.window!))];
  const byId = new Map<string, Partial<Record<string, Row>>>();
  for (const row of rows) {
    const entry = byId.get(row.id!) ?? {};
    entry[row.window!] = row;
    byId.set(row.id!, entry);
  }
  const results: {
    testWindow: string;
    trainingWindows: string[];
    eligible: number;
    selected: string | null;
    trainingMinPf: number | null;
    trainingMaxDrawdown: number | null;
    test: { positions: number; net: number; pf: number; grossProfit: number; grossLoss: number; maxDD: number; hourlySuccess: number } | null;
  }[] = [];
  for (let k = 2; k < names.length; k++) {
    const training = names.slice(0, k);
    const testName = names[k]!;
    let best: { id: string; score: number; drawdown: number } | null = null;
    let eligible = 0;
    for (const [id, windowsByName] of byId) {
      const rowsTrain = training.map((name) => windowsByName[name]);
      if (rowsTrain.some((row) => !row)) continue;
      const ok = rowsTrain.every((row) => Number(row!.positions) >= MIN_POSITIONS && Number(row!.net) > 0 && Number(row!.pf) >= 1);
      if (!ok) continue;
      eligible += 1;
      const score = Math.min(...rowsTrain.map((row) => Number(row!.pf)));
      const drawdown = Math.max(...rowsTrain.map((row) => Number(row!.maxDD)));
      if (!best || score > best.score || (score === best.score && drawdown < best.drawdown)) best = { id, score, drawdown };
    }
    const test = best ? byId.get(best.id)?.[testName] ?? null : null;
    results.push({
      testWindow: testName,
      trainingWindows: training,
      eligible,
      selected: best?.id ?? null,
      trainingMinPf: best?.score ?? null,
      trainingMaxDrawdown: best?.drawdown ?? null,
      test: test
        ? {
            positions: Number(test.positions),
            net: Number(test.net),
            pf: Number(test.pf),
            grossProfit: Number(test.grossProfit),
            grossLoss: Number(test.grossLoss),
            maxDD: Number(test.maxDD),
            hourlySuccess: Number(test.hourlySuccess),
          }
        : null,
    });
  }
  const traded = results.filter((item) => item.test !== null);
  const gp = traded.reduce((total, item) => total + item.test!.grossProfit, 0);
  const gl = traded.reduce((total, item) => total + item.test!.grossLoss, 0);
  const summary = {
    interval,
    suffix,
    rule: { minPositions: MIN_POSITIONS, eachTrainingWindowPositiveNetAndPfAtLeastOne: true, rankBy: "min PF over training windows", tieBreak: "lower max drawdown over training windows" },
    windows: names,
    tests: results,
    outOfSample: {
      windowsTraded: traded.length,
      windowsFlat: results.length - traded.length,
      pf: gl > 0 ? gp / gl : 1,
      net: traded.reduce((total, item) => total + item.test!.net, 0),
      positions: traded.reduce((total, item) => total + item.test!.positions, 0),
      worstTestDrawdown: Math.max(0, ...traded.map((item) => item.test!.maxDD)),
      selectedTrainingMinPf: traded.map((item) => item.trainingMinPf),
    },
  };
  writeFileSync(join(outDir, `walk-${interval}${suffix}.json`), JSON.stringify(summary, null, 1));
  for (const item of results) {
    const test = item.test;
    const detail =
      item.trainingMinPf === null || test === null
        ? ""
        : ` | in-sample min PF ${item.trainingMinPf.toFixed(2)} -> test PF ${test.pf.toFixed(2)}, net ${test.net.toFixed(2)}, ${test.positions} positions, max DD ${test.maxDD.toFixed(2)}`;
    console.log(`${interval}${suffix} ${item.testWindow}: eligible ${item.eligible}, selected ${item.selected ?? "none (flat)"}${detail}`);
  }
  console.log(`${interval}${suffix} out of sample: ${summary.outOfSample.windowsTraded} windows traded, PF ${summary.outOfSample.pf.toFixed(3)}, net ${summary.outOfSample.net.toFixed(2)}`);
}

const [mode = "run", ...args] = process.argv.slice(2);
if (mode === "run") {
  const [captureDirs, outDir, interval, limit = "50"] = args;
  if (!captureDirs || !outDir || !interval) throw new Error("Usage: run <captureDirs> <outDir> <interval> [markets]");
  run(captureDirs.split(",").map((item) => item.trim()), outDir, interval as CandleInterval, Number(limit));
} else if (mode === "gated") {
  const [captureDirs, outDir, interval, topN = "200", limit = "50"] = args;
  if (!captureDirs || !outDir || !interval) throw new Error("Usage: gated <captureDirs> <outDir> <interval> <topN> [markets]");
  gated(captureDirs.split(",").map((item) => item.trim()), outDir, interval as CandleInterval, Number(topN), Number(limit));
} else if (mode === "merge") {
  const [outDir, interval] = args;
  if (!outDir || !interval) throw new Error("Usage: merge <outDir> <interval>");
  merge(outDir, interval as CandleInterval);
} else if (mode === "walk") {
  const [outDir, interval, suffix = ""] = args;
  if (!outDir || !interval) throw new Error("Usage: walk <outDir> <interval> [suffix]");
  walk(outDir, interval as CandleInterval, suffix);
} else {
  throw new Error("Choose run, gated, merge or walk.");
}
