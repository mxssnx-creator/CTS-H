import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_FLOORS, MAX_MUL, PREFERRED_SYMBOLS } from "./constants.ts";
import { controlOrders, orderStats } from "./coord.ts";
import { healBooks, saneBars } from "./heal.ts";
import { markPositions, mergeFills, simulateSessions, syncBooks, type Bar, type LivePos } from "./process.ts";

function wave(n: number, seed: number): Bar[] {
  const out: Bar[] = [];
  let p = 40 + (seed % 17);
  for (let i = 0; i < n; i++) {
    const o = p;
    const swing = Math.sin((i + seed) / 6) * 0.01 + ((i * 17 + seed) % 5) * 0.001;
    p = Math.max(0.5, p * (1 + swing));
    const c = p;
    out.push({
      t: 1_700_000_000_000 + i * 3_600_000,
      o,
      h: Math.max(o, c) * (1.002 + (i % 3) * 0.001),
      l: Math.min(o, c) * (0.998 - (i % 4) * 0.0005),
      c,
      v: 20 + ((i * seed) % 90),
    });
  }
  return out;
}

function leg(px: number): LivePos {
  return {
    id: "x:stress",
    symbol: "BTC-USDT",
    side: 1,
    qty: 2,
    qtyBase: 1,
    entry: px,
    mark: px,
    peak: px,
    sl: px * 0.9,
    tp: px * 1.2,
    combo: "tp0.48_sl0.75",
    indication: "move",
    hold: 0,
    dca: 0,
    openedAt: 10 * 3_600_000,
    system: "CTS-A",
    connection: "bingx-public",
    type: "position",
  };
}

test("ten books walk twice and stay finite", () => {
  const books = PREFERRED_SYMBOLS.map((symbol, i) => ({ symbol, bars: wave(160, i + 3) }));
  const t0 = Date.now();
  const first = syncBooks([], books, 10_000, DEFAULT_FLOORS);
  const second = syncBooks(first.cells, books, 10_000, DEFAULT_FLOORS);
  const ms = Date.now() - t0;
  assert.equal(first.symbols, PREFERRED_SYMBOLS.length);
  assert.equal(first.cells.length, PREFERRED_SYMBOLS.length * 126 * 8);
  assert.equal(second.closes, 0);
  assert.ok(ms < 12_000, `walk ${ms}ms`);
  for (const c of first.cells) {
    assert.ok(Number.isFinite(c.net));
    assert.ok(Number.isFinite(c.pf));
    assert.ok(c.n >= 0);
    assert.ok(c.lastN.length <= 50);
  }
  const longer = books.map((b) => ({ symbol: b.symbol, bars: [...b.bars, ...wave(8, 9).map((bar, i) => ({ ...bar, t: b.bars.at(-1)!.t + (i + 1) * 3_600_000 }))] }));
  const third = syncBooks(second.cells, longer, 10_000, DEFAULT_FLOORS);
  assert.equal(third.cells.length, first.cells.length);
  assert.ok(third.closes >= 0);
  const tape = mergeFills(first.internFills, third.internFills);
  assert.ok(tape.length <= 240);
  assert.equal(new Set(tape.map((f) => f.id)).size, tape.length);
});

test("garbage bars do not poison the walk or the tape heal", () => {
  const good = wave(40, 1);
  const junk: Bar[] = [
    { t: Number.NaN, o: 1, h: 1, l: 1, c: 1, v: 1 },
    { t: good[0]!.t, o: 0, h: 1, l: 1, c: 1, v: 1 },
    { t: good[10]!.t, o: 10, h: 9, l: 11, c: 10, v: 1 },
    { t: good[5]!.t, o: 10, h: 12, l: 9, c: 11, v: 1 },
    ...good,
  ];
  const healed = healBooks([{ symbol: "BTC-USDT", bars: good, quote: { last: good.at(-1)!.c } }], [{ symbol: "BTC-USDT", bars: junk, quote: { last: 0 } }]);
  assert.ok(healed.books[0]!.bars.length >= 24);
  assert.ok(saneBars(healed.books[0]!.bars).every((b, i, all) => i === 0 || b.t >= all[i - 1]!.t));
  const walked = syncBooks([], [{ symbol: "BTC-USDT", bars: junk }], 10_000, DEFAULT_FLOORS);
  assert.ok(walked.cells.length > 0);
  assert.ok(walked.cells.every((c) => Number.isFinite(c.net) && Number.isFinite(c.pf)));
});

test("quote storm keeps size, stops, and control orders aligned", () => {
  let open = [leg(100)];
  let closed = 0;
  for (let i = 0; i < 400; i++) {
    const drift = 100 + Math.sin(i / 9) * 12 + (i % 17) * 0.05;
    const marked = markPositions(open, { "BTC-USDT": drift }, { trail: true, dca: true, equity: 10_000, asOf: (10 + (i % 30)) * 3_600_000 });
    closed += marked.closed.length;
    for (const p of marked.open) {
      assert.ok(p.qty <= p.qtyBase * MAX_MUL + 1e-8);
      assert.ok(p.qty > 0);
      assert.ok(p.side > 0 ? p.tp > p.sl : p.tp < p.sl);
      assert.ok(Number.isFinite(p.entry) && Number.isFinite(p.sl) && Number.isFinite(p.tp));
    }
    for (const c of marked.closed) {
      assert.ok(Number.isFinite(c.pnl));
      assert.ok(c.px > 0);
      if (c.reason === "sl") assert.equal(c.px, c.pos.sl);
      if (c.reason === "tp") assert.equal(c.px, c.pos.tp);
    }
    const orders = controlOrders(marked.open, { protect: true, connection: "bingx-public" });
    const stats = orderStats(marked.open, orders, { protect: true, connection: "bingx-public" });
    assert.equal(stats.mismatches, 0);
    assert.ok(stats.mul <= MAX_MUL + 1e-8);
    for (const o of orders) {
      assert.equal(o.reduceOnly, true);
      assert.equal(o.side, -1);
      const p = marked.open.find((row) => row.id === o.positionId);
      assert.ok(p);
      assert.equal(o.qty, p!.qty);
      assert.equal(o.px, o.kind === "sl" ? p!.sl : p!.tp);
    }
    open = marked.open;
    if (!open.length) open = [leg(drift)];
  }
  assert.ok(closed > 0);
});

test("a drop through the trail fills the stop instead of chasing price", () => {
  const marked = markPositions([leg(100)], { "BTC-USDT": 97 }, { trail: true, dca: false, equity: 10_000, asOf: 0 });
  assert.equal(marked.closed[0]?.reason, "sl");
  assert.ok(Math.abs((marked.closed[0]?.px ?? 0) - 98.5) < 1e-9);
});

test("replay of ten books stays finite on every range", () => {
  const books = PREFERRED_SYMBOLS.map((symbol, i) => ({ symbol, bars: wave(140, i + 1) }));
  const t0 = Date.now();
  for (const hours of [12, 24, 48] as const) {
    const report = simulateSessions(books, 10_000, DEFAULT_FLOORS, { hours, size: "both" });
    assert.equal(report.ready, true, report.note);
    assert.equal(report.pre.length, hours);
    assert.equal(report.live.length, hours);
    for (const row of [...report.bookPre, ...report.bookLive, ...report.pre, ...report.live]) {
      assert.ok(Number.isFinite(row.net));
      assert.ok(Number.isFinite(row.realized));
      assert.ok(Number.isFinite(row.mtm));
    }
  }
  assert.ok(Date.now() - t0 < 20_000);
});
