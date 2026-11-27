import assert from "node:assert/strict";
import test from "node:test";
import { INDICATIONS, POSITION_RT_COST_PCT } from "./constants.ts";
import {
  aggregateBars,
  barIndexAt,
  buildMicroBook,
  enumerateMicroSets,
  MICRO_GRID,
  microSetId,
  MicroState,
  newMicroAcc,
  simulateMicro,
  summarizeMicro,
  type Closes,
  type Fill,
  type MicroBook,
  type MicroLegTrace,
  type MicroOptions,
  type MicroSet,
  type Trail,
} from "./micro.ts";
import type { Bar } from "./process.ts";

const MINUTE = 60_000;
const HOUR_MS = 3_600_000;
const bar = (index: number, o: number, h: number, l: number, c: number, v = 1): Bar => ({ t: index * MINUTE, o, h, l, c, v, closed: true });

// A book with one signal: the indication fires on closed bar `signalAt` with `side`, so entry is the next bar's open.
function bookWith(bars: Bar[], signalAt: number, side: 1 | -1, indication: "volumeBreak" | "rsi" = "volumeBreak"): MicroBook {
  return {
    interval: "1m",
    bars,
    atr: new Float64Array(bars.length).fill(2),
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
  const acc = newMicroAcc(0, MINUTE, book.bars.length);
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

test("a blocked entry is a shadow: not booked, but its close is evidence so the cell can earn its way back", () => {
  const bars = [bar(0, 100, 100, 100, 100), bar(1, 100, 100, 100, 100), bar(2, 100, 100.5, 99.9, 100.4)];
  const closes: Closes = { pnls: [], costs: [] };
  const blocked = run(bookWith(bars, 0, 1), setOf(), 3, { closes, gate: () => false });
  assert.equal(blocked.acc.positions, 0);
  assert.equal(blocked.acc.legs, 0);
  assert.equal(blocked.acc.shadows, 1);
  assert.ok(blocked.acc.shadowNet > 0);
  assert.equal(closes.pnls.length, 1, "the shadow close is evidence");
  assert.ok(closes.pnls[0]! > 0);
  assert.equal(blocked.trace[0]!.booked, false);
  const allowedCloses: Closes = { pnls: [], costs: [] };
  const allowed = run(bookWith(bars, 0, 1), setOf(), 3, { closes: allowedCloses, gate: () => true });
  assert.equal(allowed.acc.positions, 1);
  assert.equal(allowedCloses.pnls.length, 1);
  assert.equal(allowedCloses.costs.length, 1);
});

test("the entry gate receives the index of the entry bar", () => {
  const bars = [bar(0, 100, 100, 100, 100), bar(1, 100, 100, 100, 100), bar(2, 100, 100.5, 99.9, 100.4)];
  const seen: number[] = [];
  run(bookWith(bars, 0, 1), setOf(), 3, { closes: { pnls: [], costs: [] }, gate: (_closes, index) => (seen.push(index), true) });
  assert.deepEqual(seen, [1]);
});

test("a long-only set ignores a short signal and a window starts flat", () => {
  const bars = [bar(0, 100, 100, 100, 100), bar(1, 100, 100, 100, 100), bar(2, 100, 100.5, 99.9, 100.4)];
  const longOnly = run(bookWith(bars, 0, -1), setOf({ direction: "long" }), 3);
  assert.equal(longOnly.acc.positions, 0);
  assert.equal(longOnly.trace.length, 0);
});

test("drawdown is the largest peak-to-trough fall of the equity, and hourly success counts buckets whose equity rose", () => {
  const acc = newMicroAcc(0, HOUR_MS, 3);
  acc.slotDelta.set([1, -3, 1]);
  const summary = summarizeMicro(acc);
  // Equity 1, -2, -1: the peak is 1 and the trough is -2.
  assert.equal(summary.maxDrawdown, 3);
  assert.equal(summary.equityEnd, -1);
  // Three active hours, two of them rising.
  assert.ok(Math.abs(summary.hourlySuccess - 200 / 3) < 1e-9);
  assert.equal(summary.activeHours, 3);
});

test("an open position that is underwater shows in drawdown before it closes, even when the trade ends as a winner", () => {
  // Entry 100 with a wide stop (99.08) and a 0.2% target (100.32). The price dips to a mark of about -0.62 before the
  // target fills at 100.32. Closed trades alone would show no drawdown at all.
  const bars = [bar(0, 100, 100, 100, 100), bar(1, 100, 100.1, 99.5, 99.6), bar(2, 99.6, 99.8, 99.4, 99.5), bar(3, 99.5, 100.4, 99.4, 100.4)];
  const { acc } = run(bookWith(bars, 0, 1), setOf({ tp: 0.2, sl: 0.8, holdMinutes: 60 }), 4);
  const summary = summarizeMicro(acc);
  assert.ok(summary.net > 0.19 && summary.net < 0.2, "the trade nets about 0.2 after cost");
  // The bar-2 mark is -0.5 - 99.75 x 0.0012 = -0.6197, and nothing realized is negative.
  assert.ok(Math.abs(summary.maxDrawdown - 0.6197) < 1e-9, `drawdown ${summary.maxDrawdown}`);
  assert.equal(summary.grossLoss, 0);
  assert.ok(Math.abs(summary.equityEnd - summary.net) < 1e-9);
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

test("the streaming state gives the same fills as the batch run on the same bars", () => {
  let state = 11;
  const random = () => {
    state = (state * 1_103_515_245 + 12_345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
  let price = 100;
  const bars: Bar[] = Array.from({ length: 900 }, (_, i) => {
    const o = price;
    const c = o + (random() - 0.5) * 0.5;
    const h = Math.max(o, c) + random() * 0.15;
    const l = Math.min(o, c) - random() * 0.15;
    price = c;
    return { t: i * MINUTE, o, h, l, c, v: 1, closed: true };
  });
  // About one closed bar in twelve fires, with a random side, so positions open, close and re-open.
  const at: number[] = [];
  const side: number[] = [];
  bars.forEach((_, i) => {
    if (i > 25 && random() < 1 / 12) {
      at.push(i);
      side.push(random() < 0.5 ? 1 : -1);
    }
  });
  const signalOn = new Int8Array(bars.length);
  at.forEach((index, k) => {
    signalOn[index] = side[k]!;
  });
  const book: MicroBook = { interval: "1m", bars, atr: new Float64Array(bars.length).fill(2), signals: { volumeBreak: { at: Int32Array.from(at), side: Int8Array.from(side) } } };
  const variants: MicroSet[] = [
    setOf({ tp: 0.2, sl: 0.2, holdMinutes: 30 }),
    setOf({ tp: 0.5, sl: 0.3, trail: { kind: "dynamic", retrace: 0.4 }, holdMinutes: 120, partial: 0.5 }),
    setOf({ tp: 0.3, sl: 0.6, trail: { kind: "fixed" }, holdMinutes: 60, partial: 0.5, direction: "short" }),
    setOf({ tp: 0.8, sl: 0.2, trail: { kind: "dynamic", retrace: 0.6 }, holdMinutes: 240, direction: "long" }),
  ];
  for (const set of variants) {
    const batchFills: Fill[] = [];
    const batchAcc = newMicroAcc(0, MINUTE, bars.length);
    simulateMicro(book, set, 0, bars.length, batchAcc, { trace: batchFills });
    assert.ok(Math.abs(summarizeMicro(batchAcc).equityEnd - batchAcc.net) < 1e-9, `${set.id} equity ends at the booked net`);
    const streaming = new MicroState(set, "1m");
    const streamFills: Fill[] = [];
    for (let b = 0; b < bars.length; b++) {
      const signal = b === 0 ? 0 : signalOn[b - 1]!;
      streaming.onBar(bars[b]!, b, signal as 0 | 1 | -1, b === bars.length - 1, null, (fill) => streamFills.push(fill));
    }
    assert.ok(batchFills.length > 0, `${set.id} has fills`);
    assert.deepEqual(streamFills, batchFills, set.id);
    assert.ok(streaming.flat, "the window end leaves the state flat");
  }
});

test("ATR brackets sit multiples of the signal-bar ATR beyond the cost", () => {
  // ATR 2 on the signal bar, so a 1.0 ATR target sits at 100 + 2 + 0.12 = 102.12 and the 1.0 ATR stop at 97.88.
  const bars = [bar(0, 100, 100, 100, 100), bar(1, 100, 100, 100, 100), bar(2, 100, 102.5, 99.9, 102.2), bar(3, 102.2, 102.3, 101.9, 102.1)];
  const book = bookWith(bars, 0, 1);
  const { trace } = run(book, setOf({ bracket: "atr", tp: 1, sl: 1, holdMinutes: 60 }), 4);
  assert.equal(trace.length, 1);
  assert.equal(trace[0]!.reason, "tp");
  assert.ok(Math.abs(trace[0]!.price - 102.12) < 1e-12);
});

test("an ATR bracket does not enter without an ATR value", () => {
  const bars = [bar(0, 100, 100, 100, 100), bar(1, 100, 100, 100, 100), bar(2, 100, 102.5, 99.9, 102.2)];
  const book = bookWith(bars, 0, 1);
  book.atr = new Float64Array(bars.length).fill(Number.NaN);
  const { acc, trace } = run(book, setOf({ bracket: "atr", tp: 1, sl: 1 }), 3);
  assert.equal(trace.length, 0);
  assert.equal(acc.positions, 0);
});
