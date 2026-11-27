import assert from "node:assert/strict";
import test from "node:test";
import { MAX_LIVE_LEGS } from "./constants.ts";
import type { LivePos } from "./process.ts";
import { useDesk } from "./store.ts";

function book(px: number) {
  const bars = [];
  for (let i = 0; i < 8; i++) {
    bars.push({
      t: 1_700_000_000_000 + i * 3_600_000,
      o: px,
      h: px * 1.01,
      l: px * 0.99,
      c: px,
      v: 10,
    });
  }
  return {
    symbol: "BTC-USDT",
    bars,
    quote: {
      symbol: "BTC-USDT",
      last: px,
      changePct: 0,
      quoteVolume: 1,
      high: px,
      low: px,
      bid: px,
      ask: px,
    },
    funding: null,
    depth: { bids: [] as [number, number][], asks: [] as [number, number][] },
  };
}

function pos(over: Partial<LivePos> = {}): LivePos {
  return {
    id: "x:audit",
    symbol: "BTC-USDT",
    side: 1,
    qty: 1,
    qtyBase: 1,
    entry: 100,
    mark: 100,
    peak: 100,
    sl: 99,
    tp: 110,
    combo: "tp0.48_sl0.75",
    indication: "move",
    hold: 0,
    dca: 0,
    openedAt: Date.now(),
    system: "CTS-H",
    connection: "bingx-public",
    type: "position",
    ...over,
  };
}

test("denying new entries still fills a resting stop", () => {
  const allow = { ...useDesk.getState().allow, live_paper_execute: false, intern_arm: false };
  useDesk.setState({
    allow,
    positions: [pos()],
    orders: [],
    liveFills: [],
    closedNet: 0,
    books: [book(100)],
    connection: "bingx-public",
    phase: "performing",
    cells: [],
    barSig: "held",
  });
  useDesk.getState().ingest([book(97)], Date.now());
  const s = useDesk.getState();
  assert.equal(s.positions.length, 0);
  assert.equal(s.liveFills[0]?.px, 97);
});

test("protect off drops in-scope control orders immediately", () => {
  useDesk.setState({
    positions: [pos({ sl: 90, tp: 110 })],
    connection: "bingx-public",
    orders: [],
  });
  useDesk.getState().toggleAllow("protect_grid");
  const off = useDesk.getState();
  if (off.allow.protect_grid) useDesk.getState().toggleAllow("protect_grid");
  assert.equal(useDesk.getState().orders.length, 0);
  useDesk.getState().toggleAllow("protect_grid");
  assert.equal(useDesk.getState().orders.length, 2);
});

test("manual entry stops at the live cap and does not drop an open leg", () => {
  const allow = { ...useDesk.getState().allow, live_paper_execute: true };
  const positions = Array.from({ length: MAX_LIVE_LEGS }, (_, i) =>
    pos({ id: `x:${i}`, indication: "move", symbol: i % 2 ? "ETH-USDT" : "BTC-USDT" }),
  );
  useDesk.setState({
    allow,
    positions,
    books: [book(100)],
    phase: "performing",
    connection: "bingx-public",
  });
  useDesk.getState().manual(1);
  assert.equal(useDesk.getState().positions.length, MAX_LIVE_LEGS);
  assert.ok(useDesk.getState().events[0]?.msg.includes("live cap"));
});

test("switching BingX connections keeps paper positions and net scoped", () => {
  const saved = useDesk.getState();
  try {
    useDesk.setState({
      connection: "bingx-public",
      inactive: {},
      books: [book(100)],
      positions: [pos()],
      closedNet: 4,
      allow: { ...saved.allow, connect_exchange: true },
    });
    useDesk.getState().setConnection("bingx-x02");
    assert.equal(useDesk.getState().positions.length, 0);
    assert.equal(useDesk.getState().closedNet, 0);
    assert.equal(useDesk.getState().books.length, 0);
    useDesk.getState().setConnection("bingx-public");
    assert.equal(useDesk.getState().positions[0]?.id, "x:audit");
    assert.equal(useDesk.getState().status, "loading");
    assert.equal(useDesk.getState().closedNet, 4);
  } finally {
    useDesk.setState(saved);
  }
});

test("an unavailable or restored quote does not execute an owned paper stop", () => {
  useDesk.setState({
    allow: { ...useDesk.getState().allow, live_paper_execute: false, intern_arm: false },
    positions: [pos()],
    books: [book(100)],
    connection: "bingx-public",
    phase: "performing",
  });
  useDesk.getState().ingest([book(97)], Date.now(), { unavailable: ["BTC-USDT"] });
  assert.equal(useDesk.getState().positions.length, 1);
  assert.equal(useDesk.getState().positions[0]?.mark, 100);
});
