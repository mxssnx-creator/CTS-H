import assert from "node:assert/strict";
import test from "node:test";
import { INDICATIONS, POSITION_RT_COST_PCT, type Indication } from "./constants.ts";
import { CANDLE_INTERVALS, HOUR_MS, type CandleInterval } from "./intervals.ts";
import { profitFactor } from "./math.ts";
import { enumerateMicroSets, type Fill, MICRO_GRID, MICRO_INTERVALS, type MicroBook, MicroRun, type MicroSet, newMicroAcc, simulateMicro, summarizeMicro } from "./micro.ts";
import type { Bar, Side } from "./process.ts";

// The reference model below is written from docs/micro-strategies.md. It shares no code with micro.ts except the
// round-trip cost constant, so a slip in the state machine, the partial arithmetic or the accounting shows up as a
// mismatch. It is plain and slow on purpose. Every set of the grid is checked against it on the same bars.

const NOTIONAL = 100;
const COST = POSITION_RT_COST_PCT;

type Dense = Record<Indication, Int8Array>;

// Random bars with occasional gaps, so that stops and targets fill, gaps through them happen, and ATR brackets have a
// realistic range. Signals are sparse and random for every indication, in both directions.
function randomMarket(seed: number, interval: CandleInterval, count: number): { book: MicroBook; dense: Dense } {
  let state = seed;
  const random = () => {
    state = (state * 1_103_515_245 + 12_345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
  const step = CANDLE_INTERVALS[interval];
  let prev = 100;
  const bars: Bar[] = Array.from({ length: count }, (_, i) => {
    const gap = random() < 0.02 ? (random() - 0.5) * 0.012 : 0;
    const o = prev * (1 + gap);
    const c = o * (1 + (random() - 0.5) * 0.008);
    const h = Math.max(o, c) * (1 + random() * 0.004);
    const l = Math.min(o, c) * (1 - random() * 0.004);
    prev = c;
    return { t: i * step, o, h, l, c, v: 1, closed: true };
  });
  const atr = Float64Array.from({ length: count }, () => 0.5 + random());
  const dense = {} as Dense;
  const signals: MicroBook["signals"] = {};
  for (const indication of INDICATIONS) {
    const sides = new Int8Array(count);
    for (let i = 0; i < count; i++) if (random() < 1 / 14) sides[i] = random() < 0.5 ? 1 : -1;
    dense[indication] = sides;
    const at: number[] = [];
    const side: number[] = [];
    sides.forEach((value, i) => {
      if (value !== 0) {
        at.push(i);
        side.push(value);
      }
    });
    signals[indication] = { at: Int32Array.from(at), side: Int8Array.from(side) };
  }
  return { book: { interval, bars, atr, signals }, dense };
}

type RefPos = {
  side: 1 | -1;
  entry: number;
  entryBar: number;
  qty: number;
  target: number;
  stop: number;
  remaining: number;
  activated: boolean;
  partialTaken: boolean;
  peak: number;
  held: number;
  net: number;
};
type RefFill = { reason: string; exitBar: number; entryBar: number; side: number; price: number; fraction: number; pnl: number; cost: number; closed: boolean; positionNet: number };
type RefRun = { fills: RefFill[]; equity: number[] };

// The rules, one bar at a time. A signal on bar i opens at the open of bar i + 1. A stop is checked before a target. A
// partial closes its share at the target and moves the stop to break-even. A trail activates at the target and follows
// the peak. A time stop and the window end close at the close.
function reference(book: MicroBook, dense: Dense, set: MicroSet, to: number): RefRun {
  const step = CANDLE_INTERVALS[book.interval];
  const maxHold = Math.max(1, Math.round((set.holdMinutes * 60_000) / step));
  const dynamic = set.trail.kind === "dynamic";
  const retrace = set.trail.kind === "dynamic" ? set.trail.retrace : 0;
  const state: { pos: RefPos | null; realized: number } = { pos: null, realized: 0 };
  const fills: RefFill[] = [];
  const equity: number[] = [];
  const close = (p: RefPos, i: number, reason: string, price: number, fraction: number): void => {
    const q = p.qty * fraction;
    const cost = q * ((p.entry + price) / 2) * COST;
    const pnl = (price - p.entry) * p.side * q - cost;
    p.remaining -= fraction;
    p.net += pnl;
    state.realized += pnl;
    const closed = reason !== "partial";
    fills.push({ reason, exitBar: i, entryBar: p.entryBar, side: p.side, price, fraction, pnl, cost, closed, positionNet: closed ? p.net : 0 });
    if (closed) state.pos = null;
  };
  for (let i = 0; i < to; i++) {
    const bar = book.bars[i]!;
    if (state.pos === null && i > 0) {
      const signal = dense[set.indication][i - 1]!;
      const sideOk = set.direction === "both" || (set.direction === "long" ? signal === 1 : signal === -1);
      const entry = bar.o;
      const atr = book.atr[i - 1]!;
      const atrOk = set.bracket === "atr" ? atr > 0 : true;
      if (signal !== 0 && sideOk && entry > 0 && atrOk) {
        const side = signal as 1 | -1;
        // Target and stop sit their distance beyond the entry on their side, and the round-trip cost is added to both.
        const tpUnits = set.bracket === "atr" ? atr * set.tp : (entry * set.tp) / 100;
        const slUnits = set.bracket === "atr" ? atr * set.sl : (entry * set.sl) / 100;
        state.pos = {
          side,
          entry,
          entryBar: i,
          qty: NOTIONAL / entry,
          target: entry + side * (tpUnits + entry * COST),
          stop: entry - side * (slUnits + entry * COST),
          remaining: 1,
          activated: false,
          partialTaken: false,
          peak: entry,
          held: 0,
          net: 0,
        };
      }
    }
    const p = state.pos;
    if (p !== null) {
      const side = p.side;
      p.held += 1;
      const stopHit = side > 0 ? bar.l <= p.stop : bar.h >= p.stop;
      const targetHit = side > 0 ? bar.h >= p.target : bar.l <= p.target;
      if (stopHit) {
        // A gap through the stop fills at the open.
        close(p, i, "sl", side > 0 ? Math.min(bar.o, p.stop) : Math.max(bar.o, p.stop), p.remaining);
      } else if (targetHit && !dynamic && set.partial === 0) {
        close(p, i, "tp", p.target, p.remaining);
      } else {
        if (targetHit) {
          if (set.partial > 0 && !p.partialTaken) {
            close(p, i, "partial", p.target, set.partial);
            p.partialTaken = true;
            p.stop = side > 0 ? Math.max(p.stop, p.entry) : Math.min(p.stop, p.entry);
          }
          if (dynamic) p.activated = true;
        }
        if (p.activated) {
          p.peak = side > 0 ? Math.max(p.peak, bar.h) : Math.min(p.peak, bar.l);
          const trail = side > 0 ? p.peak - retrace * (p.peak - p.entry) : p.peak + retrace * (p.entry - p.peak);
          p.stop = side > 0 ? Math.max(p.stop, trail) : Math.min(p.stop, trail);
        }
        if (p.held >= maxHold) close(p, i, "time", bar.c, p.remaining);
        else if (i === to - 1) close(p, i, "end", bar.c, p.remaining);
      }
    }
    // Equity at the close of the bar: everything realized, plus the mark of the open position at this close.
    const open = state.pos;
    const markQty = open ? open.qty * open.remaining : 0;
    const mark = open ? (bar.c - open.entry) * open.side * markQty - markQty * ((open.entry + bar.c) / 2) * COST : 0;
    equity.push(state.realized + mark);
  }
  assert.equal(state.pos, null, "the window end leaves no position open");
  return { fills, equity };
}

// The summary the reference implies, computed directly from its fills and equity path.
function summaryOf(run: RefRun, step: number) {
  const { fills, equity } = run;
  const closed = fills.filter((fill) => fill.closed);
  let gp = 0;
  let gl = 0;
  let net = 0;
  for (const fill of fills) {
    net += fill.pnl;
    if (fill.pnl > 0) gp += fill.pnl;
    else if (fill.pnl < 0) gl -= fill.pnl;
  }
  let peak = 0;
  let maxDrawdown = 0;
  for (const e of equity) {
    peak = Math.max(peak, e);
    maxDrawdown = Math.max(maxDrawdown, peak - e);
  }
  // Hourly success: a bucket is one hour, or one bar when the bar is longer. Active when equity moved inside it; green when
  // it ended higher than it began.
  const perBucket = Math.max(1, Math.round(Math.max(step, HOUR_MS) / step));
  let active = 0;
  let green = 0;
  for (let s = 0; s < equity.length; s += perBucket) {
    const end = Math.min(equity.length, s + perBucket);
    const before = s === 0 ? 0 : equity[s - 1]!;
    let previous = before;
    let moved = false;
    for (let i = s; i < end; i++) {
      if (Math.abs(equity[i]! - previous) > 1e-12) moved = true;
      previous = equity[i]!;
    }
    if (moved) {
      active += 1;
      if (equity[end - 1]! - before > 1e-12) green += 1;
    }
  }
  return {
    positions: closed.length,
    legs: fills.length,
    net,
    pf: profitFactor(gp, gl),
    winRate: closed.length ? (closed.filter((fill) => fill.positionNet > 0).length / closed.length) * 100 : 0,
    maxDrawdown,
    equityEnd: equity[equity.length - 1] ?? 0,
    hourlySuccess: active ? (green / active) * 100 : 0,
    activeHours: active,
    grossProfit: gp,
    grossLoss: gl,
  };
}

const near = (actual: number, expected: number, tolerance: number, message: string) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: engine ${actual} reference ${expected}`);
};

test("the grid has one id per set, across every timeframe and bracket", () => {
  const all = enumerateMicroSets({ ...MICRO_GRID, intervals: MICRO_INTERVALS, brackets: ["percent", "atr"] });
  // 25 indications × 7 targets × 7 stops × (fixed + four trails) × 2 holds × 2 partials, per timeframe and bracket.
  assert.equal(all.length, MICRO_INTERVALS.length * 2 * INDICATIONS.length * 7 * 7 * 5 * 2 * 2);
  assert.equal(new Set(all.map((set) => set.id)).size, all.length, "ids are unique");
});

// Every set of the percent and ATR grids, on the same random bars: fills, exits, partials, costs, P&L, drawdown and hourly
// success must match the reference; each closed position must sum to its full quantity; and the streamed run must produce
// the same fills and summary as the batch run.
for (const [interval, count, to] of [
  ["1m", 240, 205],
  ["5m", 240, 205],
  ["15m", 240, 205],
  ["30m", 240, 205],
  ["1h", 300, 262],
  ["4h", 300, 262],
] as const) {
  test(`every set of the ${interval} grid matches the reference model, with partials, streaming and accounting`, () => {
    const { book, dense } = randomMarket(3 + MICRO_INTERVALS.indexOf(interval), interval, count);
    const sets = enumerateMicroSets({ ...MICRO_GRID, intervals: [interval], brackets: ["percent", "atr"] });
    const step = CANDLE_INTERVALS[interval];
    const reasons: Record<string, number> = {};
    let partialSets = 0;
    for (const set of sets) {
      const batchAcc = newMicroAcc(0, step, count);
      const trace: Fill[] = [];
      simulateMicro(book, set, 0, to, batchAcc, { trace });
      const ref = reference(book, dense, set, to);

      // Fill by fill.
      assert.equal(trace.length, ref.fills.length, `${set.id} fill count`);
      let fraction = 0;
      trace.forEach((fill, k) => {
        const expected = ref.fills[k]!;
        assert.equal(fill.reason, expected.reason, `${set.id} fill ${k} reason`);
        assert.equal(fill.exitBar, expected.exitBar, `${set.id} fill ${k} exit bar`);
        assert.equal(fill.entryBar, expected.entryBar, `${set.id} fill ${k} entry bar`);
        assert.equal(fill.side, expected.side, `${set.id} fill ${k} side`);
        assert.equal(fill.closed, expected.closed, `${set.id} fill ${k} closed`);
        near(fill.fraction, expected.fraction, 1e-12, `${set.id} fill ${k} fraction`);
        near(fill.price, expected.price, 1e-9, `${set.id} fill ${k} price`);
        near(fill.pnl, expected.pnl, 1e-9, `${set.id} fill ${k} pnl`);
        near(fill.cost, expected.cost, 1e-9, `${set.id} fill ${k} cost`);
        // A closed position's legs sum to its whole quantity, and the closing leg carries the position's net.
        fraction += fill.fraction;
        reasons[fill.reason] = (reasons[fill.reason] ?? 0) + 1;
        if (fill.closed) {
          near(fraction, 1, 1e-12, `${set.id} position legs sum to one`);
          near(fill.positionNet, expected.positionNet, 1e-9, `${set.id} position net`);
          fraction = 0;
        }
      });
      assert.equal(fraction, 0, `${set.id} no leg left open`);
      if (set.partial > 0) partialSets += 1;

      // Summary against the reference's own summary.
      const engine = summarizeMicro(batchAcc);
      const expected = summaryOf(ref, step);
      assert.equal(engine.positions, expected.positions, `${set.id} positions`);
      assert.equal(engine.legs, expected.legs, `${set.id} legs`);
      near(engine.net, expected.net, 1e-9, `${set.id} net`);
      near(engine.grossProfit, expected.grossProfit, 1e-9, `${set.id} gross profit`);
      near(engine.grossLoss, expected.grossLoss, 1e-9, `${set.id} gross loss`);
      near(engine.pf, expected.pf, 1e-9, `${set.id} pf`);
      near(engine.winRate, expected.winRate, 1e-9, `${set.id} win rate`);
      near(engine.maxDrawdown, expected.maxDrawdown, 1e-9, `${set.id} max drawdown`);
      near(engine.equityEnd, expected.equityEnd, 1e-9, `${set.id} equity end`);
      near(engine.hourlySuccess, expected.hourlySuccess, 1e-9, `${set.id} hourly success`);
      assert.equal(engine.activeHours, expected.activeHours, `${set.id} active hours`);
      near(engine.equityEnd, engine.net, 1e-9, `${set.id} a window that ends flat ends at its net`);

      // Streaming: the same bars fed one at a time through MicroRun, with the signal of the previous bar and its ATR.
      const streamed: Fill[] = [];
      const streamAcc = newMicroAcc(0, step, count);
      const run = new MicroRun(set, interval, { sink: (fill) => streamed.push(fill) });
      for (let b = 0; b < to; b++) {
        const signal = (b === 0 ? 0 : dense[set.indication][b - 1]!) as Side | 0;
        run.step(book.bars[b]!, b, signal, b === to - 1, null, streamAcc, undefined, b === 0 ? Number.NaN : book.atr[b - 1]!);
      }
      assert.deepEqual(streamed, trace, `${set.id} streamed fills equal batch fills`);
      assert.deepEqual(summarizeMicro(streamAcc), engine, `${set.id} streamed summary equals batch summary`);
    }
    // The random bars must exercise every exit path and the partial sets, or the comparison proves less than it claims.
    for (const reason of ["tp", "partial", "sl", "time", "end"]) assert.ok((reasons[reason] ?? 0) > 0, `${interval}: ${reason} exits are exercised`);
    assert.ok(partialSets > 0);
    console.log(`${interval}: ${sets.length} sets checked; exits ${JSON.stringify(reasons)}`);
  });
}
