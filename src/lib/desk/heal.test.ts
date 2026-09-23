import assert from "node:assert/strict";
import test from "node:test";
import { healBooks, noteHealth, saneBars, EMPTY_HEALTH } from "./heal.ts";
import type { Bar } from "./process.ts";

function bar(t: number, c: number): Bar {
  return { t, o: c, h: c + 1, l: c - 1, c, v: 1 };
}

function book(symbol: string, bars: Bar[], last = bars.at(-1)?.c ?? 0) {
  return { symbol, bars, quote: { last } };
}

test("bad bars are dropped and a gap is filled from the last good book", () => {
  const prev = [book("BTC-USDT", [bar(1, 100), bar(2, 101)]), book("ETH-USDT", [bar(1, 10), bar(2, 11)])];
  const next = [book("BTC-USDT", [{ t: 3, o: 0, h: 1, l: 2, c: -1, v: 1 }]), book("SOL-USDT", [bar(3, 4)])];
  const healed = healBooks(prev, next);
  const symbols = healed.books.map((b) => b.symbol).sort();
  assert.deepEqual(symbols, ["BTC-USDT", "ETH-USDT", "SOL-USDT"]);
  assert.equal(healed.books.find((b) => b.symbol === "BTC-USDT")?.bars.at(-1)?.c, 101);
  assert.ok(healed.notes.some((n) => n.startsWith("kept BTC")));
  assert.ok(healed.notes.some((n) => n.startsWith("restored ETH")));
});

test("a rewound series does not replace a longer book", () => {
  const prev = [book("BTC-USDT", [bar(1, 10), bar(2, 11), bar(3, 12), bar(4, 13), bar(5, 14), bar(6, 15), bar(7, 16)])];
  const next = [book("BTC-USDT", [bar(1, 10)])];
  const healed = healBooks(prev, next);
  assert.equal(healed.books[0]?.bars.length, 7);
  assert.equal(healed.notes[0], "rewound BTC-USDT");
});

test("a clean cycle counts as ok and a repair counts as healed", () => {
  assert.equal(saneBars([bar(2, 5), bar(1, 4), bar(2, 6)]).length, 1);
  const ok = noteHealth(EMPTY_HEALTH, []);
  assert.equal(ok.ok, 1);
  assert.equal(ok.lastNote, "cycle ok");
  const healed = noteHealth(ok, ["kept BTC-USDT"]);
  assert.equal(healed.healed, 1);
  assert.equal(healed.cycles, 2);
  assert.equal(healed.ok, 1);
});
