import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_FLOORS } from "./constants.ts";
import { gateCell, gateState, gateStateOf, type Cell, type GateState } from "./process.ts";
import type { PfSettings } from "./strategies.ts";

const settings: PfSettings = { minimumPf: 1, autoPf: true, autoPfPenalty: 0.15, autoPfSamples: 4, autoPfRecent: true };

test("gateStateOf keeps the closes, net, PF and the last fifty closes of a cell", () => {
  const state = gateStateOf([1, -1, 2]);
  assert.equal(state.n, 3);
  assert.equal(state.net, 2);
  assert.equal(state.pf, 3);
  assert.deepEqual([...state.lastN], [1, -1, 2]);
  const long = gateStateOf(Array.from({ length: 60 }, () => 1));
  assert.equal(long.n, 60);
  assert.equal(long.lastN.length, 50);
  assert.equal(gateStateOf([-1, -1]).pf, 0);
  // A record with neither gains nor losses is neutral: PF 1.00, the same as every other record.
  assert.equal(gateStateOf([]).pf, 1);
});

test("a cell with a winning record and clean recent closes is valid and disabled is false", () => {
  const state = gateStateOf([1, 1, 1, 1, 1, 1, 1, 1]);
  const result = gateState(state, DEFAULT_FLOORS, settings);
  assert.equal(result.validExec, true);
  assert.equal(result.disabled, false);
});

test("a losing record is invalid and gets disabled once the suspension window shows losses", () => {
  const result = gateState(gateStateOf([-1, -1, -1, -1, -1, -1, -1, -1]), DEFAULT_FLOORS, settings);
  assert.equal(result.validExec, false);
  assert.equal(result.disabled, true);
});

test("too few samples for the auto PF requirement never validates a cell", () => {
  const result = gateState(gateStateOf([1, 1]), DEFAULT_FLOORS, settings);
  assert.equal(result.validExec, false);
  assert.equal(result.disabled, false);
});

test("a cell that is not live-eligible is never valid, whatever its record", () => {
  const state: GateState = { ...gateStateOf([1, 1, 1, 1, 1, 1, 1, 1]), liveFloor: false };
  assert.equal(gateState(state, DEFAULT_FLOORS, settings).validExec, false);
});

test("gateCell writes the same result onto a cell as gateState computes", () => {
  const pnls = [1, -0.5, 2, 1, -0.2, 0.7, 0.4, 1.1];
  const cell = { ...gateStateOf(pnls), liveFloor: true, validExec: false, disabled: false, requiredRecentPf: 0 } as unknown as Cell;
  const expected = gateState(gateStateOf(pnls), DEFAULT_FLOORS, settings);
  gateCell(cell, DEFAULT_FLOORS, settings);
  assert.equal(cell.validExec, expected.validExec);
  assert.equal(cell.disabled, expected.disabled);
  assert.equal(cell.requiredRecentPf, expected.requiredRecentPf);
});
