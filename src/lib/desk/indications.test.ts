import assert from "node:assert/strict";
import test from "node:test";
import { INDICATIONS } from "./constants.ts";
import { HOUR_MS } from "./intervals.ts";
import { buildSeries, indicationBoard, REPLAY_WARMUP_BARS, signalAt, simulateSessions, traceTrades, type Bar } from "./process.ts";
import { BOOK, DEFAULT_FLOORS } from "./constants.ts";
import { defaultForInterval, normalizeStrategies } from "./strategies.ts";

function walk(seed: number, count: number): Bar[] {
  let state = seed;
  const random = () => {
    state = (state * 1_103_515_245 + 12_345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
  const bars: Bar[] = [];
  let close = 100;
  for (let i = 0; i < count; i++) {
    const open = close;
    close = open * (1 + 0.01 * (random() * 2 - 1));
    bars.push({
      t: i * HOUR_MS,
      o: open,
      h: Math.max(open, close) * (1 + 0.005 * random()),
      l: Math.min(open, close) * (1 - 0.005 * random()),
      c: close,
      v: 500 + 500 * random(),
      closed: true,
    });
  }
  return bars;
}

// A signal at bar i may only depend on bars up to and including i.
test("every indication is causal: truncating later bars leaves earlier signals unchanged", () => {
  const full = walk(7, 320);
  const cut = 220;
  const short = full.slice(0, cut);
  const fullSeries = buildSeries(full);
  const shortSeries = buildSeries(short);
  for (const indication of INDICATIONS) {
    for (let i = 0; i < cut; i++) {
      const a = signalAt(indication, full, fullSeries, i);
      const b = signalAt(indication, short, shortSeries, i);
      assert.equal(a, b, `${indication} changed at bar ${i} when later bars were removed`);
    }
  }
});

test("new indications fire on realistic bars and appear on the indication board", () => {
  const bars = walk(11, 320);
  const series = buildSeries(bars);
  for (const indication of ["donchian", "supertrend", "vwapReclaim", "adxDi", "stochRsi"] as const) {
    let fires = 0;
    for (let i = 22; i < bars.length; i++) if (signalAt(indication, bars, series, i)) fires++;
    assert.ok(fires > 0, `${indication} never fired`);
  }
  const names = indicationBoard(bars).map((row) => row.name);
  assert.ok(names.includes("donchian") && names.includes("stochRsi"));
  assert.ok(indicationBoard(bars).every((row) => row.detail.length > 0));
});

test("a gate that rejects every signal produces no trades; an open gate matches the ungated trace", () => {
  const bars = walk(19, 320);
  const open = traceTrades(bars, "stochRsi", 3, 1, "dynamic", "1h", undefined, () => true);
  const closed = traceTrades(bars, "stochRsi", 3, 1, "dynamic", "1h", undefined, () => false);
  assert.equal(closed.length, 0);
  assert.deepEqual(open, traceTrades(bars, "stochRsi", 3, 1, "dynamic"));
  assert.ok(open.length > 0);
});

test("fixed-bracket replay trades only the chosen configuration on every market", () => {
  const hours = 48;
  const pre = 48;
  const span = REPLAY_WARMUP_BARS + pre + hours;
  const start = Math.floor(1_795_776_000_000 / HOUR_MS) * HOUR_MS;
  const books = [1, 2].map((seed) => ({ symbol: `F${seed}-USDT`, bars: walk(seed + 30, span).map((b, i) => ({ ...b, t: start + i * HOUR_MS })) }));
  const strategies = normalizeStrategies({ ...defaultForInterval("1h"), enabledIndications: [...INDICATIONS], extendedTargets: true });
  const report = simulateSessions(books, BOOK, DEFAULT_FLOORS, {
    hours, preHours: pre, end: start + span * HOUR_MS, profile: "coordinated", strategies, selectedOnly: true,
    fixed: { indication: "stochRsi", tpAtr: 4, slOfTp: 1.5, coordination: "breakeven" },
  });
  assert.equal(report.selected.length, books.length);
  for (const item of report.selected) {
    assert.equal(item.indication, "stochRsi");
    assert.equal(item.range, "wide");
    assert.ok(item.name.includes("stochRsi tp4.00_sl1.50 breakeven"), item.name);
  }
});
