import assert from "node:assert/strict";
import test from "node:test";
import { allShortCombos, clampAxisPartial, clampBlockVol, closePnl, liveShortOk, profitFactor, sanitizeBlockCounts } from "./math.ts";

test("profit factor is neutral at 1.0 when gross profit and loss are both zero", () => {
  assert.equal(profitFactor(0, 0), 1);
  assert.equal(profitFactor(2, 2), 1);
  assert.equal(profitFactor(0, 3), 0);
});

test("126 short combos", () => {
  assert.equal(allShortCombos().length, 126);
});

test("live floors", () => {
  assert.equal(liveShortOk(0.42, 1.5), false);
  assert.equal(liveShortOk(0.48, 0.5), false);
  assert.equal(liveShortOk(0.48, 0.75), true);
});

test("pf and rt", () => {
  assert.equal(profitFactor(4, 0), 4);
  const pnl = closePnl(1, 100, 101, 1);
  assert.ok(pnl < 1);
});

test("reject 0.08 and skip block 2", () => {
  assert.equal(clampBlockVol(0.08), 0.2);
  assert.equal(clampAxisPartial(0.08), 3);
  assert.deepEqual(sanitizeBlockCounts([1, 2, 3, 4, 5, 6]), [1, 3, 4, 5, 6]);
});
