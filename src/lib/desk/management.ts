export const COORDINATIONS = ["fixed", "dynamic", "breakeven"] as const;
export type Coordination = (typeof COORDINATIONS)[number];

export const COORDINATION_LABELS: Record<Coordination, string> = {
  fixed: "Fixed bracket",
  breakeven: "Break-even stop",
  dynamic: "ATR trail",
};

export type TrailRules = { trailActivation: number; trailDistance: number };
export type TrailSettings = TrailRules & { dynamic: boolean; breakeven: boolean };
export const DEFAULT_TRAILS: TrailSettings = {
  dynamic: true,
  breakeven: true,
  trailActivation: 0.55,
  trailDistance: 0.45,
};

export function targetDistance(
  tpAtr: number,
  atr: number,
  price: number,
  roundTripCost: number,
  costMultiple = 0,
) {
  return Math.max(tpAtr * Math.max(atr, price * 0.0004), price * roundTripCost * costMultiple);
}
const LOSS_SIZE = 0.65;

export function sizeAfterLosses(penultimate: number | undefined, last: number | undefined) {
  return (penultimate ?? 0) < 0 && (last ?? 0) < 0 ? LOSS_SIZE : 1;
}

export function protectiveStop(
  coordination: Coordination,
  side: 1 | -1,
  entry: number,
  target: number,
  stop: number,
  favorable: number,
  roundTripCost: number,
  rules: TrailRules = DEFAULT_TRAILS,
) {
  if (coordination === "fixed") return stop;
  const distance = Math.abs(target - entry);
  if (side * (favorable - entry) < rules.trailActivation * distance) return stop;

  const fee = (side * roundTripCost) / 2;
  const breakEven = entry * ((1 + fee) / (1 - fee));
  if (side * (target - breakEven) <= 0) return stop;
  const candidate =
    coordination === "dynamic" ? favorable - side * distance * rules.trailDistance : breakEven;
  return side > 0 ? Math.max(stop, breakEven, candidate) : Math.min(stop, breakEven, candidate);
}
