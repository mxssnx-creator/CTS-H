import {
  AXIS_PARTIAL_RATIO,
  BLOCK_ADD,
  LIVE_BLOCK_COUNTS,
  LIVE_SHORT,
  MAX_MUL,
  MODEL_STOP_RISK,
  PF_NO_LOSS,
  POSITION_COST_PCT,
  POSITION_RT_COST_PCT,
  SHORT_SL,
  SHORT_TP,
} from "./constants.ts";

export const NEUTRAL_PF = 1;

export function profitFactor(profit: number, loss: number): number {
  const gp = Number.isFinite(profit) ? Math.max(0, profit) : 0;
  const gl = Number.isFinite(loss) ? Math.max(0, loss) : 0;
  // PF 1.0 is neutral: no gross profit and no gross loss (net zero) reads as 1.0, not 0.
  if (gl < 1e-12) return gp > 1e-12 ? PF_NO_LOSS : NEUTRAL_PF;
  const pf = gp / gl;
  return Number.isFinite(pf) ? pf : 0;
}

export function pfFromPnls(rows: { pnl: number }[]): number {
  let gp = 0;
  let gl = 0;
  for (const r of rows) {
    const p = Number(r.pnl);
    if (!Number.isFinite(p)) continue;
    if (p > 0) gp += p;
    else if (p < 0) gl -= p;
  }
  return profitFactor(gp, gl);
}

export function positionRtCost(entry: number, exit: number, qty: number, rtPct = POSITION_RT_COST_PCT): number {
  if (!(qty > 0) || !(entry > 0) || !(exit > 0) || !(rtPct > 0)) return 0;
  return qty * ((entry + exit) / 2) * rtPct;
}

export function closePnl(side: number, entry: number, exit: number, qty: number, rtPct = POSITION_RT_COST_PCT): number {
  const signed = side < 0 ? -1 : 1;
  if (!(entry > 0) || !(exit > 0) || !(qty > 0)) return 0;
  const net = (exit - entry) * qty * signed - positionRtCost(entry, exit, qty, rtPct);
  return Math.abs(net) <= (entry + exit) * qty * Number.EPSILON ? 0 : net;
}

export function clampBlockVol(n: number, fallback = BLOCK_ADD): number {
  if (!Number.isFinite(n) || n <= 0 || Math.abs(n - 0.08) < 1e-6) return fallback;
  return Math.min(1, Math.max(0.1, n));
}

export function clampAxisPartial(n: number, fallback = AXIS_PARTIAL_RATIO): number {
  if (!Number.isFinite(n) || n <= 0 || Math.abs(n - 0.08) < 1e-6) return fallback;
  return Math.min(4, Math.max(0.5, n));
}

export function sanitizeBlockCounts(raw: number[]): number[] {
  const uniq = [...new Set(raw.map((n) => Math.round(n)).filter((n) => n >= 1 && n <= 6))].sort((a, b) => a - b);
  const withOne = uniq.includes(1) || uniq.length === 0 ? uniq : [1, ...uniq];
  const live = (withOne.length ? withOne : [...LIVE_BLOCK_COUNTS]).filter((n) => n !== 2);
  return live.length ? live : [...LIVE_BLOCK_COUNTS];
}

export function capTotalQty(baseQty: number, extra: number): number {
  return Math.min(baseQty * MAX_MUL, baseQty + Math.max(0, extra));
}

export function blockQty(baseQty: number, counts = [...LIVE_BLOCK_COUNTS]): number {
  const live = sanitizeBlockCounts(counts);
  const extra = live.length * baseQty * clampBlockVol(BLOCK_ADD);
  return capTotalQty(baseQty, extra);
}

export function axisQty(baseQty: number): number {
  const r = clampAxisPartial(AXIS_PARTIAL_RATIO);
  return capTotalQty(baseQty, baseQty * (r - 1));
}

export function positionNotional(equity: number): number {
  const e = Number(equity) > 0 ? equity : 0;
  return e * POSITION_COST_PCT;
}

export function stopCappedQty(notional: number, entry: number, stopDistance: number, roundTripCost: number, side = 0) {
  const stopCost = stopDistance + (entry - side * stopDistance / 2) * roundTripCost;
  return Math.min(notional / entry, notional * MODEL_STOP_RISK / stopCost);
}

export function allShortCombos(): { tpAtr: number; slOfTp: number }[] {
  const out: { tpAtr: number; slOfTp: number }[] = [];
  for (const tpAtr of SHORT_TP) for (const slOfTp of SHORT_SL) out.push({ tpAtr, slOfTp });
  return out;
}

export function liveShortOk(tpAtr: number, slOfTp: number): boolean {
  return tpAtr + 1e-12 >= LIVE_SHORT.minTp && slOfTp + 1e-12 >= LIVE_SHORT.minSlOfTp && tpAtr <= LIVE_SHORT.maxTp + 1e-12;
}

export function comboId(tpAtr: number, slOfTp: number): string {
  return `tp${tpAtr.toFixed(2)}_sl${slOfTp.toFixed(2)}`;
}
