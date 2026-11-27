import assert from "node:assert/strict";
import test from "node:test";
import { BOOK, DEFAULT_FLOORS } from "./constants.ts";
import { HOUR_MS } from "./intervals.ts";
import { hourAccumulator, REPLAY_WARMUP_BARS, replayWindow, buildSeries, signalAt, type Bar, type LanedReplay } from "./process.ts";
import { simulateStaged } from "./staged.ts";
import { defaultForInterval, normalizeStrategies } from "./strategies.ts";

function walk(seed: number, count: number, start: number): Bar[] {
  let state = seed;
  const random = () => {
    state = (state * 1_103_515_245 + 12_345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
  const bars: Bar[] = [];
  let close = 100 + seed;
  for (let i = 0; i < count; i++) {
    const open = close;
    close = open * (1 + 0.012 * (random() * 2 - 1));
    bars.push({
      t: start + i * HOUR_MS,
      o: open,
      h: Math.max(open, close) * (1 + 0.006 * random()),
      l: Math.min(open, close) * (1 - 0.006 * random()),
      c: close,
      v: 800 + 400 * random(),
      closed: true,
    });
  }
  return bars;
}

const HOLD = 48;
const PRE = 48;
const SPAN = REPLAY_WARMUP_BARS + PRE + HOLD;
const START = Math.floor(1_795_776_000_000 / HOUR_MS) * HOUR_MS;
const END = START + SPAN * HOUR_MS;
const books = [1, 2, 3, 4].map((seed) => ({ symbol: `G${seed}-USDT`, bars: walk(seed + 40, SPAN, START) }));
const preferences = normalizeStrategies({ ...defaultForInterval("1h"), enabledIndications: ["stochRsi", "bollinger", "break", "rangeFade"], extendedTargets: true });

test("stages nest: each stage receives exactly the cells the stage before validated", () => {
  const report = simulateStaged(books, BOOK, DEFAULT_FLOORS, { hours: HOLD, preHours: PRE, end: END, strategies: preferences, minPf: 1 });
  const staged = report.staged!;
  assert.ok(staged.stages.length >= 2);
  assert.equal(staged.stages[0]!.input, staged.pool);
  for (let k = 1; k < staged.stages.length; k++) {
    assert.equal(staged.stages[k]!.input, staged.stages[k - 1]!.validated, `stage ${k} input`);
    assert.ok(staged.stages[k]!.validated <= staged.stages[k]!.input);
  }
  assert.equal(staged.validatedFinal, staged.stages.at(-1)!.validated);
});

test("selection keeps at most perSymbol cells per market and tallies match the book", () => {
  const report = simulateStaged(books, BOOK, DEFAULT_FLOORS, { hours: HOLD, preHours: PRE, end: END, strategies: preferences, perSymbol: 2 });
  const perMarket = new Map<string, number>();
  for (const cell of report.selected) perMarket.set(cell.symbol, (perMarket.get(cell.symbol) ?? 0) + 1);
  for (const count of perMarket.values()) assert.ok(count <= 2);
  // Stacking: the book is the sum of the selected cell replays, so trade counts must match exactly.
  const bookedTrades = report.bookLive.reduce((total, row) => total + row.trades, 0);
  const cellTrades = report.selected.reduce((total, cell) => total + cell.replay.samples, 0);
  assert.equal(bookedTrades, cellTrades);
  assert.equal(report.staged!.bookedCloses, cellTrades);
});

test("a gate that never allows books no trades and every blocked entry is a shadow", () => {
  const bars = walk(77, SPAN, START);
  const series = buildSeries(bars);
  const signals = bars.map((_, i) => signalAt("stochRsi", bars, series, i));
  const slots = Array.from({ length: HOLD }, (_, k) => hourAccumulator(bars[REPLAY_WARMUP_BARS + PRE + k]!.t));
  const laned: LanedReplay = { closes: [], allow: () => false, shadows: 0, shadowPnl: [] };
  replayWindow(bars, series.atr, signals, REPLAY_WARMUP_BARS + PRE, slots, 10, 0.0012, 4, 1.5, true, "breakeven", true, undefined, "1h", undefined, undefined, undefined, laned);
  assert.equal(slots.reduce((total, row) => total + row.trades, 0), 0);
  assert.ok(laned.shadows > 0, "the stochRsi test fixture should produce entries");
  assert.equal(laned.shadowPnl.length, laned.closes.length);
  assert.equal(laned.closes.length, laned.shadows);
});

test("an allowing gate reproduces the ungated holdout", () => {
  const bars = walk(78, SPAN, START);
  const series = buildSeries(bars);
  const signals = bars.map((_, i) => signalAt("stochRsi", bars, series, i));
  const run = (laned?: LanedReplay) => {
    const slots = Array.from({ length: HOLD }, (_, k) => hourAccumulator(bars[REPLAY_WARMUP_BARS + PRE + k]!.t));
    replayWindow(bars, series.atr, signals, REPLAY_WARMUP_BARS + PRE, slots, 10, 0.0012, 4, 1.5, true, "breakeven", true, undefined, "1h", undefined, undefined, undefined, laned);
    return slots.map((row) => [row.trades, row.realized]);
  };
  const open = run({ closes: [], allow: () => true, shadows: 0, shadowPnl: [] });
  assert.deepEqual(open, run(undefined));
});

test("the staged run is deterministic", () => {
  const a = simulateStaged(books, BOOK, DEFAULT_FLOORS, { hours: HOLD, preHours: PRE, end: END, strategies: preferences });
  const b = simulateStaged(books, BOOK, DEFAULT_FLOORS, { hours: HOLD, preHours: PRE, end: END, strategies: preferences });
  assert.deepEqual(a.staged, b.staged);
  assert.deepEqual(a.bookLive, b.bookLive);
});
