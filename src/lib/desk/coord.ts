import { MAX_MUL } from "./constants";
import type { LivePos, Side } from "./process";

export const SYSTEM_ID = "CTS-A";

export const CONNECTIONS = [
  { id: "bingx-public", label: "BingX public", route: "paper" },
  { id: "bingx-vst-02", label: "BingX VST", route: "none" },
  { id: "bingx-x01", label: "BingX mainnet", route: "none" },
] as const;

export type ConnectionId = (typeof CONNECTIONS)[number]["id"];
export type TicketType = "position" | "order" | "intern";

export type Scope = {
  system: string;
  connection: string;
  type: TicketType;
};

export type Tracked = {
  id: string;
  system: string;
  connection: string;
  type: TicketType;
};

export type CoordHit = {
  t: number;
  action: string;
  system: string;
  connection: string;
  type: TicketType;
  kept: number;
  skipped: number;
  note: string;
};

export type WorkingOrder = {
  id: string;
  positionId: string;
  kind: "sl" | "tp";
  symbol: string;
  side: Side;
  qty: number;
  px: number;
  system: string;
  connection: string;
  type: "order";
  reduceOnly: true;
};

export type OrderCtrl = { protect: boolean; connection: string };

export function connectionOf(id: string) {
  return CONNECTIONS.find((c) => c.id === id) ?? null;
}

export function canAffect(connection: string): boolean {
  return connectionOf(connection)?.route === "paper";
}

export function positionScope(connection: string): Scope {
  return { system: SYSTEM_ID, connection, type: "position" };
}

export function orderScope(connection: string): Scope {
  return { system: SYSTEM_ID, connection, type: "order" };
}

export function owns(row: Tracked, scope: Scope): boolean {
  return row.system === scope.system && row.connection === scope.connection && row.type === scope.type;
}

export function partition<T extends Tracked>(rows: T[], scope: Scope): { owned: T[]; skipped: T[] } {
  const owned: T[] = [];
  const skipped: T[] = [];
  for (const row of rows) {
    if (owns(row, scope)) owned.push(row);
    else skipped.push(row);
  }
  return { owned, skipped };
}

export function coordHit(action: string, scope: Scope, kept: number, skipped: number, note: string, t = Date.now()): CoordHit {
  return { t, action, system: scope.system, connection: scope.connection, type: scope.type, kept, skipped, note };
}

export function controlOrders(positions: LivePos[], ctrl: OrderCtrl): WorkingOrder[] {
  const out: WorkingOrder[] = [];
  for (const p of positions) {
    if (p.type !== "position" || !p.system || !p.connection) continue;
    if (!(p.qty > 0) || !(p.qtyBase > 0) || !(p.sl > 0) || !(p.tp > 0)) continue;
    if (p.qty > p.qtyBase * MAX_MUL + 1e-8) continue;
    if (p.side > 0 ? !(p.tp > p.sl) : !(p.tp < p.sl)) continue;
    const active = p.system === SYSTEM_ID && p.connection === ctrl.connection;
    if (active && !ctrl.protect) continue;
    const closeSide: Side = p.side > 0 ? -1 : 1;
    const qty = Math.min(p.qty, p.qtyBase * MAX_MUL);
    out.push({
      id: `o:${p.id}:sl`,
      positionId: p.id,
      kind: "sl",
      symbol: p.symbol,
      side: closeSide,
      qty,
      px: p.sl,
      system: p.system,
      connection: p.connection,
      type: "order",
      reduceOnly: true,
    });
    out.push({
      id: `o:${p.id}:tp`,
      positionId: p.id,
      kind: "tp",
      symbol: p.symbol,
      side: closeSide,
      qty,
      px: p.tp,
      system: p.system,
      connection: p.connection,
      type: "order",
      reduceOnly: true,
    });
  }
  return out;
}

export function workingOrders(positions: LivePos[]): WorkingOrder[] {
  return controlOrders(positions, { protect: true, connection: "" });
}

export function orderStats(positions: LivePos[], orders: WorkingOrder[], ctrl: OrderCtrl) {
  const expected = controlOrders(positions, ctrl);
  const key = (rows: WorkingOrder[]) => rows.map((o) => `${o.id}:${o.side}:${o.qty}:${o.px}`).sort().join("|");
  let qty = 0;
  let base = 0;
  let notional = 0;
  for (const p of positions) {
    if (p.system !== SYSTEM_ID || p.connection !== ctrl.connection || !(p.qty > 0)) continue;
    qty += p.qty;
    base += p.qtyBase;
    notional += p.qty * (p.mark > 0 ? p.mark : p.entry);
  }
  return {
    qty,
    base,
    notional,
    mul: base > 0 ? qty / base : 0,
    orders: orders.length,
    expected: expected.length,
    mismatches: key(expected) === key(orders) ? 0 : 1,
  };
}
