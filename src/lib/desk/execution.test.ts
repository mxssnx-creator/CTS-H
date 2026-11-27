import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Bingx } from "./bingx.server.ts";
import { requireConnection } from "./connections.ts";
import {
  approve,
  clearFlatControls,
  ownedPortfolio,
  planClose,
  protect,
  propose,
  reconcile,
  send,
  sendBatch,
  signOff,
} from "./execution.server.ts";
import { Journal } from "./journal.server.ts";

const LIMITS = { maxNotional: 150, riskFraction: 0.005, entryBps: 10, exitBps: 20 };
const NOW = Date.now();
const SYMBOL = "ETH-USDT";
const ORDER_ID = "1945935713755381761";

function venue(opts: { hedge?: boolean; failSubmit?: boolean; failReplace?: boolean } = {}) {
  const hedge = opts.hedge ?? true;
  const orders = new Map<string, Record<string, unknown>>();
  const writes: URL[] = [];
  const positions: Record<string, unknown>[] = [];
  const controls: Record<string, unknown>[] = [];
  const controlHistory = new Map<string, Record<string, unknown>>();
  const batches: Record<string, unknown>[][] = [];
  const controlWrites: { method: string; params: URLSearchParams }[] = [];
  let nextControl = 9007199254741010n;
  const transport: typeof fetch = async (url, init) => {
    const dest = new URL(String(url));
    assert.equal(dest.origin, "https://open-api-vst.bingx.com");
    const p = dest.searchParams;
    const symbol = p.get("symbol") ?? SYMBOL;
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
            symbol,
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
          symbol,
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
        return result({
          orders: p.has("symbol") ? controls.filter((row) => row.symbol === symbol) : controls,
        });
      case "/openApi/swap/v2/user/positions":
        return result(
          p.has("symbol") ? positions.filter((row) => row.symbol === symbol) : positions,
        );
      case "/openApi/swap/v2/trade/order/test":
        assert.equal(init?.method, "POST");
        return result({});
      case "/openApi/swap/v2/trade/batchOrders": {
        assert.equal(init?.method, "POST");
        const batch = JSON.parse(p.get("batchOrders")!) as Record<string, unknown>[];
        batches.push(batch);
        return result({
          orders: [{ clientOrderID: batch[0]!.clientOrderId }],
          errors: [{ code: 110400 }],
        });
      }
      case "/openApi/swap/v1/trade/cancelReplace": {
        controlWrites.push({ method: init!.method!, params: p });
        const old = p.get("cancelOrderId");
        assert.equal(p.get("cancelReplaceMode"), "STOP_ON_FAILURE");
        const original = controls.findIndex((row) => row.orderID === old);
        assert.ok(original >= 0);
        const newId = String(nextControl++);
        controls[original] = {
          ...Object.fromEntries(p),
          orderID: newId,
          origQty: p.get("quantity"),
          time: NOW,
        };
        if (opts.failReplace) throw new Error("Lost replacement acknowledgement");
        return new Response(
          `{"code":0,"data":{"cancelResult":"SUCCESS","newOrderResult":"SUCCESS","newOrderId":${newId}}}`,
        );
      }
      case "/openApi/swap/v2/trade/order":
        if (init?.method === "DELETE") {
          controlWrites.push({ method: "DELETE", params: p });
          const index = controls.findIndex((row) => row.orderID === p.get("orderId"));
          assert.ok(index >= 0);
          const [row] = controls.splice(index, 1);
          controlHistory.set(String(row?.orderID), { ...row, status: "CANCELLED", executedQty: 0 });
          return result(row);
        }
        if (init?.method === "POST") {
          if (!p.has("clientOrderId")) {
            controlWrites.push({ method: "POST", params: p });
            const row = {
              ...Object.fromEntries(p),
              orderID: String(nextControl++),
              origQty: p.get("quantity"),
              time: NOW,
            };
            controls.push(row);
            return result({ order: row });
          }
          writes.push(dest);
          orders.set(p.get("clientOrderId")!, {
            clientOrderID: p.get("clientOrderId"),
            symbol,
            side: p.get("side"),
            positionSide: p.get("positionSide"),
            status: "PARTIALLYFILLED",
            executedQty: "0.01",
            avgPrice: "100",
          });
          if (opts.failSubmit) throw new Error("disconnected");
          return result({});
        }
        if (p.has("orderId")) {
          const row =
            controlHistory.get(p.get("orderId")!) ??
            controls.find((order) => order.orderID === p.get("orderId"));
          return row ? result({ order: row }) : new Response('{"code":109421}', { status: 200 });
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
    controlHistory,
    controlWrites,
    batches,
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

test("batch uses one signed request and persists per-ticket acknowledgements without resending", async (t) => {
  const journal = setup(t);
  const { client, batches } = venue();
  const tickets = [
    opening(journal),
    propose(
      journal,
      "bingx-x02",
      "BTC-USDT",
      { side: "long", quantity: 0.03, stop: 95, target: 111 },
      "Second symbol",
    ),
  ];
  for (const ticket of tickets) {
    await signOff(journal, client, ticket.id, LIMITS);
    approve(journal, ticket.id, ticket.id, NOW);
  }
  const ids = tickets.map(({ id }) => id);
  await assert.rejects(sendBatch(journal, client, ids, ids[0]!, LIMITS, ["bingx-x02"]), /exact/);
  const result = await sendBatch(journal, client, ids, ids.join(","), LIMITS, ["bingx-x02"]);
  assert.equal(batches.length, 1);
  assert.deepEqual(
    result.map(({ phase }) => phase),
    ["reconcile", "uncertain"],
  );
  assert.ok(result.every(({ latency }) => latency && latency.submitMs >= 0));
  assert.deepEqual(
    batches[0]!.map(({ clientOrderId }) => clientOrderId),
    ids,
  );
  await assert.rejects(
    sendBatch(journal, client, ids, ids.join(","), LIMITS, ["bingx-x02"]),
    /current/,
  );
  assert.equal(batches.length, 1);
});

async function fullPosition(journal: Journal, mocked: ReturnType<typeof venue>) {
  const ticket = opening(journal);
  await signOff(journal, mocked.client, ticket.id, LIMITS);
  approve(journal, ticket.id, ticket.id, NOW);
  await send(journal, mocked.client, ticket.id, ticket.id, LIMITS, ["bingx-x02"]);
  Object.assign(mocked.orders.get(ticket.id)!, { status: "FILLED", executedQty: "0.03" });
  mocked.positions.push({
    symbol: SYMBOL,
    positionSide: "LONG",
    positionAmt: "0.03",
    positionId: "83",
  });
  for (const [orderID, type, stopPrice] of [
    ["84", "STOP_MARKET", 95],
    ["85", "TAKE_PROFIT_MARKET", 111],
  ])
    mocked.controls.push({
      symbol: SYMBOL,
      positionSide: "LONG",
      origQty: "0.03",
      type,
      side: "SELL",
      stopPrice,
      workingType: "CONTRACT_PRICE",
      orderID,
      status: "NEW",
    });
  return reconcile(journal, mocked.client, ticket.id);
}

test("overall protection and a partial target reconcile by venue IDs through target fill and residual close", async (t) => {
  const journal = setup(t);
  const mocked = venue();
  const { client, controls, positions, controlHistory } = mocked;
  const parent = await fullPosition(journal, mocked);
  assert.equal(parent.phase, "open");
  const { id } = parent;
  const armed = ["bingx-x02"];
  await assert.rejects(
    protect(journal, client, id, id, "target", 110, false, armed, false, 0.01),
    /overall stop/,
  );
  await protect(journal, client, id, id, "stop", 96, true, armed);
  const updated = await reconcile(journal, client, id);
  assert.equal(updated.venue?.stopId, "9007199254741010");
  assert.equal(updated.venue?.stopOverall, true);
  await protect(journal, client, id, id, "target", 110, false, armed, false, 0.01);
  const guarded = await reconcile(journal, client, id);
  assert.equal(guarded.targetQuantity, 0.01);
  assert.equal(guarded.phase, "open");
  const summary = await ownedPortfolio(journal, client, "bingx-x02");
  assert.equal(summary.positions[0]?.controls[0]?.overall, true);
  const [target] = controls.splice(1, 1);
  controlHistory.set(String(target!.orderID), { ...target, executedQty: "0.01", status: "FILLED" });
  positions[0]!.positionAmt = "0.02";
  const residual = await reconcile(journal, client, id);
  assert.equal(residual.phase, "incident");
  assert.ok(Math.abs(residual.venue!.remaining - 0.02) < 1e-10);
  assert.equal(residual.venue?.controlFills?.[String(target!.orderID)], 0.01);
  const child = planClose(journal, id, "Reduce the owned residual", 0.01);
  await signOff(journal, client, child.id, LIMITS);
  approve(journal, child.id, child.id, NOW);
  await send(journal, client, child.id, child.id, LIMITS, armed);
  mocked.orders.get(child.id)!.status = "FILLED";
  positions[0]!.positionAmt = "0.01";
  assert.equal((await reconcile(journal, client, child.id)).phase, "closed");
  assert.ok(Math.abs(journal.get(id).venue!.remaining - 0.01) < 1e-10);
  await protect(journal, client, id, id, "target", 111, true, armed);
  assert.equal((await reconcile(journal, client, id)).phase, "open");
});

test("lost control response is reconciled once and stale control cleanup preserves a foreign order", async (t) => {
  const journal = setup(t);
  const mocked = venue({ failReplace: true });
  const { client, controls, controlWrites, positions, orders } = mocked;
  const { id } = await fullPosition(journal, mocked);
  const armed = ["bingx-x02"];
  await protect(journal, client, id, id, "stop", 96, true, armed);
  assert.equal(journal.get(id).phase, "incident");
  await assert.rejects(
    protect(journal, client, id, id, "stop", 97, true, armed),
    /verified ownership/,
  );
  assert.equal((await reconcile(journal, client, id)).phase, "open");
  assert.equal(controlWrites.length, 1);
  const child = planClose(journal, id, "Close the owned position");
  await signOff(journal, client, child.id, LIMITS);
  approve(journal, child.id, child.id, NOW);
  await send(journal, client, child.id, child.id, LIMITS, armed);
  Object.assign(orders.get(child.id)!, { status: "FILLED", executedQty: "0.03" });
  positions.length = 0;
  controls.push({ symbol: SYMBOL, orderID: "87", type: "LIMIT" });
  await reconcile(journal, client, child.id);
  assert.equal(journal.get(id).phase, "incident");
  assert.equal((await clearFlatControls(journal, client, id, id, armed)).phase, "closed");
  assert.deepEqual(
    controls.map((row) => row.orderID),
    ["87"],
  );
});
