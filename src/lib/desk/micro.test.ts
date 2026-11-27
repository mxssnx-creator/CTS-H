import assert from "node:assert/strict";
import test from "node:test";
import { INDICATIONS, POSITION_RT_COST_PCT } from "./constants.ts";
import {
  aggregateBars,
  barIndexAt,
  buildMicroBook,
  enumerateMicroSets,
  MICRO_GRID,
  mergeMicroAcc,
  microSetId,
  newMicroAcc,
  resetMicroAcc,
  simulateMicro,
  summarizeMicro,
  type Closes,
  type MicroBook,
  type MicroLegTrace,
  type MicroOptions,
  type MicroSet,
  type Trail,
} from "./micro.ts";
import type { Bar } from "./process.ts";

const MINUTE = 60_000;
const bar = (index: number, o: number, h: number, l: number, c: number, v = 1): Bar => ({ t: index * MINUTE, o, h, l, c, v, closed: true });

// A book with one signal: the indication fires on closed bar `signalAt` with `side`, so entry is the next bar's open.
function bookWith(bars: Bar[], signalAt: number, side: 1 | -1, indication: "volumeBreak" | "rsi" = "volumeBreak"): MicroBook {
  return {
    interval: "1m",
    bars,
    signals: { [indication]: { at: Int32Array.from([signalAt]), side: Int8Array.from([side]) } },
  };
}

function setOf(overrides: Partial<Omit<MicroSet, "id">> & { trail?: Trail } = {}): MicroSet {
  const base = {
    interval: "1m" as const,
    indication: "volumeBreak" as const,
    direction: "both" as const,
    tp: 0.2,
    sl: 0.2,
    trail: { kind: "fixed" } as Trail,
    holdMinutes: 30,
    partial: 0,
    ...overrides,
  };
  return { ...base, id: microSetId(base) };
}

function run(book: MicroBook, set: MicroSet, to: number, options: MicroOptions = {}) {
  const acc = newMicroAcc(book.bars[0]!.t, 240);
  const trace: MicroLegTrace[] = [];
  simulateMicro(book, set, 0, to, acc, { ...options, trace: options.trace ?? trace });
  return { acc, trace: options.trace ?? trace };
}

test("aggregation builds whole candles from minutes and drops any candle with a missing minute", () => {
  const minutes = [0, 1, 2, 3, 4].map((i) => bar(i, 100 + i, 101 + i * 2, 99 - i, 100.5 + i, 2));
  const [candle, ...rest] = aggregateBars(minutes, 5 * MINUTE);
  assert.equal(rest.length, 0);
  assert.equal(candle!.t, 0);
  assert.equal(candle!.o, 100);
  assert.equal(candle!.h, 109);
  assert.equal(candle!.l, 95);
  assert.equal(candle!.c, 104.5);
  assert.equal(candle!.v, 10);
  const gapped = aggregateBars([0, 1, 2, 5, 6, 7, 8, 9].map((i) => bar(i, 1, 1, 1, 1)), 5 * MINUTE);
  assert.deepEqual(gapped.map((item) => item.t), [5 * MINUTE]);
  assert.throws(() => aggregateBars(minutes, 90_000));
});

test("the set grid enumerates every combination with unique ids", () => {
  const small = enumerateMicroSets({
    intervals: ["1m"],
    indications: ["volumeBreak", "rsi"],
    directions: ["both"],
    tp: [0.2, 0.3],
    sl: [0.2],
    retrace: [0.3],
    partials: [0, 0.5],
  });
  // 2 indications × 2 targets × 1 stop × (fixed + one dynamic) × 2 holds × 2 partials.
  assert.equal(small.length, 2 * 2 * 1 * 2 * 2 * 2);
  assert.equal(new Set(small.map((set) => set.id)).size, small.length);
  const full = enumerateMicroSets(MICRO_GRID).filter((set) => set.interval === "5m");
  // 19 indications × 7 targets × 7 stops × (fixed + four trails) × 2 holds × 2 partials, both directions.
  assert.equal(full.length, INDICATIONS.length * 7 * 7 * 5 * 2 * 2);
});

test("a target is percent beyond the round-trip cost, and the charged cost is the exact leg cost", () => {
  const bars = [bar(0, 100, 100, 100, 100), bar(1, 100, 100.1, 99.9, 100), bar(2, 100, 100.5, 99.9, 100.4)];
  const { acc, trace } = run(bookWith(bars, 0, 1), setOf({ tp: 0.2, sl: 0.2 }), 3);
  assert.equal(trace.length, 1);
  const [leg] = trace;
  assert.equal(leg!.reason, "tp");
  // Entry 100, target 100 + 0.2% + 0.12% = 100.32, the notional is 100, so qty = 1.
  assert.ok(Math.abs(leg!.price - 100.32) < 1e-12);
  const cost = ((100 + 100.32) / 2) * POSITION_RT_COST_PCT;
  assert.ok(Math.abs(leg!.cost - cost) < 1e-12);
  assert.ok(Math.abs(leg!.pnl - (0.32 - cost)) < 1e-12);
  assert.ok(leg!.pnl > 0.199 && leg!.pnl < 0.2, "net of the cost, the target nets about 0.2%");
  assert.equal(acc.positions, 1);
  assert.equal(acc.wins, 1);
});

test("a gap through the stop fills at the open, and the stop wins a tie inside one bar", () => {
  // Entry 100, stop 100 − (0.2% + 0.12%) = 99.68.
  const gap = run(bookWith([bar(0, 100, 100, 100, 100), bar(1, 100, 100, 100, 100), bar(2, 99.5, 99.6, 99.4, 99.5)], 0, 1), setOf(), 3);
  assert.equal(gap.trace[0]!.reason, "sl");
  assert.equal(gap.trace[0]!.price, 99.5);
  // The bar touches both the stop and the target: the stop is taken.
  const tie = run(bookWith([bar(0, 100, 100, 100, 100), bar(1, 100, 100, 100, 100), bar(2, 100, 100.5, 99.5, 100)], 0, 1), setOf(), 3);
  assert.equal(tie.trace[0]!.reason, "sl");
  assert.equal(tie.trace[0]!.price, 99.68);
});

test("short positions mirror the long rules", () => {
  const bars = [bar(0, 100, 100, 100, 100), bar(1, 100, 100, 100, 100), bar(2, 100, 100.1, 99.5, 99.6)];
  const { trace } = run(bookWith(bars, 0, -1), setOf(), 3);
  assert.equal(trace[0]!.side, -1);
  assert.equal(trace[0]!.reason, "tp");
  assert.ok(Math.abs(trace[0]!.price - 99.68) < 1e-12);
});

test("a dynamic trail activates at the target, follows the peak at the retracement, and only tightens", () => {
  // Entry 100, target 100.32, initial stop 99.68, retrace 0.5.
  const bars = [
    bar(0, 100, 100, 100, 100),
    bar(1, 100, 100.1, 99.9, 100),
    bar(2, 100.1, 100.5, 100.1, 100.4), // touches the target: trail activates, peak 100.5, stop 100.25
    bar(3, 100.4, 102, 100.3, 101.8), // peak 102, stop 101
    bar(4, 101.5, 101.6, 100.9, 101), // low 100.9 through stop 101: exits at 101
  ];
  const { trace } = run(bookWith(bars, 0, 1), setOf({ trail: { kind: "dynamic", retrace: 0.5 }, holdMinutes: 60 }), 5);
  assert.equal(trace.length, 1);
  assert.equal(trace[0]!.reason, "sl");
  assert.ok(Math.abs(trace[0]!.price - 101) < 1e-12);
  assert.ok(trace[0]!.pnl > 0.87 && trace[0]!.pnl < 0.88);
});

test("a partial closes its share at the target and protects the rest at break-even", () => {
  const bars = [
    bar(0, 100, 100, 100, 100),
    bar(1, 100, 100.1, 99.9, 100),
    bar(2, 100, 100.5, 99.95, 100.4), // partial at 100.32, rest moves to break-even 100
    bar(3, 100.1, 100.2, 99.9, 100), // low 99.9 through break-even: rest exits at 100
  ];
  const { acc, trace } = run(bookWith(bars, 0, 1), setOf({ partial: 0.5 }), 4);
  assert.deepEqual(trace.map((item) => item.reason), ["partial", "sl"]);
  assert.deepEqual(trace.map((item) => item.fraction), [0.5, 0.5]);
  assert.equal(trace[1]!.price, 100);
  assert.equal(acc.positions, 1);
  assert.equal(acc.legs, 2);
});

test("a time stop closes at the close after the hold, and the last bar of a window closes whatever is open", () => {
  const flat = [0, 1, 2, 3, 4].map((i) => bar(i, 100, 100.05, 99.95, 100));
  const timed = run(bookWith(flat, 0, 1), setOf({ holdMinutes: 2 }), 5);
  assert.equal(timed.trace[0]!.reason, "time");
  assert.equal(timed.trace[0]!.exitBar, 2);
  const ended = run(bookWith(flat, 0, 1), setOf({ holdMinutes: 60 }), 3);
  assert.equal(ended.trace[0]!.reason, "end");
  assert.equal(ended.trace[0]!.exitBar, 2);
});

test("a blocked entry is a shadow: it is tracked but neither booked nor counted as evidence", () => {
  const bars = [bar(0, 100, 100, 100, 100), bar(1, 100, 100, 100, 100), bar(2, 100, 100.5, 99.9, 100.4)];
  const closes: Closes = { pnls: [], costs: [] };
  const blocked = run(bookWith(bars, 0, 1), setOf(), 3, { closes, gate: () => false });
  assert.equal(blocked.acc.positions, 0);
  assert.equal(blocked.acc.shadows, 1);
  assert.ok(blocked.acc.shadowNet > 0);
  assert.deepEqual(closes.pnls, []);
  assert.equal(blocked.trace[0]!.booked, false);
  const allowedCloses: Closes = { pnls: [], costs: [] };
  const allowed = run(bookWith(bars, 0, 1), setOf(), 3, { closes: allowedCloses, gate: () => true });
  assert.equal(allowed.acc.positions, 1);
  assert.equal(allowedCloses.pnls.length, 1);
  assert.equal(allowedCloses.costs.length, 1);
});

test("a long-only set ignores a short signal and a window starts flat", () => {
  const bars = [bar(0, 100, 100, 100, 100), bar(1, 100, 100, 100, 100), bar(2, 100, 100.5, 99.9, 100.4)];
  const longOnly = run(bookWith(bars, 0, -1), setOf({ direction: "long" }), 3);
  assert.equal(longOnly.acc.positions, 0);
  assert.equal(longOnly.trace.length, 0);
});

test("a window accumulates hourly drawdown on booked legs, and merged windows add up", () => {
  const hours = 3;
  const a = newMicroAcc(0, hours);
  a.hourNet.set([1, -3, 1]);
  a.hourLegs.set([1, 1, 1]);
  a.net = -1;
  a.grossProfit = 2;
  a.grossLoss = 3;
  a.positions = 3;
  const summary = summarizeMicro(a);
  // Cumulative 1, −2, −1: the peak is 1 and the trough is −2, a drawdown of 3.
  assert.equal(summary.maxDrawdown, 3);
  assert.ok(Math.abs(summary.hourlySuccess - (200 / 3)) < 1e-9);
  const b = newMicroAcc(0, hours);
  resetMicroAcc(b, 0);
  b.hourNet.set([2, 0, 0]);
  b.hourLegs.set([1, 0, 0]);
  b.net = 2;
  b.grossProfit = 2;
  mergeMicroAcc(a, b);
  assert.equal(a.net, 1);
  assert.equal(a.hourNet[0], 3);
});

test("barIndexAt returns the first bar at or after a time", () => {
  const bars = [0, 1, 2, 3].map((i) => bar(i, 1, 1, 1, 1));
  assert.equal(barIndexAt(bars, 0), 0);
  assert.equal(barIndexAt(bars, 2 * MINUTE), 2);
  assert.equal(barIndexAt(bars, 2 * MINUTE + 1), 3);
  assert.equal(barIndexAt(bars, 99 * MINUTE), 4);
});

test("indicator signals on a prefix match the full history, so no signal reads a later bar", () => {
  let state = 7;
  const random = () => {
    state = (state * 1_103_515_245 + 12_345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
  let price = 100;
  const bars: Bar[] = Array.from({ length: 600 }, (_, i) => {
    const o = price;
    const c = o + (random() - 0.5) * 0.4;
    const h = Math.max(o, c) + random() * 0.1;
    const l = Math.min(o, c) - random() * 0.1;
    price = c;
    return { t: i * MINUTE, o, h, l, c, v: 50 + random() * 100, closed: true };
  });
  const full = buildMicroBook(bars, "1m");
  const prefix = buildMicroBook(bars.slice(0, 400), "1m");
  for (const indication of INDICATIONS) {
    const whole = full.signals[indication]!;
    const part = prefix.signals[indication]!;
    const keep = [...whole.at].map((at, k) => ({ at, side: whole.side[k]! })).filter((item) => item.at < 400);
    assert.deepEqual([...part.at], keep.map((item) => item.at), `${indication} indices`);
    assert.deepEqual([...part.side], keep.map((item) => item.side), `${indication} sides`);
  }
});
