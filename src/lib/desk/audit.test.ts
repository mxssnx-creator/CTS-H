import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_FLOORS, INDICATIONS, PF_NO_LOSS } from "./constants.ts";
import { HOUR_MS } from "./intervals.ts";
import { closePnl, NEUTRAL_PF, pfFromPnls, positionRtCost, profitFactor } from "./math.ts";
import { laneRequiredPf, laneValue, makeLane } from "./lanes.ts";
import { gateState, gateStateOf, summarizeReplay, type HourPoint } from "./process.ts";
import { enumerateMicroSets, MICRO_GRID, newMicroAcc, simulateMicro, summarizeMicro, type Fill, type MicroSet } from "./micro.ts";
import type { Bar } from "./process.ts";

// Audit of the conventions, checked as invariants on the real functions:
//   profit factor is computed on closed-trade P&L after round-trip costs; 1.00 is neutral (net zero, and no trades);
//   a record with no losses reads the no-loss cap; 1.1 is one round trip of costs when costs are 10% of gross loss;
//   net is closed-trade P&L, equal to gross profit minus gross loss; open marks are equity, used by drawdown only.

let state = 2026;
const random = () => {
  state = (state * 1_103_515_245 + 12_345) & 0x7fffffff;
  return state / 0x7fffffff;
};

function hourRow(t: number, realized: number, mtm: number, trades: number): HourPoint {
  const gp = realized > 0 ? realized : 0;
  const gl = realized < 0 ? -realized : 0;
  return {
    t,
    trades,
    wins: gp > 0 ? 1 : 0,
    losses: gl > 0 ? 1 : 0,
    realized,
    mtm,
    net: realized + mtm,
    pf: profitFactor(gp, gl),
    grossProfit: gp,
    grossLoss: gl,
    openLegs: 0,
  };
}

test("profit factor is neutral at net zero and with no trades, and reads the no-loss cap with no losses", () => {
  assert.equal(NEUTRAL_PF, 1);
  assert.equal(profitFactor(0, 0), 1);
  assert.equal(profitFactor(3, 3), 1);
  assert.ok(Math.abs(profitFactor(11, 10) - 1.1) < 1e-12);
  assert.equal(profitFactor(0, 5), 0);
  assert.equal(profitFactor(5, 0), PF_NO_LOSS);
  assert.equal(pfFromPnls([]), 1);
  assert.equal(pfFromPnls([{ pnl: 1 }, { pnl: -1 }]), 1);
  assert.equal(pfFromPnls([{ pnl: 2 }, { pnl: -1 }]), 2);
});

test("a cell with no gains and no losses is neutral everywhere the cell PF is read", () => {
  assert.equal(gateStateOf([]).pf, 1);
  assert.equal(gateStateOf([1, -1]).pf, 1);
  assert.equal(gateStateOf([-1, -1]).pf, 0);
  // Eight wins and no losses: the no-loss cap, not an infinite PF.
  assert.equal(gateStateOf([1, 1, 1, 1, 1, 1, 1, 1]).pf, PF_NO_LOSS);
  assert.equal(gateState(gateStateOf([]), DEFAULT_FLOORS, undefined).validExec, false);
});

test("1.1 is one round trip of costs when costs are 10% of gross loss", () => {
  // Gross loss 1.0 on the net basis, costs 0.1: the margin above neutral is 0.1, which is one round trip.
  const closes = { pnls: [1.1, -1], costs: [0.05, 0.05] };
  const value = laneValue(closes, 2);
  assert.ok(Math.abs(value.pf - 1.1) < 1e-12);
  assert.ok(Math.abs(value.net - 0.1) < 1e-12);
  assert.ok(Math.abs(value.costRatio - 0.1) < 1e-12);
  const lane = makeLane("short", 4, "both", { autoPenalty: 0, laneMinPf: {}, minPf: 1, costMultiple: 1 });
  assert.ok(Math.abs(laneRequiredPf(lane, 4, value.costRatio) - 1.1) < 1e-12);
});

test("a round trip satisfies gross = net + cost, for both sides and any prices", () => {
  for (let i = 0; i < 200; i++) {
    const entry = 50 + random() * 100;
    const exit = entry * (1 + (random() - 0.5) * 0.02);
    const qty = 0.1 + random() * 10;
    const side = random() < 0.5 ? 1 : -1;
    const net = closePnl(side, entry, exit, qty);
    const cost = positionRtCost(entry, exit, qty);
    assert.ok(Math.abs(net + cost - (exit - entry) * side * qty) < 1e-9, `case ${i}`);
    assert.ok(cost > 0);
  }
});

test("replay summaries: net is closed-trade P&L, equal to gross profit minus gross loss, and open marks stay in equity", () => {
  const rows = [hourRow(0, 1, 0, 1), hourRow(HOUR_MS, 0, -3, 0), hourRow(2 * HOUR_MS, -0.5, 0.2, 1), hourRow(3 * HOUR_MS, 0, 0.5, 0)];
  const summary = summarizeReplay(rows);
  assert.ok(Math.abs(summary.net - 0.5) < 1e-12, "net excludes the open marks");
  assert.ok(Math.abs(summary.net - (summary.grossProfit - summary.grossLoss)) < 1e-12);
  assert.ok(Math.abs(summary.openPnl - (-3 + 0.2 + 0.5)) < 1e-12);
  assert.ok(Math.abs(summary.equity - (summary.net + summary.openPnl)) < 1e-12);
  assert.ok(Math.abs(summary.pf - profitFactor(summary.grossProfit, summary.grossLoss)) < 1e-12);
  // Drawdown follows equity: the open loss of 3 after a closed gain of 1 is a drawdown of 3.
  assert.ok(summary.drawdown >= 3 - 1e-12, `drawdown ${summary.drawdown}`);
});

test("a replay with no trades reads net 0 and PF 1.00", () => {
  const summary = summarizeReplay([hourRow(0, 0, 0, 0), hourRow(HOUR_MS, 0, 0, 0)]);
  assert.equal(summary.net, 0);
  assert.equal(summary.pf, 1);
  assert.equal(summary.openPnl, 0);
});

test("micro accounting: net is booked P&L, gross profit minus gross loss, PF on those fills, equity ends at net when flat", () => {
  const minute = 60_000;
  const bars: Bar[] = [];
  let price = 100;
  for (let i = 0; i < 700; i++) {
    const o = price;
    const c = o * (1 + (random() - 0.5) * 0.01);
    bars.push({ t: i * minute, o, h: Math.max(o, c) * (1 + random() * 0.002), l: Math.min(o, c) * (1 - random() * 0.002), c, v: 1, closed: true });
    price = c;
  }
  const at: number[] = [];
  const side: number[] = [];
  bars.forEach((_, i) => {
    if (i > 10 && random() < 0.08) {
      at.push(i);
      side.push(random() < 0.5 ? 1 : -1);
    }
  });
  const book = {
    interval: "1m" as const,
    bars,
    atr: new Float64Array(bars.length).fill(0.5),
    signals: { volumeBreak: { at: Int32Array.from(at), side: Int8Array.from(side) } },
  };
  const sets: MicroSet[] = [
    { id: "a", interval: "1m", indication: "volumeBreak", direction: "both", tp: 0.4, sl: 0.4, trail: { kind: "fixed" }, holdMinutes: 60, partial: 0 },
    { id: "b", interval: "1m", indication: "volumeBreak", direction: "both", tp: 0.6, sl: 0.3, trail: { kind: "dynamic", retrace: 0.4 }, holdMinutes: 120, partial: 0.5 },
  ];
  for (const set of sets) {
    const acc = newMicroAcc(0, minute, bars.length);
    const trace: Fill[] = [];
    simulateMicro(book, set, 0, bars.length, acc, { trace });
    const booked = trace.filter((fill) => fill.booked);
    const net = booked.reduce((total, fill) => total + fill.pnl, 0);
    const gp = booked.filter((fill) => fill.pnl > 0).reduce((total, fill) => total + fill.pnl, 0);
    const gl = -booked.filter((fill) => fill.pnl < 0).reduce((total, fill) => total + fill.pnl, 0);
    const summary = summarizeMicro(acc);
    assert.ok(Math.abs(summary.net - net) < 1e-9, `${set.id} net`);
    assert.ok(Math.abs(summary.grossProfit - gp) < 1e-9 && Math.abs(summary.grossLoss - gl) < 1e-9, `${set.id} gross`);
    assert.ok(Math.abs(summary.pf - profitFactor(gp, gl)) < 1e-9, `${set.id} pf`);
    assert.ok(Math.abs(summary.equityEnd - net) < 1e-9, `${set.id} equity ends at net when flat`);
    assert.ok(Math.abs(summary.net - (summary.grossProfit - summary.grossLoss)) < 1e-9, `${set.id} net = gross profit - gross loss`);
  }
});

test("micro sets: the grid counts, unique IDs, and the ATR token only on ATR brackets", () => {
  const all = enumerateMicroSets(MICRO_GRID);
  assert.equal(all.length, 6 * INDICATIONS.length * 7 * 7 * 5 * 2 * 2);
  assert.equal(new Set(all.map((set) => set.id)).size, all.length);
  for (const set of all.slice(0, 500)) {
    assert.ok(!set.id.endsWith("|atr"), "percent sets carry no ATR token");
    assert.match(set.id, /^(1m|5m|15m|30m|1h|4h)\|/);
  }
  const atrGrid = enumerateMicroSets({ ...MICRO_GRID, brackets: ["atr"], tp: [0.5, 1, 1.5, 2, 3], sl: [0.5, 1, 1.5, 2] });
  assert.ok(atrGrid.every((set) => set.id.endsWith("|atr")));
  assert.equal(atrGrid.length, 6 * INDICATIONS.length * 5 * 4 * 5 * 2 * 2);
});

test("PF over pooled closes equals the helper on the same closes", () => {
  const pnls = [0.4, -0.2, 0, 1.1, -0.9, 0.3];
  const value = laneValue({ pnls, costs: pnls.map(() => 0) }, pnls.length);
  const gp = pnls.filter((pnl) => pnl > 0).reduce((a, b) => a + b, 0);
  const gl = -pnls.filter((pnl) => pnl < 0).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(value.pf - profitFactor(gp, gl)) < 1e-12);
  assert.ok(Math.abs(value.net - pnls.reduce((a, b) => a + b, 0)) < 1e-12);
});
