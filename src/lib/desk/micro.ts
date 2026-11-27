import { INDICATIONS, POSITION_RT_COST_PCT, type Indication } from "./constants.ts";
import { CANDLE_INTERVALS, HOUR_MS, type CandleInterval } from "./intervals.ts";
import { closePnl, positionRtCost, profitFactor } from "./math.ts";
import { buildSeries, signalAt, type Bar, type Side } from "./process.ts";

// Micro sets: one indication on one timeframe, with a target and a protective stop given in percent beyond the
// round-trip cost, a fixed or dynamic trail, a time stop and an optional partial close at the first target.
//
// Causality: a signal read on closed bar i opens at the open of bar i+1. Every exit decision on bar b reads only
// bars up to b. Within one bar the protective stop is checked before the target, because the order of the high and
// the low inside a bar is unknown; the stop therefore wins a tie.

export const MICRO_NOTIONAL = 100;
export const MICRO_TP = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
export const MICRO_SL = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
// Dynamic trail: the stop sits this fraction of the peak-to-entry move behind the peak (0.3 = 30%).
export const MICRO_RETRACE = [0.3, 0.4, 0.5, 0.6];
export const MICRO_PARTIALS = [0, 0.5];
export const MICRO_DIRECTIONS = ["both", "long", "short"] as const;
export const MICRO_INTERVALS: CandleInterval[] = ["1m", "5m", "15m", "30m", "1h", "4h"];
// Time stops in minutes, two per timeframe: the short hold and the long hold.
export const MICRO_HOLDS: Record<CandleInterval, number[]> = {
  "1m": [30, 120],
  "5m": [60, 240],
  "15m": [120, 480],
  "30m": [240, 960],
  "1h": [480, 1440],
  "4h": [960, 2880],
};

export type Direction = (typeof MICRO_DIRECTIONS)[number];
export type Trail = { kind: "fixed" } | { kind: "dynamic"; retrace: number };
export type ExitReason = "tp" | "partial" | "sl" | "time" | "end";

export type MicroSet = {
  id: string;
  interval: CandleInterval;
  indication: Indication;
  direction: Direction;
  tp: number;
  sl: number;
  trail: Trail;
  holdMinutes: number;
  // Share of the position closed at the first target touch; 0 disables the partial.
  partial: number;
};

export type MicroGrid = {
  intervals: readonly CandleInterval[];
  indications: readonly Indication[];
  directions: readonly Direction[];
  tp: readonly number[];
  sl: readonly number[];
  retrace: readonly number[];
  partials: readonly number[];
};

// The main search trades both directions, as the brief asks. Long-only and short-only are diagnostics for chosen sets.
export const MICRO_GRID: MicroGrid = {
  intervals: MICRO_INTERVALS,
  indications: INDICATIONS,
  directions: ["both"],
  tp: MICRO_TP,
  sl: MICRO_SL,
  retrace: MICRO_RETRACE,
  partials: MICRO_PARTIALS,
};

export function trailLabel(trail: Trail): string {
  return trail.kind === "fixed" ? "fixed" : `dyn${trail.retrace.toFixed(1)}`;
}

export function microSetId(set: Omit<MicroSet, "id">): string {
  return [
    set.interval,
    set.indication,
    set.direction,
    `tp${set.tp.toFixed(1)}`,
    `sl${set.sl.toFixed(1)}`,
    trailLabel(set.trail),
    `h${set.holdMinutes}`,
    `p${set.partial.toFixed(1)}`,
  ].join("|");
}

export function enumerateMicroSets(grid: MicroGrid = MICRO_GRID): MicroSet[] {
  const trails: Trail[] = [{ kind: "fixed" }, ...grid.retrace.map((retrace): Trail => ({ kind: "dynamic", retrace }))];
  const sets: MicroSet[] = [];
  for (const interval of grid.intervals) {
    for (const indication of grid.indications) {
      for (const direction of grid.directions) {
        for (const tp of grid.tp) {
          for (const sl of grid.sl) {
            for (const trail of trails) {
              for (const holdMinutes of MICRO_HOLDS[interval]) {
                for (const partial of grid.partials) {
                  const base = { interval, indication, direction, tp, sl, trail, holdMinutes, partial };
                  sets.push({ ...base, id: microSetId(base) });
                }
              }
            }
          }
        }
      }
    }
  }
  return sets;
}

// Aggregates one-minute bars into candles of `stepMs`, aligned to UTC. A candle is kept only when every minute in it
// is present, so a gap never produces a candle with a partial high, low or volume.
export function aggregateBars(minutes: readonly Bar[], stepMs: number): Bar[] {
  if (!Number.isInteger(stepMs) || stepMs < 60_000 || stepMs % 60_000 !== 0) {
    throw new Error("Aggregation needs a whole-minute step.");
  }
  const perCandle = stepMs / 60_000;
  const out: Bar[] = [];
  let current: Bar | null = null;
  let count = 0;
  for (const bar of minutes) {
    const t = Math.floor(bar.t / stepMs) * stepMs;
    if (current === null || current.t !== t) {
      if (current !== null && count === perCandle) out.push(current);
      current = { t, o: bar.o, h: bar.h, l: bar.l, c: bar.c, v: bar.v, closed: true };
      count = 1;
    } else {
      current.h = Math.max(current.h, bar.h);
      current.l = Math.min(current.l, bar.l);
      current.c = bar.c;
      current.v += bar.v;
      count += 1;
    }
  }
  if (current !== null && count === perCandle) out.push(current);
  return out;
}

// First bar index whose open time is at or after `t`.
export function barIndexAt(bars: readonly Bar[], t: number): number {
  let lo = 0;
  let hi = bars.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid]!.t < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export type SignalEvents = { at: Int32Array; side: Int8Array };
export type MicroBook = { interval: CandleInterval; bars: Bar[]; signals: Partial<Record<Indication, SignalEvents>> };

// Signals for every indication, as sparse lists of closed-bar indices. The indicator series are causal, so
// the signal at bar i depends only on bars up to i.
export function buildMicroBook(bars: Bar[], interval: CandleInterval, indications: readonly Indication[] = INDICATIONS): MicroBook {
  const series = buildSeries(bars);
  const signals: Partial<Record<Indication, SignalEvents>> = {};
  for (const indication of indications) {
    const at: number[] = [];
    const side: number[] = [];
    for (let i = 0; i < bars.length; i++) {
      const fired = signalAt(indication, bars, series, i);
      if (fired !== 0) {
        at.push(i);
        side.push(fired);
      }
    }
    signals[indication] = { at: Int32Array.from(at), side: Int8Array.from(side) };
  }
  return { interval, bars, signals };
}

export type Closes = { pnls: number[]; costs: number[] };

export type MicroAcc = {
  t0: number;
  // Booked net P&L and leg counts per hour of the window, by exit time.
  hourNet: Float64Array;
  hourLegs: Int32Array;
  positions: number;
  legs: number;
  wins: number;
  grossProfit: number;
  grossLoss: number;
  net: number;
  shadows: number;
  shadowNet: number;
  exits: Record<ExitReason, number>;
};

function emptyExits(): Record<ExitReason, number> {
  return { tp: 0, partial: 0, sl: 0, time: 0, end: 0 };
}

export function newMicroAcc(t0: number, hours: number): MicroAcc {
  return {
    t0,
    hourNet: new Float64Array(hours),
    hourLegs: new Int32Array(hours),
    positions: 0,
    legs: 0,
    wins: 0,
    grossProfit: 0,
    grossLoss: 0,
    net: 0,
    shadows: 0,
    shadowNet: 0,
    exits: emptyExits(),
  };
}

export function resetMicroAcc(acc: MicroAcc, t0: number): void {
  acc.t0 = t0;
  acc.hourNet.fill(0);
  acc.hourLegs.fill(0);
  acc.positions = 0;
  acc.legs = 0;
  acc.wins = 0;
  acc.grossProfit = 0;
  acc.grossLoss = 0;
  acc.net = 0;
  acc.shadows = 0;
  acc.shadowNet = 0;
  acc.exits = emptyExits();
}

export function mergeMicroAcc(into: MicroAcc, from: MicroAcc): void {
  for (let h = 0; h < into.hourNet.length; h++) {
    into.hourNet[h] = into.hourNet[h]! + from.hourNet[h]!;
    into.hourLegs[h] = into.hourLegs[h]! + from.hourLegs[h]!;
  }
  into.positions += from.positions;
  into.legs += from.legs;
  into.wins += from.wins;
  into.grossProfit += from.grossProfit;
  into.grossLoss += from.grossLoss;
  into.net += from.net;
  into.shadows += from.shadows;
  into.shadowNet += from.shadowNet;
  for (const key of Object.keys(into.exits) as ExitReason[]) into.exits[key] += from.exits[key];
}

export type MicroLegTrace = {
  entryBar: number;
  exitBar: number;
  side: Side;
  entry: number;
  price: number;
  fraction: number;
  reason: ExitReason;
  pnl: number;
  cost: number;
  booked: boolean;
};

export type MicroOptions = {
  notional?: number;
  cost?: number;
  // Lane gate: decides whether an entry is booked. A blocked entry becomes a shadow position.
  gate?: (closes: Closes) => boolean;
  closes?: Closes;
  trace?: MicroLegTrace[];
};

type Leg = { reason: ExitReason; bar: number; price: number; fraction: number; pnl: number; cost: number };

// Simulates one set over bars [from, to) of the book, with one position at a time per market.
// A window starts flat and closes any open position on its last bar, so each window stands alone.
export function simulateMicro(book: MicroBook, set: MicroSet, from: number, to: number, acc: MicroAcc, options: MicroOptions = {}): void {
  if (options.gate && !options.closes) throw new Error("A gate reads closes, so pass the closes it reads.");
  const events = book.signals[set.indication];
  if (!events) return;
  const bars = book.bars;
  const notional = options.notional ?? MICRO_NOTIONAL;
  const cost = options.cost ?? POSITION_RT_COST_PCT;
  const maxHold = Math.max(1, Math.round((set.holdMinutes * 60_000) / CANDLE_INTERVALS[book.interval]));
  const tpFrac = set.tp / 100;
  const slFrac = set.sl / 100;
  const dynamic = set.trail.kind === "dynamic";
  const retrace = set.trail.kind === "dynamic" ? set.trail.retrace : 0;
  const onlySide = set.direction === "long" ? 1 : set.direction === "short" ? -1 : 0;
  const partial = set.partial;
  const hours = acc.hourNet.length;
  const closes = options.closes;
  let nextFree = from;

  for (let k = 0; k < events.at.length; k++) {
    const side = events.side[k]! as Side;
    if (onlySide !== 0 && side !== onlySide) continue;
    const entryBar = events.at[k]! + 1;
    if (entryBar >= to) break;
    if (entryBar < from || entryBar < nextFree) continue;
    const entry = bars[entryBar]!.o;
    if (!(entry > 0)) continue;

    // Target and stop sit percent beyond the round-trip cost, on both sides of the entry.
    const costAbs = entry * cost;
    const qty = notional / entry;
    const target = entry + side * (entry * tpFrac + costAbs);
    let stop = entry - side * (entry * slFrac + costAbs);
    let remaining = 1;
    let activated = false;
    let partialTaken = false;
    let peak = entry;
    let exitBar = to - 1;
    const legs: Leg[] = [];

    const leg = (price: number, fraction: number, reason: ExitReason, bar: number) => {
      const legQty = qty * fraction;
      legs.push({
        reason,
        bar,
        price,
        fraction,
        pnl: closePnl(side, entry, price, legQty, cost),
        cost: positionRtCost(entry, price, legQty, cost),
      });
      remaining -= fraction;
    };

    for (let b = entryBar; b < to; b++) {
      const bar = bars[b]!;
      const stopHit = side > 0 ? bar.l <= stop : bar.h >= stop;
      if (stopHit) {
        // A gap through the stop fills at the open, which is worse than the stop itself.
        leg(side > 0 ? Math.min(bar.o, stop) : Math.max(bar.o, stop), remaining, "sl", b);
        exitBar = b;
        break;
      }
      const targetHit = side > 0 ? bar.h >= target : bar.l <= target;
      if (targetHit) {
        if (!dynamic && partial === 0) {
          leg(target, remaining, "tp", b);
          exitBar = b;
          break;
        }
        if (partial > 0 && !partialTaken) {
          leg(target, partial, "partial", b);
          partialTaken = true;
          // The rest of the position is protected at break-even.
          stop = side > 0 ? Math.max(stop, entry) : Math.min(stop, entry);
        }
        if (dynamic) activated = true;
      }
      if (activated) {
        // The trail follows the best price reached, and only ever tightens.
        peak = side > 0 ? Math.max(peak, bar.h) : Math.min(peak, bar.l);
        const trail = side > 0 ? peak - retrace * (peak - entry) : peak + retrace * (entry - peak);
        stop = side > 0 ? Math.max(stop, trail) : Math.min(stop, trail);
      }
      if (b - entryBar + 1 >= maxHold) {
        leg(bar.c, remaining, "time", b);
        exitBar = b;
        break;
      }
      if (b === to - 1) {
        leg(bar.c, remaining, "end", b);
        exitBar = b;
        break;
      }
    }

    const allowed = options.gate ? options.gate(closes!) : true;
    let positionNet = 0;
    for (const item of legs) {
      positionNet += item.pnl;
      options.trace?.push({
        entryBar,
        exitBar: item.bar,
        side,
        entry,
        price: item.price,
        fraction: item.fraction,
        reason: item.reason,
        pnl: item.pnl,
        cost: item.cost,
        booked: allowed,
      });
      if (!allowed) continue;
      if (closes) {
        closes.pnls.push(item.pnl);
        closes.costs.push(item.cost);
      }
      acc.legs += 1;
      acc.exits[item.reason] += 1;
      acc.net += item.pnl;
      if (item.pnl > 0) acc.grossProfit += item.pnl;
      else if (item.pnl < 0) acc.grossLoss -= item.pnl;
      const hour = Math.floor((bars[item.bar]!.t - acc.t0) / HOUR_MS);
      if (hour >= 0 && hour < hours) {
        acc.hourNet[hour] = acc.hourNet[hour]! + item.pnl;
        acc.hourLegs[hour] = acc.hourLegs[hour]! + 1;
      }
    }
    if (allowed) {
      acc.positions += 1;
      if (positionNet > 0) acc.wins += 1;
    } else {
      acc.shadows += 1;
      acc.shadowNet += positionNet;
    }
    nextFree = exitBar + 1;
  }
}

export type MicroSummary = {
  positions: number;
  legs: number;
  net: number;
  pf: number;
  winRate: number;
  maxDrawdown: number;
  hourlySuccess: number;
  activeHours: number;
  shadows: number;
  shadowNet: number;
  grossProfit: number;
  grossLoss: number;
  exits: Record<ExitReason, number>;
};

// Summary of a window. Drawdown is measured on the cumulative hourly net of booked legs, so it is a closed-trade
// drawdown: open-position mark-to-market is not included. Hourly success is the share of active hours whose net is positive.
export function summarizeMicro(acc: MicroAcc): MicroSummary {
  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let active = 0;
  let green = 0;
  for (let h = 0; h < acc.hourNet.length; h++) {
    const net = acc.hourNet[h]!;
    cumulative += net;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
    if (acc.hourLegs[h]! > 0) {
      active += 1;
      if (net > 0) green += 1;
    }
  }
  return {
    positions: acc.positions,
    legs: acc.legs,
    net: acc.net,
    pf: profitFactor(acc.grossProfit, acc.grossLoss),
    winRate: acc.positions ? (acc.wins / acc.positions) * 100 : 0,
    maxDrawdown,
    hourlySuccess: active ? (green / active) * 100 : 0,
    activeHours: active,
    shadows: acc.shadows,
    shadowNet: acc.shadowNet,
    grossProfit: acc.grossProfit,
    grossLoss: acc.grossLoss,
    exits: { ...acc.exits },
  };
}
