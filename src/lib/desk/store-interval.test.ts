import assert from "node:assert/strict";
import test from "node:test";
import { BOOK } from "./constants.ts";
import { SYSTEM_ID } from "./coord.ts";
import { normalizeStrategies } from "./strategies.ts";
import { mergeSnapshots } from "./snapshot.ts";
import { useDesk, type SnapBook } from "./store.ts";
import { barSignature, type Cell, type LivePos } from "./process.ts";

function book(interval: number): SnapBook {
  const now = Date.now();
  const end = Math.floor(now / interval) * interval;
  const bars = Array.from({ length: 48 }, (_, index) => {
    const c = 100 + index * 0.04;
    return { t: end - (48 - index) * interval, o: c - 0.04, h: c + 0.1,
      l: c - 0.1, c, v: 200, closed: true };
  });
  return {
    symbol: "BTC-USDT", bars,
    quote: { symbol: "BTC-USDT", last: 100, changePct: 0, quoteVolume: 1,
      high: 101, low: 99, bid: 99.9, ask: 100.1, exchangeTime: now },
    funding: null, depth: { bids: [], asks: [] },
  };
}

test("timeframe changes retain owned positions and restore interval settings", (t) => {
  const original = useDesk.getState();
  t.after(() => useDesk.setState(original, true));
  const pos: LivePos = {
    id: "owned", symbol: "BTC-USDT", side: 1, qty: 1, qtyBase: 1,
    entry: 100, mark: 100, peak: 100, sl: 90, tp: 110, combo: "manual",
    indication: "manual", interval: "1h", maxHoldBars: 24, hold: 0, dca: 0,
    openedAt: Date.now(), system: SYSTEM_ID, connection: "bingx-public", type: "position",
  };
  const hourly = book(3_600_000);
  useDesk.setState({
    strategies: normalizeStrategies({ interval: "1h", volumeFactor: 1.5 }),
    intervalProfiles: {}, books: [hourly], bookInterval: "1h", positions: [pos],
    cells: [], internFills: [], barSig: "", phase: "intern-pre",
    status: "live", closedNet: 0, peak: BOOK, unavailable: [],
  });
  useDesk.getState().setStrategies({ interval: "15m" });
  assert.equal(useDesk.getState().bookInterval, "1h");
  assert.equal(useDesk.getState().positions[0]?.id, "owned");
  assert.deepEqual(useDesk.getState().strategies.enabledIndications, ["macd"]);
  assert.equal(useDesk.getState().strategies.microReselectHours, 24);
  useDesk.getState().manual(-1);
  assert.equal(useDesk.getState().positions.length, 1);
  assert.match(useDesk.getState().events[0]?.msg ?? "", /selected interval/);
  useDesk.getState().ingest([hourly], Date.now());
  assert.equal(useDesk.getState().cells.length, 0);
  const quarterHour = book(900_000);
  useDesk.getState().ingest([quarterHour], Date.now(), { resetHistory: true });
  assert.equal(useDesk.getState().bookInterval, "15m");
  assert.ok(useDesk.getState().cells.length > 0);
  assert.ok(useDesk.getState().cells.every((cell) => cell.id.startsWith("15m|")));
  assert.equal(useDesk.getState().positions[0]?.id, "owned");
  useDesk.getState().setStrategies({ microTargetCosts: 2.2 });
  useDesk.getState().setStrategies({ interval: "1h" });
  assert.equal(useDesk.getState().strategies.volumeFactor, 1.5);
  assert.deepEqual(useDesk.getState().strategies.enabledIndications, ["break", "ema", "rangeFade"]);
  useDesk.getState().setStrategies({ interval: "15m" });
  assert.equal(useDesk.getState().strategies.microTargetCosts, 2.2);
});

test("retired markets continue receiving quotes without being scored on old candles", (t) => {
  const original = useDesk.getState();
  t.after(() => useDesk.setState(original, true));
  const btc = { ...book(900_000), candleInterval: "15m" as const };
  const old = book(3_600_000);
  const near: SnapBook = { ...old, symbol: "NEAR-USDT", candleInterval: "1h",
    quote: { ...old.quote, symbol: "NEAR-USDT", last: 101 } };
  const pos: LivePos = {
    id: "retained", symbol: "NEAR-USDT", side: 1, qty: 1, qtyBase: 1,
    entry: 100, mark: 100, peak: 100, sl: 90, tp: 110, combo: "manual",
    indication: "manual", interval: "1h", maxHoldBars: 24, hold: 0, dca: 0,
    openedAt: Date.now(), system: SYSTEM_ID, connection: "bingx-public", type: "position",
  };
  useDesk.setState({
    strategies: normalizeStrategies({ interval: "15m", marketCount: 1 }),
    books: [btc, near], bookInterval: "15m", positions: [pos], cells: [],
    barSig: "", status: "live", phase: "intern-pre", unavailable: [],
  });
  const held = new Set(["NEAR-USDT"]);
  const snap = mergeSnapshots([btc, near], [btc], true, false, held);
  assert.equal(snap.length, 2);
  useDesk.getState().ingest(snap, Date.now());
  assert.equal(useDesk.getState().positions[0]?.mark, 101);
  assert.ok(useDesk.getState().cells.every((cell) => cell.symbol === "BTC-USDT"));
  const updated: SnapBook = { ...near, bars: [], quote: { ...near.quote, last: 103, exchangeTime: Date.now() + 1 } };
  const next = mergeSnapshots(useDesk.getState().books, [btc, updated], false, false, held);
  useDesk.getState().ingest(next, Date.now() + 1);
  assert.equal(useDesk.getState().positions[0]?.mark, 103);
  assert.ok(useDesk.getState().cells.every((cell) => cell.symbol === "BTC-USDT"));
  useDesk.setState({ strategies: normalizeStrategies({ interval: "15m", marketCount: 16 }),
    barSig: "", cells: [] });
  useDesk.getState().ingest(next, Date.now() + 2);
  assert.ok(useDesk.getState().cells.length > 0);
  assert.ok(useDesk.getState().cells.every((cell) => cell.symbol === "BTC-USDT"));
});

test("market count is bounded by the interval's candle rate", () => {
  assert.equal(normalizeStrategies({ interval: "1m", marketCount: 60 }).marketCount, 32);
  assert.equal(normalizeStrategies({ interval: "5m", marketCount: 60 }).marketCount, 60);
  assert.equal(normalizeStrategies({ interval: "15m", marketCount: 0 }).marketCount, 1);
});

test("an empty indication set remains in preparation instead of reporting performing", (t) => {
  const original = useDesk.getState();
  t.after(() => useDesk.setState(original, true));
  const source = book(300_000);
  useDesk.setState({
    connection: "bingx-public", strategies: normalizeStrategies({ interval: "5m", marketCount: 1,
      enabledIndications: [] }), bookInterval: "5m", books: [source], positions: [],
    cells: [], barSig: "", allow: { ...original.allow, intern_arm: true, intern_all_pre: true,
      promote_real: true }, phase: "intern-pre", unavailable: [],
  });
  useDesk.getState().ingest([source], Date.now());
  assert.equal(useDesk.getState().cells.length, 0);
  assert.equal(useDesk.getState().phase, "intern-pre");
});

test("stale closed candles cannot open a paper entry even with a fresh quote", (t) => {
  const original = useDesk.getState();
  t.after(() => useDesk.setState(original, true));
  const hour = 3_600_000;
  const now = Math.floor(Date.now() / hour) * hour + 10_000;
  const source = book(hour);
  const fresh: SnapBook = { ...source, quote: { ...source.quote, exchangeTime: now } };
  const stale = { ...fresh, bars: fresh.bars.map((bar) => ({ ...bar, t: bar.t - 2 * hour })) };
  const candidate = (cursorT: number): Cell => ({
    id: "BTC-USDT|move|test", symbol: "BTC-USDT", indication: "move", tpAtr: 1,
    slOfTp: 1, liveFloor: true, coordination: "fixed", n: 8, wins: 8,
    gw: 8, gl: 1, net: 7, pf: 8, validExec: true, disabled: false,
    lastN: [1, 1, 1, 1, 1, 1, 1, 1], cursorT, side: 1, signal: 1, leg: null,
  });
  useDesk.setState({
    connection: "bingx-public", strategies: normalizeStrategies({ interval: "1h", marketCount: 1 }),
    bookInterval: "1h", books: [stale], positions: [], orders: [],
    cells: [candidate(stale.bars.at(-1)!.t)], barSig: barSignature([stale]),
    allow: { ...original.allow, promote_real: true, live_paper_execute: true },
    toggles: { ...original.toggles, autoEntries: true, normal: true },
    phase: "performing", status: "live", unavailable: [], lastEntries: {},
  });
  useDesk.getState().ingest([stale], now);
  assert.equal(useDesk.getState().positions.length, 0);
  useDesk.setState({ books: [fresh], cells: [candidate(fresh.bars.at(-1)!.t)],
    barSig: barSignature([fresh]), lastEntries: {} });
  useDesk.getState().ingest([fresh], now);
  assert.equal(useDesk.getState().positions.length, 1);
});

test("manual paper entries require a current candle and ignore foreign positions in the cap", (t) => {
  const original = useDesk.getState();
  t.after(() => useDesk.setState(original, true));
  const hour = 3_600_000;
  const fresh = book(hour);
  const expected = Math.floor((Date.now() - 3_000) / hour) * hour - hour;
  const shift = expected - fresh.bars.at(-1)!.t;
  fresh.bars = fresh.bars.map((bar) => ({ ...bar, t: bar.t + shift }));
  const stale = { ...fresh, bars: fresh.bars.map((bar) => ({ ...bar, t: bar.t - hour })) };
  const foreign: LivePos = { id: "foreign", symbol: "BTC-USDT", side: 1, qty: 1,
    qtyBase: 1, entry: 100, mark: 100, peak: 100, sl: 90, tp: 110, combo: "external",
    indication: "manual", hold: 0, dca: 0, openedAt: Date.now(), system: "other",
    connection: "bingx-public", type: "position" };
  useDesk.setState({
    connection: "bingx-public", focus: "BTC-USDT", books: [stale], bookInterval: "1h",
    strategies: normalizeStrategies({ interval: "1h", marketCount: 1, maxPaperPositions: 1 }),
    positions: [foreign], status: "live", phase: "intern-pre", unavailable: [],
    allow: { ...original.allow, live_paper_execute: true },
  });
  useDesk.getState().manual(1);
  assert.equal(useDesk.getState().positions.length, 1);
  assert.match(useDesk.getState().events[0]?.msg ?? "", /fresh closed candle/);
  useDesk.setState({ books: [fresh] });
  useDesk.getState().manual(1);
  assert.equal(useDesk.getState().positions.length, 2);
  assert.equal(useDesk.getState().positions[1]?.system, SYSTEM_ID);
});
