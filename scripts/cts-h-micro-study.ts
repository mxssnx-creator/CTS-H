import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CANDLE_INTERVALS, HOUR_MS, type CandleInterval } from "../src/lib/desk/intervals.ts";
import {
  aggregateBars,
  barIndexAt,
  buildMicroBook,
  enumerateMicroSets,
  MICRO_GRID,
  mergeMicroAcc,
  type MicroBook,
  type MicroGrid,
  type MicroSet,
  newMicroAcc,
  resetMicroAcc,
  simulateMicro,
  summarizeMicro,
  trailLabel,
} from "../src/lib/desk/micro.ts";
import type { Bar } from "../src/lib/desk/process.ts";

// Micro study over one-minute captures.
//   run <captureDir> <outDir> <interval> [markets]    full grid for one timeframe, three 10-day windows
//   select <outDir> <interval>                        choose by the two research windows; report the holdout
//
// Windows, anchored to the capture end on a 4-hour grid: R1 and R2 are research, H is the holdout. Selection reads
// only R1 and R2. H is reported after the choice and is never used to choose.
// GRID=quick runs a reduced grid for timing and smoke tests.

const WINDOW_HOURS = 240;
const WINDOW_MS = WINDOW_HOURS * HOUR_MS;
const ANCHOR_MS = 4 * HOUR_MS;
const MIN_POSITIONS = Number(process.env.MIN_POSITIONS ?? 100);
const TOP = Number(process.env.TOP ?? 10);

type CaptureFile = {
  symbol: string;
  end: number;
  complete: boolean;
  bars: { time: number; open: number; high: number; low: number; close: number; volume: number }[];
};
type Market = { symbol: string; end: number; bars1m: Bar[] };
type WindowName = "R1" | "R2" | "H";
type Window = { name: WindowName; start: number; end: number };

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
].join(",");

function loadMarkets(dir: string, limit: number): Market[] {
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".json") && name !== "_summary.json")
    .sort();
  const markets: Market[] = [];
  for (const name of files) {
    if (markets.length >= limit) break;
    const file = JSON.parse(readFileSync(join(dir, name), "utf8")) as CaptureFile;
    if (!file.complete) continue;
    markets.push({
      symbol: file.symbol,
      end: file.end,
      bars1m: file.bars.map((row) => ({ t: row.time, o: row.open, h: row.high, l: row.low, c: row.close, v: row.volume, closed: true })),
    });
  }
  return markets;
}

function windowsFor(end: number): Window[] {
  const anchor = Math.floor(end / ANCHOR_MS) * ANCHOR_MS;
  return [
    { name: "R1", start: anchor - 3 * WINDOW_MS, end: anchor - 2 * WINDOW_MS },
    { name: "R2", start: anchor - 2 * WINDOW_MS, end: anchor - WINDOW_MS },
    { name: "H", start: anchor - WINDOW_MS, end: anchor },
  ];
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
  ].join(",");
}

function run(captureDir: string, outDir: string, interval: CandleInterval, limit: number): void {
  const started = Date.now();
  const markets = loadMarkets(captureDir, limit);
  if (markets.length === 0) throw new Error(`No complete markets in ${captureDir}.`);
  const end = Math.min(...markets.map((market) => market.end));
  const windows = windowsFor(end);
  const quick = process.env.GRID === "quick";
  const grid: MicroGrid = { ...(quick ? QUICK_GRID : MICRO_GRID), intervals: [interval] };
  const sets = enumerateMicroSets(grid);
  const books = markets.map((market) => bookFor(market, interval));
  const ranges = books.map((book) => windows.map((window) => ({ from: barIndexAt(book.bars, window.start), to: barIndexAt(book.bars, window.end) })));
  const portfolio = windows.map(() => newMicroAcc(0, WINDOW_HOURS));
  const scratch = newMicroAcc(0, WINDOW_HOURS);
  const rows: string[] = [HEADER];
  console.log(`${interval}: ${markets.length} markets, ${sets.length} sets${quick ? " (quick grid)" : ""}, windows ${windows.map((w) => `${w.name} ${new Date(w.start).toISOString()}`).join(", ")}`);

  sets.forEach((set, index) => {
    windows.forEach((window, w) => {
      const acc = portfolio[w]!;
      resetMicroAcc(acc, window.start);
      let withLegs = 0;
      let positive = 0;
      books.forEach((book, m) => {
        const range = ranges[m]![w]!;
        if (range.to - range.from < 2) return;
        resetMicroAcc(scratch, window.start);
        simulateMicro(book, set, range.from, range.to, scratch);
        mergeMicroAcc(acc, scratch);
        if (scratch.legs > 0) withLegs += 1;
        if (scratch.net > 0) positive += 1;
      });
      rows.push(csvRow(set, window, summarizeMicro(acc), markets.length, withLegs, positive));
    });
    if ((index + 1) % 2000 === 0) {
      console.log(`  ${index + 1}/${sets.length} sets, ${((Date.now() - started) / 1000).toFixed(0)}s`);
    }
  });

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${interval}.csv`), `${rows.join("\n")}\n`);
  console.log(`${interval}: wrote ${rows.length - 1} rows in ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

type Row = Record<string, string>;

function select(outDir: string, interval: CandleInterval): void {
  const path = join(outDir, `${interval}.csv`);
  if (!existsSync(path)) throw new Error(`Missing ${path}. Run the study first.`);
  const lines = readFileSync(path, "utf8").trim().split("\n");
  const keys = lines[0]!.split(",");
  const byId = new Map<string, Partial<Record<WindowName, Row>>>();
  for (const line of lines.slice(1)) {
    const cells = line.split(",");
    const row = Object.fromEntries(keys.map((key, i) => [key, cells[i] ?? ""])) as Row;
    const entry = byId.get(row.id!) ?? {};
    entry[row.window as WindowName] = row;
    byId.set(row.id!, entry);
  }

  // Research rule: enough positions in both research windows, positive net in both, ranked by the lower of the two PFs.
  const candidates: { id: string; score: number; drawdown: number; r1: Row; r2: Row; h: Row | undefined }[] = [];
  for (const [id, windowsByName] of byId) {
    const r1 = windowsByName.R1;
    const r2 = windowsByName.R2;
    if (!r1 || !r2) continue;
    if (Number(r1.positions) < MIN_POSITIONS || Number(r2.positions) < MIN_POSITIONS) continue;
    if (Number(r1.net) <= 0 || Number(r2.net) <= 0) continue;
    candidates.push({
      id,
      score: Math.min(Number(r1.pf), Number(r2.pf)),
      drawdown: Math.max(Number(r1.maxDD), Number(r2.maxDD)),
      r1,
      r2,
      h: windowsByName.H,
    });
  }
  candidates.sort((a, b) => b.score - a.score || a.drawdown - b.drawdown);
  const top = candidates.slice(0, TOP);
  const fmt = (row: Row | undefined) =>
    row ? `pos ${row.positions.padStart(5)} net ${Number(row.net).toFixed(2).padStart(9)} PF ${Number(row.pf).toFixed(2)} DD ${Number(row.maxDD).toFixed(2).padStart(7)} hrs ${Number(row.hourlySuccess).toFixed(0).padStart(3)}% mkts+ ${row.marketsPositive}/${row.markets}` : "-";
  console.log(`${interval}: ${candidates.length} sets pass the research rule (of ${byId.size}); top ${top.length}`);
  for (const item of top) {
    console.log(`${item.id}`);
    console.log(`  R1 ${fmt(item.r1)}`);
    console.log(`  R2 ${fmt(item.r2)}`);
    console.log(`  H  ${fmt(item.h)}`);
  }
  const holdoutPositive = top.filter((item) => item.h && Number(item.h.net) > 0).length;
  console.log(`holdout net > 0 for ${holdoutPositive}/${top.length} of the research top set`);
  writeFileSync(
    join(outDir, `${interval}-selection.json`),
    JSON.stringify({ interval, rule: { minPositions: MIN_POSITIONS, netPositiveResearch: true, rankBy: "min(PF R1, PF R2)", tieBreak: "max(maxDD R1, maxDD R2)" }, candidates: candidates.length, top: top.map((item) => ({ id: item.id, score: item.score, research: { R1: item.r1, R2: item.r2 }, holdout: item.h ?? null })) }, null, 1),
  );
}

const [mode = "run", ...args] = process.argv.slice(2);
if (mode === "run") {
  const [captureDir, outDir, interval, limit = "50"] = args;
  if (!captureDir || !outDir || !interval) throw new Error("Usage: run <captureDir> <outDir> <interval> [markets]");
  run(captureDir, outDir, interval as CandleInterval, Number(limit));
} else if (mode === "select") {
  const [outDir, interval] = args;
  if (!outDir || !interval) throw new Error("Usage: select <outDir> <interval>");
  select(outDir, interval as CandleInterval);
} else {
  throw new Error("Choose run or select.");
}
