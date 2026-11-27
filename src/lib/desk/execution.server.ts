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
    (parent.phase !== "open" && parent.phase !== "incident") ||
    parent.protection ||
    !parentVenue?.positionId ||
    positions.length !== 1 ||
    !row ||
    row.id !== parentVenue.positionId ||
    !matchesPosition(ticket, row, hedge) ||
    !near(Math.abs(row.rawQuantity), journal.remaining(parent)) ||
    (ticket.bracket.quantity > Math.abs(row.rawQuantity) &&
      !near(ticket.bracket.quantity, Math.abs(row.rawQuantity)))
  )
    throw new Error("Current venue exposure could not be attributed wholly to the parent ticket.");
  const ids = new Set([parentVenue.stopId, parentVenue.targetId]);
  if (working.some((order) => !venueId(order, "order") || !ids.has(venueId(order, "order")))) {
    throw new Error("Unrecognized orders occupy this symbol.");
  }
  return row.id;
}

async function tradeContext(client: Bingx) {
  const [balances, mode] = await Promise.all([
    account(client),
    client.privateGet<{ dualSidePosition?: boolean | string }>(
      "/openApi/swap/v1/positionSide/dual",
    ),
  ]);
  if (![true, false, "true", "false"].includes(mode.dualSidePosition ?? ""))
    throw new Error("Venue position mode is unavailable.");
  return { balances, hedge: mode.dualSidePosition === true || mode.dualSidePosition === "true" };
}

async function riskCheck(
  journal: Journal,
  client: Bingx,
  ticket: Ticket,
  limits: Limits,
  previous?: Risk,
  context?: Awaited<ReturnType<typeof tradeContext>>,
): Promise<Risk> {
  if (client.connection.id !== ticket.connection)
    throw new Error("Ticket and connection must match.");
  const { symbol, bracket } = ticket;
  const [rules, { balances, hedge }, positions, working, quote] = await Promise.all([
    client.publicGet<unknown>("/openApi/swap/v2/quote/contracts", { symbol }),
    context ?? tradeContext(client),
    venuePositions(client, symbol),
    client.openOrders(symbol),
    loadQuote(client, symbol),
  ]);
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

export function planClose(journal: Journal, id: string, why: string, quantity?: number) {
  const ticket = journal.get(id);
  if (
    ticket.parent ||
    (ticket.phase !== "open" && ticket.phase !== "incident") ||
    !ticket.venue?.positionId ||
    ticket.protection
  )
    throw new Error("Choose a parent with a verified position and no pending protection change.");
  const remaining = journal.remaining(ticket);
  const toClose = quantity ?? remaining;
  if (!(toClose > 0) || (toClose > remaining && !near(toClose, remaining)))
    throw new Error("Close quantity must be positive and within the owned position.");
  return propose(
    journal,
    ticket.connection,
    ticket.symbol,
    {
      ...ticket.bracket,
      quantity: Math.min(toClose, remaining),
    },
    why,
    id,
  );
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
  const started = performance.now();
  const risk = await riskCheck(journal, client, ticket, limits, ticket.risk);
  const preflightMs = performance.now() - started;
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
  const sentAt = performance.now();
  try {
    await client.place(orderParams(claimed, risk));
  } catch (error) {
    const detail = error instanceof Error ? error.message : "BingX submission outcome is unknown.";
    return journal.change(id, ["sending"], detail, (current) => ({
      ...current,
      phase: "uncertain",
      latency: { preflightMs, submitMs: performance.now() - sentAt },
    }));
  }
  return journal.change(
    id,
    ["sending"],
    "BingX acknowledged the request. Reconcile by client ID.",
    (current) => ({
      ...current,
      phase: "reconcile",
      latency: { preflightMs, submitMs: performance.now() - sentAt },
    }),
  );
}

export async function sendBatch(
  journal: Journal,
  client: Bingx,
  ids: string[],
  confirmation: string,
  limits: Limits,
  armed: string[],
) {
  if (
    ids.length < 1 ||
    ids.length > 5 ||
    new Set(ids).size !== ids.length ||
    confirmation !== ids.join(",")
  )
    throw new Error("Confirm the exact comma-separated list of one to five unique tickets.");
  const tickets = ids.map((id) => journal.get(id));
  const { connection } = tickets[0]!;
  if (client.connection.id !== connection || !armed.includes(connection))
    throw new Error("The batch requires an armed route for its connection.");
  if (
    tickets.some(
      (ticket) =>
        ticket.connection !== connection ||
        ticket.phase !== "approved" ||
        !ticket.risk ||
        ticket.risk.expiresAt <= client.now(),
    ) ||
    new Set(tickets.map((ticket) => ticket.symbol)).size !== tickets.length
  )
    throw new Error("Batch approvals must be current, on one route, and for distinct markets.");
  const started = performance.now();
  const context = await tradeContext(client);
  const checks = await Promise.all(
    tickets.map((ticket) => riskCheck(journal, client, ticket, limits, ticket.risk, context)),
  );
  let margin = 0;
  let risk = 0;
  for (const [i, ticket] of tickets.entries()) {
    if (ticket.parent) continue;
    margin += checks[i]!.notional;
    risk += checks[i]!.modeledLoss;
  }
  if (margin > context.balances.available || risk > context.balances.equity * limits.riskFraction)
    throw new Error("Combined batch exceeds the available margin or modeled loss limit.");
  const claimed = journal.claimBatch(tickets, client.now());
  const preflightMs = performance.now() - started;
  const sentAt = performance.now();
  let acknowledged = new Set<string>();
  let reason = "No matching acknowledgement returned for this ticket. Reconcile by client ID.";
  try {
    const response = await client.placeBatch(
      claimed.map((ticket, i) => orderParams(ticket, checks[i]!)),
    );
    if (Array.isArray(response.orders)) {
      acknowledged = new Set(
        response.orders.map((order) =>
          String(order.clientOrderId ?? order.clientOrderID ?? "").toLowerCase(),
        ),
      );
    }
  } catch (error) {
    if (error instanceof Error) reason = error.message;
  }
  const latency = { preflightMs, submitMs: performance.now() - sentAt };
  return claimed.map(({ id, cid }) => {
    const accepted = acknowledged.has(cid);
    return journal.change(
      id,
      ["sending"],
      accepted ? "BingX acknowledged this batch item. Reconcile by client ID." : reason,
      (ticket) => ({ ...ticket, phase: accepted ? "reconcile" : "uncertain", latency }),
    );
  });
}

type ControlKind = "stop" | "target";
const CONTROL_TYPES = { stop: "STOP_MARKET", target: "TAKE_PROFIT_MARKET" } as const;
const CONTROL_KINDS = ["stop", "target"] as const;
const CONTROL_ID = { stop: "stopId", target: "targetId" } as const;
const OVERALL = { stop: "stopOverall", target: "targetOverall" } as const;

function closesOverall(order: Record<string, unknown>) {
  return order.closePosition === true || order.closePosition === "true";
}

function controlIdentity(
  order: Record<string, unknown>,
  ticket: Ticket,
  kind: ControlKind,
  positionId: string | null,
) {
  const { side, positionSide } = sides(ticket, ticket.risk!.hedge);
  const attachedTo = venueId(order, "position");
  return (
    order.symbol === ticket.symbol &&
    order.positionSide === positionSide &&
    order.side === (side === "BUY" ? "SELL" : "BUY") &&
    order.type === CONTROL_TYPES[kind] &&
    (!attachedTo || attachedTo === positionId)
  );
}

function activeControl(
  working: Record<string, unknown>[],
  ticket: Ticket,
  kind: ControlKind,
  positionId: string,
  remaining: number,
) {
  const change = ticket.protection?.kind === kind ? ticket.protection : undefined;
  const at = change?.trigger ?? ticket.bracket[kind];
  const id = change ? change.orderId : ticket.venue?.[CONTROL_ID[kind]];
  const intendedQuantity = change
    ? change.quantity
    : kind === "target"
      ? ticket.targetQuantity
      : undefined;
  const matching = working.filter((row) => {
    const observedId = venueId(row, "order");
    const status = row.status;
    if (
      !observedId ||
      (id && observedId !== id) ||
      (change && observedId === change.oldId) ||
      (status &&
        !["NEW", "PENDING", "PARTIALLYFILLED", "PARTIALLY_FILLED"].includes(String(status))) ||
      !controlIdentity(row, ticket, kind, positionId) ||
      row.workingType !== "CONTRACT_PRICE" ||
      !near(Number(row.stopPrice), at)
    )
      return false;
    if (change && !id && Number(row.time ?? row.updateTime) < change.beganAt - 5_000) return false;
    if (change && !id && !Number.isFinite(Number(row.time ?? row.updateTime))) return false;
    const overall = closesOverall(row);
    if (change && overall !== change.overall) return false;
    if (overall) return true;
    if (!ticket.risk!.hedge && String(row.reduceOnly) === "false") return false;
    const executed = Number(row.executedQty) || 0;
    const openQuantity = Number(row.origQty ?? row.quantity) - executed;
    const expected =
      intendedQuantity === undefined ? remaining : Math.min(remaining, intendedQuantity - executed);
    return expected > 0 && near(openQuantity, expected);
  });
  if (matching.length !== 1) return null;
  return { id: venueId(matching[0]!, "order")!, overall: closesOverall(matching[0]!) };
}

async function verifiedControlFills(
  client: Bingx,
  ticket: Ticket,
  working: Record<string, unknown>[],
) {
  const fills = { ...ticket.venue?.controlFills };
  await Promise.all(
    CONTROL_KINDS.map(async (kind) => {
      const id = ticket.venue?.[CONTROL_ID[kind]];
      if (!id) return;
      const active = working.find((row) => venueId(row, "order") === id);
      try {
        const row = active ?? (await client.order(ticket.symbol, id, true));
        const amount = Number(row.executedQty);
        if (
          venueId(row, "order") === id &&
          controlIdentity(row, ticket, kind, ticket.venue!.positionId) &&
          Number.isFinite(amount) &&
          amount >= 0
        )
          fills[id] = Math.max(fills[id] ?? 0, amount);
      } catch {
        // A later observation can recover the full order by ID.
      }
    }),
  );
  return fills;
}

function verifyControls(
  working: Record<string, unknown>[],
  ticket: Ticket,
  venue: Venue,
  positionId: string,
  remaining: number,
) {
  const stop = activeControl(working, ticket, "stop", positionId, remaining);
  const target = activeControl(working, ticket, "target", positionId, remaining);
  return {
    venue: {
      ...venue,
      positionId,
      remaining,
      stopId: stop?.id ?? venue.stopId,
      targetId: target?.id ?? venue.targetId,
      stopOverall: stop?.overall ?? venue.stopOverall,
      targetOverall: target?.overall ?? venue.targetOverall,
    },
    stop,
    target,
  };
}

function knownWorking(working: Record<string, unknown>[], venue?: Venue) {
  const ids = new Set([venue?.stopId, venue?.targetId].filter(Boolean));
  return working.some((row) => ids.has(venueId(row, "order")));
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
    (ticket.venue?.orderId && orderId !== ticket.venue.orderId) ||
    row.symbol !== symbol ||
    String(row.clientOrderId ?? row.clientOrderID).toLowerCase() !== ticket.cid ||
    row.side !== identity.side ||
    row.positionSide !== identity.positionSide
  )
    throw new Error("BingX returned an order that does not match the ticket.");
  const status = String(row.status).toUpperCase();
  const terminal = TERMINAL.has(status);
  const filled = value(row.executedQty, "filled quantity");
  if (filled < 0 || (filled > bracket.quantity && !near(filled, bracket.quantity)))
    throw new Error("Venue fill exceeds ticket quantity.");
  if (ticket.venue && filled + EPSILON < ticket.venue.filled)
    throw new Error("Older exchange observation ignored.");
  if (ticket.venue && TERMINAL.has(ticket.venue.status) && !terminal)
    throw new Error("Older exchange order state ignored.");
  const average = Number(row.avgPrice);
  const base: Venue = {
    positionId: null,
    remaining: 0,
    stopId: null,
    targetId: null,
    ...ticket.venue,
    orderId,
    status,
    filled,
    average: average > 0 ? average : (ticket.venue?.average ?? null),
    observedAt: client.now(),
  };
  const save = (phase: Phase, detail: string, venue: Venue = base, update?: Partial<Ticket>) =>
    journal.change(id, OBSERVABLE, detail, (current) => {
      if (
        current.phase !== ticket.phase ||
        JSON.stringify(current.venue) !== JSON.stringify(ticket.venue) ||
        JSON.stringify(current.protection) !== JSON.stringify(ticket.protection)
      )
        throw new Error("A newer exchange observation is already recorded.");
      return { ...current, phase, venue, ...update };
    });
  if (filled === 0)
    return save(
      terminal ? "no-fill" : "reconcile",
      terminal ? "Venue reports a terminal order with zero fills." : "Order can still fill.",
    );
  const [positions, working] = await Promise.all([
    venuePositions(client, symbol),
    client.openOrders(symbol),
  ]);
  const [position] = positions;
  if (ticket.parent) {
    const parent = journal.get(ticket.parent);
    const parentVenue = parent.venue;
    if (!parentVenue?.positionId)
      return save("incident", "Parent position identity is unavailable.");
    const remaining = journal.remaining(parent, id) - filled;
    if (remaining < -EPSILON) return save("incident", "Close quantity exceeds journaled exposure.");
    if (remaining <= EPSILON && !positions.length) {
      const stranded = knownWorking(working, parentVenue);
      const detail = stranded
        ? "Position is flat. An owned control remains active."
        : "Owned position is flat.";
      return journal.observeClose(
        ticket,
        parent,
        {
          ...ticket,
          phase: terminal ? "closed" : "reconcile",
          venue: { ...base, positionId: parentVenue.positionId, remaining: 0 },
        },
        detail,
        !terminal || stranded ? "incident" : "closed",
        { ...parentVenue, remaining: 0 },
      );
    }
    if (
      position &&
      positions.length === 1 &&
      position.id === parentVenue.positionId &&
      matchesPosition(ticket, position, risk.hedge) &&
      near(Math.abs(position.rawQuantity), remaining)
    ) {
      const protection = verifyControls(working, parent, parentVenue, position.id, remaining);
      const protectedResidual = Boolean(protection.stop && protection.target);
      const detail = protectedResidual
        ? "Partial close recorded. Both controls cover the residual exposure."
        : "Partial close recorded. The residual controls need reconciliation or resizing.";
      return journal.observeClose(
        ticket,
        parent,
        {
          ...ticket,
          phase: terminal ? "closed" : "reconcile",
          venue: { ...base, remaining, positionId: position.id },
        },
        detail,
        protectedResidual ? "open" : "incident",
        protection.venue,
      );
    }
    return save("incident", "Close fills and remaining exchange exposure disagree.");
  }
  const expected = journal.remaining({ ...ticket, venue: base });
  if (
    ticket.venue?.positionId &&
    (!position ||
      !near(Math.abs(position.rawQuantity), expected) ||
      CONTROL_KINDS.some((kind) => {
        const controlId = ticket.venue?.[CONTROL_ID[kind]];
        return controlId && !working.some((order) => venueId(order, "order") === controlId);
      }))
  )
    base.controlFills = await verifiedControlFills(client, ticket, working);
  const remaining = journal.remaining({ ...ticket, venue: base });
  if (terminal && Math.abs(remaining) <= EPSILON && !positions.length) {
    if (knownWorking(working, base))
      return save("incident", "Position is flat. An owned control remains active.", {
        ...base,
        remaining: 0,
      });
    return save(
      "closed",
      "Owned closing fills match the flat position.",
      { ...base, remaining: 0 },
      { protection: undefined },
    );
  }
  if (
    !position ||
    positions.length !== 1 ||
    !matchesPosition(ticket, position, risk.hedge) ||
    (ticket.venue?.positionId && position.id !== ticket.venue.positionId) ||
    remaining <= 0 ||
    !near(Math.abs(position.rawQuantity), remaining)
  ) {
    return save(
      terminal ? "incident" : "reconcile",
      "The open exposure could not be attributed exclusively to this ticket.",
    );
  }
  const protection = verifyControls(working, ticket, base, position.id, remaining);
  const amended = ticket.protection && protection[ticket.protection.kind];
  const savedBracket =
    amended && ticket.protection
      ? { ...bracket, [ticket.protection.kind]: ticket.protection.trigger }
      : bracket;
  const foreign = working.some((order) => {
    const id = venueId(order, "order");
    return (
      id !== protection.venue.stopId &&
      id !== protection.venue.targetId &&
      String(order.clientOrderId ?? order.clientOrderID ?? "").toLowerCase() !== ticket.cid
    );
  });
  const protectedPosition = Boolean(protection.stop && protection.target && !foreign);
  const phase = !terminal ? "reconcile" : protectedPosition ? "open" : "incident";
  return save(
    phase,
    protectedPosition
      ? terminal
        ? "Fill and both controls reconciled on BingX."
        : "Partial entry reconciled with both controls."
      : "Owned exposure has unresolved or missing control orders.",
    protection.venue,
    {
      bracket: savedBracket,
      targetQuantity:
        amended && ticket.protection?.kind === "target"
          ? ticket.protection.quantity
          : ticket.targetQuantity,
      protection: amended ? undefined : ticket.protection,
    },
  );
}

export async function ownedPortfolio(
  journal: Journal,
  client: Bingx,
  connection: SignedConnection,
) {
  if (client.connection.id !== connection) throw new Error("Portfolio and connection must match.");
  const tickets = journal.active(connection);
  if (!tickets.length) return { connection, positions: [], pending: [], readMs: 0 };
  const started = performance.now();
  const [positions, working] = await Promise.all([client.positions(), client.openOrders()]);
  return {
    connection,
    readMs: performance.now() - started,
    positions: tickets
      .filter((ticket) => !ticket.parent && ticket.venue?.positionId)
      .map((ticket) => {
        const risk = ticket.risk!;
        const venue = ticket.venue!;
        const active = positions.find(
          (row) =>
            row.symbol === ticket.symbol &&
            venueId(row, "position") === venue.positionId &&
            row.positionSide === sides(ticket, risk.hedge).positionSide,
        );
        return {
          id: ticket.id,
          symbol: ticket.symbol,
          side: ticket.bracket.side,
          phase: ticket.phase,
          positionId: venue.positionId,
          recordedQuantity: Math.max(0, journal.remaining(ticket)),
          venueQuantity:
            active && Number.isFinite(Number(active.positionAmt))
              ? Math.abs(Number(active.positionAmt))
              : null,
          controls: CONTROL_KINDS.map((kind) => {
            const id = venue[CONTROL_ID[kind]];
            const order = working.find(
              (row) =>
                id &&
                venueId(row, "order") === id &&
                controlIdentity(row, ticket, kind, venue.positionId),
            );
            return {
              kind,
              id,
              trigger: ticket.bracket[kind],
              active: Boolean(order),
              overall: order ? closesOverall(order) : Boolean(venue[OVERALL[kind]]),
            };
          }),
        };
      }),
    pending: tickets
      .filter((ticket) => ticket.phase !== "open")
      .map(({ id, symbol, parent, phase, latency }) => ({ id, symbol, parent, phase, latency })),
  };
}

export async function protect(
  journal: Journal,
  client: Bingx,
  id: string,
  confirmation: string,
  kind: ControlKind,
  trigger: number,
  overall: boolean,
  armed: string[],
  test = false,
  quantity?: number,
) {
  const ticket = journal.get(id);
  if (
    id !== confirmation ||
    ticket.connection !== client.connection.id ||
    (!test && !armed.includes(ticket.connection))
  )
    throw new Error("Confirm the exact ticket on its armed route.");
  if (
    ticket.parent ||
    !ticket.risk ||
    !ticket.venue?.positionId ||
    ticket.protection ||
    (ticket.phase !== "open" && ticket.phase !== "incident") ||
    !TERMINAL.has(ticket.venue.status)
  )
    throw new Error("A settled entry with verified ownership is required to manage its controls.");
  const { symbol, bracket, venue } = ticket;
  const positionId = venue.positionId!;
  const knownId = venue[CONTROL_ID[kind]];
  const [positions, working, quote, contract] = await Promise.all([
    venuePositions(client, symbol),
    client.openOrders(symbol),
    loadQuote(client, symbol),
    client.publicGet<unknown>("/openApi/swap/v2/quote/contracts", { symbol }),
  ]);
  const [position] = positions;
  const remaining = journal.remaining(ticket);
  const amount = quantity ?? remaining;
  const ownedIds = new Set([venue.stopId, venue.targetId]);
  if (
    !(remaining > 0) ||
    !position ||
    positions.length !== 1 ||
    position.id !== positionId ||
    !matchesPosition(ticket, position, ticket.risk.hedge) ||
    !near(Math.abs(position.rawQuantity), remaining) ||
    working.some((row) => !venueId(row, "order") || !ownedIds.has(venueId(row, "order")))
  )
    throw new Error("Current position and controls must match the owned journal scope.");
  const rule = requireRows(contract, "contracts").find((row) => row.symbol === symbol);
  if (
    !rule ||
    !atPrecision(trigger, Number(rule.pricePrecision)) ||
    !atPrecision(amount, Number(rule.quantityPrecision)) ||
    !quoteIsFresh(quote, client.now()) ||
    !(quote.ask >= quote.bid && quote.bid > 0)
  )
    throw new Error("A fresh quote and contract-valid trigger and quantity are required.");
  if (
    !(amount > 0) ||
    (amount > remaining && !near(amount, remaining)) ||
    (quantity !== undefined && (kind !== "target" || overall))
  )
    throw new Error(
      "A fixed-quantity target may use a positive quantity within the owned position.",
    );
  if (
    !near(amount, remaining) &&
    !activeControl(working, ticket, "stop", positionId, remaining)?.overall
  )
    throw new Error("Set a verified overall stop before placing a partial take-profit control.");
  const long = bracket.side === "long";
  const above = kind === "target" ? long : !long;
  if (
    !(trigger > 0) ||
    (above
      ? trigger <= Math.max(quote.last, quote.ask)
      : trigger >= Math.min(quote.last, quote.bid)) ||
    (kind === "stop" && (long ? trigger < bracket.stop : trigger > bracket.stop))
  )
    throw new Error(
      "The trigger must be on the correct side of the quote and keep the stop risk bounded.",
    );
  const previous = working.find((row) => knownId && venueId(row, "order") === knownId);
  const oldId = previous ? knownId : null;
  if (previous && !controlIdentity(previous, ticket, kind, positionId))
    throw new Error("The control does not match the owned position.");
  const { side, positionSide } = sides(ticket, ticket.risk.hedge);
  const params = {
    symbol,
    side: side === "BUY" ? "SELL" : "BUY",
    positionSide,
    type: CONTROL_TYPES[kind],
    stopPrice: wireDecimal(trigger),
    workingType: "CONTRACT_PRICE",
    quantity: wireDecimal(Math.min(amount, remaining)),
    ...(ticket.risk.hedge ? { positionId } : {}),
    ...(overall ? { closePosition: "true" } : ticket.risk.hedge ? {} : { reduceOnly: "true" }),
  };
  if (test) {
    await client.place(params, true);
    return { id, test: true, reservedOrderId: oldId };
  }
  const intent = { kind, trigger, overall, quantity, oldId, beganAt: client.now() };
  journal.claimProtection(id, ticket, intent);
  try {
    const receipt = oldId
      ? await client.replaceControl({
          ...params,
          cancelOrderId: oldId,
          cancelReplaceMode: "STOP_ON_FAILURE",
        })
      : await client.place(params);
    const order =
      receipt.order && typeof receipt.order === "object"
        ? (receipt.order as Record<string, unknown>)
        : receipt;
    const orderId = venueId(order, "order") ?? venueId({ orderId: order.newOrderId }, "order");
    const failed = Boolean(oldId && order.newOrderResult === "FAILED");
    return journal.change(
      id,
      ["incident", "open"],
      failed
        ? "Venue rejected the replacement. Reconcile the position before another protection change."
        : "Protection request recorded. Reconcile the exact position and controls.",
      (current) => {
        if (!current.protection || current.protection.beganAt !== intent.beganAt) return current;
        return {
          ...current,
          phase: "incident",
          protection: failed ? undefined : { ...intent, ...(orderId ? { orderId } : {}) },
        };
      },
    );
  } catch (error) {
    return journal.change(
      id,
      ["incident", "open"],
      error instanceof Error
        ? error.message
        : "Protection outcome is uncertain. Reconcile before another update.",
      (current) => current,
    );
  }
}

export async function clearFlatControls(
  journal: Journal,
  client: Bingx,
  id: string,
  confirmation: string,
  armed: string[],
) {
  const ticket = journal.get(id);
  if (
    id !== confirmation ||
    !armed.includes(ticket.connection) ||
    client.connection.id !== ticket.connection
  )
    throw new Error("Confirm the exact ticket on its armed route.");
  if (
    ticket.parent ||
    ticket.phase !== "incident" ||
    !ticket.risk ||
    !ticket.venue ||
    ticket.protection ||
    Math.abs(journal.remaining(ticket)) > EPSILON
  )
    throw new Error(
      "The ticket must have verified zero owned exposure and no pending protection change.",
    );
  const [positions, working] = await Promise.all([
    venuePositions(client, ticket.symbol),
    client.openOrders(ticket.symbol),
  ]);
  if (positions.length) throw new Error("The market still has venue exposure.");
  const controls = CONTROL_KINDS.flatMap((kind) => {
    const id = ticket.venue![CONTROL_ID[kind]];
    const row = working.find((row) => id && venueId(row, "order") === id);
    return id && row && controlIdentity(row, ticket, kind, ticket.venue!.positionId) ? [id] : [];
  });
  const results = await Promise.allSettled(
    controls.map((id) => client.cancelOrder(ticket.symbol, id)),
  );
  if (results.some((result) => result.status === "rejected"))
    return journal.change(
      id,
      ["incident"],
      "A control cancellation has an uncertain outcome. Reconcile by order ID.",
      (current) => current,
    );
  return reconcile(journal, client, id);
}
