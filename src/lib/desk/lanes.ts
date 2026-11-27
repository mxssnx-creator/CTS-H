import { PF_NO_LOSS } from "./constants.ts";
import { profitFactor } from "./math.ts";

// Position-history lanes. Each lane evaluates the last N closes of one cell independently.
// Pure functions only: no replay state, so every rule here can be tested on its own.

export type LaneKind = "long" | "short" | "last";
export type LaneMode = "positive" | "both";

export type Lane = {
  id: string;
  kind: LaneKind;
  window: number;
  mode: LaneMode;
  minPf: number;
  minSamples: number;
};

export type LaneStage = { id: string; name: string; lanes: Lane[] };

export type LaneEval = { lane: Lane; pf: number; n: number; sign: 1 | 0 | -1 };

export type Verdict = {
  validated: boolean;
  confirmed: number;
  vetoed: number;
  evals: LaneEval[];
};

export const DEFAULT_MIN_PF = 1;
// A lane gives evidence only once the cell has at least this many closes in total. The window then
// selects the most recent closes it reads. Without this floor a single winning close can validate a cell.
export const MIN_EVIDENCE = 4;

export function makeLane(kind: LaneKind, window: number, mode: LaneMode, minPf = DEFAULT_MIN_PF): Lane {
  if (!Number.isInteger(window) || window < 1) throw new Error("Lane windows are positive whole numbers.");
  return { id: `${kind}${window}`, kind, window, mode, minPf, minSamples: MIN_EVIDENCE };
}

// Inclusive integer ladder, e.g. ladder(8, 16, 4) = [8, 12, 16].
export function ladder(from: number, to: number, step: number): number[] {
  if (!(step >= 1) || from > to) throw new Error("A ladder needs from <= to and a step of at least 1.");
  const out: number[] = [];
  for (let value = from; value <= to; value += step) out.push(value);
  return out;
}

// PF over the last `window` closes. Fewer closes than the window use every close available.
export function laneValue(pnls: readonly number[], window: number): { pf: number; n: number; net: number } {
  const n = Math.min(window, pnls.length);
  let gp = 0;
  let gl = 0;
  let net = 0;
  for (let i = pnls.length - n; i < pnls.length; i++) {
    const pnl = pnls[i]!;
    net += pnl;
    if (pnl > 0) gp += pnl;
    else gl -= pnl;
  }
  return { pf: profitFactor(gp, gl), n, net };
}

export function evaluateLane(pnls: readonly number[], lane: Lane): LaneEval {
  const value = laneValue(pnls, lane.window);
  if (pnls.length < lane.minSamples) return { lane, pf: value.pf, n: value.n, sign: 0 };
  if (value.pf >= lane.minPf) return { lane, pf: value.pf, n: value.n, sign: 1 };
  return { lane, pf: value.pf, n: value.n, sign: lane.mode === "both" ? -1 : 0 };
}

// A cell is validated when no lane vetoes it and at least one lane confirms it.
export function verdict(pnls: readonly number[], lanes: readonly Lane[]): Verdict {
  const evals = lanes.map((lane) => evaluateLane(pnls, lane));
  let confirmed = 0;
  let vetoed = 0;
  for (const item of evals) {
    if (item.sign > 0) confirmed += 1;
    else if (item.sign < 0) vetoed += 1;
  }
  return { validated: vetoed === 0 && confirmed > 0, confirmed, vetoed, evals };
}

// Stage plan from the specification. Thin stages follow the Main pattern and refine the steps.
export function basePlan(): LaneStage {
  return {
    id: "base",
    name: "Base",
    lanes: [
      ...ladder(10, 30, 10).map((window) => makeLane("long", window, "both")),
      ...ladder(4, 8, 4).map((window) => makeLane("short", window, "both")),
      ...ladder(1, 4, 1).map((window) => makeLane("last", window, "both")),
    ],
  };
}

export function mainPlan(): LaneStage {
  return {
    id: "main",
    name: "Main",
    lanes: [
      ...ladder(8, 16, 4).map((window) => makeLane("short", window, "positive")),
      ...ladder(1, 4, 1).map((window) => makeLane("last", window, "both")),
    ],
  };
}

export function thinPlan(index: number): LaneStage {
  if (!Number.isInteger(index) || index < 1) throw new Error("Thin stages are numbered from 1.");
  const shortStep = index === 1 ? 2 : 1;
  const lanes = [
    ...ladder(8, 16, shortStep).map((window) => makeLane("short", window, "positive")),
    ...ladder(1, 4, 1).map((window) => makeLane("last", window, "both")),
  ];
  if (index >= 2) lanes.push(...ladder(10, 30, 5).map((window) => makeLane("long", window, "both")));
  return { id: `thin${index}`, name: `Thin ${index}`, lanes };
}

// Recursive plan: Base, Main, then up to `thins` refinement stages.
export function stagePlan(thins = 2): LaneStage[] {
  if (!Number.isInteger(thins) || thins < 0 || thins > 4) throw new Error("Use 0 to 4 thin stages.");
  return [basePlan(), mainPlan(), ...Array.from({ length: thins }, (_, i) => thinPlan(i + 1))];
}

// Each thin stage raises the PF bar by `step` so refinement can reject cells that Main validated.
export function ratchetPlan(plan: LaneStage[], minPf: number, step = 0.05): LaneStage[] {
  if (!(minPf > 0) || !(step >= 0)) throw new Error("Use a positive minimum PF and a non-negative step.");
  return plan.map((stage) => {
    const thin = stage.id.startsWith("thin") ? Number(stage.id.slice(4)) : 0;
    const bar = minPf + step * thin;
    return { ...stage, lanes: stage.lanes.map((lane) => ({ ...lane, minPf: bar })) };
  });
}

// Applies one minimum PF to every lane of every stage.
export function withMinPf(plan: LaneStage[], minPf: number): LaneStage[] {
  if (!(minPf > 0)) throw new Error("The minimum PF must be positive.");
  return plan.map((stage) => ({
    ...stage,
    lanes: stage.lanes.map((lane) => ({ ...lane, minPf })),
  }));
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
  minPf: number;
  evidence: number;
  confirmed: number;
  vetoed: number;
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
  closesHoldout: number;
  pfHoldout: number;
  netHoldout: number;
  shadows: number;
  shadowPf: number;
};

export type StagedSummary = {
  plan: string[];
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

export type LaneTally = { evidence: number; confirmed: number; vetoed: number; pfs: number[] };

// Single pass over a whole stage input. Returns the same validation as `verdict` per cell, with per-lane
// tallies, but allocates no per-lane objects; this is the hot path for stage evaluation.
export function scanStage(
  cells: readonly (readonly number[])[],
  lanes: readonly Lane[],
): { validated: Uint8Array; vetoedCells: number; tallies: LaneTally[] } {
  const validated = new Uint8Array(cells.length);
  const tallies: LaneTally[] = lanes.map(() => ({ evidence: 0, confirmed: 0, vetoed: 0, pfs: [] }));
  let vetoedCells = 0;
  for (let c = 0; c < cells.length; c++) {
    const pnls = cells[c]!;
    const len = pnls.length;
    let confirmed = 0;
    let vetoed = 0;
    for (let l = 0; l < lanes.length; l++) {
      const lane = lanes[l]!;
      if (len < lane.minSamples) continue;
      const n = Math.min(lane.window, len);
      let gp = 0;
      let gl = 0;
      for (let i = len - n; i < len; i++) {
        const pnl = pnls[i]!;
        if (pnl > 0) gp += pnl;
        else gl -= pnl;
      }
      const pf = gl < 1e-12 ? (gp > 1e-12 ? PF_NO_LOSS : 0) : gp / gl;
      const tally = tallies[l]!;
      tally.evidence += 1;
      tally.pfs.push(pf);
      if (pf >= lane.minPf) {
        confirmed += 1;
        tally.confirmed += 1;
      } else if (lane.mode === "both") {
        vetoed += 1;
        tally.vetoed += 1;
      }
    }
    if (vetoed) vetoedCells += 1;
    validated[c] = vetoed === 0 && confirmed > 0 ? 1 : 0;
  }
  return { validated, vetoedCells, tallies };
}
