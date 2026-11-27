import assert from "node:assert/strict";
import test from "node:test";
import { BOOK, DEFAULT_FLOORS, MODEL_STOP_RISK } from "./constants.ts";
import { protectiveStop, sizeAfterLosses } from "./management.ts";
import { closePnl } from "./math.ts";
import { simulateSessions, type Bar } from "./process.ts";
import {
  adjustPosition,
  managedEntry,
  normalizeStrategies,
  newStrategyActions,
  recordRelationClose,
  relationKey,
  requiredPf,
  RelationLedger,
} from "./strategies.ts";

const cost = 0.0012;
const winners = [-2, 2, 1, 3, 1, 2];
const entry = { notional: 100, entry: 100, stop: 95, target: 110, cost };

test("Auto PF applies an independent small-sample margin above the configured floor", () => {
  const settings = normalizeStrategies({
    autoPf: true,
    minimumPf: 1.2,
    autoPfPenalty: 0.4,
    autoPfSamples: 4,
  });
  assert.equal(requiredPf(1, 4, settings), 1.6);
  assert.ok(Math.abs(requiredPf(1, 16, settings) - 1.4) < 1e-12);
  assert.equal(requiredPf(1.35, 16, settings), 1.55);
  assert.equal(requiredPf(1.35, 16, { ...settings, autoPf: false }), 1.35);
});

test("normalized volume factor uses tenths and invalid strategy preferences stay bounded", () => {
  assert.equal(normalizeStrategies().volumeFactor, 1);
  assert.equal(normalizeStrategies({ volumeFactor: 1.26 }).volumeFactor, 1.3);
  assert.equal(normalizeStrategies({ volumeFactor: 0 }).volumeFactor, 0.1);
  assert.equal(normalizeStrategies({ volumeFactor: 15 }).volumeFactor, 10);
  const prefs = normalizeStrategies({
    axisSamples: 28,
    axisLookback: 8,
    dcaLevels: Infinity,
    enabledIndications: ["rsi", "rsi"],
  });
  assert.equal(prefs.axisSamples, 8);
  assert.equal(prefs.dcaLevels, 1);
  assert.deepEqual(prefs.enabledIndications, ["rsi"]);
  assert.equal(sizeAfterLosses(-0.2, -0.01), 0.65);
  assert.equal(sizeAfterLosses(-0.2, 0), 1);
});

test("managed stops advance after activation on both sides and cover the modeled fee", () => {
  for (const side of [1, -1] as const) {
    const target = 100 + side * 10;
    const original = 100 - side * 5;
    const lifted = protectiveStop("breakeven", side, 100, target, original, 100 + side * 6, cost);
    assert.equal(closePnl(side, 100, lifted, 10, cost), 0);
    assert.equal(
      protectiveStop("dynamic", side, 100, target, original, 100 + side * 5, cost),
      original,
    );
    const moving = protectiveStop("dynamic", side, 100, target, original, 100 + side * 8, cost);
    assert.ok((moving - lifted) * side > 0);
    assert.equal(
      protectiveStop("dynamic", side, 100, target, moving, 100 + side * 6, cost),
      moving,
    );
  }
});

test("Axis is conditional on prior PF, sample count and two wins", () => {
  const prefs = normalizeStrategies({ axis: true });
  const actions = newStrategyActions();
  const off = managedEntry(entry, prefs, winners.slice(1), [], actions);
  const on = managedEntry(entry, prefs, winners, [], actions);
  assert.ok(on.qty > off.qty);
  assert.equal(actions.axis, 1);
  assert.equal(managedEntry(entry, prefs, [...winners, -1], [], actions).qty, off.qty);
});

test("Block favorable rungs and DCA adverse rungs share bounded funding and stop risk", () => {
  const seeded = managedEntry(
    entry,
    normalizeStrategies({ block: true, dca: true }),
    winners,
    [],
    newStrategyActions(),
  );
  const position = { side: 1 as const, entry: 100, sl: 95, tp: 110, ...seeded };
  assert.equal(adjustPosition(position, 104.01, cost, true, true), null);
  assert.equal(adjustPosition(position, 102, cost, true, true), "block");
  assert.equal(adjustPosition(position, 98, cost, true, true), "dca");
  assert.equal(adjustPosition(position, 94, cost, true, true), null);
  assert.equal(position.sl, 95);
  assert.equal(position.plan?.blockFilled, 1);
  assert.equal(position.plan?.dcaFilled, 1);
  assert.ok(position.qty <= position.plan!.maxQty);
  assert.ok(position.qty * position.entry <= entry.notional);
  assert.ok(
    -closePnl(1, position.entry, position.sl, position.qty, cost) <=
      entry.notional * MODEL_STOP_RISK + 1e-12,
  );
  const short = managedEntry(
    { ...entry, target: 90, stop: 105 },
    normalizeStrategies({ dca: true }),
    [],
    [],
    newStrategyActions(),
  );
  const shortPosition = { side: -1 as const, entry: 100, sl: 105, tp: 90, ...short };
  assert.equal(adjustPosition(shortPosition, 102, cost, true, true), "dca");
  assert.ok(shortPosition.entry > 100);
});

test("Relate uses prior closes only in its exact direction and selected relation", () => {
  const ledger = new RelationLedger();
  for (const pnl of winners) recordRelationClose(ledger, "BTC|config-A", "BTC", 1, pnl);
  const prefs = normalizeStrategies({ relate: true, relateScope: "symbol" });
  const actions = newStrategyActions();
  const long = managedEntry(
    entry,
    prefs,
    winners,
    ledger.recent(relationKey("symbol", "BTC", 1)),
    actions,
    [],
  );
  const short = managedEntry(
    entry,
    prefs,
    winners,
    ledger.recent(relationKey("symbol", "BTC", -1)),
    actions,
    [],
  );
  const foreign = managedEntry(
    entry,
    prefs,
    winners,
    ledger.recent(relationKey("symbol", "ETH", 1)),
    actions,
    [],
  );
  assert.ok(long.qty > short.qty);
  assert.equal(short.qty, foreign.qty);
  assert.equal(actions.relate, 1);
  assert.equal(ledger.recent("BTC|config-A|1").length, winners.length);
});

test("asymmetric sub-hour replays score only the selected lane and preserve hour accounting", () => {
  const step = 300_000;
  const end = Date.parse("2026-11-27T08:00:00Z");
  const count = 22 + 12 * (12 + 24);
  let entry = 100;
  const bars: Bar[] = Array.from({ length: count }, (_, i) => {
    const o = entry;
    entry *= 1 + (Math.sin(i / 3) * 0.012 + 0.004);
    return {
      t: end - (count - i) * step,
      o,
      c: entry,
      h: Math.max(o, entry) * 1.001,
      l: Math.min(o, entry) * 0.999,
      v: 100 + i,
      closed: true,
    };
  });
  const options = {
    hours: 24,
    preHours: 12,
    end,
    interval: "5m",
    indication: "move",
    range: "wide",
    profile: "coordinated",
  } as const;
  const original = simulateSessions([{ symbol: "ETH-USDT", bars }], BOOK, DEFAULT_FLOORS, options);
  assert.equal(original.ready, true);
  assert.equal(original.bookPre.length, 12);
  assert.equal(original.bookLive.length, 24);
  assert.equal(original.evaluatedConfigs, 105);
  assert.ok(original.selected.every(({ name }) => name.includes(" move ")));
  const futureEdited = bars.map((bar, i) =>
    i >= count - 12 * 24
      ? { ...bar, o: bar.o * 1.01, c: bar.c * 1.01, h: bar.h * 1.01, l: bar.l * 1.01 }
      : bar,
  );
  const replay = simulateSessions(
    [{ symbol: "ETH-USDT", bars: futureEdited }],
    BOOK,
    DEFAULT_FLOORS,
    options,
  );
  assert.deepEqual(replay.bookNames, original.bookNames);
  assert.deepEqual(replay.bookPre, original.bookPre);
  assert.ok(original.bookDrawdownLive >= 0);

  const strict = simulateSessions([{ symbol: "ETH-USDT", bars }], BOOK, DEFAULT_FLOORS, {
    ...options,
    strategies: normalizeStrategies({
      autoPf: true,
      autoPfSamples: 8,
      minimumPf: 2,
      autoPfPenalty: 0.4,
    }),
  });
  assert.equal(strict.evaluatedConfigs, original.evaluatedConfigs);
  assert.ok(strict.rejectedPf >= original.rejectedPf);
  assert.ok(strict.selected.every(({ requiredPf }) => requiredPf > 2));
});
