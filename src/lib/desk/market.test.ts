import assert from "node:assert/strict";
import test from "node:test";
import { Bingx } from "./bingx.server.ts";
import { REPLAY_SYMBOLS } from "./constants.ts";
import { loadQuoteSnapshot } from "./market.server.ts";

test("quote snapshots include all 60 markets and flag an individually stale quote", async (t) => {
  const original = Bingx.prototype.publicGet;
  t.after(() => { Bingx.prototype.publicGet = original; });
  const now = Date.now();
  Bingx.prototype.publicGet = (async (path: string) => {
    if (path.endsWith("/ticker"))
      return REPLAY_SYMBOLS.map((symbol, index) => ({ symbol, lastPrice: "100", closeTime: now - (index === 59 ? 30_000 : 0) }));
    if (path.endsWith("/depth")) return { bids: [["99", "1"]], asks: [["101", "1"]] };
    if (path.endsWith("/premiumIndex")) return { lastFundingRate: "0.0001" };
    throw new Error(`Unexpected endpoint ${path}`);
  }) as typeof original;
  const snapshot = await loadQuoteSnapshot("bingx-public", "BTC-USDT");
  assert.equal(snapshot.books.length, 60);
  assert.deepEqual(snapshot.books.map((book) => book.symbol), REPLAY_SYMBOLS);
  assert.deepEqual(snapshot.unavailable, [REPLAY_SYMBOLS[59]]);
  assert.equal(snapshot.stale, false);
  assert.deepEqual(snapshot.books[0]?.depth.bids, [[99, 1]]);
});
