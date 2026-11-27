import { INDICATIONS, POSITION_RT_COST_PCT, type Indication } from "./constants.ts";
import { CANDLE_INTERVALS, HOUR_MS, type CandleInterval } from "./intervals.ts";
import { closePnl, positionRtCost, profitFactor } from "./math.ts";
import { buildSeries, signalAt, type Bar, type Side } from "./process.ts";

// Micro sets: one indication on one timeframe, with a target and a protective stop given in percent beyond the
// round-trip cost, a fixed or dynamic trail, a time stop and an optional partial close at the first target.
//
// One state machine, MicroState, runs the rules bar by bar. MicroRun wraps it with the accounting. The batch
// simulator and the live runner both use MicroRun, so a backtest and a live run on the same candles produce the same
// fills and the same equity.
//
// Causality: a signal read on closed bar i opens at the open of bar i+1. Every exit decision on bar b reads only
// bars up to b. Within one bar the protective stop is checked before the target, because the order of the high and
// the low inside a bar is unknown; the stop therefore wins a tie.
//
// Equity: realized P&L of booked legs plus the mark-to-market of the booked open position at each bar close. Both are
// posted to the slot of the bar on which they occur, so drawdown is measured at bar resolution and includes open
// losses. Shadow positions are never part of equity.

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
  // percent: tp and sl are percent of the entry. atr: tp and sl are multiples of the ATR at the signal bar.
  bracket?: "percent" | "atr";
};

export type MicroGrid = {
  intervals: readonly CandleInterval[];
  indications: readonly Indication[];
  directions: readonly Direction[];
  tp: readonly number[];
  sl: readonly number[];
  retrace: readonly number[];
  partials: readonly number[];
  brackets?: readonly ("percent" | "atr")[];
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
  const base = [
    set.interval,
    set.indication,
    set.direction,
    `tp${set.tp.toFixed(1)}`,
    `sl${set.sl.toFixed(1)}`,
    trailLabel(set.trail),
    `h${set.holdMinutes}`,
    `p${set.partial.toFixed(1)}`,
  ];
  // Percent ids stay as they were; ATR brackets carry an extra token.
  return (set.bracket === "atr" ? [...base, "atr"] : base).join("|");
}

export function enumerateMicroSets(grid: MicroGrid = MICRO_GRID): MicroSet[] {
  const trails: Trail[] = [{ kind: "fixed" }, ...grid.retrace.map((retrace): Trail => ({ kind: "dynamic", retrace }))];
  const sets: MicroSet[] = [];
  for (const bracket of grid.brackets ?? ["percent"]) {
    for (const interval of grid.intervals) {
      for (const indication of grid.indications) {
        for (const direction of grid.directions) {
          for (const tp of grid.tp) {
            for (const sl of grid.sl) {
              for (const trail of trails) {
                for (const holdMinutes of MICRO_HOLDS[interval]) {
                  for (const partial of grid.partials) {
                    const base = { interval, indication, direction, tp, sl, trail, holdMinutes, partial, bracket };
                    sets.push({ ...base, id: microSetId(base) });
                  }
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
// atr: the ATR14 at each bar, in price units, causal. ATR brackets read it at the signal bar.
export type MicroBook = { interval: CandleInterval; bars: Bar[]; atr: Float64Array; signals: Partial<Record<Indication, SignalEvents>> };

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
  return { interval, bars, signals, atr: Float64Array.from(series.atr) };
}

export type Closes = { pnls: number[]; costs: number[] };

// One fill: a partial close, or the close that ends a position. `booked` is false for a shadow position, one the
// lane gate blocked at entry: it is tracked but never counts as booked P&L or as equity.
export type Fill = {
  reason: ExitReason;
  exitBar: number;
  t: number;
  price: number;
  fraction: number;
  pnl: number;
  cost: number;
  side: Side;
  entry: number;
  entryBar: number;
  booked: boolean;
  closed: boolean;
  // Net P&L of the whole position, set on the closing fill only.
  positionNet: number;
};

export type MicroLegTrace = Fill;

export type MicroOptions = {
  notional?: number;
  cost?: number;
  // Lane gate: decides whether an entry is booked, reading the closes booked so far.
  gate?: (closes: Closes, index: number) => boolean;
  closes?: Closes;
  trace?: Fill[];
  // Receives every fill as it happens, without storing it.
  sink?: (fill: Fill) => void;
  // Per bar: +1 or -1 when the trend allows only that side of signal, 0 when it allows none. Undefined disables it.
  trendFilter?: Int8Array;
};

export type MicroStateOptions = { notional?: number; cost?: number };

// The rules for one set on one market, one closed bar at a time.
export class MicroState {
  readonly set: MicroSet;
  private readonly notional: number;
  private readonly cost: number;
  private readonly maxHold: number;
  private readonly tpFrac: number;
  private readonly slFrac: number;
  private readonly dynamic: boolean;
  private readonly retrace: number;
  private readonly partial: number;
  private readonly onlySide: 0 | 1 | -1;
  private readonly atrBracket: boolean;
  private open = false;
  private side: Side = 1;
  private entry = 0;
  private entryBar = 0;
  private qty = 0;
  private target = 0;
  private stop = 0;
  private remaining = 1;
  private activated = false;
  private partialTaken = false;
  private peak = 0;
  private held = 0;
  private booked = true;
  private positionNet = 0;

  constructor(set: MicroSet, interval: CandleInterval, options: MicroStateOptions = {}) {
    this.set = set;
    this.notional = options.notional ?? MICRO_NOTIONAL;
    this.cost = options.cost ?? POSITION_RT_COST_PCT;
    this.maxHold = Math.max(1, Math.round((set.holdMinutes * 60_000) / CANDLE_INTERVALS[interval]));
    this.tpFrac = set.tp / 100;
    this.slFrac = set.sl / 100;
    this.dynamic = set.trail.kind === "dynamic";
    this.retrace = set.trail.kind === "dynamic" ? set.trail.retrace : 0;
    this.partial = set.partial;
    this.onlySide = set.direction === "long" ? 1 : set.direction === "short" ? -1 : 0;
    this.atrBracket = set.bracket === "atr";
  }

  get flat(): boolean {
    return !this.open;
  }

  // The open position for display, or null when flat.
  get position(): { side: Side; entry: number; entryBar: number; stop: number; target: number; remaining: number; held: number } | null {
    if (!this.open) return null;
    return { side: this.side, entry: this.entry, entryBar: this.entryBar, stop: this.stop, target: this.target, remaining: this.remaining, held: this.held };
  }

  // Unrealized net P&L of the open position at `price`, if it is booked. Shadows and flat states mark to zero.
  mark(price: number): number {
    if (!this.open || !this.booked) return 0;
    return closePnl(this.side, this.entry, price, this.qty * this.remaining, this.cost);
  }

  // Feeds one closed bar. `signal` is the indication's signal on the bar before this one (0 for none); a flat state
  // opens at this bar's open. `last` closes any open position at this bar's close. `allow`, when given, is asked at
  // entry and decides whether the position is booked.
  onBar(bar: Bar, index: number, signal: Side | 0, last: boolean, allow: ((index: number) => boolean) | null, emit: (fill: Fill) => void, entryAtr = Number.NaN): void {
    if (!this.open) {
      if (signal === 0) return;
      if (this.onlySide !== 0 && signal !== this.onlySide) return;
      const entry = bar.o;
      if (!(entry > 0)) return;
      if (this.atrBracket && !(entryAtr > 0)) return;
      const side = signal;
      this.open = true;
      this.side = side;
      this.entry = entry;
      this.entryBar = index;
      this.booked = allow ? allow(index) : true;
      this.positionNet = 0;
      this.qty = this.notional / entry;
      // Percent brackets sit percent of the entry beyond the round-trip cost. ATR brackets sit multiples of the ATR at the
      // signal bar beyond the cost. Both sit on both sides of the entry.
      const costAbs = entry * this.cost;
      const tpUnits = this.atrBracket ? entryAtr * this.set.tp : entry * this.tpFrac;
      const slUnits = this.atrBracket ? entryAtr * this.set.sl : entry * this.slFrac;
      this.target = entry + side * (tpUnits + costAbs);
      this.stop = entry - side * (slUnits + costAbs);
      this.remaining = 1;
      this.activated = false;
      this.partialTaken = false;
      this.peak = entry;
      this.held = 0;
    }
    const side = this.side;
    this.held += 1;
    const stopHit = side > 0 ? bar.l <= this.stop : bar.h >= this.stop;
    if (stopHit) {
      // A gap through the stop fills at the open, which is worse than the stop itself.
      this.leg("sl", side > 0 ? Math.min(bar.o, this.stop) : Math.max(bar.o, this.stop), this.remaining, bar, index, emit);
      return;
    }
    const targetHit = side > 0 ? bar.h >= this.target : bar.l <= this.target;
    if (targetHit) {
      if (!this.dynamic && this.partial === 0) {
        this.leg("tp", this.target, this.remaining, bar, index, emit);
        return;
      }
      if (this.partial > 0 && !this.partialTaken) {
        this.leg("partial", this.target, this.partial, bar, index, emit);
        this.partialTaken = true;
        // The rest of the position is protected at break-even.
        this.stop = side > 0 ? Math.max(this.stop, this.entry) : Math.min(this.stop, this.entry);
      }
      if (this.dynamic) this.activated = true;
    }
    if (this.activated) {
      // The trail follows the best price reached, and only ever tightens.
      this.peak = side > 0 ? Math.max(this.peak, bar.h) : Math.min(this.peak, bar.l);
      const trail = side > 0 ? this.peak - this.retrace * (this.peak - this.entry) : this.peak + this.retrace * (this.entry - this.peak);
      this.stop = side > 0 ? Math.max(this.stop, trail) : Math.min(this.stop, trail);
    }
    if (this.held >= this.maxHold) {
      this.leg("time", bar.c, this.remaining, bar, index, emit);
      return;
    }
    if (last) this.leg("end", bar.c, this.remaining, bar, index, emit);
  }

  private leg(reason: ExitReason, price: number, fraction: number, bar: Bar, index: number, emit: (fill: Fill) => void): void {
    const legQty = this.qty * fraction;
    const pnl = closePnl(this.side, this.entry, price, legQty, this.cost);
    const cost = positionRtCost(this.entry, price, legQty, this.cost);
    this.remaining -= fraction;
    this.positionNet += pnl;
    const closed = reason !== "partial";
    emit({
      reason,
      exitBar: index,
      t: bar.t,
      price,
      fraction,
      pnl,
      cost,
      side: this.side,
      entry: this.entry,
      entryBar: this.entryBar,
      booked: this.booked,
      closed,
      positionNet: closed ? this.positionNet : 0,
    });
    if (closed) this.open = false;
  }
}

export type MicroAcc = {
  t0: number;
  // Slot size: the interval of the book the accumulator is run on.
  stepMs: number;
  // Equity change per bar slot: booked realized P&L plus the change of the booked open mark at bar closes.
  slotDelta: Float64Array;
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

export function newMicroAcc(t0: number, stepMs: number, slots: number): MicroAcc {
  return {
    t0,
    stepMs,
    slotDelta: new Float64Array(slots),
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
  acc.slotDelta.fill(0);
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

function slotOf(acc: MicroAcc, t: number): number {
  return Math.floor((t - acc.t0) / acc.stepMs);
}

// Books one fill. Every closed leg, booked or shadow, is evidence for the lane gate: a blocked cell keeps being
// tracked, so it can earn its way back in. Only booked legs count as P&L and as equity.
export function bookFill(acc: MicroAcc, fill: Fill, closes?: Closes): void {
  if (closes) {
    closes.pnls.push(fill.pnl);
    closes.costs.push(fill.cost);
  }
  if (!fill.booked) {
    if (fill.closed) {
      acc.shadows += 1;
      acc.shadowNet += fill.positionNet;
    }
    return;
  }
  acc.legs += 1;
  acc.exits[fill.reason] += 1;
  acc.net += fill.pnl;
  if (fill.pnl > 0) acc.grossProfit += fill.pnl;
  else if (fill.pnl < 0) acc.grossLoss -= fill.pnl;
  const slot = slotOf(acc, fill.t);
  if (slot >= 0 && slot < acc.slotDelta.length) acc.slotDelta[slot] = acc.slotDelta[slot]! + fill.pnl;
  if (fill.closed) {
    acc.positions += 1;
    if (fill.positionNet > 0) acc.wins += 1;
  }
}

export type MicroRunOptions = MicroStateOptions & { sink?: (fill: Fill) => void };

// One set on one market: the state machine plus the accounting. Batch and live runs both go through this class.
export class MicroRun {
  readonly state: MicroState;
  private readonly sink: ((fill: Fill) => void) | undefined;
  private acc: MicroAcc | null = null;
  private closes: Closes | undefined;
  private lastMark = 0;
  private readonly emit = (fill: Fill): void => {
    bookFill(this.acc!, fill, this.closes);
    this.sink?.(fill);
  };

  constructor(set: MicroSet, interval: CandleInterval, options: MicroRunOptions = {}) {
    this.state = new MicroState(set, interval, options);
    this.sink = options.sink;
  }

  get flat(): boolean {
    return this.state.flat;
  }

  // Feeds one closed bar, books its fills, and posts the change of the booked open mark to the bar's slot.
  step(bar: Bar, index: number, signal: Side | 0, last: boolean, allow: ((index: number) => boolean) | null, acc: MicroAcc, closes?: Closes, entryAtr = Number.NaN): void {
    this.acc = acc;
    this.closes = closes;
    this.state.onBar(bar, index, signal, last, allow, this.emit, entryAtr);
    const mark = this.state.mark(bar.c);
    const slot = slotOf(acc, bar.t);
    if (slot >= 0 && slot < acc.slotDelta.length) acc.slotDelta[slot] = acc.slotDelta[slot]! + (mark - this.lastMark);
    this.lastMark = mark;
  }
}

// Batch run of one set over bars [from, to). A window starts flat and closes any open position on its last bar, so
// each window stands alone. While flat it jumps straight to the next signal, which keeps long histories cheap.
export function simulateMicro(book: MicroBook, set: MicroSet, from: number, to: number, acc: MicroAcc, options: MicroOptions = {}): void {
  if (options.gate && !options.closes) throw new Error("A gate reads closes, so pass the closes it reads.");
  const events = book.signals[set.indication];
  if (!events) return;
  if (acc.stepMs !== CANDLE_INTERVALS[book.interval]) throw new Error("The accumulator slot must match the book interval.");
  const bars = book.bars;
  const closes = options.closes;
  const gate = options.gate;
  const allow = gate && closes ? (index: number) => gate(closes, index) : null;
  const trace = options.trace;
  const run = new MicroRun(set, book.interval, {
    notional: options.notional,
    cost: options.cost,
    sink: options.sink ?? (trace ? (fill) => trace.push(fill) : undefined),
  });
  const n = events.at.length;
  let k = 0;
  let b = from;
  while (b < to) {
    if (run.flat) {
      while (k < n && events.at[k]! + 1 < b) k++;
      if (k >= n || events.at[k]! + 1 >= to) break;
      b = Math.max(b, events.at[k]! + 1);
    }
    while (k < n && events.at[k]! < b - 1) k++;
    let signal: Side | 0 = 0;
    if (k < n && events.at[k]! === b - 1) {
      const eventSide = events.side[k]! as Side;
      // A trend filter passes a signal only when the trend on the signal bar points the same way.
      signal = options.trendFilter && options.trendFilter[b - 1] !== eventSide ? 0 : eventSide;
      k++;
    }
    run.step(bars[b]!, b, signal, b === to - 1, allow, acc, closes, book.atr[b - 1] ?? Number.NaN);
    b++;
  }
}

export type MicroSummary = {
  positions: number;
  legs: number;
  net: number;
  pf: number;
  winRate: number;
  // Largest peak-to-trough fall of bar-close equity, including open-position marks.
  maxDrawdown: number;
  equityEnd: number;
  // Share of active buckets whose equity rose. A bucket is one hour, or one bar when the bar is longer than an hour.
  hourlySuccess: number;
  activeHours: number;
  shadows: number;
  shadowNet: number;
  grossProfit: number;
  grossLoss: number;
  exits: Record<ExitReason, number>;
};

export function summarizeMicro(acc: MicroAcc, bucketMs = Math.max(acc.stepMs, HOUR_MS)): MicroSummary {
  const perBucket = Math.max(1, Math.round(bucketMs / acc.stepMs));
  const slots = acc.slotDelta.length;
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let bucketSum = 0;
  let bucketMoved = false;
  let active = 0;
  let green = 0;
  for (let s = 0; s < slots; s++) {
    const delta = acc.slotDelta[s]!;
    equity += delta;
    if (equity > peak) peak = equity;
    if (peak - equity > maxDrawdown) maxDrawdown = peak - equity;
    bucketSum += delta;
    if (Math.abs(delta) > 1e-12) bucketMoved = true;
    if ((s + 1) % perBucket === 0 || s === slots - 1) {
      // Active: the equity moved inside the bucket, even when it ended where it began. Green: it ended higher.
      if (bucketMoved) {
        active += 1;
        if (bucketSum > 1e-12) green += 1;
      }
      bucketSum = 0;
      bucketMoved = false;
    }
  }
  return {
    positions: acc.positions,
    legs: acc.legs,
    net: acc.net,
    pf: profitFactor(acc.grossProfit, acc.grossLoss),
    winRate: acc.positions ? (acc.wins / acc.positions) * 100 : 0,
    maxDrawdown,
    equityEnd: equity,
    hourlySuccess: active ? (green / active) * 100 : 0,
    activeHours: active,
    shadows: acc.shadows,
    shadowNet: acc.shadowNet,
    grossProfit: acc.grossProfit,
    grossLoss: acc.grossLoss,
    exits: { ...acc.exits },
  };
}
