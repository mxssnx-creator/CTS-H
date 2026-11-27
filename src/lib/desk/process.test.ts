import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_FLOORS, INDICATIONS } from "./constants.ts";
import { blockQty, clampAxisPartial, clampBlockVol } from "./math.ts";
import { cellRollup, exitOnBar, indicationBoard, markPositions, mergeFills, simulateSessions, sizedNotional, syncBooks, type Bar, type LivePos } from "./process.ts";

function bars(n = 90, drift = 0.003): Bar[] {
  const out: Bar[] = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    const o = p;
    p = p * (1 + drift);
    const c = p;
    out.push({
      t: 1_700_000_000_000 + i * 3_600_000,
      o,
      h: Math.max(o, c) * 1.002,
      l: Math.min(o, c) * 0.998,
      c,
      v: 50 + (i % 7) * 20,
    });
  }
  return out;
}

test("closed-bar pass scores the short grid on a trend", () => {
  const book = { symbol: "BTC-USDT", bars: bars() };
  const t0 = Date.now();
  const first = syncBooks([], [book], 10_000, DEFAULT_FLOORS);
  const ms = Date.now() - t0;
  assert.equal(first.symbols, 1);
  assert.equal(first.cells.length, 126 * 8);
  assert.ok(first.closes > 0, "expected intern closes");
  assert.ok(ms < 1500, `walk too slow ${ms}ms`);
  const again = syncBooks(first.cells, [book], 10_000, DEFAULT_FLOORS);
  assert.equal(again.closes, 0);
  const roll = cellRollup(first.cells);
  assert.equal(roll.samples, first.closes);
  const board = indicationBoard(book.bars);
  assert.equal(board.length, INDICATIONS.length);
  assert.ok(board.some((row) => row.side !== 0));
});

test("both-hit bars take the stop with either candle color", () => {
  const bull = { t: 1, o: 100, h: 110, l: 90, c: 105, v: 1 };
  const bear = { t: 2, o: 105, h: 110, l: 90, c: 95, v: 1 };
  const longBull = exitOnBar(1, 108, 92, bull, 1);
  const longBear = exitOnBar(1, 108, 92, bear, 1);
  assert.equal(longBull?.reason, "sl");
  assert.equal(longBear?.reason, "sl");
});

test("replay range follows the requested window", () => {
  const book = { symbol: "BTC-USDT", bars: bars(80, 0.002) };
  const report = simulateSessions([book], 10_000, DEFAULT_FLOORS, { hours: 12, size: "base" });
  assert.equal(report.ready, true);
  assert.equal(report.pre.length, 12);
  assert.equal(report.live.length, 12);
  assert.equal(report.bookPre.length, 12);
  assert.match(report.note, /12h/);
  assert.match(report.note, /base/);
});

test("session splits two closed 24h windows", () => {
  const book = { symbol: "BTC-USDT", bars: bars(80, 0.002) };
  const report = simulateSessions([book], 10_000, DEFAULT_FLOORS);
  assert.equal(report.ready, true);
  assert.equal(report.pre.length, 24);
  assert.equal(report.live.length, 24);
  assert.equal(report.bookPre.length, 24);
  assert.equal(report.bookLive.length, 24);
  for (const row of [...report.pre, ...report.live, ...report.bookPre, ...report.bookLive]) {
    assert.ok(Number.isFinite(row.net));
    assert.ok(Number.isFinite(row.realized));
  }
});

test("axis and block stay inside 2.5x and reject 0.08", () => {
  assert.equal(clampBlockVol(0.08), 0.2);
  assert.equal(clampAxisPartial(0.08), 3);
  const base = 12;
  const sized = sizedNotional(base, { block: true, axis: true });
  assert.ok(sized <= base * 2.5 + 1e-9);
  assert.ok(sized > base);
  assert.ok(blockQty(base) <= base * 2.5 + 1e-9);
});

function leg(over: Partial<LivePos> = {}): LivePos {
  return {
    id: "x:1",
    symbol: "BTC-USDT",
    side: 1,
    qty: 1,
    qtyBase: 1,
    entry: 100,
    mark: 100,
    peak: 100,
    sl: 90,
    tp: 110,
    combo: "tp0.48_sl0.75",
    indication: "move",
    hold: 0,
    dca: 0,
    openedAt: 0,
    system: "CTS-H",
    connection: "bingx-public",
    type: "position",
    ...over,
  };
}

test("live hold follows closed hours and a repeat quote does not age the leg", () => {
  const hour = 3_600_000;
  const once = markPositions([leg({ openedAt: 10 * hour })], { "BTC-USDT": 101 }, { trail: false, dca: false, equity: 10_000, asOf: 12 * hour });
  assert.equal(once.open[0]?.hold, 2);
  const again = markPositions(once.open, { "BTC-USDT": 102 }, { trail: false, dca: false, equity: 10_000, asOf: 12 * hour });
  assert.equal(again.open[0]?.hold, 2);
  assert.equal(again.closed.length, 0);
  const aged = markPositions([leg()], { "BTC-USDT": 101 }, { trail: false, dca: false, equity: 10_000, asOf: 24 * hour });
  assert.equal(aged.closed[0]?.reason, "hold");
  const stopped = markPositions([leg({ sl: 99, tp: 110 })], { "BTC-USDT": 97 }, { trail: false, dca: false, equity: 10_000, asOf: hour });
  assert.equal(stopped.closed[0]?.reason, "sl");
  assert.equal(stopped.closed[0]?.px, 99);
});

test("intern tape keeps earlier fills when a later bar arrives", () => {
  const older = { id: "i:a", tape: "intern" as const, symbol: "BTC-USDT", combo: "tp0.48_sl0.75", pnl: 1, px: 10, ts: 1, side: 1 as const };
  const newer = { ...older, id: "i:b", ts: 2, pnl: 2 };
  const merged = mergeFills([older], [older, newer]);
  assert.deepEqual(merged.map((f) => f.id), ["i:b", "i:a"]);
  assert.equal(mergeFills(merged, [newer]).length, 2);
});

test("a flat cell does not keep the side of a closed leg", () => {
  const book = { symbol: "BTC-USDT", bars: bars(40, 0) };
  const first = syncBooks([], [book], 10_000, DEFAULT_FLOORS);
  const stuck = first.cells.map((c) => ({ ...c, side: 1 as const, leg: null }));
  const again = syncBooks(stuck, [book], 10_000, DEFAULT_FLOORS);
  assert.ok(again.cells.length > 0);
  assert.ok(again.cells.every((c) => c.side === 0));
});


test("holdout prices cannot change preselection and stale coverage cannot qualify", () => {
  const length = 132;
  const hourly = bars(length, .004).map((bar) => ({ ...bar, closed: true }));
  const boundary = hourly.length - 48;
  const altered = hourly.map((bar, i) => i < boundary ? bar : ({ ...bar, h: bar.h * 1.1, l: bar.l * .9 }));
  const a = simulateSessions([{ symbol: "BTC-USDT", bars: hourly }], 10_000, DEFAULT_FLOORS, { hours: 48 });
  const b = simulateSessions([{ symbol: "BTC-USDT", bars: altered }], 10_000, DEFAULT_FLOORS, { hours: 48 });
  assert.equal(a.ready, true);
  assert.deepEqual(a.bookNames, b.bookNames);
  assert.deepEqual(a.bookPre, b.bookPre);
  const gap = hourly.filter((_, i) => i !== length - 8);
  const c = simulateSessions([{ symbol: "BTC-USDT", bars: gap }], 10_000, DEFAULT_FLOORS, { hours: 48 });
  assert.equal(c.ready, false);
  assert.deepEqual(c.unavailable, ["BTC-USDT"]);
});
