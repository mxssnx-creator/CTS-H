import { randomUUID } from "node:crypto";
import { Bingx, requireRows } from "./bingx.server.ts";
import { requireSymbol } from "./connections.ts";
import { loadQuote, quoteIsFresh } from "./market.server.ts";
import {
  Journal,
  type Bracket,
  type Phase,
  type Risk,
  type SignedConnection,
  type Ticket,
  type Venue,
} from "./journal.server.ts";

const OBSERVABLE: Phase[] = ["sending", "reconcile", "uncertain", "open", "incident"];
const TERMINAL = new Set(["FILLED", "CANCELLED", "CANCELED", "EXPIRED", "FAILED", "REJECTED"]);
const EPSILON = 1e-10;

export type Limits = {
  maxNotional: number;
  riskFraction: number;
  entryBps: number;
  exitBps: number;
};

function value(input: unknown, label: string): number {
  if (input === "" || input == null || !Number.isFinite(Number(input)))
    throw new Error(`Missing or invalid ${label}.`);
  return Number(input);
}

function positive(input: unknown, label: string): number {
  const n = value(input, label);
  if (n <= 0) throw new Error(`${label} must be positive.`);
  return n;
}

function near(a: number, b: number) {
  return Math.abs(a - b) <= Math.max(EPSILON, Math.max(Math.abs(a), Math.abs(b)) * 1e-10);
}

function roundPrice(price: number, digits: number, direction: "up" | "down"): number {
  const factor = 10 ** digits;
  return (
    (direction === "up" ? Math.ceil(price * factor - 1e-8) : Math.floor(price * factor + 1e-8)) /
    factor
  );
}

function atPrecision(n: number, digits: number): boolean {
  return (
    Number.isInteger(digits) &&
    digits >= 0 &&
    digits <= 12 &&
    Math.abs(n * 10 ** digits - Math.round(n * 10 ** digits)) <= 1e-6
  );
}

function wireDecimal(n: number) {
  return n.toFixed(12).replace(/\.?0+$/, "");
}

function venueId(row: Record<string, unknown>, kind: "order" | "position"): string | null {
  const id = row[`${kind}ID`] ?? row[`${kind}Id`];
  return (typeof id === "string" && /^\d+$/.test(id)) ||
    (typeof id === "number" && Number.isSafeInteger(id))
    ? String(id)
    : null;
}

export function propose(
  journal: Journal,
  connection: SignedConnection,
  symbol: string,
  bracket: Bracket,
  why: string,
  parent?: string,
) {
  if (!why.trim() || why.length > 2_000)
    throw new Error("Supply a short reason and evidence reference for the ticket.");
  positive(bracket.quantity, "quantity");
  if (!parent) {
    positive(bracket.stop, "stop");
    positive(bracket.target, "target");
  }
  const id = `ctsh-${randomUUID().replaceAll("-", "")}`;
  return journal.create({
    id,
    cid: id,
    connection,
    symbol: requireSymbol(symbol),
    bracket,
    why: why.trim(),
    createdAt: Date.now(),
    parent,
    phase: "idea",
  });
}

export async function account(client: Bingx) {
  const rows = requireRows(
    await client.privateGet<unknown>("/openApi/swap/v3/user/balance"),
    "balances",
  );
  const usdt = rows.find(
    (row) => row.asset === "USDT" || (client.connection.slot === "X02" && row.asset === "VST"),
  );
  if (!usdt) throw new Error("No USDT or VST futures balance returned.");
  return {
    equity: value(usdt.equity, "equity"),
    available: value(usdt.availableMargin, "available margin"),
    asset: usdt.asset,
  };
}

type Position = { id: string; side: unknown; rawQuantity: number };
async function venuePositions(client: Bingx, symbol: string): Promise<Position[]> {
  const result = await client.positions(symbol);
  return result.flatMap((row) => {
    if (row.symbol !== symbol) throw new Error("BingX returned a position for a different symbol.");
    const rawQuantity = value(row.positionAmt, "position quantity");
    if (rawQuantity === 0) return [];
    const id = venueId(row, "position");
    if (!id) throw new Error("BingX position has no usable ID.");
    return [{ id, side: row.positionSide, rawQuantity }];
  });
}

function sides(ticket: Ticket, hedge: boolean) {
  const isLong = ticket.bracket.side === "long";
  return {
    side: isLong !== Boolean(ticket.parent) ? "BUY" : "SELL",
    positionSide: hedge ? (isLong ? "LONG" : "SHORT") : "BOTH",
  };
}

function matchesPosition(ticket: Ticket, row: Position, hedge: boolean) {
  const { positionSide } = sides(ticket, hedge);
  return (
    row.side === positionSide &&
    (hedge || Math.sign(row.rawQuantity) === (ticket.bracket.side === "long" ? 1 : -1))
  );
}

function checkScope(
  journal: Journal,
  ticket: Ticket,
  positions: Position[],
  working: Record<string, unknown>[],
  hedge: boolean,
) {
  if (!ticket.parent) {
    if (positions.length || working.length)
      throw new Error("An existing position or order occupies this BingX symbol.");
    return undefined;
  }
  const parent = journal.get(ticket.parent);
  const [row] = positions;
  const parentVenue = parent.venue;
  if (
    parent.connection !== ticket.connection ||
    parent.symbol !== ticket.symbol ||
    parent.bracket.side !== ticket.bracket.side ||
    parent.phase !== "open" ||
    !parentVenue?.positionId ||
    positions.length !== 1 ||
    !row ||
    row.id !== parentVenue.positionId ||
    !matchesPosition(ticket, row, hedge) ||
    !near(Math.abs(row.rawQuantity), journal.remaining(parent)) ||
    !near(ticket.bracket.quantity, Math.abs(row.rawQuantity))
  )
    throw new Error("Current venue exposure could not be attributed wholly to the parent ticket.");
  const ids = new Set([parentVenue.stopId, parentVenue.targetId]);
  if (working.some((order) => !venueId(order, "order") || !ids.has(venueId(order, "order")))) {
    throw new Error("Unrecognized orders occupy this symbol.");
  }
  return row.id;
}

async function riskCheck(
  journal: Journal,
  client: Bingx,
  ticket: Ticket,
  limits: Limits,
  previous?: Risk,
): Promise<Risk> {
  if (client.connection.id !== ticket.connection)
    throw new Error("Ticket and connection must match.");
  const { symbol, bracket } = ticket;
  const [rules, balances, mode, positions, working] = await Promise.all([
    client.publicGet<unknown>("/openApi/swap/v2/quote/contracts", { symbol }),
    account(client),
    client.privateGet<{ dualSidePosition?: boolean | string }>(
      "/openApi/swap/v1/positionSide/dual",
    ),
    venuePositions(client, symbol),
    client.openOrders(symbol),
  ]);
  if (![true, false, "true", "false"].includes(mode.dualSidePosition ?? ""))
    throw new Error("Venue position mode is unavailable.");
  const hedge = mode.dualSidePosition === true || mode.dualSidePosition === "true";
  const row = requireRows(rules, "contracts").find((contract) => contract.symbol === symbol);
  if (
    !row ||
    (!ticket.parent && (Number(row.status) !== 1 || String(row.apiStateOpen) === "false")) ||
    (ticket.parent && String(row.apiStateClose) === "false")
  ) {
    throw new Error("Contract is unavailable for this action.");
  }
  const positionId = checkScope(journal, ticket, positions, working, hedge);
  const qDigits = value(row.quantityPrecision, "quantity precision");
  const pDigits = value(row.pricePrecision, "price precision");
  if (
    !atPrecision(bracket.quantity, qDigits) ||
    (!ticket.parent &&
      (!atPrecision(bracket.stop, pDigits) || !atPrecision(bracket.target, pDigits)))
  ) {
    throw new Error("Quantity, stop or target exceed the contract precision.");
  }
  const quote = await loadQuote(client, symbol);
  const now = client.now();
  if (
    !quoteIsFresh(quote, now) ||
    now - quote.exchangeTime > 10_000 ||
    !(quote.bid > 0 && quote.ask >= quote.bid)
  ) {
    throw new Error("A fresh, valid BingX bid and ask are required.");
  }
  const { side } = sides(ticket, hedge);
  const buy = side === "BUY";
  const ref = buy ? quote.ask : quote.bid;
  const limit =
    previous?.limit ??
    roundPrice(
      ref * (1 + ((buy ? 1 : -1) * limits.entryBps) / 10_000),
      pDigits,
      buy ? "down" : "up",
    );
  if (limit <= 0 || (buy ? ref > limit : ref < limit))
    throw new Error("The executable quote is outside the ticket limit.");
  if (previous && (previous.hedge !== hedge || previous.positionId !== positionId))
    throw new Error("Venue scope changed since approval.");
  const qty = bracket.quantity;
  const notional = qty * limit;
  let modeledLoss = 0;
  if (!ticket.parent) {
    if (
      qty < positive(row.tradeMinQuantity, "minimum quantity") ||
      qty * Math.min(limit, ref) < positive(row.tradeMinUSDT, "minimum notional")
    ) {
      throw new Error("Order is below the BingX minimum quantity or notional.");
    }
    const long = bracket.side === "long";
    if (
      long
        ? bracket.stop >= Math.min(quote.last, limit) ||
          bracket.target <= Math.max(quote.last, limit)
        : bracket.stop <= Math.max(quote.last, limit) ||
          bracket.target >= Math.min(quote.last, limit)
    ) {
      throw new Error("Bracket must surround the current trade price and the entry limit.");
    }
    const fee = value(row.takerFeeRate ?? row.feeRate, "taker fee");
    if (fee < 0 || fee > 0.01) throw new Error("BingX returned an invalid taker fee.");
    const stop = bracket.stop * (1 + ((long ? -1 : 1) * limits.exitBps) / 10_000);
    modeledLoss = qty * (Math.abs(limit - stop) + (limit + stop) * fee);
    if (
      notional > limits.maxNotional ||
      notional > balances.available ||
      modeledLoss > balances.equity * limits.riskFraction
    ) {
      throw new Error("Ticket exceeds the notional, available margin or modeled loss limit.");
    }
  }
  return {
    checkedAt: now,
    expiresAt: now + 120_000,
    limit,
    notional,
    modeledLoss,
    hedge,
    positionId,
  };
}

export async function signOff(journal: Journal, client: Bingx, id: string, limits: Limits) {
  const ticket = journal.get(id);
  const risk = await riskCheck(journal, client, ticket, limits);
  return journal.change(id, ["idea", "risk-pass", "approved"], "Risk PASS", (current) => ({
    ...current,
    phase: "risk-pass",
    risk,
  }));
}

export function approve(journal: Journal, id: string, confirmation: string, now = Date.now()) {
  if (id !== confirmation) throw new Error("Confirm the exact ticket ID.");
  return journal.change(id, ["risk-pass"], "Operator approved the ticket", (current) => {
    if (!current.risk || current.risk.expiresAt <= now) throw new Error("Risk sign-off expired.");
    return { ...current, phase: "approved" };
  });
}

function orderParams(ticket: Ticket, risk: Risk): Record<string, string> {
  const base: Record<string, string> = {
    symbol: ticket.symbol,
    ...sides(ticket, risk.hedge),
    type: "LIMIT",
    timeInForce: "IOC",
    price: wireDecimal(risk.limit),
    quantity: wireDecimal(ticket.bracket.quantity),
    clientOrderId: ticket.cid,
  };
  if (ticket.parent) {
    if (risk.hedge) base.positionId = risk.positionId!;
    else base.reduceOnly = "true";
    return base;
  }
  const bracket = (type: string, stopPrice: number) =>
    JSON.stringify({ type, stopPrice, workingType: "CONTRACT_PRICE" });
  return {
    ...base,
    stopLoss: bracket("STOP_MARKET", ticket.bracket.stop),
    takeProfit: bracket("TAKE_PROFIT_MARKET", ticket.bracket.target),
  };
}

export async function send(
  journal: Journal,
  client: Bingx,
  id: string,
  confirmation: string,
  limits: Limits,
  armed: string[],
  test = false,
) {
  if (id !== confirmation) throw new Error("Confirm the exact ticket ID.");
  const ticket = journal.get(id);
  if (!test && !armed.includes(ticket.connection))
    throw new Error("This connection's order route is disabled.");
  if (ticket.phase !== "approved" || !ticket.risk || ticket.risk.expiresAt <= client.now())
    throw new Error("A current approval is required.");
  const risk = await riskCheck(journal, client, ticket, limits, ticket.risk);
  if (test) {
    await client.place(orderParams(ticket, risk), true);
    return { id, test: true, status: "Accepted by BingX order/test" };
  }
  const claimed = journal.claim(id, client.now());
  // A concurrent risk refresh must never produce a send against different approved parameters.
  if (JSON.stringify(claimed.risk) !== JSON.stringify(ticket.risk)) {
    return journal.change(
      id,
      ["sending"],
      "Approval changed during preflight. No request sent.",
      (current) => ({ ...current, phase: "no-fill" }),
    );
  }
  try {
    await client.place(orderParams(claimed, risk));
  } catch (error) {
    const detail = error instanceof Error ? error.message : "BingX submission outcome is unknown.";
    return journal.change(id, ["sending"], detail, (current) => ({
      ...current,
      phase: "uncertain",
    }));
  }
  return journal.change(
    id,
    ["sending"],
    "BingX acknowledged the request. Reconcile by client ID.",
    (current) => ({
      ...current,
      phase: "reconcile",
    }),
  );
}

export async function reconcile(journal: Journal, client: Bingx, id: string): Promise<Ticket> {
  const ticket = journal.get(id);
  if (!OBSERVABLE.includes(ticket.phase) || !ticket.risk)
    throw new Error("Ticket is awaiting a send or already settled.");
  if (client.connection.id !== ticket.connection)
    throw new Error("Ticket and connection must match.");
  const { symbol, bracket, risk } = ticket;
  const row = await client.order(symbol, ticket.cid);
  const orderId = venueId(row, "order");
  const identity = sides(ticket, risk.hedge);
  if (
    !orderId ||
    row.symbol !== symbol ||
    String(row.clientOrderId ?? row.clientOrderID).toLowerCase() !== ticket.cid ||
    row.side !== identity.side ||
    row.positionSide !== identity.positionSide
  )
    throw new Error("BingX returned an order that does not match the ticket.");
  const status = String(row.status).toUpperCase();
  const filled = value(row.executedQty, "filled quantity");
  if (filled < 0 || (filled > bracket.quantity && !near(filled, bracket.quantity)))
    throw new Error("Venue fill exceeds ticket quantity.");
  const average = Number(row.avgPrice);
  const base: Venue = {
    orderId,
    status,
    filled,
    average: average > 0 ? average : null,
    positionId: null,
    remaining: 0,
    stopId: null,
    targetId: null,
  };
  const save = (phase: Phase, detail: string, venue: Venue = base) =>
    journal.change(id, OBSERVABLE, detail, (current) => {
      if (current.venue && filled + EPSILON < current.venue.filled)
        throw new Error("Older exchange observation ignored.");
      return { ...current, phase, venue };
    });
  if (!TERMINAL.has(status))
    return save("reconcile", "Order can still fill. Reconcile again by ID.");
  if (filled === 0) return save("no-fill", "Venue reports a terminal order with zero fills.");
  const [positions, working] = await Promise.all([
    venuePositions(client, symbol),
    client.openOrders(symbol),
  ]);
  if (ticket.parent) {
    const parent = journal.get(ticket.parent);
    const remaining = journal.remaining(parent, id) - filled;
    if (remaining < -EPSILON) return save("incident", "Close quantity exceeds journaled exposure.");
    if (remaining <= EPSILON && !positions.length) {
      const result = save(
        "closed",
        working.length
          ? "Close filled. Check remaining venue orders."
          : "Close filled and position is flat.",
      );
      if (!working.length) {
        journal.change(
          parent.id,
          ["open"],
          "Owned position closed by a CTS-H child ticket",
          (prior) => ({
            ...prior,
            phase: "closed",
            venue: { ...prior.venue!, remaining: 0 },
          }),
        );
      }
      return result;
    }
    const [position] = positions;
    if (
      position &&
      positions.length === 1 &&
      position.id === parent.venue?.positionId &&
      matchesPosition(ticket, position, risk.hedge) &&
      near(Math.abs(position.rawQuantity), remaining)
    ) {
      return save(
        "closed",
        "IOC partly closed the own position. Reconcile the parent for residual protection.",
        {
          ...base,
          remaining,
          positionId: position.id,
        },
      );
    }
    return save("incident", "Close fills and remaining exchange exposure disagree.");
  }
  if (!positions.length && !working.length)
    return save("closed", "Entry filled and the venue is flat.");
  const [position] = positions;
  const remaining = journal.remaining({ ...ticket, venue: base });
  if (
    !position ||
    positions.length !== 1 ||
    !matchesPosition(ticket, position, risk.hedge) ||
    (ticket.venue?.positionId && position.id !== ticket.venue.positionId) ||
    !near(Math.abs(position.rawQuantity), remaining)
  )
    return save("incident", "The venue position cannot be matched exclusively to this ticket.");
  const control = (type: string, at: number) => {
    const matching = working.filter(
      (candidate) =>
        candidate.symbol === symbol &&
        candidate.positionSide === identity.positionSide &&
        candidate.type === type &&
        candidate.side !== identity.side &&
        near(Number(candidate.stopPrice), at) &&
        near(Number(candidate.origQty ?? candidate.quantity), remaining) &&
        (!venueId(candidate, "position") || venueId(candidate, "position") === position.id) &&
        candidate.workingType === "CONTRACT_PRICE",
    );
    return matching.length === 1 ? venueId(matching[0]!, "order") : null;
  };
  const stopId = control("STOP_MARKET", bracket.stop);
  const targetId = control("TAKE_PROFIT_MARKET", bracket.target);
  return save(
    stopId && targetId ? "open" : "incident",
    stopId && targetId
      ? "Fill and both attached controls reconciled on BingX."
      : "Position found without two matching controls. Review in BingX.",
    { ...base, positionId: position.id, remaining, stopId, targetId },
  );
}
