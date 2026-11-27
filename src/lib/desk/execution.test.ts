import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Bingx } from "./bingx.server.ts";
import { requireConnection } from "./connections.ts";
import { approve, propose, reconcile, send, signOff } from "./execution.server.ts";
import { Journal } from "./journal.server.ts";

const LIMITS = { maxNotional: 150, riskFraction: 0.005, entryBps: 10, exitBps: 20 };
const NOW = Date.now();
const SYMBOL = "ETH-USDT";
const ORDER_ID = "1945935713755381761";

function venue(opts: { hedge?: boolean; failSubmit?: boolean } = {}) {
  const hedge = opts.hedge ?? true;
  const orders = new Map<string, Record<string, unknown>>();
  const writes: URL[] = [];
  const positions: Record<string, unknown>[] = [];
  const controls: Record<string, unknown>[] = [];
  const transport: typeof fetch = async (url, init) => {
    const dest = new URL(String(url));
    assert.equal(dest.origin, "https://open-api-vst.bingx.com");
    const p = dest.searchParams;
    const result = (data: unknown) =>
      new Response(JSON.stringify({ code: 0, data }), { status: 200 });
    const headers = new Headers(init?.headers);
    if (!dest.pathname.includes("/quote/")) {
      assert.equal(headers.get("X-BX-APIKEY"), "test-key");
      const payload = [...p.entries()]
        .filter(([key]) => key !== "signature")
        .map(([k, v]) => `${k}=${v}`)
        .join("&");
      assert.equal(
        p.get("signature"),
        createHmac("sha256", "test-secret").update(payload).digest("hex"),
      );
    } else assert.equal(headers.get("X-BX-APIKEY"), null);
    switch (dest.pathname) {
      case "/openApi/swap/v2/quote/contracts":
        return result([
          {
            symbol: SYMBOL,
            status: 1,
            pricePrecision: 2,
            quantityPrecision: 2,
            tradeMinQuantity: 0.01,
            tradeMinUSDT: 2,
            takerFeeRate: 0.0005,
          },
        ]);
      case "/openApi/swap/v2/quote/ticker":
        return result({
          symbol: SYMBOL,
          lastPrice: "100",
          bidPrice: "99.98",
          askPrice: "100.02",
          closeTime: NOW,
        });
      case "/openApi/swap/v3/user/balance":
        return result([{ asset: "VST", availableMargin: "1000", equity: "1000" }]);
      case "/openApi/swap/v1/positionSide/dual":
        return result({ dualSidePosition: hedge });
      case "/openApi/swap/v2/trade/openOrders":
        return result({ orders: controls });
      case "/openApi/swap/v2/user/positions":
        return result(positions);
      case "/openApi/swap/v2/trade/order/test":
        assert.equal(init?.method, "POST");
        return result({});
      case "/openApi/swap/v2/trade/order":
        if (init?.method === "POST") {
          writes.push(dest);
          orders.set(p.get("clientOrderId")!, {
            clientOrderID: p.get("clientOrderId"),
            symbol: SYMBOL,
            side: p.get("side"),
            positionSide: p.get("positionSide"),
            status: "PARTIALLYFILLED",
            executedQty: "0.01",
            avgPrice: "100",
          });
          if (opts.failSubmit) throw new Error("disconnected");
          return result({});
        }
        const queried = JSON.stringify({
          code: 0,
          data: { order: { orderId: ORDER_ID, ...orders.get(p.get("clientOrderId")!) } },
        });
        return new Response(queried.replace(`"${ORDER_ID}"`, ORDER_ID));
      default:
        assert.fail(`Unexpected path ${dest.pathname}`);
    }
  };
  return {
    client: new Bingx(
      requireConnection("bingx-x02"),
      { key: "test-key", secret: "test-secret" },
      transport,
      () => NOW,
    ),
    writes,
    orders,
    positions,
    controls,
  };
}

function setup(t: { after: (fn: () => void) => void }) {
  const dir = mkdtempSync(join(tmpdir(), "cts-h-test-"));
  const journal = new Journal(dir);
  t.after(() => {
    journal.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return journal;
}

function opening(journal: Journal) {
  return propose(
    journal,
    "bingx-x02",
    SYMBOL,
    { side: "long", quantity: 0.03, stop: 95, target: 111 },
    "Test evidence",
  );
}

test("risk, exact approval and a persistent claim permit one send across concurrent calls", async (t) => {
  const journal = setup(t);
  const { client, writes, orders, positions, controls } = venue();
  const ticket = opening(journal);
  await signOff(journal, client, ticket.id, LIMITS);
  assert.throws(() => approve(journal, ticket.id, "other"), /exact/);
  approve(journal, ticket.id, ticket.id, NOW);
  await assert.rejects(send(journal, client, ticket.id, ticket.id, LIMITS, []), /disabled/);
  await send(journal, client, ticket.id, ticket.id, LIMITS, [], true);
  assert.equal(journal.get(ticket.id).phase, "approved");
  const outcomes = await Promise.allSettled(
    [1, 2].map(() => send(journal, client, ticket.id, ticket.id, LIMITS, ["bingx-x02"])),
  );
  assert.equal(outcomes.filter((row) => row.status === "fulfilled").length, 1);
  assert.equal(writes.length, 1);
  const sent = writes[0]!.searchParams;
  assert.equal(sent.get("timeInForce"), "IOC");
  assert.equal(JSON.parse(sent.get("stopLoss")!).stopPrice, 95);
  assert.equal(JSON.parse(sent.get("takeProfit")!).stopPrice, 111);
  assert.equal(sent.get("reduceOnly"), null);
  const partial = await reconcile(journal, client, ticket.id);
  assert.equal(partial.phase, "reconcile");
  assert.equal(partial.venue?.orderId, ORDER_ID);
  orders.get(ticket.id)!.status = "CANCELLED";
  positions.push({ symbol: SYMBOL, positionSide: "LONG", positionAmt: "0.01", positionId: "83" });
  controls.push(
    {
      symbol: SYMBOL,
      positionSide: "LONG",
      origQty: "0.01",
      type: "STOP_MARKET",
      side: "SELL",
      stopPrice: "95",
      workingType: "CONTRACT_PRICE",
      orderID: "84",
    },
    {
      symbol: SYMBOL,
      positionSide: "LONG",
      origQty: "0.01",
      type: "TAKE_PROFIT_MARKET",
      side: "SELL",
      stopPrice: "111",
      workingType: "CONTRACT_PRICE",
      orderID: "85",
    },
  );
  assert.equal((await reconcile(journal, client, ticket.id)).phase, "open");
  const close = propose(
    journal,
    "bingx-x02",
    SYMBOL,
    { ...ticket.bracket, quantity: 0.01 },
    "Close the filled quantity",
    ticket.id,
  );
  await signOff(journal, client, close.id, LIMITS);
  approve(journal, close.id, close.id, NOW);
  await send(journal, client, close.id, close.id, LIMITS, ["bingx-x02"]);
  assert.equal(writes[1]?.searchParams.get("positionId"), "83");
  assert.equal(writes[1]?.searchParams.get("side"), "SELL");
  assert.equal(writes[1]?.searchParams.get("stopLoss"), null);
  orders.get(close.id)!.status = "FILLED";
  positions.length = controls.length = 0;
  assert.equal((await reconcile(journal, client, close.id)).phase, "closed");
  assert.equal(journal.get(ticket.id).phase, "closed");
  assert.ok(journal.history(ticket.id).events.length >= 6);
});

test("a lost acknowledgement leaves an uncertain ticket and never repeats the write", async (t) => {
  const journal = setup(t);
  const { client, writes, orders } = venue({ failSubmit: true });
  const ticket = opening(journal);
  await signOff(journal, client, ticket.id, LIMITS);
  approve(journal, ticket.id, ticket.id, NOW);
  const outcome = await send(journal, client, ticket.id, ticket.id, LIMITS, ["bingx-x02"]);
  assert.ok("phase" in outcome && outcome.phase === "uncertain");
  await assert.rejects(send(journal, client, ticket.id, ticket.id, LIMITS, ["bingx-x02"]));
  const second = opening(journal);
  await signOff(journal, client, second.id, LIMITS);
  approve(journal, second.id, second.id, NOW);
  await assert.rejects(
    send(journal, client, second.id, second.id, LIMITS, ["bingx-x02"]),
    /Resolve the outstanding/,
  );
  orders.get(ticket.id)!.executedQty = "0";
  orders.get(ticket.id)!.status = "CANCELLED";
  assert.equal((await reconcile(journal, client, ticket.id)).phase, "no-fill");
  assert.equal(writes.length, 1);
});

test("risk rejects a foreign position and the wrong venue", async (t) => {
  const journal = setup(t);
  const { client, positions, writes } = venue();
  const ticket = opening(journal);
  positions.push({ symbol: SYMBOL, positionSide: "SHORT", positionAmt: "2", positionId: "79" });
  await assert.rejects(signOff(journal, client, ticket.id, LIMITS), /occupies/);
  await assert.rejects(
    signOff(journal, new Bingx(requireConnection("bingx-x01")), ticket.id, LIMITS),
    /match/,
  );
  assert.equal(writes.length, 0);
});
