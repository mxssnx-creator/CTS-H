import { PF_NO_LOSS } from "./constants.ts";
import { NEUTRAL_PF, profitFactor } from "./math.ts";

// Position-history lanes. Each lane evaluates the last N closes of one cell independently.
// Pure functions only: no replay state, so every rule here can be tested on its own.
//
// Conventions:
// - PF is computed on P&L after round-trip costs, so PF 1.0 is neutral (net zero) and PF 1.1 is net profit
//   equal to 10% of gross loss.
// - The cost floor makes that margin explicit: PF must reach 1 + costMultiple × (costs / gross loss), so with
//   costMultiple 1.0 a 1.1 floor equals one round-trip cost whenever costs are 10% of gross loss.

export type LaneKind = "long" | "short" | "last";
export type LaneMode = "positive" | "both";

// A cell's closed positions in exit order. Each cost is the round-trip cost of that close, already inside its pnl.
export type Closes = { pnls: readonly number[]; costs: readonly number[] };

export type LanePolicy = {
  // PF floor for lanes without their own tuned value. 1.0 is neutral.
  minPf: number;
  // Tuned PF floor per relation (lane id), e.g. { short8: 1.12 }. Lanes without an entry use minPf.
  laneMinPf: Record<string, number>;
  // PF must reach 1 + costMultiple × (costs / gross loss) in every lane.
  costMultiple: number;
  // Auto PF: extra PF while a lane has few closes, as the engine's requiredPf does.
  autoPenalty: number;
  autoSamples: number;
  // Lanes and whole-history validation need positive net P&L.
  requireNet: boolean;
  // Thin stage k raises every floor by ratchetStep × k.
  ratchetStep: number;
};

// Per-relation PF floors tuned on research windows R1–R7 by scripts/cts-h-lane-tune.ts (two passes, grid 1.00–1.50).
// They improved net on two validation sets that the search never read (fresh: −6.84 vs −7.00; earlier: −7.16 vs −7.68),
// but no window reached positive net. Relations not listed use minPf (neutral 1.0) plus the cost floor.
export const TUNED_LANE_MIN_PF: Record<string, number> = {
  long10: 1.15,
  long25: 1.4,
  short4: 1.3,
  short8: 1.5,
  last3: 1.5,
};

export const DEFAULT_LANE_POLICY: LanePolicy = {
  minPf: 1,
  laneMinPf: TUNED_LANE_MIN_PF,
  costMultiple: 1,
  autoPenalty: 0.15,
  autoSamples: 4,
  requireNet: true,
  ratchetStep: 0.05,
};

export const DEFAULT_MIN_PF = DEFAULT_LANE_POLICY.minPf;
// A lane gives evidence only once the cell has at least this many closes in total. The window then
// selects the most recent closes it reads. Without this floor a single winning close can validate a cell.
export const MIN_EVIDENCE = 4;

export type Lane = {
  id: string;
  kind: LaneKind;
  window: number;
  mode: LaneMode;
  // Tuned floor for this relation, before the cost term, the auto PF term and the ratchet.
  minPf: number;
  ratchet: number;
  costMultiple: number;
  autoPenalty: number;
  autoSamples: number;
  requireNet: boolean;
  minSamples: number;
};

export type LaneStage = { id: string; name: string; lanes: Lane[] };

export type LaneEval = {
  lane: Lane;
  pf: number;
  n: number;
  net: number;
  costRatio: number;
  required: number;
  sign: 1 | 0 | -1;
};

export type Verdict = {
  validated: boolean;
  confirmed: number;
  vetoed: number;
  evals: LaneEval[];
};

// Required PF for one lane that read `n` closes with the given costs over gross loss.
export function laneRequiredPf(lane: Lane, n: number, costRatio: number): number {
  const floor = Math.max(lane.minPf, 1 + lane.costMultiple * costRatio);
  const support = Math.max(lane.autoSamples, n);
  return floor + lane.autoPenalty * Math.sqrt(lane.autoSamples / support) + lane.ratchet;
}

export function makeLane(
  kind: LaneKind,
  window: number,
  mode: LaneMode,
  policy: Partial<LanePolicy> = {},
  ratchet = 0,
): Lane {
  if (!Number.isInteger(window) || window < 1) throw new Error("Lane windows are positive whole numbers.");
  const p = { ...DEFAULT_LANE_POLICY, ...policy };
  const id = `${kind}${window}`;
  const minPf = p.laneMinPf?.[id] ?? p.minPf;
  if (!(minPf > 0)) throw new Error("The minimum PF must be positive.");
  if (!(p.costMultiple >= 0)) throw new Error("The cost multiple must be non-negative.");
  if (!(p.autoPenalty >= 0) || !(p.autoSamples >= 1)) throw new Error("Auto PF needs a non-negative penalty and at least one sample.");
  if (!(ratchet >= 0)) throw new Error("The ratchet must be non-negative.");
  return {
    id,
    kind,
    window,
    mode,
    minPf,
    ratchet,
    costMultiple: p.costMultiple,
    autoPenalty: p.autoPenalty,
    autoSamples: p.autoSamples,
    requireNet: p.requireNet,
    minSamples: MIN_EVIDENCE,
  };
}

// Inclusive integer ladder, e.g. ladder(8, 16, 4) = [8, 12, 16].
export function ladder(from: number, to: number, step: number): number[] {
  if (!(step >= 1) || from > to) throw new Error("A ladder needs from <= to and a step of at least 1.");
  const out: number[] = [];
  for (let value = from; value <= to; value += step) out.push(value);
  return out;
}

// PF, net, count and cost ratio over the last `window` closes. Fewer closes than the window use all of them.
export function laneValue(closes: Closes, window: number): { pf: number; n: number; net: number; costRatio: number } {
  const len = closes.pnls.length;
  const n = Math.min(window, len);
  let gp = 0;
  let gl = 0;
  let net = 0;
  let cost = 0;
  for (let i = len - n; i < len; i++) {
    const pnl = closes.pnls[i]!;
    net += pnl;
    cost += closes.costs[i] ?? 0;
    if (pnl > 0) gp += pnl;
    else gl -= pnl;
  }
  return { pf: profitFactor(gp, gl), n, net, costRatio: gl > 1e-12 ? cost / gl : 0 };
}

export function evaluateLane(closes: Closes, lane: Lane): LaneEval {
  const value = laneValue(closes, lane.window);
  const required = laneRequiredPf(lane, value.n, value.costRatio);
  const base = { lane, pf: value.pf, n: value.n, net: value.net, costRatio: value.costRatio, required };
  if (closes.pnls.length < lane.minSamples) return { ...base, sign: 0 };
  const pass = value.pf >= required && (!lane.requireNet || value.net > 0);
  if (pass) return { ...base, sign: 1 };
  return { ...base, sign: lane.mode === "both" ? -1 : 0 };
}

// A cell is validated when no lane vetoes it, at least one lane confirms it, and (when `netGate` is set)
// its full history shows positive net P&L.
export function verdict(closes: Closes, lanes: readonly Lane[], netGate = false): Verdict {
  const evals = lanes.map((lane) => evaluateLane(closes, lane));
  let confirmed = 0;
  let vetoed = 0;
  for (const item of evals) {
    if (item.sign > 0) confirmed += 1;
    else if (item.sign < 0) vetoed += 1;
  }
  let fullNet = 0;
  if (netGate) for (const pnl of closes.pnls) fullNet += pnl;
  return { validated: vetoed === 0 && confirmed > 0 && (!netGate || fullNet > 0), confirmed, vetoed, evals };
}

// Stage plan from the specification. Every lane checks both negative and positive results, except
// Main's short lanes, which are positive-only as specified.
export function basePlan(policy: Partial<LanePolicy> = {}): LaneStage {
  return {
    id: "base",
    name: "Base",
    lanes: [
      ...ladder(10, 30, 10).map((window) => makeLane("long", window, "both", policy)),
      ...ladder(4, 8, 4).map((window) => makeLane("short", window, "both", policy)),
      ...ladder(1, 4, 1).map((window) => makeLane("last", window, "both", policy)),
    ],
  };
}

export function mainPlan(policy: Partial<LanePolicy> = {}): LaneStage {
  return {
    id: "main",
    name: "Main",
    lanes: [
      ...ladder(8, 16, 4).map((window) => makeLane("short", window, "positive", policy)),
      ...ladder(1, 4, 1).map((window) => makeLane("last", window, "both", policy)),
    ],
  };
}

// Thin stage `index` raises every floor by `ratchetStep × index`, so refinement can reject cells that the
// stage before validated.
export function thinPlan(index: number, policy: Partial<LanePolicy> = {}): LaneStage {
  if (!Number.isInteger(index) || index < 1) throw new Error("Thin stages are numbered from 1.");
  const p = { ...DEFAULT_LANE_POLICY, ...policy };
  const ratchet = p.ratchetStep * index;
  const shortStep = index === 1 ? 2 : 1;
  const lanes = [
    ...ladder(8, 16, shortStep).map((window) => makeLane("short", window, "positive", policy, ratchet)),
    ...ladder(1, 4, 1).map((window) => makeLane("last", window, "both", policy, ratchet)),
  ];
  if (index >= 2) lanes.push(...ladder(10, 30, 5).map((window) => makeLane("long", window, "both", policy, ratchet)));
  return { id: `thin${index}`, name: `Thin ${index}`, lanes };
}

// Base, Main, then up to `thins` refinement stages.
export function buildPlan(thins: number, policy: Partial<LanePolicy> = {}): LaneStage[] {
  if (!Number.isInteger(thins) || thins < 0 || thins > 4) throw new Error("Use 0 to 4 thin stages.");
  return [basePlan(policy), mainPlan(policy), ...Array.from({ length: thins }, (_, i) => thinPlan(i + 1, policy))];
}

export function median(values: readonly number[]): number {
  const sorted = values.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export type LaneSummary = {
  id: string;
  kind: LaneKind;
  window: number;
  mode: LaneMode;
  // Floor before the cost term, the auto PF term and the stage ratchet.
  floor: number;
  evidence: number;
  confirmed: number;
  vetoed: number;
  netPositive: number;
  medianPf: number;
};

export type StageSummary = {
  id: string;
  name: string;
  input: number;
  validated: number;
  vetoed: number;
  retained: number;
  medianPfIn: number;
  medianPfOut: number;
  relation: number;
  lanes: LaneSummary[];
};

export type StagedCellSummary = {
  symbol: string;
  name: string;
  closesPre: number;
  pfPre: number;
  netPre: number;
  closesHoldout: number;
  pfHoldout: number;
  netHoldout: number;
  shadows: number;
  shadowPf: number;
};

export type StagedSummary = {
  // Progressive: Base, Main and thin stages in turn. Legacy: one pass of the per-cell last-N gate, with no stages.
  logistics: "progressive" | "legacy";
  plan: string[];
  policy: LanePolicy;
  stages: StageSummary[];
  finalStage: string;
  perSymbol: number;
  minPf: number;
  minCloses: number;
  pool: number;
  validatedFinal: number;
  chosen: number;
  bookedCloses: number;
  shadows: number;
  shadowCloses: number;
  shadowPf: number;
  cells: StagedCellSummary[];
};

export type LaneTally = { evidence: number; confirmed: number; vetoed: number; netPositive: number; pfs: number[] };

// Single pass over a whole stage input. Returns the same validation as `verdict` per cell, with per-lane
// tallies, but allocates no per-lane objects; this is the hot path for stage evaluation.
export function scanStage(
  cells: readonly Closes[],
  lanes: readonly Lane[],
  netGate = false,
): { validated: Uint8Array; vetoedCells: number; tallies: LaneTally[] } {
  const validated = new Uint8Array(cells.length);
  const tallies: LaneTally[] = lanes.map(() => ({ evidence: 0, confirmed: 0, vetoed: 0, netPositive: 0, pfs: [] }));
  let vetoedCells = 0;
  for (let c = 0; c < cells.length; c++) {
    const { pnls, costs } = cells[c]!;
    const len = pnls.length;
    let confirmed = 0;
    let vetoed = 0;
    for (let l = 0; l < lanes.length; l++) {
      const lane = lanes[l]!;
      if (len < lane.minSamples) continue;
      const n = Math.min(lane.window, len);
      let gp = 0;
      let gl = 0;
      let net = 0;
      let cost = 0;
      for (let i = len - n; i < len; i++) {
        const pnl = pnls[i]!;
        net += pnl;
        cost += costs[i] ?? 0;
        if (pnl > 0) gp += pnl;
        else gl -= pnl;
      }
      const pf = gl < 1e-12 ? (gp > 1e-12 ? PF_NO_LOSS : NEUTRAL_PF) : gp / gl;
      const costRatio = gl > 1e-12 ? cost / gl : 0;
      const tally = tallies[l]!;
      tally.evidence += 1;
      tally.pfs.push(pf);
      if (net > 0) tally.netPositive += 1;
      const pass = pf >= laneRequiredPf(lane, n, costRatio) && (!lane.requireNet || net > 0);
      if (pass) {
        confirmed += 1;
        tally.confirmed += 1;
      } else if (lane.mode === "both") {
        vetoed += 1;
        tally.vetoed += 1;
      }
    }
    if (vetoed) vetoedCells += 1;
    let fullNet = 0;
    if (netGate) for (let i = 0; i < len; i++) fullNet += pnls[i]!;
    validated[c] = vetoed === 0 && confirmed > 0 && (!netGate || fullNet > 0) ? 1 : 0;
  }
  return { validated, vetoedCells, tallies };
}
