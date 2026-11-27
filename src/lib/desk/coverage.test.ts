import assert from "node:assert/strict";
import test from "node:test";
import { BOOK, DEFAULT_FLOORS, INDICATIONS } from "./constants.ts";
import { HOUR_MS } from "./intervals.ts";
import { buildSeries, REPLAY_WARMUP_BARS, signalAt, simulateSessions, type Bar } from "./process.ts";
import { normalizeStrategies } from "./strategies.ts";

// Deterministic random walk so the fixture is reproducible.
function walk(seed: number, count: number, start: number): Bar[] {
  let state = seed;
  const random = () => {
    state = (state * 1_103_515_245 + 12_345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
  const bars: Bar[] = [];
  let close = 100 + seed;
  for (let i = 0; i < count; i++) {
    const open = close;
    close = open * (1 + 0.012 * (random() * 2 - 1));
    const high = Math.max(open, close) * (1 + 0.006 * random());
    const low = Math.min(open, close) * (1 - 0.006 * random());
    bars.push({ t: start + i * HOUR_MS, o: open, h: high, l: low, c: close, v: 800 + 400 * random(), closed: true });
  }
  return bars;
}

const HOURS = 48;
const PRE = 48;
const SPAN = REPLAY_WARMUP_BARS + PRE + HOURS;
const START = Math.floor(1_795_776_000_000 / HOUR_MS) * HOUR_MS;
const END = START + SPAN * HOUR_MS;
const books = [1, 2, 3].map((seed) => ({ symbol: `T${seed}-USDT`, bars: walk(seed, SPAN, START) }));
const strategies = normalizeStrategies({
  enabledIndications: [...INDICATIONS],
  axis: true,
  block: true,
  dca: true,
  relate: true,
});

test("coverage lists every indication and range with ordered gate counts", () => {
  const report = simulateSessions(books, BOOK, DEFAULT_FLOORS, {
    hours: HOURS,
    preHours: PRE,
    end: END,
    profile: "coordinated",
    strategies,
  });
  const keys = new Set(report.coverage.map((row) => `${row.indication}|${row.range}`));
  for (const indication of INDICATIONS) {
    assert.ok(keys.has(`${indication}|short`), `missing ${indication} short`);
    assert.ok(keys.has(`${indication}|wide`), `missing ${indication} wide`);
  }
  for (const row of report.coverage) {
    assert.ok(row.configs >= 0 && row.excluded >= 0);
    assert.ok(row.withCloses <= row.configs, row.indication);
    assert.ok(row.reachedSamples <= row.withCloses, row.indication);
    assert.ok(row.passed <= row.reachedSamples, row.indication);
    assert.ok(row.selected <= row.passed, row.indication);
    assert.ok(row.bestPf >= 0);
  }
});

test("selections are tallied against the coverage rows that produced them", () => {
  const report = simulateSessions(books, BOOK, DEFAULT_FLOORS, {
    hours: HOURS,
    preHours: PRE,
    end: END,
    profile: "coordinated",
    strategies,
  });
  assert.equal(
    report.coverage.reduce((total, row) => total + row.selected, 0),
    report.selected.length,
  );
  for (const item of report.selected) {
    const row = report.coverage.find(
      (candidate) => candidate.indication === item.indication && candidate.range === item.range,
    );
    assert.ok(row && row.selected > 0, `${item.name} has no coverage row`);
  }
});

test("prehistory signal counts match the engine's own signal function", () => {
  const report = simulateSessions(books, BOOK, DEFAULT_FLOORS, {
    hours: HOURS,
    preHours: PRE,
    end: END,
    profile: "coordinated",
    strategies,
  });
  const replayFrom = REPLAY_WARMUP_BARS + PRE;
  for (const indication of INDICATIONS) {
    let pre = 0;
    let replay = 0;
    for (const book of books) {
      const series = buildSeries(book.bars);
      for (let i = REPLAY_WARMUP_BARS; i < book.bars.length; i++) {
        if (!signalAt(indication, book.bars, series, i)) continue;
        if (i < replayFrom) pre++;
        else replay++;
      }
    }
    const row = report.coverage.find((candidate) => candidate.indication === indication);
    assert.ok(row, indication);
    assert.equal(row.signalsPre, pre, `${indication} prehistory signals`);
    assert.equal(row.signalsReplay, replay, `${indication} holdout signals`);
  }
});

test("reselected replays add up coverage across windows", () => {
  const options = { hours: 2 * 24, preHours: 24, end: END, profile: "coordinated" as const, strategies };
  const single = simulateSessions(books, BOOK, DEFAULT_FLOORS, { ...options, hours: 24, reselectHours: 0 });
  const daily = simulateSessions(books, BOOK, DEFAULT_FLOORS, { ...options, reselectHours: 24 });
  const configsOf = (rows: { configs: number }[]) => rows.reduce((total, row) => total + row.configs, 0);
  assert.equal(configsOf(daily.coverage), 2 * configsOf(single.coverage));
  assert.equal(
    daily.coverage.reduce((total, row) => total + row.selected, 0),
    daily.selected.length,
  );
});
