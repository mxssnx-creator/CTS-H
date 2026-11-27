import assert from "node:assert/strict";
import test from "node:test";
import { HOUR_MS } from "./intervals.ts";
import { periodRows } from "./periods.ts";
import type { HourPoint } from "./process.ts";

// Aligned to a four-hour UTC boundary so index 0 starts a period.
const ORIGIN = Math.floor(1_795_776_000_000 / (4 * HOUR_MS)) * (4 * HOUR_MS);

function hour(index: number, overrides: Partial<HourPoint> = {}): HourPoint {
  const base = {
    t: ORIGIN + index * HOUR_MS,
    trades: 0,
    wins: 0,
    losses: 0,
    realized: 0,
    mtm: 0,
    grossProfit: 0,
    grossLoss: 0,
    openLegs: 0,
  };
  const row = { ...base, ...overrides };
  return { ...row, net: row.realized + row.mtm, pf: 0 };
}

test("periods align to UTC four-hour boundaries and cover every hour", () => {
  const rows = Array.from({ length: 10 }, (_, i) => hour(i));
  const periods = periodRows(rows, 4);
  assert.deepEqual(periods.map((p) => p.hours), [4, 4, 2]);
  assert.equal(periods[0]!.start % (4 * HOUR_MS), 0);
  assert.equal(periods[0]!.end - periods[0]!.start, 4 * HOUR_MS);
});

test("a period partly before the first row starts at its UTC boundary", () => {
  const rows = [hour(2), hour(3), hour(4)];
  const periods = periodRows(rows, 4);
  assert.equal(periods.length, 2);
  assert.equal(periods[0]!.hours, 2);
  assert.equal(periods[0]!.start, rows[0]!.t - 2 * HOUR_MS);
  assert.equal(periods[1]!.start, periods[0]!.end);
});

test("totals, profit factor, win rate and cumulative net add up", () => {
  const rows = [
    hour(0, { trades: 2, wins: 1, losses: 1, realized: 3, grossProfit: 5, grossLoss: 2, openLegs: 1 }),
    hour(1, { trades: 1, wins: 0, losses: 1, realized: -1, mtm: 0.5, grossLoss: 1, openLegs: 1 }),
    hour(2, { mtm: -0.25, openLegs: 1 }),
    hour(3, { trades: 1, wins: 1, realized: 2, grossProfit: 2, openLegs: 0 }),
    hour(4, { trades: 1, wins: 1, realized: 1, grossProfit: 1 }),
  ];
  const [first, second] = periodRows(rows, 4);
  assert.equal(first!.trades, 4);
  assert.equal(first!.wins, 2);
  assert.equal(first!.losses, 2);
  assert.equal(first!.winRate, 0.5);
  assert.ok(Math.abs(first!.net - (3 - 1 + 0.5 - 0.25 + 2)) < 1e-12);
  assert.ok(Math.abs(first!.pf - 7 / 3) < 1e-12);
  assert.equal(first!.positiveHours, 2);
  assert.equal(first!.openLegsEnd, 0);
  assert.equal(second!.trades, 1);
  assert.ok(Math.abs(second!.cumulative - (first!.net + second!.net)) < 1e-12);
});

test("drawdown is measured from the start of each period", () => {
  const rows = [
    hour(0, { realized: 2 }),
    hour(1, { realized: -3 }),
    hour(2, { realized: 1 }),
    hour(3, { realized: -1 }),
    hour(4, { realized: -1 }),
  ];
  const [first, second] = periodRows(rows, 4);
  assert.equal(first!.drawdown, 3);
  assert.equal(second!.drawdown, 1);
});

test("periods measured from a replay origin are always complete", () => {
  // A replay that starts at 13:00 UTC: four-hour periods begin at 13:00, 17:00, and so on.
  const origin = ORIGIN + HOUR_MS;
  const rows = Array.from({ length: 12 }, (_, i) => hour(i + 1));
  const periods = periodRows(rows, 4, origin);
  assert.deepEqual(periods.map((p) => p.hours), [4, 4, 4]);
  assert.equal(periods[0]!.start, origin);
  assert.equal(periods.at(-1)!.end, origin + 12 * HOUR_MS);
});

test("a period without trades reports null win rate and no profit factor", () => {
  const [period] = periodRows([hour(0, { mtm: 0.1, openLegs: 1 })], 4);
  assert.equal(period!.winRate, null);
  assert.equal(period!.pf, 0);
  assert.equal(period!.openLegsEnd, 1);
});

test("empty input yields no periods and invalid periods are rejected", () => {
  assert.deepEqual(periodRows([], 4), []);
  assert.throws(() => periodRows([hour(0)], 0));
  assert.throws(() => periodRows([hour(0)], 1.5));
});
