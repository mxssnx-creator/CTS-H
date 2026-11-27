import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CANDLE_INTERVALS, HOUR_MS, type CandleInterval } from "../src/lib/desk/intervals.ts";
import { profitFactor } from "../src/lib/desk/math.ts";
import {
  aggregateBars,
  barIndexAt,
  buildMicroBook,
  enumerateMicroSets,
  type Fill,
  MICRO_GRID,
  type MicroBook,
  type MicroSet,
  newMicroAcc,
  resetMicroAcc,
  simulateMicro,
} from "../src/lib/desk/micro.ts";
import type { Bar } from "../src/lib/desk/process.ts";

// Population diagnostics: a seeded random sample of the grid, simulated on the research windows only (never the holdout).
// Each group reports leg counts, net and gross P&L (gross = net + the round-trip cost of the leg), and PF on both bases.
//   diagnose <captureDirs> <outDir> <interval> [sample] [seed] [markets]

const WINDOW_MS = 240 * HOUR_MS;
const ANCHOR_MS = 4 * HOUR_MS;
const WARMUP_MS = 48 * HOUR_MS;

type CaptureFile = { symbol: string; end: number; complete: boolean; bars: { time: number; open: number; high: number; low: number; close: number; volume: number }[] };
type Market = { symbol: string; end: number; bars1m: Bar[] };
type Group = { legs: number; net: number; cost: number; netWin: number; netLoss: number; grossWin: number; grossLoss: number };

function loadMarkets(dirs: string[], limit: number): Market[] {
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
  for (const symbol of [...bySymbol.keys()].sort()) {
    if (markets.length >= limit) break;
    const entry = bySymbol.get(symbol)!;
    entry.bars.sort((a, b) => a.t - b.t);
    const bars: Bar[] = [];
    for (const bar of entry.bars) if (bars.length === 0 || bars[bars.length - 1]!.t !== bar.t) bars.push(bar);
    if (bars.length >= 0.99 * ((entry.end - bars[0]!.t) / 60_000)) markets.push({ symbol, end: entry.end, bars1m: bars });
  }
  return markets;
}

// Research windows only: every window except the holdout H, which is the last one.
function researchWindows(end: number, dataStart: number): { name: string; start: number; end: number }[] {
  const anchor = Math.floor(end / ANCHOR_MS) * ANCHOR_MS;
  const windows: { name: string; start: number; end: number }[] = [];
  let start = anchor - 2 * WINDOW_MS;
  while (start - WARMUP_MS >= dataStart) {
    windows.unshift({ name: "", start, end: start + WINDOW_MS });
    start -= WINDOW_MS;
  }
  windows.forEach((window, index) => (window.name = `R${index + 1}`));
  return windows;
}

function add(group: Group, fill: Fill): void {
  const gross = fill.pnl + fill.cost;
  group.legs += 1;
  group.net += fill.pnl;
  group.cost += fill.cost;
  if (fill.pnl > 0) group.netWin += fill.pnl;
  else group.netLoss -= fill.pnl;
  if (gross > 0) group.grossWin += gross;
  else group.grossLoss -= gross;
}

function empty(): Group {
  return { legs: 0, net: 0, cost: 0, netWin: 0, netLoss: 0, grossWin: 0, grossLoss: 0 };
}

function summarize(group: Group) {
  return {
    legs: group.legs,
    netPnl: Number(group.net.toFixed(4)),
    costPaid: Number(group.cost.toFixed(4)),
    // Both use the shared convention: no losses reads PF_NO_LOSS, and no P&L at all reads the neutral 1.00.
    netPf: Number(profitFactor(group.netWin, group.netLoss).toFixed(4)),
    // Before costs: the gross move of each leg, cost added back.
    grossPf: Number(profitFactor(group.grossWin, group.grossLoss).toFixed(4)),
    avgNetPerLeg: group.legs ? Number((group.net / group.legs).toFixed(6)) : null,
    avgCostPerLeg: group.legs ? Number((group.cost / group.legs).toFixed(6)) : null,
  };
}

const [dirsText, outDir, intervalText, sampleText = "400", seedText = "7", limitText = "50"] = process.argv.slice(2);
if (!dirsText || !outDir || !intervalText) throw new Error("Usage: diagnose <captureDirs> <outDir> <interval> [sample] [seed] [markets]");
const interval = intervalText as CandleInterval;
const step = CANDLE_INTERVALS[interval];
const markets = loadMarkets(dirsText.split(",").map((item) => item.trim()), Number(limitText));
const end = Math.min(...markets.map((market) => market.end));
const dataStart = Math.max(...markets.map((market) => market.bars1m[0]!.t));
const windows = researchWindows(end, dataStart);
const books: MicroBook[] = markets.map((market) => buildMicroBook(interval === "1m" ? market.bars1m : aggregateBars(market.bars1m, step), interval));
const ranges = books.map((book) => windows.map((window) => ({ from: barIndexAt(book.bars, window.start), to: barIndexAt(book.bars, window.end) })));

// Seeded sample of the grid, without replacement.
const all = enumerateMicroSets({ ...MICRO_GRID, intervals: [interval] });
let state = Number(seedText) || 7;
const random = () => {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return (state >>> 0) / 4294967296;
};
const picks = new Set<number>();
const want = Math.min(Number(sampleText), all.length);
while (picks.size < want) picks.add(Math.floor(random() * all.length));
const sample: MicroSet[] = [...picks].sort((a, b) => a - b).map((index) => all[index]!);

const byReason = new Map<string, Group>();
const byIndication = new Map<string, Group>();
const bySide = new Map<string, Group>();
const byHold = new Map<string, Group>();
const perWindow = new Map<string, Group>();
const bump = (map: Map<string, Group>, key: string, fill: Fill) => {
  const group = map.get(key) ?? empty();
  add(group, fill);
  map.set(key, group);
};
const started = Date.now();
for (const set of sample) {
  books.forEach((book, m) => {
    windows.forEach((window, w) => {
      const range = ranges[m]![w]!;
      if (range.to - range.from < 2) return;
      const acc = newMicroAcc(window.start, step, WINDOW_MS / step);
      resetMicroAcc(acc, window.start);
      const trace: Fill[] = [];
      simulateMicro(book, set, range.from, range.to, acc, { trace });
      for (const fill of trace) {
        if (fill.reason === "end") continue;
        bump(byReason, fill.reason, fill);
        bump(byIndication, set.indication, fill);
        bump(bySide, fill.side > 0 ? "long" : "short", fill);
        bump(byHold, `${set.holdMinutes}min`, fill);
        bump(perWindow, window.name, fill);
      }
    });
  });
}

const toObject = (map: Map<string, Group>) => Object.fromEntries([...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([key, group]) => [key, summarize(group)]));
const result = {
  interval,
  markets: markets.length,
  sampledSets: sample.length,
  gridSets: all.length,
  windows: windows.map((window) => ({ name: window.name, start: new Date(window.start).toISOString() })),
  seconds: Math.round((Date.now() - started) / 1000),
  total: summarize([...perWindow.values()].reduce((total, group) => {
    total.legs += group.legs;
    total.net += group.net;
    total.cost += group.cost;
    total.netWin += group.netWin;
    total.netLoss += group.netLoss;
    total.grossWin += group.grossWin;
    total.grossLoss += group.grossLoss;
    return total;
  }, empty())),
  byWindow: toObject(perWindow),
  byReason: toObject(byReason),
  byIndication: toObject(byIndication),
  bySide: toObject(bySide),
  byHold: toObject(byHold),
};
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `diagnose-${interval}.json`), JSON.stringify(result, null, 1));
console.log(`${interval}: ${sample.length} sampled sets of ${all.length}, ${markets.length} markets, research windows ${windows.map((w) => w.name).join(", ")}, ${result.seconds}s`);
console.log(`  total: legs ${result.total.legs}, net PF ${result.total.netPf}, gross PF ${result.total.grossPf}, cost paid ${result.total.costPaid}`);
for (const [reason, row] of Object.entries(result.byReason)) console.log(`  exit ${reason}: legs ${row.legs}, net PF ${row.netPf}, gross PF ${row.grossPf}, avg net ${row.avgNetPerLeg}, avg cost ${row.avgCostPerLeg}`);
