import { DEFAULT_TRAILS, type TrailSettings } from "./management.ts";
import { INDICATIONS, MAX_MUL, MODEL_STOP_RISK, type Indication } from "./constants.ts";
import { closePnl, profitFactor, stopCappedQty } from "./math.ts";

export const STRATEGY_TYPES = ["axis", "block", "dca", "relate"] as const;
export type StrategyType = (typeof STRATEGY_TYPES)[number];
export const STRATEGY_LABELS: Record<StrategyType, string> = {
  axis: "Axis",
  block: "Block",
  dca: "DCA",
  relate: "Relate",
};

export const STRATEGY_LIMITS = {
  volumeFactor: [0.1, 10, 0.1],
  minimumPf: [1, 4, 0.05],
  autoPfPenalty: [0, 2, 0.05],
  autoPfSamples: [4, 15, 1],
  trailActivation: [0.25, 0.85, 0.05],
  trailDistance: [0.2, 0.8, 0.05],
  axisRatio: [0, 0.5, 0.05],
  axisPf: [1, 4, 0.05],
  axisSamples: [4, 30, 1],
  axisLookback: [8, 50, 1],
  blockLevels: [1, 6, 1],
  blockRatio: [0, 0.5, 0.05],
  blockTargetShare: [0.15, 0.6, 0.05],
  blockPf: [1, 4, 0.05],
  dcaLevels: [1, 3, 1],
  dcaRatio: [0, 0.5, 0.05],
  dcaStopShare: [0.15, 0.8, 0.05],
  relateSteps: [1, 8, 1],
  relateRatio: [0, 0.5, 0.05],
  relatePf: [1, 4, 0.05],
  relateSamples: [4, 30, 1],
  relateLookback: [8, 50, 1],
} as const;

export type StrategyNumber = keyof typeof STRATEGY_LIMITS;
export type StrategySettings = TrailSettings &
  Record<StrategyType, boolean> &
  Record<StrategyNumber, number> & {
    blockMode: "shared" | "additive";
    relateMode: "shared" | "additive";
    relateScope: "configuration" | "symbol" | "overall";
    enabledIndications: readonly Indication[];
    shortRange: boolean;
    wideRange: boolean;
    autoPf: boolean;
    autoPfRecent: boolean;
  };

export const DEFAULT_STRATEGIES: StrategySettings = {
  ...DEFAULT_TRAILS,
  volumeFactor: 1,
  minimumPf: 1,
  autoPf: true,
  autoPfRecent: true,
  autoPfPenalty: 0.15,
  autoPfSamples: 4,
  enabledIndications: ["break", "ema", "rangeFade"],
  shortRange: true,
  wideRange: true,
  axis: false,
  block: false,
  dca: false,
  relate: false,
  axisRatio: 0.1,
  axisPf: 1.25,
  axisSamples: 6,
  axisLookback: 15,
  blockLevels: 2,
  blockRatio: 0.15,
  blockTargetShare: 0.4,
  blockPf: 1.2,
  blockMode: "shared",
  dcaLevels: 1,
  dcaRatio: 0.25,
  dcaStopShare: 0.4,
  relateSteps: 3,
  relateRatio: 0.1,
  relatePf: 1.2,
  relateSamples: 6,
  relateLookback: 15,
  relateMode: "shared",
  relateScope: "symbol",
};

export function normalizeStrategies(input?: Partial<StrategySettings>): StrategySettings {
  const config = { ...DEFAULT_STRATEGIES };
  if (!input) return config;
  for (const key of [
    ...STRATEGY_TYPES,
    "dynamic",
    "breakeven",
    "shortRange",
    "wideRange",
    "autoPf",
    "autoPfRecent",
  ] as const) {
    const value = input[key];
    if (typeof value === "boolean") config[key] = value;
  }
  if (Array.isArray(input.enabledIndications)) {
    config.enabledIndications = INDICATIONS.filter((kind) =>
      input.enabledIndications?.includes(kind),
    );
  }
  for (const key of Object.keys(STRATEGY_LIMITS) as StrategyNumber[]) {
    const value = input[key];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const [lo, hi, step] = STRATEGY_LIMITS[key];
    const bounded = Math.min(hi, Math.max(lo, value));
    config[key] =
      key === "volumeFactor"
        ? Math.round(bounded * 10) / 10
        : step === 1
          ? Math.round(bounded)
          : bounded;
  }
  if (config.axisSamples > config.axisLookback) config.axisSamples = config.axisLookback;
  if (config.relateSamples > config.relateLookback) config.relateSamples = config.relateLookback;
  if (input.blockMode === "additive" || input.blockMode === "shared")
    config.blockMode = input.blockMode;
  if (input.relateMode === "additive" || input.relateMode === "shared")
    config.relateMode = input.relateMode;
  if (
    input.relateScope === "configuration" ||
    input.relateScope === "symbol" ||
    input.relateScope === "overall"
  ) {
    config.relateScope = input.relateScope;
  }
  return config;
}

export type PfSettings = Pick<
  StrategySettings,
  "minimumPf" | "autoPf" | "autoPfPenalty" | "autoPfSamples" | "autoPfRecent"
>;

export function requiredPf(floor: number, samples: number, settings?: PfSettings) {
  const minimum = Math.max(floor, settings?.minimumPf ?? 0);
  if (!settings?.autoPf) return minimum;
  const support = Math.max(settings.autoPfSamples, samples);
  return minimum + settings.autoPfPenalty * Math.sqrt(settings.autoPfSamples / support);
}

export type StrategyActions = Record<StrategyType, number>;
export const newStrategyActions = (): StrategyActions => ({ axis: 0, block: 0, dca: 0, relate: 0 });

function evidence(values: readonly number[], window: number) {
  const start = Math.max(0, values.length - window);
  let profit = 0;
  let loss = 0;
  for (let i = start; i < values.length; i++) {
    const pnl = values[i]!;
    if (pnl > 0) profit += pnl;
    else if (pnl < 0) loss -= pnl;
  }
  let streak = 0;
  for (let i = values.length - 1; i >= start && values[i]! > 0; i--) streak++;
  return { n: values.length - start, pf: profitFactor(profit, loss), streak };
}

function advanceRelate(values: readonly number[], config: StrategySettings) {
  const recent = evidence(values, config.relateLookback);
  return recent.n >= config.relateSamples && recent.pf >= config.relatePf
    ? Math.min(config.relateSteps, recent.streak) * config.relateRatio
    : 0;
}

export type ScalePlan = {
  entry: number;
  target: number;
  stop: number;
  seedQty: number;
  maxQty: number;
  riskBudget: number;
  notionalBudget: number;
  blockSteps: number;
  blockFilled: number;
  blockStepRatio: number;
  blockTargetShare: number;
  dcaSteps: number;
  dcaFilled: number;
  dcaRatio: number;
  dcaStopShare: number;
};

type Entry = {
  notional: number;
  entry: number;
  stop: number;
  target: number;
  cost: number;
};

export function managedEntry(
  input: Entry,
  settings: StrategySettings,
  local: readonly number[],
  relation: readonly number[],
  actions: StrategyActions,
  relateLocal: readonly number[] = local,
) {
  const { notional, entry, stop, target, cost } = input;
  const recent = settings.axis || settings.block ? evidence(local, settings.axisLookback) : null;
  const axis =
    settings.axis &&
    recent &&
    recent.n >= settings.axisSamples &&
    recent.pf >= settings.axisPf &&
    recent.streak >= 2
      ? settings.axisRatio
      : 0;
  const matching =
    settings.relate && settings.relateScope !== "configuration"
      ? advanceRelate(relation, settings)
      : 0;
  const own = settings.relate ? advanceRelate(relateLocal, settings) : 0;
  const relativity = settings.relateMode === "shared" ? Math.max(own, matching) : own + matching;
  const sizing = { axis: axis > 0, relate: relativity > 0 };
  if (sizing.axis) actions.axis++;
  if (sizing.relate) actions.relate++;
  const funded = notional * Math.min(MAX_MUL, 1 + axis + relativity);
  const side = target > entry ? 1 : -1;
  const maxQty = stopCappedQty(funded, entry, Math.abs(entry - stop), cost, side);
  const blockSteps =
    settings.block &&
    settings.blockRatio > 0 &&
    recent &&
    recent.n >= 4 &&
    recent.pf >= settings.blockPf
      ? settings.blockLevels
      : 0;
  // Skip any rung beyond the parent's stop.
  const dcaSteps =
    settings.dca && settings.dcaRatio > 0
      ? Math.min(settings.dcaLevels, Math.ceil(1 / settings.dcaStopShare) - 1)
      : 0;
  if (!blockSteps && !dcaSteps) return { qty: maxQty, plan: undefined, sizing };

  const blockStepRatio =
    blockSteps && settings.blockMode === "shared"
      ? settings.blockRatio / blockSteps
      : settings.blockRatio;
  const seedQty = maxQty / (1 + blockSteps * blockStepRatio + dcaSteps * settings.dcaRatio);
  const plan: ScalePlan = {
    entry,
    target,
    stop,
    seedQty,
    maxQty,
    riskBudget: funded * MODEL_STOP_RISK,
    notionalBudget: funded,
    blockSteps,
    blockFilled: 0,
    blockStepRatio,
    blockTargetShare: settings.blockTargetShare,
    dcaSteps,
    dcaFilled: 0,
    dcaRatio: settings.dcaRatio,
    dcaStopShare: settings.dcaStopShare,
  };
  return { qty: seedQty, plan, sizing };
}

type ManagedPosition = {
  side: 1 | -1;
  entry: number;
  tp: number;
  sl: number;
  qty: number;
  plan?: ScalePlan;
};

export function adjustPosition(
  position: ManagedPosition,
  price: number,
  cost: number,
  allowBlock: boolean,
  allowDca: boolean,
): "block" | "dca" | null {
  const plan = position.plan;
  const { side, qty, entry, sl, tp } = position;
  if (!plan || !(price > 0) || side * (price - sl) <= 0 || side * (tp - price) <= 0) return null;

  const drift = side * (price - plan.entry);
  const targetDistance = Math.abs(plan.target - plan.entry);
  const blockProgress =
    (targetDistance * plan.blockTargetShare * (plan.blockFilled + 1)) /
    Math.max(1, plan.blockSteps);
  const dcaProgress = Math.abs(plan.entry - plan.stop) * plan.dcaStopShare * (plan.dcaFilled + 1);
  const block =
    allowBlock &&
    plan.blockFilled < plan.blockSteps &&
    drift >= blockProgress &&
    drift <= targetDistance * plan.blockTargetShare;
  const dca = allowDca && plan.dcaFilled < plan.dcaSteps && -drift >= dcaProgress;
  if (!block && !dca) return null;
  const expectedRisk = Math.max(0, -closePnl(side, entry, sl, qty, cost));
  const riskPerUnit = -closePnl(side, price, sl, 1, cost);
  const increment = Math.min(
    plan.seedQty * (block ? plan.blockStepRatio : plan.dcaRatio),
    plan.maxQty - qty,
    (plan.notionalBudget - entry * qty) / price,
    Math.max(0, plan.riskBudget - expectedRisk) / riskPerUnit,
  );
  if (!(increment > 1e-12)) return null;
  position.entry = (entry * qty + price * increment) / (qty + increment);
  position.qty = qty + increment;
  if (block) plan.blockFilled++;
  else plan.dcaFilled++;
  return block ? "block" : "dca";
}

export class RelationLedger {
  private readonly outcomes = new Map<string, number[]>();

  recent(key: string): readonly number[] {
    return this.outcomes.get(key) ?? [];
  }

  record(key: string, pnl: number) {
    if (!key || !Number.isFinite(pnl)) return;
    const history = this.outcomes.get(key) ?? [];
    history.push(pnl);
    if (history.length > 50) history.shift();
    this.outcomes.set(key, history);
  }
}

export function relationKey(scope: StrategySettings["relateScope"], symbol: string, side: number) {
  if (scope === "overall") return `direction|${side}`;
  if (scope === "symbol") return `market|${symbol}|${side}`;
  return "";
}

export function recordRelationClose(
  ledger: RelationLedger,
  exact: string,
  symbol: string,
  side: number,
  pnl: number,
) {
  ledger.record(`${exact}|${side}`, pnl);
  ledger.record(relationKey("symbol", symbol, side), pnl);
  ledger.record(relationKey("overall", symbol, side), pnl);
}
