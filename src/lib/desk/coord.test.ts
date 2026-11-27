import assert from "node:assert/strict";
import test from "node:test";
import { canAffect, controlOrders, coordHit, orderStats, owns, partition, positionScope, workingOrders, type Tracked } from "./coord.ts";
import type { LivePos } from "./process.ts";

function row(partial: Partial<Tracked> & Pick<Tracked, "id" | "system" | "connection" | "type">): Tracked {
  return partial;
}

test("exchange affect keeps only the active system, connection, and type", () => {
  const scope = positionScope("bingx-public");
  const rows = [
    row({ id: "a", system: "CTS-H", connection: "bingx-public", type: "position" }),
    row({ id: "b", system: "OTHER", connection: "bingx-public", type: "position" }),
    row({ id: "c", system: "CTS-H", connection: "bingx-x01", type: "position" }),
    row({ id: "d", system: "CTS-H", connection: "bingx-public", type: "order" }),
    row({ id: "e", system: "CTS-H", connection: "bingx-public", type: "intern" }),
  ];
  const { owned, skipped } = partition(rows, scope);
  assert.deepEqual(owned.map((r) => r.id), ["a"]);
  assert.deepEqual(skipped.map((r) => r.id), ["b", "c", "d", "e"]);
  assert.equal(owns(rows[0]!, scope), true);
  assert.equal(owns(rows[3]!, scope), false);
});

test("only registered connections can affect their paper book", () => {
  assert.equal(canAffect("bingx-public"), true);
  assert.equal(canAffect("bingx-x02"), true);
  assert.equal(canAffect("bingx-vst-02"), true);
  assert.equal(canAffect("bingx-x01"), true);
  assert.equal(canAffect("other-exchange"), false);
  const hit = coordHit("flatten", positionScope("bingx-x01"), 0, 2, "no order route");
  assert.equal(hit.kept, 0);
  assert.equal(hit.skipped, 2);
  assert.equal(hit.type, "position");
});

test("protect orders inherit the position system and connection", () => {
  const pos = {
    id: "x:1",
    symbol: "BTC-USDT",
    side: 1,
    qty: 1,
    qtyBase: 1,
    entry: 100,
    mark: 100,
    peak: 100,
    sl: 90,
    tp: 110,
    combo: "tp0.48_sl0.75",
    indication: "move",
    hold: 0,
    dca: 0,
    openedAt: 1,
    system: "CTS-H",
    connection: "bingx-public",
    type: "position",
  } satisfies LivePos;
  const orders = workingOrders([pos]);
  assert.equal(orders.length, 2);
  assert.equal(orders[0]?.type, "order");
  assert.equal(orders[0]?.side, -1);
  assert.equal(orders[0]?.reduceOnly, true);
  assert.equal(orders[0]?.qty, 1);
  assert.equal(orders[0]?.px, 90);
  assert.equal(orders[1]?.px, 110);
  assert.equal(orders[0]?.connection, "bingx-public");
  assert.equal(orders[0]?.system, "CTS-H");
  assert.equal(orders[1]?.kind, "tp");
  const off = controlOrders([pos, { ...pos, id: "x:2", connection: "bingx-x01" }], { protect: false, connection: "bingx-public" });
  assert.deepEqual(off.map((o) => o.positionId), ["x:2", "x:2"]);
  const stats = orderStats([pos], orders, { protect: true, connection: "bingx-public" });
  assert.equal(stats.mismatches, 0);
  assert.equal(stats.mul, 1);
  const drifted = orderStats([pos], orders.map((o) => ({ ...o, qty: o.qty * 2 })), { protect: true, connection: "bingx-public" });
  assert.equal(drifted.mismatches, 1);
});
