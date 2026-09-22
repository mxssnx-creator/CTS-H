import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_FLOORS } from "./constants.ts";
import { blockQty, clampAxisPartial, clampBlockVol } from "./math.ts";
import { cellRollup, indicationBoard, sizedNotional, syncBooks, type Bar } from "./process.ts";

function bars(n = 90, drift = 0.003): Bar[] {
  const out: Bar[] = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    const o = p;
    p = p * (1 + drift);
    const c = p;
    out.push({
      t: 1_700_000_000_000 + i * 60_000,
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
  assert.equal(board.length, 8);
  assert.ok(board.some((row) => row.side !== 0));
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
