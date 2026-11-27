import assert from "node:assert/strict";
import test from "node:test";
import { CALIBRATION_END, CALIBRATED_EXCLUSIONS } from "./calibration.ts";
import { configurationKey, excludedConfigurations } from "./config-policy.ts";
import {
  BOOK,
  DEFAULT_FLOORS,
  INDICATIONS,
  PREFERRED_SYMBOLS,
  REPLAY_SYMBOLS,
  WIDE_SL_OF_TP,
  WIDE_TP_ATR,
} from "./constants.ts";
import { allShortCombos, liveShortOk, stopCappedQty } from "./math.ts";
import { simulateSessions, syncBooks, type Bar } from "./process.ts";

const HOUR = 3_600_000;
const standardConfigs = [
  ...allShortCombos().filter((combo) => liveShortOk(combo.tpAtr, combo.slOfTp)),
  ...WIDE_TP_ATR.flatMap((tpAtr) => WIDE_SL_OF_TP.map((slOfTp) => ({ tpAtr, slOfTp }))),
];
const validKeys = new Set(
  standardConfigs.flatMap(({ tpAtr, slOfTp }) =>
    INDICATIONS.map((indication) => configurationKey(indication, tpAtr, slOfTp)),
  ),
);

function book(end: number, symbol = "ETH-USDT") {
  const bars: Bar[] = [];
  let last = 100;
  for (let i = 0; i < 118; i++) {
    const close = last * (1 + Math.sin(i / 4) * 0.008 + 0.001);
    bars.push({
      t: end - (118 - i) * HOUR,
      o: last,
      c: close,
      h: Math.max(last, close) * 1.001,
      l: Math.min(last, close) * 0.999,
      v: 100 + i,
      closed: true,
    });
    last = close;
  }
  return { symbol, bars };
}

test("the larger replay universe retains the watchlist and has fifty unique symbols", () => {
  assert.equal(new Set(REPLAY_SYMBOLS).size, 50);
  assert.ok(PREFERRED_SYMBOLS.every((symbol) => REPLAY_SYMBOLS.includes(symbol)));
});

test("published exclusions apply to the right BingX route and only after calibration", () => {
  assert.equal(excludedConfigurations("bingx-x01", CALIBRATION_END - 1).size, 0);
  assert.equal(excludedConfigurations("bingx-x02", CALIBRATION_END - 1).size, 0);
  const main = excludedConfigurations("bingx-x01", CALIBRATION_END);
  const demo = excludedConfigurations("bingx-x02", CALIBRATION_END);
  assert.deepEqual(excludedConfigurations("bingx-public", CALIBRATION_END), main);
  assert.notDeepEqual(main, demo);
  for (const venue of ["bingx-x01", "bingx-x02"] as const) {
    const keys = CALIBRATED_EXCLUSIONS[venue];
    assert.ok(keys.length > 0 && keys.length < validKeys.size * REPLAY_SYMBOLS.length);
    assert.equal(keys.length, new Set(keys).size);
    assert.ok(
      keys.every((id) => {
        const [symbol, indication, bracket] = id.split("|");
        return REPLAY_SYMBOLS.includes(symbol!) && validKeys.has(`${indication}|${bracket}`);
      }),
    );
  }
});

test("automatic paper scoring omits excluded keys only on their market", () => {
  const exclusions = excludedConfigurations("bingx-x02", CALIBRATION_END);
  const affected = exclusions.values().next().value!.split("|")[0]!;
  const without = REPLAY_SYMBOLS.find(
    (symbol) => ![...exclusions].some((id) => id.startsWith(symbol + "|")),
  )!;
  const books = [book(CALIBRATION_END, affected), book(CALIBRATION_END, without)];
  const later = syncBooks([], books, BOOK, DEFAULT_FLOORS, "bingx-x02");
  const firstBlocked = [...exclusions].filter((id) => id.startsWith(affected + "|"));
  assert.equal(
    later.cells.filter((cell) => cell.symbol === affected).length,
    validKeys.size - firstBlocked.length,
  );
  assert.equal(later.cells.filter((cell) => cell.symbol === without).length, validKeys.size);
  assert.ok(later.cells.every((cell) => !exclusions.has(cell.id)));

  const earlier = syncBooks(
    [],
    [book(CALIBRATION_END - HOUR, affected)],
    BOOK,
    DEFAULT_FLOORS,
    "bingx-x02",
  );
  assert.equal(earlier.cells.length, validKeys.size);
});

test("historical replay cannot use exclusions from a later calibration", () => {
  const end = CALIBRATION_END + 95 * HOUR;
  const opts = { connection: "bingx-x01" as const, hours: 48 as const, end };
  const blocked = excludedConfigurations("bingx-x01", CALIBRATION_END);
  const market = blocked.values().next().value!.split("|")[0]!;
  const candles = [book(end, market)];
  const withoutCalibration = simulateSessions(candles, BOOK, DEFAULT_FLOORS, {
    ...opts,
    connection: undefined,
  });
  const historical = simulateSessions(candles, BOOK, DEFAULT_FLOORS, {
    ...opts,
    profile: "filtered",
  });
  assert.equal(historical.disabledConfigs, 0);
  assert.deepEqual(historical.selected, withoutCalibration.selected);
  assert.deepEqual(historical.bookLive, withoutCalibration.bookLive);

  const liveEnd = end + HOUR;
  const filtered = simulateSessions([book(liveEnd, market)], BOOK, DEFAULT_FLOORS, {
    ...opts,
    end: liveEnd,
  });
  const marketDisabled = [...blocked].filter((id) => id.startsWith(market + "|")).length;
  assert.equal(filtered.disabledConfigs, marketDisabled);
  assert.equal(filtered.evaluatedConfigs, validKeys.size - marketDisabled);
  assert.ok(filtered.bookNames.every((name) => !blocked.has(name.split(" ").join("|"))));
});

test("modeled stop sizing preserves small orders and scales wider stops down", () => {
  const narrow = stopCappedQty(100, 100, 0.2, 0.0012);
  const wide = stopCappedQty(100, 100, 2.0, 0.0012);
  assert.equal(narrow, 1);
  assert.ok(wide < narrow);
  assert.ok(Math.abs(wide * (2.0 + 100 * 0.0012) - 0.8) < 1e-10);
});
