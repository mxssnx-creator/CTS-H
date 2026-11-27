import {
  EXTENDED_SL_OF_TP,
  EXTENDED_TP_ATR,
  INDICATIONS,
  LEGACY_INDICATIONS,
  NEW_INDICATIONS,
  LASTN,
  LIVE_SHORT,
  MAX_HOLD,
  MAX_LIVE_LEGS,
  MAX_MUL,
  PF,
  POSITION_RT_COST_PCT,
  TAG,
  TRAIL_PCT,
  WIDE_SL_OF_TP,
  WIDE_TP_ATR,
  type Floors,
  type Indication,
} from "./constants.ts";
import { configurationKey, excludedConfigurations, type ReplayProfile } from "./config-policy.ts";
import type { StagedSummary } from "./lanes.ts";
import type { ConnectionId } from "./connections.ts";
import { saneBars } from "./heal.ts";
import { CANDLE_INTERVALS, HOUR_MS as REPLAY_HOUR, type CandleInterval } from "./intervals.ts";
import {
  allShortCombos,
  axisQty,
  blockQty,
  capTotalQty,
  closePnl,
  comboId,
  liveShortOk,
  pfFromPnls,
  positionNotional,
  profitFactor,
  stopCappedQty,
} from "./math.ts";

import {
  COORDINATIONS,
  protectiveStop,
  sizeAfterLosses,
  targetDistance,
  type Coordination,
  type TrailRules,
} from "./management.ts";

import {
  defaultForInterval,
  STRATEGY_TYPES,
  RelationLedger,
  adjustPosition,
  managedEntry,
  newStrategyActions,
  recordRelationClose,
  relationKey,
  requiredPf,
  type PfSettings,
  type ScalePlan,
  type StrategyActions,
  type StrategySettings,
} from "./strategies.ts";

export type Bar = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  closed?: boolean;
};

export type Side = 1 | -1;

export type Cell = {
  id: string;
  symbol: string;
  indication: Indication;
  interval?: CandleInterval;
  tpAtr: number;
  slOfTp: number;
  liveFloor: boolean;
  coordination?: Coordination;
  n: number;
  wins: number;
  gw: number;
  gl: number;
  net: number;
  pf: number;
  validExec: boolean;
  requiredRecentPf?: number;
  disabled: boolean;
  lastN: number[];
  cursorT: number;
  side: Side | 0;
  signal?: Side | 0;
  leg: OpenLeg | null;
};

type OpenLeg = {
  side: Side;
  entry: number;
  sl: number;
  tp: number;
  qty: number;
  hold: number;
  favorable?: number;
  plan?: ScalePlan;
  active?: boolean;
};

export type LivePos = {
  id: string;
  symbol: string;
  side: Side;
  qty: number;
  qtyBase: number;
  entry: number;
  mark: number;
  peak: number;
  sl: number;
  tp: number;
  combo: string;
  indication: string;
  coordination?: Coordination;
  configId?: string;
  trailRules?: TrailRules;
  plan?: ScalePlan;
  sizing?: { axis: boolean; relate: boolean };
  realized?: number;
  interval?: CandleInterval;
  maxHoldBars?: number;
  hold: number;
  dca: number;
  openedAt: number;
  system: string;
  connection: string;
  type: "position";
};

export type TapeFill = {
  id: string;
  tape: "intern" | "live";
  symbol: string;
  combo: string;
  pnl: number;
  px: number;
  ts: number;
  side: Side;
  indication?: string;
  coordination?: Coordination;
  quantity?: number;
  partial?: boolean;
};

export type Series = {
  atr: number[];
  ema9: number[];
  ema12: number[];
  ema21: number[];
  ema26: number[];
  rsi: number[];
  mid: number[];
  sd: number[];
  vol: number[];
  adx: number[];
  pdi: number[];
  mdi: number[];
  st: Array<Side | 0>;
  stoch: number[];
  vwap: number[];
};

export type TradeLeg = {
  t: number;
  side: Side;
  entry: number;
  exit: number;
  pnl: number;
  reason: "tp" | "sl" | "time" | "end";
  hold: number;
};

const PF_NO_LOSS_NEAR = 3.999;
export const REPLAY_WARMUP_BARS = 22;
const WARMUP = REPLAY_WARMUP_BARS;
const SHORT_COMBOS = allShortCombos();
function settings(
  indication: Indication,
  tpAtr: number,
  slOfTp: number,
  liveFloor: boolean,
  coordination: Coordination = "fixed",
) {
  return {
    indication,
    tpAtr,
    slOfTp,
    liveFloor,
    coordination,
    range: tpAtr > LIVE_SHORT.maxTp ? ("wide" as const) : ("short" as const),
    key: configurationKey(indication, tpAtr, slOfTp, coordination),
  };
}
const STRATEGY_CONFIGS = LEGACY_INDICATIONS.flatMap((indication) =>
  SHORT_COMBOS.map(({ tpAtr, slOfTp }) =>
    settings(indication, tpAtr, slOfTp, liveShortOk(tpAtr, slOfTp)),
  ),
);
const EXECUTION_CONFIGS = [
  ...STRATEGY_CONFIGS.filter((config) => config.liveFloor),
  ...LEGACY_INDICATIONS.flatMap((indication) =>
    WIDE_TP_ATR.flatMap((tpAtr) =>
      WIDE_SL_OF_TP.map((slOfTp) => settings(indication, tpAtr, slOfTp, true)),
    ),
  ),
];
const COORDINATED_CONFIGS = [
  ...EXECUTION_CONFIGS,
  ...NEW_INDICATIONS.flatMap((indication) =>
    EXECUTION_CONFIGS.filter((config) => config.indication === "move").map(({ tpAtr, slOfTp }) =>
      settings(indication, tpAtr, slOfTp, true),
    ),
  ),
].flatMap(({ indication, tpAtr, slOfTp }) =>
  COORDINATIONS.map((mode) => settings(indication, tpAtr, slOfTp, true, mode)),
);

const EXTENDED_COORDINATED_CONFIGS = ([...LEGACY_INDICATIONS, ...NEW_INDICATIONS] as Indication[]).flatMap((indication) =>
  EXTENDED_TP_ATR.flatMap((tpAtr) =>
    EXTENDED_SL_OF_TP.flatMap((slOfTp) =>
      COORDINATIONS.map((mode) => settings(indication, tpAtr, slOfTp, true, mode)),
    ),
  ),
);

const MICRO_EXTRA_CONFIGS = INDICATIONS.flatMap((indication) =>
  [2.5, 3, 4, 6].flatMap((tpAtr) =>
    WIDE_SL_OF_TP.flatMap((slOfTp) =>
      COORDINATIONS.map((mode) => settings(indication, tpAtr, slOfTp, true, mode)),
    ),
  ),
);

export function coordinatedConfigs(trailing: boolean, preferences?: StrategySettings, step = REPLAY_HOUR) {
  const base =
    step <= 15 * 60_000 && preferences?.microExtended
      ? [...COORDINATED_CONFIGS, ...MICRO_EXTRA_CONFIGS]
      : COORDINATED_CONFIGS;
  const candidates = preferences?.extendedTargets ? [...base, ...EXTENDED_COORDINATED_CONFIGS] : base;
  if (
    trailing &&
    (!preferences ||
      (preferences.dynamic &&
        preferences.breakeven &&
        preferences.shortRange &&
        preferences.wideRange &&
        preferences.enabledIndications.length === INDICATIONS.length))
  )
    return candidates;
  return candidates.filter(
    ({ coordination }) =>
      coordination === "fixed" || (trailing && preferences?.[coordination] === true),
  ).filter(
    (config) =>
      !preferences ||
      (preferences.enabledIndications.includes(config.indication) &&
        (config.range === "short" ? preferences.shortRange : preferences.wideRange)),
  );
}

export function atrSeries(bars: Bar[], n = 14): number[] {
  const out = new Array<number>(bars.length).fill(0);
  let prev = bars[0]?.c ?? 0;
  let atr = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]!;
    const tr = Math.max(b.h - b.l, Math.abs(b.h - prev), Math.abs(b.l - prev));
    atr = i === 0 ? tr : (atr * (n - 1) + tr) / n;
    out[i] = atr;
    prev = b.c;
  }
  return out;
}

function emaSeries(bars: Bar[], n: number): number[] {
  const out = new Array<number>(bars.length).fill(0);
  if (!bars.length) return out;
  const k = 2 / (n + 1);
  let e = bars[0]!.c;
  out[0] = e;
  for (let i = 1; i < bars.length; i++) {
    e = bars[i]!.c * k + e * (1 - k);
    out[i] = e;
  }
  return out;
}

function rsiSeries(bars: Bar[], n = 14): number[] {
  const out = new Array<number>(bars.length).fill(50);
  if (bars.length < n + 1) return out;
  let g = 0;
  let l = 0;
  for (let i = 1; i <= n; i++) {
    const d = bars[i]!.c - bars[i - 1]!.c;
    if (d >= 0) g += d;
    else l -= d;
  }
  const pack = (i: number, gain: number, loss: number) => {
    if (loss <= 0) out[i] = 100;
    else {
      const rs = gain / loss;
      out[i] = 100 - 100 / (1 + rs);
    }
  };
  pack(n, g, l);
  for (let i = n + 1; i < bars.length; i++) {
    const d = bars[i]!.c - bars[i - 1]!.c;
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    g = (g * (n - 1) + gain) / n;
    l = (l * (n - 1) + loss) / n;
    pack(i, g, l);
  }
  return out;
}

function bbSeries(bars: Bar[], n = 20): { mid: number[]; sd: number[] } {
  const mid = new Array<number>(bars.length).fill(0);
  const sd = new Array<number>(bars.length).fill(0);
  let sum = 0;
  let sum2 = 0;
  for (let i = 0; i < bars.length; i++) {
    const c = bars[i]!.c;
    sum += c;
    sum2 += c * c;
    if (i >= n) {
      const old = bars[i - n]!.c;
      sum -= old;
      sum2 -= old * old;
    }
    const len = Math.min(i + 1, n);
    const m = sum / len;
    const v = Math.max(0, sum2 / len - m * m);
    mid[i] = m;
    sd[i] = Math.sqrt(v);
  }
  return { mid, sd };
}

// Wilder ADX with +DI and -DI, causal: each value uses only bars up to its index.
function adxSeries(bars: Bar[], n = 14) {
  const len = bars.length;
  const adx = new Array<number>(len).fill(0);
  const pdi = new Array<number>(len).fill(0);
  const mdi = new Array<number>(len).fill(0);
  let sPlus = 0;
  let sMinus = 0;
  let sTr = 0;
  let dxAvg = 0;
  for (let i = 1; i < len; i++) {
    const b = bars[i]!;
    const p = bars[i - 1]!;
    const up = b.h - p.h;
    const down = p.l - b.l;
    const plus = up > down && up > 0 ? up : 0;
    const minus = down > up && down > 0 ? down : 0;
    const tr = Math.max(b.h - b.l, Math.abs(b.h - p.c), Math.abs(b.l - p.c));
    if (i <= n) {
      sPlus += plus;
      sMinus += minus;
      sTr += tr;
      if (i < n) continue;
    } else {
      sPlus = sPlus - sPlus / n + plus;
      sMinus = sMinus - sMinus / n + minus;
      sTr = sTr - sTr / n + tr;
    }
    const plusDi = sTr > 0 ? (100 * sPlus) / sTr : 0;
    const minusDi = sTr > 0 ? (100 * sMinus) / sTr : 0;
    const sum = plusDi + minusDi;
    const dx = sum > 0 ? (100 * Math.abs(plusDi - minusDi)) / sum : 0;
    dxAvg = i === n ? dx : (dxAvg * (n - 1) + dx) / n;
    pdi[i] = plusDi;
    mdi[i] = minusDi;
    adx[i] = dxAvg;
  }
  return { adx, pdi, mdi };
}

// Supertrend direction (1 up, -1 down) using ATR bands; causal.
function supertrendSeries(bars: Bar[], atr: number[], mult = 3): Array<Side | 0> {
  const out = new Array<Side | 0>(bars.length).fill(0);
  let upper = 0;
  let lower = 0;
  let dir: Side = 1;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]!;
    const hl2 = (b.h + b.l) / 2;
    const basicUpper = hl2 + mult * (atr[i] ?? 0);
    const basicLower = hl2 - mult * (atr[i] ?? 0);
    if (i === 0) {
      upper = basicUpper;
      lower = basicLower;
    } else {
      const prevClose = bars[i - 1]!.c;
      upper = basicUpper < upper || prevClose > upper ? basicUpper : upper;
      lower = basicLower > lower || prevClose < lower ? basicLower : lower;
      if (dir === 1 && b.c < lower) dir = -1;
      else if (dir === -1 && b.c > upper) dir = 1;
    }
    out[i] = dir;
  }
  return out;
}

// Rolling VWAP over the trailing n bars using typical price and volume.
function vwapSeries(bars: Bar[], n = 24): number[] {
  const out = new Array<number>(bars.length).fill(0);
  for (let i = 0; i < bars.length; i++) {
    let pv = 0;
    let v = 0;
    for (let k = Math.max(0, i - n + 1); k <= i; k++) {
      const b = bars[k]!;
      const volume = b.v > 0 ? b.v : 0;
      pv += ((b.h + b.l + b.c) / 3) * volume;
      v += volume;
    }
    out[i] = v > 0 ? pv / v : bars[i]!.c;
  }
  return out;
}

// Stochastic of RSI over the trailing n RSI values, scaled 0 to 100.
function stochRsiSeries(rsi: number[], n = 14): number[] {
  const out = new Array<number>(rsi.length).fill(50);
  for (let i = 0; i < rsi.length; i++) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let k = Math.max(0, i - n + 1); k <= i; k++) {
      lo = Math.min(lo, rsi[k]!);
      hi = Math.max(hi, rsi[k]!);
    }
    out[i] = hi - lo > 1e-9 ? (100 * (rsi[i]! - lo)) / (hi - lo) : 50;
  }
  return out;
}

export function buildSeries(bars: Bar[]): Series {
  const { mid, sd } = bbSeries(bars);
  const atr = atrSeries(bars);
  const rsi = rsiSeries(bars);
  const { adx, pdi, mdi } = adxSeries(bars);
  return {
    adx,
    pdi,
    mdi,
    st: supertrendSeries(bars, atrSeries(bars, 10)),
    stoch: stochRsiSeries(rsi),
    vwap: vwapSeries(bars),
    atr,
    ema9: emaSeries(bars, 9),
    ema12: emaSeries(bars, 12),
    ema21: emaSeries(bars, 21),
    ema26: emaSeries(bars, 26),
    rsi,
    mid,
    sd,
    vol: emaSeries(
      bars.map((b) => ({ ...b, c: b.v })),
      20,
    ),
  };
}

export function rsiLast(bars: Bar[], n = 14): number {
  return rsiSeries(bars, n).at(-1) ?? 50;
}

export function emaLast(bars: Bar[], n: number): number {
  return emaSeries(bars, n).at(-1) ?? 0;
}

export function signalAt(ind: Indication, bars: Bar[], s: Series, i: number): Side | 0 {
  if (i < 21 || i >= bars.length) return 0;
  const b = bars[i]!;
  const a = Math.max(s.atr[i] ?? 0, b.c * 0.0004);
  const impulse = (b.c - b.o) / a;
  switch (ind) {
    case "volumeBreak":
    case "squeezeBreak": {
      let high = -Infinity;
      let low = Infinity;
      for (let k = i - 8; k < i; k++) {
        high = Math.max(high, bars[k]!.h);
        low = Math.min(low, bars[k]!.l);
      }
      const priorVolume = s.vol[i - 1] ?? 0;
      if (!(priorVolume > 0)) return 0;
      if (ind === "volumeBreak") {
        if (b.v < 1.25 * priorVolume) return 0;
        if (b.c > high && s.ema9[i]! > s.ema21[i]! && impulse > 0.15) return 1;
        if (b.c < low && s.ema9[i]! < s.ema21[i]! && impulse < -0.15) return -1;
      } else {
        if (high - low > 4 * a || b.v < 0.8 * priorVolume) return 0;
        if (b.c > high && impulse > 0.2) return 1;
        if (b.c < low && impulse < -0.2) return -1;
      }
      return 0;
    }
    case "momentumPullback": {
      const fast = s.ema9[i]!;
      const slow = s.ema21[i]!;
      const previous = s.ema9[i - 1]!;
      const trend = fast - slow;
      if (trend > 0.12 * a && fast > previous && b.l <= fast && b.c > fast &&
          impulse > 0.12 && s.rsi[i]! > 50 && s.rsi[i]! < 75) return 1;
      if (trend < -0.12 * a && fast < previous && b.h >= fast && b.c < fast &&
          impulse < -0.12 && s.rsi[i]! < 50 && s.rsi[i]! > 25) return -1;
      return 0;
    }
    case "donchian": {
      // Breakout of the prior 20-bar range while ADX shows a trend; fires on the first close outside the range.
      const [hi, lo] = priorRange(bars, i, 20);
      const [prevHi, prevLo] = priorRange(bars, i - 1, 20);
      if (s.adx[i]! < 18) return 0;
      if (b.c > hi && bars[i - 1]!.c <= prevHi) return 1;
      if (b.c < lo && bars[i - 1]!.c >= prevLo) return -1;
      return 0;
    }
    case "supertrend": {
      const now = s.st[i];
      const prev = s.st[i - 1];
      if (now === 1 && prev === -1) return 1;
      if (now === -1 && prev === 1) return -1;
      return 0;
    }
    case "vwapReclaim": {
      // Close crosses the rolling VWAP while Stochastic RSI turns in the same direction.
      const prev = bars[i - 1]!;
      const vwap = s.vwap[i]!;
      const vwapPrev = s.vwap[i - 1]!;
      const k = s.stoch[i]!;
      const kPrev = s.stoch[i - 1]!;
      if (prev.c <= vwapPrev && b.c > vwap && k > 20 && k > kPrev) return 1;
      if (prev.c >= vwapPrev && b.c < vwap && k < 80 && k < kPrev) return -1;
      return 0;
    }
    case "adxDi": {
      // Directional line cross, accepted only when ADX confirms a trend.
      if (s.adx[i]! < 20) return 0;
      const now = s.pdi[i]! - s.mdi[i]!;
      const prior = s.pdi[i - 1]! - s.mdi[i - 1]!;
      if (prior <= 0 && now > 0) return 1;
      if (prior >= 0 && now < 0) return -1;
      return 0;
    }
    case "stochRsi": {
      const k = s.stoch[i]!;
      const kPrev = s.stoch[i - 1]!;
      if (kPrev < 20 && k >= 20) return 1;
      if (kPrev > 80 && k <= 80) return -1;
      return 0;
    }
    case "rsiRecovery": {
      const previous = s.rsi[i - 1]!;
      const current = s.rsi[i]!;
      if (previous < 45 && current >= 45 && s.ema9[i]! > s.ema21[i]!) return 1;
      if (previous > 55 && current <= 55 && s.ema9[i]! < s.ema21[i]!) return -1;
      return 0;
    }
    case "pullback": {
      const prev = bars[i - 1]!;
      const fast = s.ema9[i]!;
      const slow = s.ema21[i]!;
      const priorFast = s.ema9[i - 1]!;
      if (
        fast - slow > 0.15 * a &&
        prev.c <= priorFast &&
        b.c > fast &&
        impulse > 0.12 &&
        b.c - fast < a
      )
        return 1;
      if (
        slow - fast > 0.15 * a &&
        prev.c >= priorFast &&
        b.c < fast &&
        impulse < -0.12 &&
        fast - b.c < a
      )
        return -1;
      return 0;
    }
    case "rangeFade": {
      let high = -Infinity;
      let low = Infinity;
      for (let k = i - 8; k < i; k++) {
        high = Math.max(high, bars[k]!.h);
        low = Math.min(low, bars[k]!.l);
      }
      if (b.l < low && b.c > low && b.c - b.l > 0.4 * a && b.c >= b.o) return 1;
      if (b.h > high && b.c < high && b.h - b.c > 0.4 * a && b.c <= b.o) return -1;
      return 0;
    }
    case "direction": {
      const prev = (s.ema9[i - 1] ?? 0) - (s.ema21[i - 1] ?? 0);
      const now = (s.ema9[i] ?? 0) - (s.ema21[i] ?? 0);
      if (prev <= 0 && now > 0) return 1;
      if (prev >= 0 && now < 0) return -1;
      return 0;
    }
    case "move":
      if (impulse > 0.35) return 1;
      if (impulse < -0.35) return -1;
      return 0;
    case "break": {
      let hi = -Infinity;
      let lo = Infinity;
      for (let k = Math.max(0, i - 8); k < i; k++) {
        hi = Math.max(hi, bars[k]!.h);
        lo = Math.min(lo, bars[k]!.l);
      }
      if (b.c > hi) return 1;
      if (b.c < lo) return -1;
      return 0;
    }
    case "rsi": {
      const r = s.rsi[i] ?? 50;
      const p = s.rsi[i - 1] ?? 50;
      if (p < 35 && r >= 35) return 1;
      if (p > 65 && r <= 65) return -1;
      return 0;
    }
    case "macd": {
      const m0 = (s.ema12[i - 1] ?? 0) - (s.ema26[i - 1] ?? 0);
      const m1 = (s.ema12[i] ?? 0) - (s.ema26[i] ?? 0);
      if (m0 <= 0 && m1 > 0) return 1;
      if (m0 >= 0 && m1 < 0) return -1;
      return 0;
    }
    case "bollinger": {
      const mid = s.mid[i] ?? b.c;
      const sd = s.sd[i] ?? 0;
      if (!(sd > 0)) return 0;
      if (b.c < mid - 2 * sd) return 1;
      if (b.c > mid + 2 * sd) return -1;
      return 0;
    }
    case "ema":
      if (b.c > (s.ema21[i] ?? b.c) && bars[i - 1]!.c <= (s.ema21[i - 1] ?? b.c)) return 1;
      if (b.c < (s.ema21[i] ?? b.c) && bars[i - 1]!.c >= (s.ema21[i - 1] ?? b.c)) return -1;
      return 0;
    case "active": {
      const vol = s.vol[i] || b.v || 1;
      if (b.v < vol) return 0;
      if (impulse > 0.25) return 1;
      if (impulse < -0.25) return -1;
      return 0;
    }
    default:
      return 0;
  }
}

function priorRange(bars: Bar[], i: number, n: number): [number, number] {
  let hi = -Infinity;
  let lo = Infinity;
  for (let k = Math.max(0, i - n); k < i; k++) {
    hi = Math.max(hi, bars[k]!.h);
    lo = Math.min(lo, bars[k]!.l);
  }
  return [hi, lo];
}

export type IndicationRow = {
  name: Indication;
  side: Side | 0;
  detail: string;
};

export function indicationBoard(bars: Bar[]): IndicationRow[] {
  const closed = closedBars(bars);
  if (closed.length < 24) {
    return INDICATIONS.map((name) => ({
      name,
      side: 0 as const,
      detail: "waiting for closed bars",
    }));
  }
  const series = buildSeries(closed);
  const i = closed.length - 1;
  const b = closed[i]!;
  const a = Math.max(series.atr[i] ?? 0, b.c * 0.0004);
  const impulse = (b.c - b.o) / a;
  const z = (series.sd[i] ?? 0) > 0 ? (b.c - (series.mid[i] ?? b.c)) / (series.sd[i] ?? 1) : 0;
  return INDICATIONS.map((name) => {
    const side = signalAt(name, closed, series, i);
    const detail =
      name === "direction"
        ? `ema9 ${series.ema9[i]!.toFixed(4)} · ema21 ${series.ema21[i]!.toFixed(4)}`
        : name === "move"
          ? `impulse ${impulse.toFixed(2)} ATR`
          : name === "break"
            ? `close ${b.c} vs prior 8-bar range`
            : name === "rsi"
              ? `RSI ${series.rsi[i]!.toFixed(1)}`
              : name === "macd"
                ? `macd ${((series.ema12[i] ?? 0) - (series.ema26[i] ?? 0)).toFixed(4)}`
                : name === "bollinger"
                  ? `z ${z.toFixed(2)}`
                  : name === "ema"
                    ? `close vs ema21 ${((b.c / (series.ema21[i] || b.c) - 1) * 100).toFixed(3)}%`
                    : name === "pullback"
                      ? `EMA9 / EMA21 ${(series.ema9[i]! / series.ema21[i]!).toFixed(3)}`
                      : name === "rangeFade"
                        ? `Band deviation ${z.toFixed(2)} · RSI ${series.rsi[i]!.toFixed(1)}`
                        : name === "donchian"
                          ? `ADX ${series.adx[i]!.toFixed(1)} · 20-bar range`
                        : name === "supertrend"
                          ? `Supertrend ${series.st[i] === 1 ? "up" : "down"}`
                        : name === "vwapReclaim"
                          ? `Close vs VWAP ${((b.c / (series.vwap[i] || b.c) - 1) * 100).toFixed(3)}% · StochRSI ${series.stoch[i]!.toFixed(1)}`
                        : name === "adxDi"
                          ? `ADX ${series.adx[i]!.toFixed(1)} · +DI ${series.pdi[i]!.toFixed(1)} / -DI ${series.mdi[i]!.toFixed(1)}`
                        : name === "stochRsi"
                          ? `StochRSI ${series.stoch[i]!.toFixed(1)}`
                        : name === "volumeBreak" || name === "squeezeBreak"
                          ? `Volume ${b.v.toFixed(2)} · range and volatility filter`
                          : name === "momentumPullback" || name === "rsiRecovery"
                            ? `RSI ${series.rsi[i]!.toFixed(1)} · EMA trend`
                        : `vol ${b.v.toFixed(2)} vs ema ${series.vol[i]!.toFixed(2)}`;
    return { name, side, detail };
  });
}

export function lastClosedBar(bars: Bar[]): Bar | undefined {
  const last = bars.at(-1);
  return last?.closed === false || (last?.closed === undefined && bars.length > 1)
    ? bars.at(-2)
    : last;
}

export function closedBars(bars: Bar[]): Bar[] {
  return lastClosedBar(bars) === bars.at(-1) ? bars : bars.slice(0, -1);
}

function indexAfter(bars: Bar[], t: number): number {
  let lo = 0;
  let hi = bars.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid]!.t <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function pushPnl(cell: Cell, pnl: number) {
  if (!Number.isFinite(pnl)) return;
  cell.n += 1;
  cell.net += pnl;
  cell.lastN.push(pnl);
  if (cell.lastN.length > LASTN.eval) cell.lastN.shift();
  if (pnl >= 0) {
    cell.wins += 1;
    cell.gw += pnl;
  } else cell.gl += Math.abs(pnl);
  cell.pf = cell.gl < 1e-12 ? (cell.gw > 1e-12 ? 4 : 0) : cell.gw / cell.gl;
}

export function gateCell(cell: Cell, floors: Floors, settings?: PfSettings) {
  const recent = Math.max(0, cell.lastN.length - LASTN.valid);
  const suspension = Math.max(0, cell.lastN.length - LASTN.disable);
  let gains = 0;
  let losses = 0;
  let net = 0;
  let suspensionNet = 0;
  let recentGains = 0;
  let recentLosses = 0;
  for (let i = recent; i < cell.lastN.length; i++) {
    const pnl = cell.lastN[i]!;
    net += pnl;
    if (pnl > 0) gains += pnl;
    else if (pnl < 0) losses -= pnl;
    if (i >= suspension) {
      suspensionNet += pnl;
      if (pnl > 0) recentGains += pnl;
      else if (pnl < 0) recentLosses -= pnl;
    }
  }
  const samples = cell.lastN.length - recent;
  const required = settings?.autoPf ? settings.autoPfSamples : LASTN.minSamples;
  const recentFloor = requiredPf(floors.short, samples, settings);
  cell.requiredRecentPf = recentFloor;
  const pass = samples >= required && profitFactor(gains, losses) >= recentFloor && net >= 0;
  const lifetimeFloor = requiredPf(Math.max(floors.base, floors.overall), cell.n, settings);
  const proven =
    cell.n >= 6 &&
    cell.pf >= lifetimeFloor &&
    cell.net > 0 &&
    !(cell.pf >= PF_NO_LOSS_NEAR && cell.net <= 1e-6);
  const followThrough =
    !settings?.autoPf ||
    !settings.autoPfRecent ||
    cell.lastN.length - suspension < Math.max(3, Math.ceil(required / 2)) ||
    (suspensionNet > 0 &&
      profitFactor(recentGains, recentLosses) >= Math.max(floors.base, floors.short, 1));
  cell.validExec = cell.liveFloor && pass && followThrough && (cell.n < 6 || proven);
  cell.disabled =
    !cell.validExec && cell.lastN.length - suspension >= LASTN.minSamples && suspensionNet < 0;
}

function blankCell(
  symbol: string,
  config: (typeof STRATEGY_CONFIGS)[number],
  interval: CandleInterval = "1h",
): Cell {
  const { key, indication, tpAtr, slOfTp, liveFloor, coordination } = config;
  return {
    id: `${interval === "1h" ? "" : `${interval}|`}${symbol}|${key}`,
    symbol,
    indication,
    interval,
    tpAtr,
    slOfTp,
    liveFloor,
    coordination,
    n: 0,
    wins: 0,
    gw: 0,
    gl: 0,
    net: 0,
    pf: 0,
    validExec: false,
    disabled: false,
    lastN: [],
    cursorT: 0,
    side: 0,
    leg: null,
  };
}

export function exitOnBar(
  side: Side,
  tp: number,
  sl: number,
  bar: Bar,
  hold: number,
  maxHold = MAX_HOLD,
): { exit: number; reason: "tp" | "sl" | "time" } | null {
  const hitTp = side > 0 ? bar.h >= tp : bar.l <= tp;
  const hitSl = side > 0 ? bar.l <= sl : bar.h >= sl;
  if (!(hitTp || hitSl || hold >= maxHold)) return null;
  // OHLC does not establish which trigger traded first. Use the adverse fill.
  if (hitSl) return { exit: side > 0 ? Math.min(bar.o, sl) : Math.max(bar.o, sl), reason: "sl" };
  if (hitTp) return { exit: tp, reason: "tp" };
  return { exit: bar.c, reason: "time" };
}

function advance(
  cell: Cell,
  bars: Bar[],
  sides: Array<Side | 0>,
  atr: number[],
  notional: number,
  from: number,
  capped: boolean,
  coordinated: boolean,
  trailRules: StrategySettings | undefined,
  interval: CandleInterval,
  push: (fill: TapeFill) => void,
) {
  const start = Math.max(from, 22);
  for (let i = start; i < bars.length; i++) {
    const b = bars[i]!;
    const a = Math.max(atr[i] ?? 0, b.c * 0.0004);
    if (!cell.leg) {
      const side = sides[i] ?? 0;
      cell.cursorT = b.t;
      if (!side) continue;
      const tpDist = targetDistance(cell.tpAtr, a, b.c, POSITION_RT_COST_PCT,
        CANDLE_INTERVALS[interval] <= 15 * 60_000 ? trailRules?.microTargetCosts : 0);
      const slDist = cell.slOfTp * tpDist;
      const tp = b.c + side * tpDist;
      const sl = b.c - side * slDist;
      if (!(tp > 0 && sl > 0)) continue;
      const planned = coordinated
        ? notional * sizeAfterLosses(cell.lastN.at(-2), cell.lastN.at(-1))
        : notional;
      cell.side = side;
      cell.leg = {
        side,
        entry: b.c,
        tp,
        sl,
        qty: capped
          ? stopCappedQty(planned, b.c, slDist, POSITION_RT_COST_PCT, coordinated ? side : 0)
          : notional / b.c,
        hold: 0,
      };
      continue;
    }
    const leg = cell.leg;
    leg.hold += 1;
    const maxHold = CANDLE_INTERVALS[interval] <= 15 * 60_000 && trailRules
      ? Math.ceil(trailRules.microHoldMinutes * 60_000 / CANDLE_INTERVALS[interval])
      : MAX_HOLD;
    const hit = exitOnBar(leg.side, leg.tp, leg.sl, b, leg.hold, maxHold);
    cell.cursorT = b.t;
    if (!hit) {
      if (coordinated)
        advanceProtection(leg, b, cell.coordination ?? "fixed", POSITION_RT_COST_PCT, trailRules);
      continue;
    }
    const pnl = closePnl(leg.side, leg.entry, hit.exit, leg.qty);
    pushPnl(cell, pnl);
    push({
      id: `i:${cell.id}:${b.t}`,
      tape: "intern",
      symbol: cell.symbol,
      combo: comboId(cell.tpAtr, cell.slOfTp),
      pnl,
      px: hit.exit,
      ts: b.t,
      side: leg.side,
      indication: cell.indication,
      coordination: cell.coordination,
    });
    cell.leg = null;
  }
  const last = bars.at(-1);
  if (last) cell.cursorT = last.t;
  cell.signal = sides[bars.length - 1] ?? 0;
  if (!cell.leg) cell.side = cell.signal;
}

function advanceProtection(
  leg: OpenLeg,
  bar: Bar,
  coordination: Coordination,
  cost: number,
  trailRules?: TrailRules,
) {
  if (coordination === "fixed") return;
  const peak = leg.favorable ?? leg.entry;
  leg.favorable = leg.side > 0 ? Math.max(peak, bar.h) : Math.min(peak, bar.l);
  leg.sl = protectiveStop(
    coordination,
    leg.side,
    leg.entry,
    leg.tp,
    leg.sl,
    leg.favorable,
    cost,
    trailRules,
  );
}

export function syncBooks(
  prev: Cell[],
  books: { symbol: string; bars: Bar[] }[],
  equity: number,
  floors: Floors,
  connection?: ConnectionId,
  options?: {
    coordinated: boolean;
    trailing: boolean;
    trailRules?: StrategySettings;
    interval?: CandleInterval;
  },
): { cells: Cell[]; internFills: TapeFill[]; closes: number; valid: number; symbols: number } {
  const byId = new Map(prev.map((c) => [c.id, c]));
  const notional = positionNotional(equity);
  const interval = options?.interval ?? "1h";
  const step = CANDLE_INTERVALS[interval];
  const configs = !connection
    ? STRATEGY_CONFIGS
    : options?.coordinated !== true
      ? EXECUTION_CONFIGS
      : coordinatedConfigs(options.trailing, options.trailRules, step);
  const indications = options?.coordinated
    ? (options.trailRules?.enabledIndications ?? INDICATIONS)
    : LEGACY_INDICATIONS;
  const cells: Cell[] = [];
  const cap = 240;
  const ring: TapeFill[] = [];
  let seq = 0;
  const push = (fill: TapeFill) => {
    if (seq < cap) ring.push(fill);
    else ring[seq % cap] = fill;
    seq += 1;
  };
  let closes = 0;
  let symbols = 0;
  for (const book of books) {
    const bars = closedBars(saneBars(book.bars));
    if (bars.length < 24) continue;
    symbols += 1;
    const lastT = bars.at(-1)!.t;
    const excluded = excludedConfigurations(step === REPLAY_HOUR ? connection : undefined, lastT + step);
    const series = buildSeries(bars);
    const sides = {} as Record<Indication, Array<Side | 0>>;
    for (const indication of indications) {
      const row: Array<Side | 0> = new Array(bars.length).fill(0);
      for (let i = WARMUP; i < bars.length; i++) row[i] = signalAt(indication, bars, series, i);
      sides[indication] = row;
    }
    for (const config of configs) {
      const marketKey = `${book.symbol}|${config.key}`;
      if (excluded.has(marketKey)) continue;
      const id = `${interval === "1h" ? "" : `${interval}|`}${marketKey}`;
      const prior = byId.get(id);
      const cell =
        prior && prior.cursorT <= lastT
          ? { ...prior, lastN: prior.lastN.slice(), leg: prior.leg ? { ...prior.leg } : null }
          : blankCell(book.symbol, config, interval);
      const from = cell.cursorT ? indexAfter(bars, cell.cursorT) : WARMUP;
      const before = cell.n;
      advance(
        cell,
        bars,
        sides[config.indication]!,
        series.atr,
        notional,
        from,
        Boolean(connection),
        options?.coordinated === true,
        options?.trailRules,
        interval,
        push,
      );
      closes += cell.n - before;
      gateCell(cell, floors, options?.coordinated ? options.trailRules : undefined);
      cells.push(cell);
    }
  }
  let valid = 0;
  for (const c of cells) if (c.validExec && !c.disabled) valid += 1;
  const internFills = seq <= cap ? ring : ring.slice(seq % cap).concat(ring.slice(0, seq % cap));
  return { cells, internFills, closes, valid, symbols };
}

export function applyFloors(cells: Cell[], floors: Floors, settings?: PfSettings): Cell[] {
  return cells.map((c) => {
    const next = { ...c, lastN: c.lastN, leg: c.leg };
    gateCell(next, floors, settings);
    return next;
  });
}

export type SizeOpts = {
  block: boolean;
  axis: boolean;
  normalLive: boolean;
  hedge: boolean;
  floors?: Floors;
  trailing?: boolean;
  strategies?: StrategySettings;
  evidence?: RelationLedger;
  actions?: StrategyActions;
  limit?: number;
  interval?: CandleInterval;
};

export function sizedNotional(base: number, opts: { block: boolean; axis: boolean }): number {
  if (!(base > 0)) return 0;
  if (opts.axis && opts.block) {
    const ax = axisQty(base);
    const bl = blockQty(base);
    return capTotalQty(base, ax - base + (bl - base));
  }
  if (opts.axis) return axisQty(base);
  if (opts.block) return blockQty(base);
  return base;
}

export function openFromPerforming(
  cells: Cell[],
  marks: Record<string, { price: number; atr: number }>,
  equity: number,
  opts: SizeOpts,
  scope: { system: string; connection: string },
): LivePos[] {
  const ranked = cells
    .filter(
      (c) => c.validExec && !c.disabled && c.liveFloor && c.net > 0 && (c.signal ?? c.side) !== 0,
    )
    .filter((c) => opts.normalLive || c.indication !== "direction")
    .filter((c) => opts.trailing !== false || !c.coordination || c.coordination === "fixed")
    .sort((a, b) => b.pf - a.pf || b.net - a.net);
  const seen = new Set<string>();
  const symbols = new Set<string>();
  const out: LivePos[] = [];
  const base = positionNotional(equity) * (opts.strategies?.volumeFactor ?? 1);
  const actions = opts.actions ?? newStrategyActions();
  for (const c of ranked) {
    if (out.length >= (opts.limit ?? MAX_LIVE_LEGS)) break;
    const key = `${c.symbol}:${c.indication}`;
    if (seen.has(key)) continue;
    if (!opts.hedge && symbols.has(c.symbol)) continue;
    const m = marks[c.symbol];
    if (!m || !(m.price > 0) || !(m.atr > 0)) continue;
    seen.add(key);
    symbols.add(c.symbol);
    const side = (c.signal ?? c.side) as Side;
    const a = Math.max(m.atr, m.price * 0.0004);
    const interval = opts.interval ?? "1h";
    const tpDist = targetDistance(c.tpAtr, a, m.price, POSITION_RT_COST_PCT,
      CANDLE_INTERVALS[interval] <= 15 * 60_000 ? opts.strategies?.microTargetCosts : 0);
    const slDist = c.slOfTp * tpDist;
    const tp = m.price + side * tpDist;
    const sl = m.price - side * slDist;
    if (!(tp > 0 && sl > 0)) continue;
    const funded = opts.strategies
      ? base * sizeAfterLosses(c.lastN.at(-2), c.lastN.at(-1))
      : sizedNotional(base, {
          block: opts.block && c.pf >= (opts.floors?.block ?? 0),
          axis: opts.axis && c.pf >= (opts.floors?.axis ?? 0),
        });
    const exact = opts.evidence?.recent(`${c.id}|${side}`) ?? [];
    const related = opts.strategies
      ? (opts.evidence?.recent(relationKey(opts.strategies.relateScope, c.symbol, side, interval)) ?? [])
      : [];
    const { qty, plan, sizing } = opts.strategies
      ? managedEntry(
          { notional: funded, entry: m.price, stop: sl, target: tp, cost: POSITION_RT_COST_PCT },
          opts.strategies,
          c.lastN,
          related,
          actions,
          exact,
        )
      : {
          qty: stopCappedQty(funded, m.price, slDist, POSITION_RT_COST_PCT),
          plan: undefined,
          sizing: undefined,
        };
    out.push({
      id: `x:${TAG}${scope.connection}:${c.id}:${c.cursorT}`,
      symbol: c.symbol,
      side,
      qty,
      qtyBase: stopCappedQty(
        base,
        m.price,
        slDist,
        POSITION_RT_COST_PCT,
        opts.strategies ? side : 0,
      ),
      entry: m.price,
      mark: m.price,
      peak: m.price,
      tp,
      sl,
      combo: comboId(c.tpAtr, c.slOfTp),
      indication: c.indication,
      coordination: c.coordination,
      configId: c.id,
      trailRules: opts.strategies
        ? {
            trailActivation: opts.strategies.trailActivation,
            trailDistance: opts.strategies.trailDistance,
          }
        : undefined,
      plan,
      sizing,
      interval,
      maxHoldBars: CANDLE_INTERVALS[interval] <= 15 * 60_000 && opts.strategies
        ? Math.ceil(opts.strategies.microHoldMinutes * 60_000 / CANDLE_INTERVALS[interval])
        : MAX_HOLD,
      hold: 0,
      dca: 0,
      openedAt: Date.now(),
      system: scope.system,
      connection: scope.connection,
      type: "position",
    });
  }
  return out;
}

export function mergeFills(prev: TapeFill[], next: TapeFill[], cap = 240): TapeFill[] {
  if (!next.length) return prev;
  const seen = new Set(prev.map((f) => f.id));
  const add = next.filter((f) => !seen.has(f.id));
  if (!add.length) return prev;
  return [...add].reverse().concat(prev).slice(0, cap);
}

export function markPositions(
  positions: LivePos[],
  prices: Record<string, number>,
  opts: {
    trail: boolean;
    dca: boolean;
    block?: boolean;
    equity: number;
    asOf?: number;
    legacyDca?: boolean;
  },
): {
  open: LivePos[];
  closed: { pos: LivePos; pnl: number; px: number; reason: string }[];
  dca: LivePos[];
  block: LivePos[];
} {
  const open: LivePos[] = [];
  const closed: { pos: LivePos; pnl: number; px: number; reason: string }[] = [];
  const dca: LivePos[] = [];
  const block: LivePos[] = [];
  const base = positionNotional(opts.equity);
  for (const p of positions) {
    const px = prices[p.symbol];
    if (!(px > 0)) {
      open.push(p);
      continue;
    }
    const asOf = opts.asOf ?? 0;
    const intervalMs = CANDLE_INTERVALS[p.interval ?? "1h"];
    const elapsed =
      asOf > 0 ? Math.floor(asOf / intervalMs) - Math.floor(p.openedAt / intervalMs) : p.hold;
    const next: LivePos = {
      ...p,
      plan: p.plan ? { ...p.plan } : undefined,
      mark: px,
      hold: Math.max(p.hold, elapsed),
    };
    if (next.side > 0) next.peak = Math.max(next.peak, px);
    else next.peak = Math.min(next.peak, px);
    if (opts.trail && !next.coordination) {
      const dist = next.peak * (TRAIL_PCT / 100);
      if (next.side > 0) next.sl = Math.min(next.tp, Math.max(next.sl, next.peak - dist));
      else next.sl = Math.max(next.tp, Math.min(next.sl, next.peak + dist));
    }
    next.qty = Math.min(next.qty, next.qtyBase * MAX_MUL);
    const hitTp = next.side > 0 ? px >= next.tp : px <= next.tp;
    const hitSl = next.side > 0 ? px <= next.sl : px >= next.sl;
    if (hitSl) {
      // A stop-market order can gap past its trigger; paper uses the observed quote.
      const exit = px;
      closed.push({
        pos: next,
        pnl: closePnl(next.side, next.entry, exit, next.qty),
        px: exit,
        reason: "sl",
      });
    } else if (hitTp) {
      closed.push({
        pos: next,
        pnl: closePnl(next.side, next.entry, next.tp, next.qty),
        px: next.tp,
        reason: "tp",
      });
    } else if (next.hold >= (next.maxHoldBars ?? MAX_HOLD)) {
      closed.push({
        pos: next,
        pnl: closePnl(next.side, next.entry, px, next.qty),
        px,
        reason: "hold",
      });
    } else {
      if (opts.trail && next.coordination) {
        next.sl = protectiveStop(
          next.coordination,
          next.side,
          next.entry,
          next.tp,
          next.sl,
          next.peak,
          POSITION_RT_COST_PCT,
          next.trailRules,
        );
      }
      if (next.plan) {
        const adjusted = adjustPosition(
          next,
          px,
          POSITION_RT_COST_PCT,
          opts.block === true,
          opts.dca,
        );
        if (adjusted === "dca") {
          next.dca++;
          dca.push(next);
        }
        if (adjusted === "block") block.push(next);
      } else if (opts.dca && opts.legacyDca !== false && !next.configId && next.dca < 2) {
        const adverse = next.side > 0 ? next.entry - px : px - next.entry;
        const room = next.qtyBase * MAX_MUL - next.qty;
        if (adverse > Math.abs(next.entry - next.sl) * 0.45 && room > 0) {
          const add = Math.min(room, base / px);
          if (add > 0) {
            next.entry = (next.entry * next.qty + px * add) / (next.qty + add);
            next.qty += add;
            next.dca += 1;
            dca.push(next);
          }
        }
      }
      open.push(next);
    }
  }
  return { open, closed, dca, block };
}

export function headline(
  livePnls: { symbol: string; combo: string; pnl: number }[],
  minPf = PF.short,
) {
  const map = new Map<string, { n: number; net: number; pnls: number[] }>();
  for (const r of livePnls) {
    const k = `${r.symbol}|${r.combo}`;
    const g = map.get(k) ?? { n: 0, net: 0, pnls: [] };
    g.n += 1;
    g.net += r.pnl;
    g.pnls.push(r.pnl);
    map.set(k, g);
  }
  return [...map.entries()]
    .map(([id, g]) => ({ id, n: g.n, net: g.net, pf: pfFromPnls(g.pnls.map((pnl) => ({ pnl }))) }))
    .filter((r) => r.n >= 4 && r.net > 0 && r.pf >= minPf)
    .sort((a, b) => b.pf - a.pf);
}

export function greenHour(fills: TapeFill[], now: number) {
  const start = now - (now % 3_600_000);
  let n = 0;
  let net = 0;
  for (const f of fills) {
    if (f.tape === "live" && f.ts >= start) {
      n += 1;
      net += f.pnl;
    }
  }
  if (!(n > 0)) return { green: false, code: "G0" as const, n, net };
  return { green: net >= 0, code: (net >= 0 ? "G1" : "R1") as "G1" | "R1", n, net };
}

export function systemNet(closed: number, positions: LivePos[]): number {
  let open = 0;
  for (const p of positions) open += closePnl(p.side, p.entry, p.mark, p.qty);
  return closed + open;
}

export function cellRollup(cells: Cell[]) {
  let valid = 0;
  let disabled = 0;
  let net = 0;
  let samples = 0;
  for (const c of cells) {
    if (c.validExec && !c.disabled) valid += 1;
    if (c.disabled) disabled += 1;
    net += c.net;
    samples += c.n;
  }
  return { valid, disabled, net, samples, n: cells.length };
}

export function barSignature(books: { symbol: string; bars: Bar[] }[]): string {
  let sig = "";
  for (const b of books) {
    const last = lastClosedBar(b.bars);
    const length = b.bars.length - Number(last !== b.bars.at(-1));
    sig += `${b.symbol}:${last?.t ?? 0}:${length}|`;
  }
  return sig;
}

export type HourPoint = {
  t: number;
  trades: number;
  wins: number;
  losses: number;
  realized: number;
  mtm: number;
  net: number;
  pf: number;
  grossProfit: number;
  grossLoss: number;
  openLegs: number;
};

export type HourAcc = Omit<HourPoint, "net" | "pf">;
type ReplayGate = { cell: Cell; floors: Floors; settings: StrategySettings };
type EquityStats = { net: number; peak: number; trough: number; drawdown: number };
type IndicationSummary = ReplaySummary & {
  selected: number;
  bookLive: HourPoint[];
  equity: EquityStats;
};

type ReplaySummary = {
  net: number;
  samples: number;
  wins: number;
  green: number;
  pf: number;
  grossProfit: number;
  grossLoss: number;
  drawdown: number;
};

export type SessionReport = {
  ready: boolean;
  note: string;
  pre: HourPoint[];
  live: HourPoint[];
  promoted: HourPoint[];
  proven: number;
  symbols: number;
  profile: ReplayProfile;
  interval: CandleInterval;
  preHours: number;
  replayHours: number;
  evaluatedConfigs: number;
  disabledConfigs: number;
  rejectedPf: number;
  strategyActions: StrategyActions;
  indicationSummaries?: Partial<Record<Indication, IndicationSummary>>;
  unavailable: string[];
  preNet: number;
  liveNet: number;
  promotedNet: number;
  greenPre: number;
  greenLive: number;
  greenPromoted: number;
  prePf: number;
  livePf: number;
  promotedPf: number;
  samplesPre: number;
  samplesLive: number;
  samplesPromoted: number;
  bookPre: HourPoint[];
  bookLive: HourPoint[];
  bookNetPre: number;
  bookNetLive: number;
  bookDrawdownPre: number;
  bookDrawdownLive: number;
  bookEquityLive: EquityStats;
  greenBookPre: number;
  greenBookLive: number;
  bookNames: string[];
  coverage: CoverageRow[];
  staged?: StagedSummary;
  selected: {
    name: string;
    symbol: string;
    indication: Indication;
    range: "short" | "wide";
    requiredPf: number;
    pre: ReplaySummary;
    replay: ReplaySummary;
  }[];
};

export type CoverageRow = {
  indication: Indication;
  range: "short" | "wide";
  // Configurations of this indication and range considered for each symbol.
  configs: number;
  // Configurations skipped by the published calibration exclusions.
  excluded: number;
  // Configurations that closed at least one trade in the prehistory.
  withCloses: number;
  // Configurations with the minimum closes required for qualification.
  reachedSamples: number;
  // Configurations passing the PF, sample and follow-through gates.
  passed: number;
  // Highest prehistory PF among configurations that reached the closes minimum.
  bestPf: number;
  // Symbols whose selected configuration uses this indication and range.
  selected: number;
  // Raw indication signals on the closed candles of each window.
  signalsPre: number;
  signalsReplay: number;
};

export type ReplaySize = "base" | "block" | "axis" | "both";

export type QualifiedReplay = {
  symbol: string;
  key: string;
  samples: number;
  grossProfit: number;
  grossLoss: number;
};

export type ReplayOpts = {
  hours?: number;
  preHours?: number;
  interval?: CandleInterval;
  indication?: Indication;
  range?: "short" | "wide";
  size?: ReplaySize;
  end?: number;
  costs?: Readonly<Record<string, number>>;
  connection?: ConnectionId;
  profile?: ReplayProfile;
  onQualified?: (row: QualifiedReplay) => void;
  strategies?: StrategySettings;
  trailing?: boolean;
  selectedOnly?: boolean;
  reselectHours?: number;
  independentIndications?: boolean;
  // Replays one bracket on every market without prehistory selection; isolates the signal and exits.
  fixed?: { indication: Indication; tpAtr: number; slOfTp: number; coordination?: Coordination };
};

export function hourAccumulator(t: number): HourAcc {
  return {
    t,
    trades: 0,
    wins: 0,
    losses: 0,
    realized: 0,
    mtm: 0,
    grossProfit: 0,
    grossLoss: 0,
    openLegs: 0,
  };
}

function seal(rows: HourAcc[]): HourPoint[] {
  return rows.map((row) => ({
    ...row,
    net: row.realized + row.mtm,
    pf: profitFactor(row.grossProfit, row.grossLoss),
  }));
}

export function summarizeReplay(rows: HourPoint[]): ReplaySummary {
  let net = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let samples = 0;
  let wins = 0;
  let green = 0;
  let peak = 0;
  let drawdown = 0;
  for (const row of rows) {
    net += row.net;
    samples += row.trades;
    wins += row.wins;
    grossProfit += row.grossProfit;
    grossLoss += row.grossLoss;
    if (row.net > 1e-9) green += 1;
    peak = Math.max(peak, net);
    drawdown = Math.max(drawdown, peak - net);
  }
  return {
    net,
    samples,
    wins,
    green,
    grossProfit,
    grossLoss,
    pf: profitFactor(grossProfit, grossLoss),
    drawdown,
  };
}

export function addHours(dst: HourAcc[], src: readonly HourAcc[], scale = 1) {
  const count = src.length;
  for (let index = 0; index < count; index++) {
    const row = src[index]!;
    // Idle hours contribute nothing; most candidate configurations are idle in most hours.
    if (!row.trades && !row.realized && !row.mtm && !row.openLegs) continue;
    const out = dst[index]!;
    out.trades += row.trades;
    out.wins += row.wins;
    out.losses += row.losses;
    out.realized += row.realized * scale;
    out.mtm += row.mtm * scale;
    out.grossProfit += row.grossProfit * scale;
    out.grossLoss += row.grossLoss * scale;
    out.openLegs += row.openLegs;
  }
}

export function clockHours(rows: HourAcc[], step: number) {
  if (step >= REPLAY_HOUR) return seal(rows);
  const hourly: HourAcc[] = [];
  for (const row of rows) {
    const time = Math.floor(row.t / REPLAY_HOUR) * REPLAY_HOUR;
    let bucket = hourly.at(-1);
    if (!bucket || bucket.t !== time) {
      bucket = hourAccumulator(time);
      hourly.push(bucket);
    }
    bucket.trades += row.trades;
    bucket.wins += row.wins;
    bucket.losses += row.losses;
    bucket.realized += row.realized;
    bucket.mtm += row.mtm;
    bucket.grossProfit += row.grossProfit;
    bucket.grossLoss += row.grossLoss;
    bucket.openLegs = row.openLegs;
  }
  return seal(hourly);
}

function candleEquity(rows: HourAcc[]): EquityStats {
  let equity = 0;
  let peak = 0;
  let trough = 0;
  let drawdown = 0;
  for (const row of rows) {
    equity += row.realized + row.mtm;
    peak = Math.max(peak, equity);
    trough = Math.min(trough, equity);
    drawdown = Math.max(drawdown, peak - equity);
  }
  return { net: equity, peak, trough, drawdown };
}

function summarizeCandles(rows: HourAcc[], step: number) {
  const summary = summarizeReplay(clockHours(rows, step));
  if (step < REPLAY_HOUR) summary.drawdown = candleEquity(rows).drawdown;
  return summary;
}

function replayGate(
  symbol: string,
  config: (typeof COORDINATED_CONFIGS)[number],
  rows: readonly Pick<HourAcc, "trades" | "realized">[],
  floors: Floors,
  settings: StrategySettings,
): ReplayGate {
  const cell = blankCell(symbol, config);
  for (const row of rows) if (row.trades) pushPnl(cell, row.realized);
  gateCell(cell, floors, settings);
  return { cell, floors, settings };
}

// Lane gate for position-history evaluation. Closes are evidence; `allow` decides whether a new
// entry books or opens a shadow position that is tracked but not booked.
export type LanedReplay = {
  closes: number[];
  allow: (closes: readonly number[]) => boolean;
  shadows: number;
  shadowPnl: number[];
};

export function replayWindow(
  bars: Bar[],
  atr: number[],
  signals: (Side | 0)[],
  from: number,
  slots: HourAcc[],
  notional: number,
  cost: number,
  tpAtr: number,
  slOfTp: number,
  capped: boolean,
  coordination: Coordination,
  throttle: boolean,
  trailRules: StrategySettings | undefined,
  interval: CandleInterval,
  gate?: ReplayGate,
  gateAtBar?: boolean[],
  ledger?: TradeLeg[],
  laned?: LanedReplay,
) {
  let leg: OpenLeg | null = null;
  let priorMark = 0;
  let priorPnl: number | undefined;
  let earlierPnl: number | undefined;
  const micro = CANDLE_INTERVALS[interval] <= 15 * 60_000;
  const maxHold = micro && trailRules
    ? Math.ceil(trailRules.microHoldMinutes * 60_000 / CANDLE_INTERVALS[interval])
    : MAX_HOLD;
  for (let offset = 0; offset < slots.length; offset++) {
    const row = slots[offset]!;
    if (gateAtBar) gateAtBar[offset] = gate?.cell.validExec ?? true;
    const i = from + offset;
    const bar = bars[i]!;
    row.trades =
      row.wins =
      row.losses =
      row.realized =
      row.mtm =
      row.grossProfit =
      row.grossLoss =
      row.openLegs =
        0;
    const side = signals[i - 1];
    if (!leg && offset > 0 && side) {
      const dist = targetDistance(tpAtr, atr[i - 1] ?? 0, bar.o, cost,
        micro ? trailRules?.microTargetCosts : 0);
      const stopDistance = dist * slOfTp;
      const planned = throttle ? notional * sizeAfterLosses(earlierPnl, priorPnl) : notional;
      const tp = bar.o + side * dist;
      const sl = bar.o - side * stopDistance;
      if (tp > 0 && sl > 0) {
        const active = laned ? laned.allow(laned.closes) : (gate?.cell.validExec ?? true);
        if (laned && !active) laned.shadows += 1;
        leg = {
          side,
          entry: bar.o,
          tp,
          sl,
          qty: capped
            ? stopCappedQty(planned, bar.o, stopDistance, cost, throttle ? side : 0)
            : notional / bar.o,
          hold: 0,
          active,
        };
      }
    }
    if (leg) {
      const hit = exitOnBar(leg.side, leg.tp, leg.sl, bar, ++leg.hold, maxHold);
      if (hit || offset === slots.length - 1) {
        const pnl = closePnl(leg.side, leg.entry, hit?.exit ?? bar.c, leg.qty, cost);
        if (laned) {
          laned.closes.push(pnl);
          if (leg.active === false) laned.shadowPnl.push(pnl);
        }
        ledger?.push({
          t: bar.t,
          side: leg.side,
          entry: leg.entry,
          exit: hit?.exit ?? bar.c,
          pnl,
          reason: hit?.reason ?? "end",
          hold: leg.hold,
        });
        earlierPnl = priorPnl;
        priorPnl = pnl;
        if (leg.active !== false) {
          row.trades = 1;
          row.realized = pnl;
          if (pnl > 0) {
            row.wins = 1;
            row.grossProfit = pnl;
          }
          if (pnl < 0) {
            row.losses = 1;
            row.grossLoss = -pnl;
          }
        }
        if (gate) {
          pushPnl(gate.cell, pnl);
          gateCell(gate.cell, gate.floors, gate.settings);
        }
        leg = null;
      } else {
        advanceProtection(leg, bar, coordination, cost, trailRules);
      }
    }
    const mark = leg && leg.active !== false ? closePnl(leg.side, leg.entry, bar.c, leg.qty, cost) : 0;
    row.mtm = mark - priorMark;
    row.openLegs = Number(Boolean(leg));
    priorMark = mark;
  }
}

function rankPre(rows: HourAcc[], byHour = false, checkRecent = false) {
  let green = 0;
  let gp = 0;
  let gl = 0;
  let n = 0;
  let interval = -1;
  let equityChange = 0;
  const split = Math.floor(rows.length / 2);
  let recentGains = 0;
  let recentLosses = 0;
  let recentSamples = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    // Idle hours add nothing to the sums or green count; a later active hour still closes the prior one.
    if (!row.trades && !row.realized && !row.mtm) continue;
    gp += row.grossProfit;
    gl += row.grossLoss;
    n += row.trades;
    if (checkRecent && i >= split) {
      recentGains += row.grossProfit;
      recentLosses += row.grossLoss;
      recentSamples += row.trades;
    }
    if (byHour) {
      const hour = Math.floor(row.t / REPLAY_HOUR);
      if (hour !== interval) {
        if (equityChange > 1e-9) green++;
        interval = hour;
        equityChange = 0;
      }
      equityChange += row.realized + row.mtm;
    }
  }
  if (equityChange > 1e-9) green++;
  return {
    n,
    green,
    net: gp - gl,
    pf: profitFactor(gp, gl),
    grossProfit: gp,
    grossLoss: gl,
    recentSamples,
    recentNet: recentGains - recentLosses,
    recentPf: profitFactor(recentGains, recentLosses),
  };
}

type ManagedReplayInput = {
  symbol: string;
  bars: Bar[];
  atr: number[];
  signals: (Side | 0)[];
  config: (typeof COORDINATED_CONFIGS)[number];
  pre: HourAcc[];
  cost: number;
  slot: number;
  gateAtBar?: boolean[];
};

function managedHoldout(
  inputs: ManagedReplayInput[],
  from: number,
  hours: number,
  notional: number,
  strategy: StrategySettings,
  actions: StrategyActions,
  interval: CandleInterval,
) {
  const ledger = new RelationLedger();
  const states = inputs.map((input) => ({
    input,
    exact: `${interval === "1h" ? "" : `${interval}|`}${input.symbol}|${input.config.key}`,
    rows: Array.from({ length: hours }, (_, i) => hourAccumulator(input.bars[from + i]!.t)),
    closed: input.pre.filter((row) => row.trades > 0).map((row) => row.realized),
    leg: null as OpenLeg | null,
    priorPnl: undefined as number | undefined,
    earlierPnl: undefined as number | undefined,
    priorMark: 0,
  }));

  for (let offset = 0; offset < hours; offset++) {
    const i = from + offset;
    const settled: { exact: string; symbol: string; side: Side; pnl: number }[] = [];
    for (const state of states) {
      const { input, exact } = state;
      const { symbol, bars, signals, atr, config, cost } = input;
      const bar = bars[i]!;
      const row = state.rows[offset]!;
      const side = signals[i - 1];
      if (state.leg) {
        const adjustment = adjustPosition(state.leg, bar.o, cost, strategy.block, strategy.dca);
        if (adjustment) actions[adjustment]++;
      } else if (offset > 0 && side && (input.gateAtBar?.[offset] ?? true)) {
        const distance = targetDistance(config.tpAtr, atr[i - 1] ?? 0, bar.o, cost,
          CANDLE_INTERVALS[interval] <= 15 * 60_000 ? strategy.microTargetCosts : 0);
        const tp = bar.o + side * distance;
        const sl = bar.o - side * distance * config.slOfTp;
        if (tp > 0 && sl > 0) {
          const funded = notional * sizeAfterLosses(state.earlierPnl, state.priorPnl);
          const entry = managedEntry(
            { notional: funded, entry: bar.o, stop: sl, target: tp, cost },
            strategy,
            state.closed,
            ledger.recent(relationKey(strategy.relateScope, symbol, side, interval)),
            actions,
            ledger.recent(`${exact}|${side}`),
          );
          state.leg = { side, entry: bar.o, tp, sl, qty: entry.qty, hold: 0, plan: entry.plan };
        }
      }
      const leg = state.leg;
      if (leg) {
        const maxHold = CANDLE_INTERVALS[interval] <= 15 * 60_000
          ? Math.ceil(strategy.microHoldMinutes * 60_000 / CANDLE_INTERVALS[interval])
          : MAX_HOLD;
        const hit = exitOnBar(leg.side, leg.tp, leg.sl, bar, ++leg.hold, maxHold);
        if (hit || offset === hours - 1) {
          const pnl = closePnl(leg.side, leg.entry, hit?.exit ?? bar.c, leg.qty, cost);
          row.trades = 1;
          row.realized = pnl;
          row.wins = Number(pnl > 0);
          row.losses = Number(pnl < 0);
          row.grossProfit = Math.max(0, pnl);
          row.grossLoss = Math.max(0, -pnl);
          state.closed.push(pnl);
          if (state.closed.length > 50) state.closed.shift();
          state.earlierPnl = state.priorPnl;
          state.priorPnl = pnl;
          if (strategy.relate) settled.push({ exact, symbol, side: leg.side, pnl });
          state.leg = null;
        } else advanceProtection(leg, bar, config.coordination, cost, strategy);
      }
      const mark = state.leg
        ? closePnl(state.leg.side, state.leg.entry, bar.c, state.leg.qty, cost)
        : 0;
      row.mtm = mark - state.priorMark;
      row.openLegs = Number(Boolean(state.leg));
      state.priorMark = mark;
    }
    // A close within this candle can only influence orders in later candles.
    for (const close of settled)
      recordRelationClose(ledger, close.exact, close.symbol, close.side, close.pnl, interval);
  }
  return states.map((state) => state.rows);
}

// Replays one configuration over closed bars and returns every trade, for loss analysis.
export function traceTrades(
  bars: Bar[],
  indication: Indication,
  tpAtr: number,
  slOfTp: number,
  coordination: Coordination = "fixed",
  interval: CandleInterval = "1h",
  trailRules?: StrategySettings,
  gate?: (index: number, side: Side) => boolean,
): TradeLeg[] {
  const series = buildSeries(bars);
  const signals = bars.map((_, i) => {
    const side = signalAt(indication, bars, series, i);
    return side && gate && !gate(i, side) ? 0 : side;
  });
  const slots = bars.slice(WARMUP).map((b) => hourAccumulator(b.t));
  const ledger: TradeLeg[] = [];
  replayWindow(
    bars, series.atr, signals, WARMUP, slots, positionNotional(10_000), POSITION_RT_COST_PCT,
    tpAtr, slOfTp, true, coordination, false, trailRules, interval, undefined, undefined, ledger,
  );
  return ledger;
}

export function simulateSessions(
  books: { symbol: string; bars: Bar[] }[],
  equity: number,
  floors: Floors,
  opts?: ReplayOpts,
): SessionReport {
  const hours = opts?.hours ?? 24;
  const preHours = opts?.preHours ?? hours;
  const interval = opts?.interval ?? "1h";
  const step = CANDLE_INTERVALS[interval];
  const preLength = (preHours * REPLAY_HOUR) / step;
  const replayLength = (hours * REPLAY_HOUR) / step;
  if (
    !Number.isInteger(preLength) ||
    !Number.isInteger(replayLength) ||
    preLength < 1 ||
    replayLength < 1 ||
    preHours > 336 ||
    hours > 336
  )
    throw new Error(
      "Replay windows must align with the candle interval and span at most 336 hours.",
    );
  const reselectHours = opts?.reselectHours ??
    (opts?.profile === "coordinated"
      ? (opts?.strategies ?? defaultForInterval(interval)).microReselectHours
      : 0);
  if (reselectHours !== 0) {
    if (!Number.isInteger(reselectHours) || reselectHours < 1 || reselectHours > 336 ||
        (reselectHours * REPLAY_HOUR) % step !== 0)
      throw new Error("Reselection must be an aligned positive number of hours.");
    if (hours > reselectHours)
      return simulateReselected(books, equity, floors, { ...opts, interval, hours, preHours, reselectHours });
  }
  const profile = opts?.profile ?? "filtered";
  const baseline = profile === "baseline";
  const coordinated = profile === "coordinated";
  const saved = opts?.strategies ?? defaultForInterval(interval);
  const preferences = !coordinated
    ? undefined
    : opts?.indication || opts?.range
      ? {
          ...saved,
          enabledIndications: opts.indication ? [opts.indication] : saved.enabledIndications,
          shortRange: opts.range === "short" || saved.shortRange,
          wideRange: opts.range === "wide" || saved.wideRange,
        }
      : saved;
  const size = coordinated ? "base" : (opts?.size ?? "both");
  const span = WARMUP + preLength + replayLength;
  const latest = Math.max(0, ...books.map((b) => lastClosedBar(b.bars)?.t ?? 0));
  const end = opts?.end ?? latest + step;
  const start = end - span * step;
  const aligned = books.flatMap((b) => {
    const bars = closedBars(saneBars(b.bars)).filter((bar) => bar.t >= start && bar.t < end);
    return bars.length === span && bars.every((bar, i) => bar.t === start + i * step)
      ? [{ symbol: b.symbol, bars }]
      : [];
  });
  const excluded =
    baseline || step !== REPLAY_HOUR
      ? excludedConfigurations(undefined, 0)
      : excludedConfigurations(opts?.connection, start + WARMUP * step);
  const availableConfigs = baseline
    ? STRATEGY_CONFIGS
    : coordinated
      ? coordinatedConfigs(opts?.trailing !== false, preferences, step)
      : EXECUTION_CONFIGS;
  const fixed = opts?.fixed;
  const configs = fixed
    ? availableConfigs.filter(
        (config) =>
          config.indication === fixed.indication &&
          config.tpAtr === fixed.tpAtr &&
          config.slOfTp === fixed.slOfTp &&
          config.coordination === (fixed.coordination ?? "fixed"),
      )
    : opts?.indication || opts?.range
      ? availableConfigs.filter(
          (config) =>
            (!opts?.indication || config.indication === opts.indication) &&
            (!opts?.range || config.range === opts.range),
        )
      : availableConfigs;
  const indications = new Set(configs.map((config) => config.indication));
  const strategies =
    preferences && STRATEGY_TYPES.some((type) => preferences[type]) ? preferences : null;
  if (opts?.independentIndications && strategies)
    throw new Error("Independent indication studies require strategy overlays to be disabled.");
  const qualification = preferences;
  const minSamples = qualification?.autoPf ? qualification.autoPfSamples : LASTN.minSamples;
  const recentGate = qualification?.autoPf && qualification.autoPfRecent;
  const minPf = Math.max(floors.base, floors.short);
  const strategyActions = newStrategyActions();
  const managed: ManagedReplayInput[] = [];
  const present = new Set(aligned.map((b) => b.symbol));
  const unavailable = books.map((b) => b.symbol).filter((s) => !present.has(s));
  const clock = (from: number, length = from === WARMUP ? preLength : replayLength) =>
    Array.from({ length: aligned.length ? length : 0 }, (_, i) =>
      hourAccumulator(start + (from + i) * step),
    );
  const replayFrom = WARMUP + preLength;
  const preAcc = clock(WARMUP);
  const liveAcc = clock(replayFrom);
  const promotedAcc = clock(replayFrom);
  const bookPreAcc = clock(WARMUP);
  const bookLiveAcc = clock(replayFrom);
  const preWork = clock(WARMUP);
  const liveWork = clock(replayFrom);
  const indicationBooks = opts?.independentIndications
    ? new Map([...indications].map((name) => [name, { rows: clock(replayFrom), selected: 0 }]))
    : undefined;
  const notional = positionNotional(equity) * (preferences?.volumeFactor ?? 1);
  const scale =
    notional > 0
      ? sizedNotional(notional, {
          block: size === "block" || size === "both",
          axis: size === "axis" || size === "both",
        }) / notional
      : 1;
  const selected: SessionReport["selected"] = [];
  const coverage = new Map<string, CoverageRow>();
  for (const config of configs) {
    const key = `${config.indication}|${config.range}`;
    if (!coverage.has(key))
      coverage.set(key, {
        indication: config.indication,
        range: config.range,
        configs: 0,
        excluded: 0,
        withCloses: 0,
        reachedSamples: 0,
        passed: 0,
        bestPf: 0,
        selected: 0,
        signalsPre: 0,
        signalsReplay: 0,
      });
  }
  const signalTally = new Map<Indication, { pre: number; replay: number }>();
  let proven = 0;
  let disabledConfigs = 0;
  let rejectedPf = 0;
  const selectedOnly = opts?.selectedOnly === true && !opts.onQualified;
  const onlineGate = Boolean(coordinated && step <= 15 * 60_000 && preferences?.microReplayGate);
  for (const { symbol, bars } of aligned) {
    const series = buildSeries(bars);
    const cost = opts?.costs?.[symbol] ?? POSITION_RT_COST_PCT;
    const bestPre = clock(WARMUP);
    const bestLive = clock(replayFrom);
    let bestNet = 0;
    let bestGreen = -1;
    let selectedFloor = minPf;
    let winner: (typeof COORDINATED_CONFIGS)[number] | undefined;
    const winners = new Map<Indication, {
      config: (typeof COORDINATED_CONFIGS)[number];
      green: number;
      net: number;
      pre: Pick<HourAcc, "trades" | "realized">[];
    }>();
    let name = "";
    const signalsByIndication = new Map(
      [...indications].map((indication) => [
        indication,
        bars.map((_, i) => signalAt(indication, bars, series, i)),
      ]),
    );
    for (const [indication, signals] of signalsByIndication) {
      const tally = signalTally.get(indication) ?? { pre: 0, replay: 0 };
      for (let i = WARMUP; i < signals.length; i++) {
        if (!signals[i]) continue;
        if (i < replayFrom) tally.pre++;
        else tally.replay++;
      }
      signalTally.set(indication, tally);
    }
    for (const config of configs) {
      const cov = coverage.get(`${config.indication}|${config.range}`)!;
      if (excluded.has(`${symbol}|${config.key}`)) {
        disabledConfigs++;
        cov.excluded++;
        continue;
      }
      cov.configs++;
      const { indication, tpAtr, slOfTp } = config;
      const signals = signalsByIndication.get(indication)!;
      replayWindow(
        bars,
        series.atr,
        signals,
        WARMUP,
        preWork,
        notional,
        cost,
        tpAtr,
        slOfTp,
        !baseline,
        config.coordination,
        coordinated,
        preferences,
        interval,
      );
      const quality = rankPre(preWork, coordinated, recentGate);
      const threshold = requiredPf(minPf, quality.n, qualification);
      const followThrough =
        !recentGate ||
        quality.recentSamples < Math.max(3, Math.ceil(minSamples / 2)) ||
        (quality.recentNet > 0 && quality.recentPf >= Math.max(minPf, 1));
      const pass =
        fixed !== undefined ||
        (config.liveFloor &&
          quality.n >= minSamples &&
          quality.net > 0 &&
          quality.pf >= threshold &&
          followThrough);
      if (quality.n > 0) cov.withCloses++;
      if (quality.n >= minSamples) {
        cov.reachedSamples++;
        cov.bestPf = Math.max(cov.bestPf, quality.pf);
      }
      if (pass) cov.passed++;
      addHours(preAcc, preWork);
      if (config.liveFloor && !pass) rejectedPf++;
      if (!pass && !baseline) continue;
      if (!selectedOnly) {
        replayWindow(
          bars,
          series.atr,
          signals,
          replayFrom,
          liveWork,
          notional,
          cost,
          tpAtr,
          slOfTp,
          !baseline,
          config.coordination,
          coordinated,
          preferences,
          interval,
          onlineGate && preferences ? replayGate(symbol, config, preWork, floors, preferences) : undefined,
        );
        addHours(liveAcc, liveWork);
      }
      if (!pass) continue;
      proven++;
      if (indicationBooks) {
        const prior = winners.get(indication);
        let better = !prior;
        if (prior)
          better = coordinated && quality.green !== prior.green
            ? quality.green > prior.green
            : quality.net > prior.net;
        if (better) winners.set(indication, {
          config, green: quality.green, net: quality.net,
          pre: onlineGate ? preWork.filter((row) => row.trades).map(({ trades, realized }) => ({ trades, realized })) : [],
        });
      }
      if (!selectedOnly) addHours(promotedAcc, liveWork);
      if (opts?.onQualified) {
        const realized = rankPre(liveWork);
        opts.onQualified({
          symbol,
          key: config.key,
          samples: realized.n,
          grossProfit: realized.grossProfit,
          grossLoss: realized.grossLoss,
        });
      }
      if (
        !coordinated || quality.green === bestGreen
          ? quality.net > bestNet
          : quality.green > bestGreen
      ) {
        bestNet = quality.net;
        bestGreen = quality.green;
        selectedFloor = threshold;
        winner = config;
        name = `${symbol} ${indication} ${comboId(tpAtr, slOfTp)}${coordinated ? ` ${config.coordination}` : ""}`;
        for (let i = 0; i < preLength; i++) Object.assign(bestPre[i]!, preWork[i]);
        if (!selectedOnly)
          for (let i = 0; i < replayLength; i++) Object.assign(bestLive[i]!, liveWork[i]);
      }
    }
    if (name && winner) {
      let gateAtBar: boolean[] | undefined;
      if (winner && (selectedOnly || (onlineGate && strategies))) {
        gateAtBar = onlineGate ? [] : undefined;
        replayWindow(
          bars, series.atr, signalsByIndication.get(winner.indication)!, replayFrom,
          bestLive, notional, cost, winner.tpAtr, winner.slOfTp,
          !baseline, winner.coordination, coordinated, preferences, interval,
          onlineGate && preferences ? replayGate(symbol, winner, bestPre, floors, preferences) : undefined,
          gateAtBar,
        );
        if (selectedOnly) {
          addHours(liveAcc, bestLive);
          addHours(promotedAcc, bestLive);
        }
      }
      addHours(bookPreAcc, bestPre, scale);
      const slot = selected.length;
      if (strategies && winner) {
        managed.push({
          symbol,
          bars,
          atr: series.atr,
          signals: signalsByIndication.get(winner.indication)!,
          config: winner,
          cost,
          pre: bestPre,
          slot,
          gateAtBar,
        });
      } else addHours(bookLiveAcc, bestLive, scale);
      coverage.get(`${winner.indication}|${winner.range}`)!.selected++;
      selected.push({
        name,
        symbol,
        indication: winner.indication,
        range: winner.range,
        requiredPf: selectedFloor,
        pre: summarizeCandles(bestPre, step),
        replay: summarizeCandles(bestLive, step),
      });
    }
    if (indicationBooks) {
      for (const [indication, chosen] of winners) {
        const book = indicationBooks.get(indication)!;
        replayWindow(
          bars, series.atr, signalsByIndication.get(indication)!, replayFrom, liveWork,
          notional, cost, chosen.config.tpAtr, chosen.config.slOfTp,
          !baseline, chosen.config.coordination, coordinated, preferences, interval,
          onlineGate && preferences ? replayGate(symbol, chosen.config, chosen.pre, floors, preferences) : undefined,
        );
        addHours(book.rows, liveWork, scale);
        book.selected++;
      }
    }
  }
  if (strategies && managed.length) {
    const rows = managedHoldout(
      managed,
      replayFrom,
      replayLength,
      notional,
      strategies,
      strategyActions,
      interval,
    );
    for (const input of managed) {
      const tape = rows[input.slot]!;
      addHours(bookLiveAcc, tape, scale);
      selected[input.slot]!.replay = summarizeCandles(tape, step);
    }
  }
  const pre = clockHours(preAcc, step);
  const live = clockHours(liveAcc, step);
  const promoted = clockHours(promotedAcc, step);
  const bookPre = clockHours(bookPreAcc, step);
  const bookLive = clockHours(bookLiveAcc, step);
  const a = summarizeReplay(pre);
  const b = summarizeReplay(live);
  const c = summarizeReplay(promoted);
  const d = summarizeReplay(bookPre);
  const e = summarizeReplay(bookLive);
  const indicationSummaries: SessionReport["indicationSummaries"] = indicationBooks
    ? Object.fromEntries([...indicationBooks].map(([name, book]) => [name, {
        ...summarizeCandles(book.rows, step),
        selected: book.selected,
        bookLive: clockHours(book.rows, step),
        equity: candleEquity(book.rows),
      }]))
    : undefined;
  return {
    ready: aligned.length > 0,
    note: aligned.length
      ? `The ${preHours}h pre-window selects one cell per symbol after PF qualification. The next ${hours}h start flat with those cells${coordinated ? "" : ` at ${size} size`}. Entries use the next open and ambiguous candles hit the stop first.${selectedOnly ? " Portfolio outcomes cover selected cells." : ""}`
      : `Need ${span} contiguous closed BingX ${interval} candles for a ${hours}h replay.`,
    pre,
    live,
    promoted,
    proven,
    symbols: aligned.length,
    profile,
    interval,
    preHours,
    replayHours: hours,
    evaluatedConfigs: configs.length * aligned.length - disabledConfigs,
    disabledConfigs,
    rejectedPf,
    strategyActions,
    indicationSummaries,
    unavailable,
    preNet: a.net,
    liveNet: b.net,
    promotedNet: c.net,
    greenPre: a.green,
    greenLive: b.green,
    greenPromoted: c.green,
    prePf: a.pf,
    livePf: b.pf,
    promotedPf: c.pf,
    samplesPre: a.samples,
    samplesLive: b.samples,
    samplesPromoted: c.samples,
    bookPre,
    bookLive,
    bookNetPre: d.net,
    bookNetLive: e.net,
    bookDrawdownPre: step < REPLAY_HOUR ? candleEquity(bookPreAcc).drawdown : d.drawdown,
    bookDrawdownLive: step < REPLAY_HOUR ? candleEquity(bookLiveAcc).drawdown : e.drawdown,
    bookEquityLive: candleEquity(bookLiveAcc),
    greenBookPre: d.green,
    greenBookLive: e.green,
    bookNames: selected.map((r) => r.name),
    coverage: [...coverage.values()].map((row) => ({
      ...row,
      signalsPre: signalTally.get(row.indication)?.pre ?? 0,
      signalsReplay: signalTally.get(row.indication)?.replay ?? 0,
    })),
    selected,
  };
}

function simulateReselected(
  books: { symbol: string; bars: Bar[] }[],
  equity: number,
  floors: Floors,
  opts: ReplayOpts & { interval: CandleInterval; hours: number; preHours: number },
): SessionReport {
  const step = CANDLE_INTERVALS[opts.interval];
  const latest = Math.max(0, ...books.map((book) => lastClosedBar(book.bars)?.t ?? 0));
  const end = opts.end ?? latest + step;
  const duration = opts.reselectHours! * REPLAY_HOUR;
  const reports: SessionReport[] = [];
  for (let start = end - opts.hours * REPLAY_HOUR; start < end; start += duration) {
    const until = Math.min(end, start + duration);
    reports.push(simulateSessions(books, equity, floors, {
      ...opts,
      end: until,
      hours: (until - start) / REPLAY_HOUR,
      reselectHours: 0,
    }));
  }
  const first = reports[0]!;
  const joined = (select: (report: SessionReport) => HourPoint[]) =>
    reports.flatMap(select);
  const live = joined((report) => report.live);
  const promoted = joined((report) => report.promoted);
  const bookLive = joined((report) => report.bookLive);
  const b = summarizeReplay(live);
  const c = summarizeReplay(promoted);
  const d = summarizeReplay(bookLive);
  const totals = newStrategyActions();
  let position = 0;
  let peak = 0;
  let trough = 0;
  let drawdown = 0;
  for (const report of reports) {
    for (const kind of STRATEGY_TYPES) totals[kind] += report.strategyActions[kind];
    const path = report.bookEquityLive;
    drawdown = Math.max(drawdown, path.drawdown, peak - (position + path.trough));
    peak = Math.max(peak, position + path.peak);
    trough = Math.min(trough, position + path.trough);
    position += path.net;
  }
  const selected = reports.flatMap((report) =>
    report.selected.map((row) => ({
      ...row,
      name: `${new Date(report.bookLive[0]?.t ?? end).toISOString().slice(0, 10)} · ${row.name}`,
    })),
  );
  const missing = [...new Set(reports.flatMap((report) => report.unavailable))];
  const sum = (key: "proven" | "evaluatedConfigs" | "disabledConfigs" | "rejectedPf") =>
    reports.reduce((total, report) => total + report[key], 0);
  const indicationSummaries: SessionReport["indicationSummaries"] = opts.independentIndications
    ? Object.fromEntries([...new Set(reports.flatMap((report) =>
        Object.keys(report.indicationSummaries ?? {}) as Indication[],
      ))].map((indication) => {
        const parts = reports.flatMap((report) => {
          const part = report.indicationSummaries?.[indication];
          return part ? [part] : [];
        });
        const rows = parts.flatMap((part) => part.bookLive);
        let net = 0;
        let top = 0;
        let bottom = 0;
        let maxDrawdown = 0;
        for (const part of parts) {
          const path = part.equity;
          maxDrawdown = Math.max(maxDrawdown, path.drawdown, top - (net + path.trough));
          top = Math.max(top, net + path.peak);
          bottom = Math.min(bottom, net + path.trough);
          net += path.net;
        }
        return [indication, {
          ...summarizeReplay(rows),
          drawdown: maxDrawdown,
          selected: parts.reduce((total, part) => total + part.selected, 0),
          bookLive: rows,
          equity: { net, peak: top, trough: bottom, drawdown: maxDrawdown },
        }];
      }))
    : undefined;
  return {
    ...first,
    ready: reports.every((report) => report.ready),
    note: `Each ${opts.reselectHours}h period selects configurations from the preceding ${opts.preHours}h. Positions are flattened at each period boundary.`,
    replayHours: opts.hours,
    symbols: Math.min(...reports.map((report) => report.symbols)),
    unavailable: missing,
    proven: sum("proven"),
    evaluatedConfigs: sum("evaluatedConfigs"),
    disabledConfigs: sum("disabledConfigs"),
    rejectedPf: sum("rejectedPf"),
    strategyActions: totals,
    indicationSummaries,
    live,
    promoted,
    liveNet: b.net,
    promotedNet: c.net,
    greenLive: b.green,
    greenPromoted: c.green,
    livePf: b.pf,
    promotedPf: c.pf,
    samplesLive: b.samples,
    samplesPromoted: c.samples,
    bookLive,
    bookNetLive: d.net,
    bookDrawdownLive: drawdown,
    bookEquityLive: { net: position, peak, trough, drawdown },
    greenBookLive: d.green,
    bookNames: selected.map((row) => row.name),
    coverage: mergeCoverage(reports.map((report) => report.coverage)),
    selected,
  };
}

function mergeCoverage(parts: CoverageRow[][]): CoverageRow[] {
  const merged = new Map<string, CoverageRow>();
  for (const part of parts) {
    for (const row of part) {
      const key = `${row.indication}|${row.range}`;
      const total = merged.get(key) ?? { ...row, configs: 0, excluded: 0, withCloses: 0,
        reachedSamples: 0, passed: 0, bestPf: 0, selected: 0, signalsPre: 0, signalsReplay: 0 };
      total.configs += row.configs;
      total.excluded += row.excluded;
      total.withCloses += row.withCloses;
      total.reachedSamples += row.reachedSamples;
      total.passed += row.passed;
      total.bestPf = Math.max(total.bestPf, row.bestPf);
      total.selected += row.selected;
      total.signalsPre += row.signalsPre;
      total.signalsReplay += row.signalsReplay;
      merged.set(key, total);
    }
  }
  return [...merged.values()];
}
