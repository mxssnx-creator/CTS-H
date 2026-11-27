import assert from "node:assert/strict";
import test from "node:test";
import { evaluateLane, basePlan, ladder, laneValue, makeLane, mainPlan, median, stagePlan, thinPlan, verdict, withMinPf } from "./lanes.ts";

test("a lane reads only its last N closes and uses every close when fewer exist", () => {
  const pnls = [5, -1, -1, 3];
  assert.deepEqual(laneValue(pnls, 2), { pf: 3, n: 2, net: 2 });
  assert.equal(laneValue(pnls, 10).n, 4);
  assert.equal(laneValue([], 4).n, 0);
});

test("positive lanes confirm but never veto; both lanes can veto", () => {
  const losing = [-1, -1, -1, -1, -1];
  const posLane = makeLane("long", 5, "positive");
  const bothLane = makeLane("short", 5, "both");
  assert.equal(evaluateLane(losing, posLane).sign, 0);
  assert.equal(evaluateLane(losing, bothLane).sign, -1);
  const winning = [2, 2, 2, 2, 2];
  assert.equal(evaluateLane(winning, posLane).sign, 1);
});

test("a lane with too few samples gives no evidence", () => {
  const lane = makeLane("short", 8, "both");
  assert.equal(lane.minSamples, 4);
  assert.equal(evaluateLane([1, 1, 1], lane).sign, 0);
  // The evidence floor applies to the whole history, not to the window: one close is never enough.
  assert.equal(evaluateLane([1], makeLane("last", 1, "both")).sign, 0);
  assert.equal(evaluateLane([1, 1, 1, 1], makeLane("last", 1, "both")).sign, 1);
});

test("validation needs no veto and at least one confirmation", () => {
  const lanes = [makeLane("last", 1, "both"), makeLane("short", 4, "positive")];
  assert.equal(verdict([3, 2, 1, 4], lanes).validated, true);
  // Last trade lost: the both-mode lane vetoes even though the positive lane confirms.
  assert.equal(verdict([3, 2, 1, -4], lanes).validated, false);
  // Only a positive lane with no confirmation: nothing validates.
  assert.equal(verdict([-1, -1, -1, -1], [makeLane("short", 4, "positive")]).validated, false);
  assert.equal(verdict([], lanes).validated, false);
});

test("the stage plans follow the specification", () => {
  assert.deepEqual(basePlan().lanes.map((lane) => lane.id), ["long10", "long20", "long30", "short4", "short8", "last1", "last2", "last3", "last4"]);
  assert.ok(basePlan().lanes.filter((lane) => lane.kind === "long").every((lane) => lane.mode === "both"));
  assert.equal(basePlan().lanes.find((lane) => lane.id === "short4")!.mode, "both");
  assert.deepEqual(mainPlan().lanes.filter((lane) => lane.kind === "short").map((lane) => lane.window), [8, 12, 16]);
  assert.ok(mainPlan().lanes.filter((lane) => lane.kind === "short").every((lane) => lane.mode === "positive"));
  assert.ok(mainPlan().lanes.filter((lane) => lane.kind === "last").every((lane) => lane.mode === "both"));
  assert.deepEqual(thinPlan(1).lanes.filter((lane) => lane.kind === "short").map((lane) => lane.window), [8, 10, 12, 14, 16]);
  assert.equal(thinPlan(2).lanes.filter((lane) => lane.kind === "short").length, 9);
  assert.deepEqual(thinPlan(2).lanes.filter((lane) => lane.kind === "long").map((lane) => lane.window), [10, 15, 20, 25, 30]);
  assert.ok(thinPlan(2).lanes.filter((lane) => lane.kind === "long").every((lane) => lane.mode === "both"));
});

test("the recursive plan extends with thinner stages and stops at its depth", () => {
  assert.equal(stagePlan(0).length, 2);
  assert.equal(stagePlan(2).length, 4);
  assert.throws(() => stagePlan(5));
  assert.throws(() => withMinPf(stagePlan(1), 0));
});

test("ladders and medians", () => {
  assert.deepEqual(ladder(10, 30, 10), [10, 20, 30]);
  assert.deepEqual(ladder(1, 4, 1), [1, 2, 3, 4]);
  assert.throws(() => ladder(4, 2, 1));
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), 0);
});

test("the stage scan matches the per-cell verdict on random position histories", async () => {
  const { scanStage } = await import("./lanes.ts");
  let state = 9;
  const random = () => {
    state = (state * 1_103_515_245 + 12_345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
  const cells = Array.from({ length: 300 }, () => Array.from({ length: Math.floor(random() * 25) }, () => (random() - 0.45) * 2));
  const lanes = [...basePlan().lanes, ...mainPlan().lanes];
  const scan = scanStage(cells, lanes);
  cells.forEach((pnls, index) => {
    const reference = verdict(pnls, lanes);
    assert.equal(scan.validated[index] === 1, reference.validated, `cell ${index}`);
  });
  lanes.forEach((lane, index) => {
    const evals = cells.map((pnls) => evaluateLane(pnls, lane));
    assert.equal(scan.tallies[index]!.confirmed, evals.filter((item) => item.sign > 0).length, lane.id);
    assert.equal(scan.tallies[index]!.vetoed, evals.filter((item) => item.sign < 0).length, lane.id);
  });
  assert.equal(scan.vetoedCells, cells.filter((pnls) => verdict(pnls, lanes).vetoed > 0).length);
});
