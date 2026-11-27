import assert from "node:assert/strict";
import test from "node:test";
import {
  basePlan,
  buildPlan,
  DEFAULT_LANE_POLICY,
  evaluateLane,
  ladder,
  laneRequiredPf,
  laneValue,
  mainPlan,
  makeLane,
  median,
  scanStage,
  thinPlan,
  verdict,
  type Closes,
} from "./lanes.ts";

// Closes with no costs, for the rules that do not involve them.
const free = (pnls: number[]): Closes => ({ pnls, costs: pnls.map(() => 0) });

test("a lane reads only its last N closes and reports net and cost ratio", () => {
  const closes: Closes = { pnls: [5, -1, -1, 3], costs: [0.5, 0.25, 0.25, 0.5] };
  const two = laneValue(closes, 2);
  assert.equal(two.pf, 3);
  assert.equal(two.n, 2);
  assert.equal(two.net, 2);
  // Costs of the last two closes are 0.25 + 0.5 = 0.75 over gross loss 1.0.
  assert.equal(two.costRatio, 0.75);
  assert.equal(laneValue(closes, 10).n, 4);
  assert.equal(laneValue(free([]), 4).n, 0);
});

test("PF 1.0 is neutral: zero net reads as PF 1.0", () => {
  const value = laneValue(free([1, -1, 1, -1]), 4);
  assert.equal(value.net, 0);
  assert.equal(value.pf, 1);
  assert.equal(laneValue(free([]), 4).pf, 1);
});

test("the default policy is neutral PF with a one-cost margin, auto PF, net required and ratchet", () => {
  assert.equal(DEFAULT_LANE_POLICY.minPf, 1);
  assert.equal(DEFAULT_LANE_POLICY.costMultiple, 1);
  assert.equal(DEFAULT_LANE_POLICY.autoPenalty, 0.15);
  assert.equal(DEFAULT_LANE_POLICY.autoSamples, 4);
  assert.equal(DEFAULT_LANE_POLICY.requireNet, true);
  assert.equal(DEFAULT_LANE_POLICY.ratchetStep, 0.05);
  assert.equal(DEFAULT_LANE_POLICY.laneMinPf.short8, 1.5);
  assert.equal(makeLane("short", 8, "positive").minPf, 1.5);
  assert.equal(makeLane("short", 12, "positive").minPf, 1);
});

test("the cost floor makes PF 1.1 equal one round-trip cost when costs are 10% of gross loss", () => {
  // Isolate the cost rule: no tuned per-relation floor and no auto PF term.
  const lane = makeLane("short", 4, "both", { autoPenalty: 0, laneMinPf: {} });
  // Gross loss 1.0 and costs 0.1: the floor is 1 + 1 × 0.1 = 1.1.
  assert.ok(Math.abs(laneRequiredPf(lane, 4, 0.1) - 1.1) < 1e-12);
  const winning: Closes = { pnls: [0.6, 0.6, -1, 0], costs: [0.03, 0.03, 0.04, 0] };
  assert.equal(evaluateLane(winning, lane).sign, 1);
  const neutral: Closes = { pnls: [0.5, 0.5, -1, 0], costs: [0.03, 0.03, 0.04, 0] };
  assert.equal(evaluateLane(neutral, lane).sign, -1);
});

test("a tuned floor per relation overrides the policy floor for that lane only", () => {
  const policy = { minPf: 1, laneMinPf: { short8: 1.3 }, costMultiple: 0, autoPenalty: 0 };
  assert.equal(makeLane("short", 8, "both", policy).minPf, 1.3);
  assert.equal(makeLane("short", 4, "both", policy).minPf, 1);
  assert.equal(makeLane("last", 1, "both", policy).minPf, 1);
  assert.throws(() => makeLane("last", 1, "both", { minPf: 0 }));
});

test("each lane's auto PF adds its penalty for short evidence and the ratchet adds on top", () => {
  const lane = makeLane("long", 30, "both", { minPf: 1.05, autoPenalty: 0.15, autoSamples: 4, costMultiple: 0 });
  assert.ok(Math.abs(laneRequiredPf(lane, 4, 0) - 1.2) < 1e-12);
  assert.ok(laneRequiredPf(lane, 2, 0) > laneRequiredPf(lane, 16, 0));
  const ratcheted = makeLane("long", 30, "both", { minPf: 1.05, autoPenalty: 0, costMultiple: 0 }, 0.1);
  assert.ok(Math.abs(laneRequiredPf(ratcheted, 30, 0) - 1.15) < 1e-12);
});

test("positive lanes confirm but never veto; both lanes can veto", () => {
  const losing = free([-1, -1, -1, -1, -1]);
  const posLane = makeLane("long", 5, "positive", { autoPenalty: 0, costMultiple: 0 });
  const bothLane = makeLane("short", 5, "both", { autoPenalty: 0, costMultiple: 0 });
  assert.equal(evaluateLane(losing, posLane).sign, 0);
  assert.equal(evaluateLane(losing, bothLane).sign, -1);
  assert.equal(evaluateLane(free([2, 2, 2, 2, 2]), posLane).sign, 1);
});

test("PF below neutral never confirms a lane, even when the net requirement is off", () => {
  // Last four closes: gains 1, losses 1.5. PF 0.67 is below the neutral floor of 1.0, and net is -0.5.
  const pnls = [9, 1, -0.75, -0.75, 0];
  const strict = makeLane("short", 4, "both", { minPf: 0.5, autoPenalty: 0, costMultiple: 0, requireNet: true });
  const loose = makeLane("short", 4, "positive", { minPf: 0.5, autoPenalty: 0, costMultiple: 0, requireNet: false });
  assert.equal(evaluateLane(free(pnls), strict).sign, -1);
  assert.equal(evaluateLane(free(pnls), loose).sign, 0);
  // Any window with PF at or above neutral already has non-negative net, so the net check binds only the cell.
  assert.equal(evaluateLane(free([2, 1, -1, 0.5]), loose).sign, 1);
});

test("a lane with too few samples gives no evidence", () => {
  const lane = makeLane("short", 8, "both");
  assert.equal(lane.minSamples, 4);
  assert.equal(evaluateLane(free([1, 1, 1]), lane).sign, 0);
  assert.equal(evaluateLane(free([1]), makeLane("last", 1, "both")).sign, 0);
  assert.equal(evaluateLane(free([1, 1, 1, 1]), makeLane("last", 1, "both")).sign, 1);
});

test("validation needs no veto and at least one confirmation", () => {
  const lanes = [makeLane("last", 1, "both"), makeLane("short", 4, "positive")];
  assert.equal(verdict(free([3, 2, 1, 4]), lanes).validated, true);
  assert.equal(verdict(free([3, 2, 1, -4]), lanes).validated, false);
  assert.equal(verdict(free([-1, -1, -1, -1]), [makeLane("short", 4, "positive")]).validated, false);
  assert.equal(verdict(free([]), lanes).validated, false);
});

test("the net gate rejects a cell whose recent window is positive but whose full history is negative", () => {
  const pnls = [-10, -10, -10, -10, 5, 5, 5, 5];
  const lanes = [makeLane("short", 4, "positive")];
  assert.equal(verdict(free(pnls), lanes, false).validated, true);
  assert.equal(verdict(free(pnls), lanes, true).validated, false);
  assert.equal(verdict(free([5, 5, 5, 5]), lanes, true).validated, true);
});

test("the stage plans follow the specification", () => {
  assert.deepEqual(basePlan().lanes.map((lane) => lane.id), ["long10", "long20", "long30", "short4", "short8", "last1", "last2", "last3", "last4"]);
  assert.ok(basePlan().lanes.every((lane) => lane.mode === "both"));
  assert.deepEqual(mainPlan().lanes.filter((lane) => lane.kind === "short").map((lane) => lane.window), [8, 12, 16]);
  assert.ok(mainPlan().lanes.filter((lane) => lane.kind === "short").every((lane) => lane.mode === "positive"));
  assert.ok(mainPlan().lanes.filter((lane) => lane.kind === "last").every((lane) => lane.mode === "both"));
  assert.deepEqual(thinPlan(1).lanes.filter((lane) => lane.kind === "short").map((lane) => lane.window), [8, 10, 12, 14, 16]);
  assert.equal(thinPlan(2).lanes.filter((lane) => lane.kind === "short").length, 9);
  assert.deepEqual(thinPlan(2).lanes.filter((lane) => lane.kind === "long").map((lane) => lane.window), [10, 15, 20, 25, 30]);
  assert.ok(thinPlan(2).lanes.filter((lane) => lane.kind === "long").every((lane) => lane.mode === "both"));
});

test("each thin stage ratchets every floor by one more step", () => {
  const plan = buildPlan(2, { minPf: 1.05, ratchetStep: 0.05 });
  assert.equal(plan.length, 4);
  assert.equal(plan[0]!.lanes[0]!.ratchet, 0);
  assert.equal(plan[2]!.lanes[0]!.ratchet, 0.05);
  assert.ok(Math.abs(plan[3]!.lanes[0]!.ratchet - 0.1) < 1e-12);
  assert.throws(() => buildPlan(5));
});

test("ladders and medians", () => {
  assert.deepEqual(ladder(10, 30, 10), [10, 20, 30]);
  assert.deepEqual(ladder(1, 4, 1), [1, 2, 3, 4]);
  assert.throws(() => ladder(4, 2, 1));
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), 0);
});

test("the stage scan matches the per-cell verdict on random histories with costs, with and without the net gate", () => {
  let state = 9;
  const random = () => {
    state = (state * 1_103_515_245 + 12_345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
  const cells: Closes[] = Array.from({ length: 300 }, () => {
    const length = Math.floor(random() * 25);
    return {
      pnls: Array.from({ length }, () => (random() - 0.45) * 2),
      costs: Array.from({ length }, () => random() * 0.1),
    };
  });
  const lanes = [...basePlan().lanes, ...mainPlan().lanes];
  for (const netGate of [false, true]) {
    const scan = scanStage(cells, lanes, netGate);
    cells.forEach((closes, index) => {
      assert.equal(scan.validated[index] === 1, verdict(closes, lanes, netGate).validated, `cell ${index} gate ${netGate}`);
    });
    lanes.forEach((lane, index) => {
      const evals = cells.map((closes) => evaluateLane(closes, lane));
      assert.equal(scan.tallies[index]!.confirmed, evals.filter((item) => item.sign > 0).length, lane.id);
      assert.equal(scan.tallies[index]!.vetoed, evals.filter((item) => item.sign < 0).length, lane.id);
      assert.equal(scan.tallies[index]!.netPositive, cells.filter((closes, i) => closes.pnls.length >= lane.minSamples && evals[i]!.net > 0).length, lane.id);
    });
    assert.equal(scan.vetoedCells, cells.filter((closes) => verdict(closes, lanes, netGate).vetoed > 0).length);
  }
});
