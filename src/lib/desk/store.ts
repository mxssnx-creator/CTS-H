import { create } from "zustand";
import { ACTIONS, BOOK, DEFAULT_FLOORS, LIVE_SHORT, MAX_LIVE_LEGS, TAG, type ActionId, type Floors } from "./constants";
import { SYSTEM_ID, canAffect, controlOrders, coordHit, orderScope, partition, positionScope, type ConnectionId, type CoordHit, type WorkingOrder } from "./coord";
import {
  atrSeries,
  barSignature,
  applyFloors,
  cellRollup,
  emaLast,
  greenHour,
  headline,
  indicationBoard,
  markPositions,
  mergeFills,
  openFromPerforming,
  rsiLast,
  simulateSessions,
  syncBooks,
  systemNet,
  type Bar,
  type Cell,
  type LivePos,
  type SessionReport,
  type TapeFill,
} from "./process";
import { EMPTY_HEALTH, healBooks, noteHealth, type Health } from "./heal";
import { closePnl, comboId, positionNotional } from "./math";

export type DeskEvent = { t: number; kind: string; msg: string };

type Quote = {
  symbol: string;
  last: number;
  changePct: number;
  quoteVolume: number;
  high: number;
  low: number;
  bid: number;
  ask: number;
};

export type SnapBook = {
  symbol: string;
  bars: Bar[];
  quote: Quote;
  funding: number | null;
  depth: { bids: [number, number][]; asks: [number, number][] };
};

type Toggles = { normal: boolean; trailing: boolean; axis: boolean; block: boolean; dca: boolean; hedge: boolean };

type DeskState = {
  status: "loading" | "live" | "degraded" | "error";
  error: string;
  focus: string;
  focusCombo: string;
  books: SnapBook[];
  cells: Cell[];
  positions: LivePos[];
  orders: WorkingOrder[];
  coord: CoordHit[];
  connection: ConnectionId;
  internFills: TapeFill[];
  liveFills: TapeFill[];
  closedNet: number;
  events: DeskEvent[];
  allow: Record<ActionId, boolean>;
  toggles: Toggles;
  floors: Floors;
  ticks: number;
  lastTs: number;
  peak: number;
  hour: number;
  barSig: string;
  session: SessionReport | null;
  health: Health;
  phase: "intern-pre" | "performing" | "halted";
  hydrated: boolean;
  ingest: (books: SnapBook[], ts: number, flags?: { stale?: boolean; note?: string }) => void;
  fail: (msg: string) => void;
  degrade: (msg: string) => void;
  setFocus: (symbol: string) => void;
  setFocusCombo: (id: string) => void;
  setConnection: (id: ConnectionId) => void;
  toggleAllow: (id: ActionId) => void;
  toggleStrat: (k: keyof Toggles) => void;
  setFloor: (k: keyof Floors, value: number) => void;
  flattenOwned: () => void;
  flattenLosers: () => void;
  halt: () => void;
  rewalk: () => void;
  manual: (side: 1 | -1) => void;
  hydrate: () => void;
};

const allowAll = Object.fromEntries(ACTIONS.map((a) => [a, true])) as Record<ActionId, boolean>;
const SESSION_KEY = "helix-ctsa-session";

function log(events: DeskEvent[], kind: string, msg: string): DeskEvent[] {
  return [{ t: Date.now(), kind, msg }, ...events].slice(0, 120);
}

function readSession(): { toggles?: Toggles; floors?: Floors } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = JSON.parse(localStorage.getItem(SESSION_KEY) || "null") as { toggles?: Toggles; floors?: Floors } | null;
    return raw;
  } catch {
    return null;
  }
}

function writeSession(toggles: Toggles, floors: Floors) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_KEY, JSON.stringify({ toggles, floors }));
}

export const useDesk = create<DeskState>((set, get) => ({
  status: "loading",
  error: "",
  focus: "BTC-USDT",
  focusCombo: "",
  books: [],
  cells: [],
  positions: [],
  orders: [],
  coord: [],
  connection: "bingx-public",
  internFills: [],
  liveFills: [],
  closedNet: 0,
  events: [],
  allow: allowAll,
  toggles: { normal: false, trailing: true, axis: true, block: true, dca: false, hedge: true },
  floors: DEFAULT_FLOORS,
  ticks: 0,
  lastTs: 0,
  peak: BOOK,
  hour: 0,
  barSig: "",
  session: null,
  health: EMPTY_HEALTH,
  phase: "intern-pre",
  hydrated: false,
  fail: (msg) => set({ status: "error", error: msg, events: log(get().events, "alert", msg) }),
  degrade: (msg) =>
    set((s) => ({
      status: s.books.length ? "degraded" : "error",
      error: msg,
      health: noteHealth(s.health, [msg]),
      events: log(s.events, "heal", msg),
    })),
  setFocus: (symbol) => set({ focus: symbol }),
  setFocusCombo: (id) => set({ focusCombo: id }),
  setConnection: (id) =>
    set((s) => {
      const scope = positionScope(id);
      const hit = coordHit("connect", scope, canAffect(id) ? 1 : 0, canAffect(id) ? 0 : 1, canAffect(id) ? "paper route" : "no order route");
      const next = { ...s, connection: id };
      return {
        connection: id,
        orders: syncOrders(next, s.positions),
        coord: [hit, ...s.coord].slice(0, 40),
        events: log(s.events, "coord", `${scope.system} · ${id} · ${canAffect(id) ? "affect on" : "observe only"}`),
      };
    }),
  hydrate: () => {
    if (get().hydrated) return;
    const saved = readSession();
    set({
      hydrated: true,
      allow: allowAll,
      toggles: saved?.toggles ? { ...get().toggles, ...saved.toggles } : get().toggles,
      floors: saved?.floors ? { ...DEFAULT_FLOORS, ...saved.floors } : DEFAULT_FLOORS,
    });
  },
  toggleAllow: (id) =>
    set((s) => {
      const allow = { ...s.allow, [id]: !s.allow[id] };
      return {
        allow,
        orders: syncOrders({ ...s, allow }, s.positions),
        events: log(s.events, s.allow[id] ? "deny" : "allow", `${s.allow[id] ? "DENY" : "ALLOW"} ${id}`),
      };
    }),
  toggleStrat: (k) =>
    set((s) => {
      const toggles = { ...s.toggles, [k]: !s.toggles[k] };
      writeSession(toggles, s.floors);
      return { toggles, events: log(s.events, "allow", `${k} ${toggles[k] ? "ON" : "OFF"}`) };
    }),
  setFloor: (k, value) =>
    set((s) => {
      if (!s.allow.change_floors) return { events: log(s.events, "deny", "change_floors denied") };
      if (!Number.isFinite(value) || value <= 0 || value > 10) return s;
      const floors = { ...s.floors, [k]: value };
      writeSession(s.toggles, floors);
      const session = s.books.length
        ? simulateSessions(
            s.books.map((b) => ({ symbol: b.symbol, bars: b.bars })),
            BOOK,
            floors,
          )
        : s.session;
      return {
        floors,
        cells: s.cells.length ? applyFloors(s.cells, floors) : s.cells,
        session,
        events: log(s.events, "allow", `floor ${k} ${value}`),
      };
    }),
  halt: () =>
    set((s) => ({
      phase: s.phase === "halted" ? "performing" : "halted",
      events: log(s.events, "halt", s.phase === "halted" ? "entries resumed" : "entries halted"),
    })),
  rewalk: () => set((s) => ({ cells: [], internFills: [], barSig: "", events: log(s.events, "bar", "rewalk armed — next closed bars rescore") })),
  flattenOwned: () =>
    set((s) => {
      if (!s.allow.flatten_own) return { events: log(s.events, "deny", "flatten_own denied") };
      return affectPositions(s, s.positions, "flatten_own");
    }),
  flattenLosers: () =>
    set((s) => {
      if (!s.allow.flatten_losers) return { events: log(s.events, "deny", "flatten_losers denied") };
      const losers = s.positions.filter((p) => closePnl(p.side, p.entry, p.mark, p.qty) < 0);
      return affectPositions(s, losers, "flatten_losers");
    }),
  manual: (side) =>
    set((s) => {
      if (!s.allow.live_paper_execute) return { events: log(s.events, "deny", "live_paper_execute denied") };
      if (s.phase === "halted") return { events: log(s.events, "deny", "entries halted") };
      const scope = positionScope(s.connection);
      if (!canAffect(s.connection)) {
        const hit = coordHit("manual", scope, 0, 1, "connection has no order route");
        return { coord: [hit, ...s.coord].slice(0, 40), events: log(s.events, "coord", `manual blocked · ${s.connection}`) };
      }
      const book = s.books.find((b) => b.symbol === s.focus) ?? s.books[0];
      if (!book) return { events: log(s.events, "alert", "no book to arm") };
      if (s.positions.length >= MAX_LIVE_LEGS) return { events: log(s.events, "alert", `live cap ${MAX_LIVE_LEGS}`) };
      const px = book.quote.last || book.bars.at(-1)?.c || 0;
      if (!(px > 0)) return s;
      if (s.positions.some((p) => p.connection === s.connection && p.symbol === book.symbol && p.indication === "manual" && p.side === side)) {
        return { events: log(s.events, "alert", "manual leg already open on this symbol") };
      }
      const atr = atrSeries(book.bars).at(-1) ?? px * 0.001;
      const a = Math.max(atr, px * 0.0008);
      const base = positionNotional(BOOK);
      const qty = base / px;
      const tp = LIVE_SHORT.minTp * a;
      const sl = LIVE_SHORT.minSlOfTp * tp;
      const pos: LivePos = {
        id: `x:${TAG}M${side > 0 ? "L" : "S"}${Date.now().toString(36)}`,
        symbol: book.symbol,
        side,
        qty,
        qtyBase: qty,
        entry: px,
        mark: px,
        peak: px,
        tp: px + side * tp,
        sl: px - side * sl,
        combo: comboId(LIVE_SHORT.minTp, LIVE_SHORT.minSlOfTp),
        indication: "manual",
        hold: 0,
        dca: 0,
        openedAt: Date.now(),
        system: SYSTEM_ID,
        connection: s.connection,
        type: "position",
      };
      const positions = [...s.positions, pos];
      const hit = coordHit("manual", scope, 1, 0, `${book.symbol} stamped`);
      return {
        positions,
        orders: syncOrders(s, positions),
        coord: [hit, ...s.coord].slice(0, 40),
        events: log(s.events, "open", `manual ${side > 0 ? "long" : "short"} ${book.symbol} @ ${px} · ${scope.system}/${scope.connection}`),
      };
    }),
  ingest: (books, ts, flags) => {
    const s = get();
    try {
    const healed = healBooks(s.books, books);
    const notes = [...healed.notes];
    if (flags?.note) notes.push(flags.note);
    if (!healed.books.length) {
      get().degrade(flags?.note || "no usable books");
      return;
    }
    books = healed.books;
    const prices: Record<string, number> = {};
    const marks: Record<string, { price: number; atr: number }> = {};
    for (const b of books) {
      const last = b.quote.last || b.bars.at(-1)?.c || 0;
      prices[b.symbol] = last;
      const atr = atrSeries(b.bars);
      marks[b.symbol] = { price: last, atr: atr.at(-1) ?? last * 0.001 };
    }
    const sig = barSignature(books);
    let cells = s.cells;
    let internFills = s.internFills;
    let events = s.events;
    if (notes.length) events = log(events, "heal", notes.join(", "));
    let session = s.session;
    let phase: DeskState["phase"] = s.phase === "halted" ? "halted" : "intern-pre";
    if (sig !== s.barSig) {
      if (s.allow.intern_arm && s.allow.intern_all_pre) {
        const replay = syncBooks(
          cells,
          books.map((b) => ({ symbol: b.symbol, bars: b.bars })),
          BOOK,
          s.floors,
        );
        cells = replay.cells;
        if (replay.internFills.length) internFills = mergeFills(internFills, replay.internFills);
        session = simulateSessions(
          books.map((b) => ({ symbol: b.symbol, bars: b.bars })),
          BOOK,
          s.floors,
        );
        events = log(events, "bar", `closed bars ${replay.symbols} books · ${replay.closes} new intern closes`);
        if (session.ready) {
          events = log(
            events,
            "hour",
            `pre ${session.greenBookPre}/24 ${session.bookNetPre.toFixed(2)} · live ${session.greenBookLive}/24 ${session.bookNetLive.toFixed(2)}`,
          );
        }
        if (s.allow.promote_real && phase !== "halted") {
          phase = "performing";
          events = log(events, "promote", `${replay.valid} performing relations`);
        }
      } else {
        events = log(events, "deny", "intern scoring denied — relations held");
      }
    }
    if (phase !== "halted" && s.allow.promote_real && cells.length) phase = "performing";
    let positions = s.positions;
    let coord = s.coord;
    const scope = positionScope(s.connection);
    if (phase !== "halted" && s.allow.live_paper_execute && s.allow.promote_real && cells.length) {
      if (!canAffect(s.connection)) {
        const hit = coordHit("open", scope, 0, 1, "connection has no order route");
        if (s.coord[0]?.note !== hit.note || s.coord[0]?.connection !== hit.connection) {
          coord = [hit, ...coord].slice(0, 40);
          events = log(events, "coord", `open blocked · ${s.connection}`);
        }
      } else {
        const fresh = openFromPerforming(
          cells,
          marks,
          BOOK,
          {
            block: s.allow.block_volume && s.toggles.block,
            axis: s.allow.axis_volume && s.toggles.axis,
            normalLive: s.allow.enable_normal_live && s.toggles.normal,
            hedge: s.toggles.hedge,
          },
          { system: SYSTEM_ID, connection: s.connection },
        );
        const have = new Set(positions.map((p) => `${p.connection}|${p.symbol}|${p.indication}`));
        const room = Math.max(0, MAX_LIVE_LEGS - positions.length);
        const add = fresh.filter((p) => !have.has(`${p.connection}|${p.symbol}|${p.indication}`)).slice(0, room);
        if (add.length) {
          positions = [...positions, ...add];
          coord = [coordHit("open", scope, add.length, 0, "positions stamped to the active scope"), ...coord].slice(0, 40);
          events = log(events, "open", `live tape +${add.length} ${scope.system}/${scope.connection}`);
          if (s.allow.protect_grid) events = log(events, "protect", "SL+TP armed on owned legs");
        }
      }
    }
    let closedNet = s.closedNet;
    let liveFills = s.liveFills;
    let asOf = 0;
    for (const b of books) {
      const closed = b.bars.length > 1 ? b.bars[b.bars.length - 2]!.t : 0;
      if (closed > asOf) asOf = closed;
    }
    const split = partition(positions, scope);
    if (split.owned.length && canAffect(s.connection)) {
      const marked = markPositions(split.owned, prices, {
        trail: s.allow.trail_1_5 && s.toggles.trailing,
        dca: s.allow.enable_dca && s.toggles.dca,
        equity: BOOK,
        asOf,
      });
      const held = split.skipped.map((p) => ({ ...p, mark: prices[p.symbol] || p.mark }));
      positions = [...marked.open, ...held];
      if (marked.closed.length || marked.dca.length) {
        coord = [coordHit("mark", scope, marked.closed.length + marked.dca.length, split.skipped.length, "closes and adds stay inside the scope"), ...coord].slice(0, 40);
      }
      const closedIds = new Set(marked.closed.map((c) => c.pos.id));
      for (const d of marked.dca) {
        if (closedIds.has(d.id)) continue;
        events = log(events, "dca", `${d.symbol} add ${d.dca} @ ${d.mark}`);
      }
      for (const c of marked.closed) {
        closedNet += c.pnl;
        liveFills = [
          {
            id: `x:${c.pos.id}:${ts}`,
            tape: "live" as const,
            symbol: c.pos.symbol,
            combo: c.pos.combo,
            pnl: c.pnl,
            px: c.px,
            ts,
            side: c.pos.side,
            indication: c.pos.indication,
          },
          ...liveFills,
        ].slice(0, 200);
        events = log(events, "fill", `${c.pos.symbol} ${c.reason} ${c.pnl.toFixed(4)} @ ${c.px}`);
      }
    } else if (positions.length) {
      positions = positions.map((p) => ({ ...p, mark: prices[p.symbol] || p.mark }));
    }
    const orders = syncOrders(s, positions);
    const orderKey = (rows: WorkingOrder[]) => rows.map((o) => `${o.id}:${o.px}:${o.qty}`).join("|");
    if (orderKey(orders) !== orderKey(s.orders)) {
      const tracked = partition(orders, orderScope(s.connection));
      coord = [coordHit("protect", orderScope(s.connection), tracked.owned.length, tracked.skipped.length, "SL/TP follow owned positions only"), ...coord].slice(0, 40);
    }
    const hour = Math.floor(ts / 3_600_000);
    if (hour !== s.hour && s.hour !== 0) {
      const g = greenHour(liveFills, ts);
      events = log(events, "hour", `${g.code} live n ${g.n} net ${g.net.toFixed(2)}`);
    }
    const equity = BOOK + systemNet(closedNet, positions);
    set({
      status: flags?.stale ? "degraded" : "live",
      error: flags?.stale ? flags.note || "last good tape" : "",
      books,
      cells,
      positions,
      orders,
      coord,
      internFills,
      liveFills,
      closedNet,
      events,
      session,
      health: noteHealth(s.health, flags?.stale ? [...notes, "stale tape"] : notes),
      phase,
      ticks: s.ticks + 1,
      lastTs: ts,
      peak: Math.max(s.peak, equity),
      hour: s.hour === 0 ? hour : hour,
      barSig: sig,
    });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "engine fault";
      const cur = get();
      set({
        status: cur.books.length ? "degraded" : "error",
        error: msg,
        health: noteHealth(cur.health, [`kept last books · ${msg}`]),
        events: log(cur.events, "heal", `kept last books · ${msg}`),
      });
    }
  },
}));

function syncOrders(s: Pick<DeskState, "allow" | "connection">, positions: LivePos[]): WorkingOrder[] {
  return controlOrders(positions, { protect: s.allow.protect_grid, connection: s.connection });
}

function closeSome(s: DeskState, rows: LivePos[], reason: string): Partial<DeskState> {
  if (!rows.length) return { events: log(s.events, "flat", "nothing in scope to close") };
  const drop = new Set(rows.map((p) => p.id));
  let closed = s.closedNet;
  let live = s.liveFills;
  for (const p of rows) {
    const pnl = closePnl(p.side, p.entry, p.mark, p.qty);
    closed += pnl;
    live = [
      {
        id: `x:${p.id}:${reason}`,
        tape: "live" as const,
        symbol: p.symbol,
        combo: p.combo,
        pnl,
        px: p.mark,
        ts: Date.now(),
        side: p.side,
        indication: p.indication,
      },
      ...live,
    ];
  }
  const positions = s.positions.filter((p) => !drop.has(p.id));
  return {
    positions,
    orders: syncOrders(s, positions),
    closedNet: closed,
    liveFills: live.slice(0, 200),
    events: log(s.events, "flat", `${reason} ${rows.length} in scope`),
  };
}

function affectPositions(s: DeskState, rows: LivePos[], action: string): Partial<DeskState> {
  const scope = positionScope(s.connection);
  const { owned, skipped } = partition(rows, scope);
  if (!canAffect(s.connection)) {
    const hit = coordHit(action, scope, 0, rows.length, "connection has no order route");
    return {
      coord: [hit, ...s.coord].slice(0, 40),
      events: log(s.events, "coord", `${action} blocked · ${s.connection} · skipped ${rows.length}`),
    };
  }
  const hit = coordHit(action, scope, owned.length, skipped.length, skipped.length ? "other system, connection, or type left untouched" : "scope match");
  const closed = closeSome(s, owned, action);
  return {
    ...closed,
    coord: [hit, ...s.coord].slice(0, 40),
    events: log(closed.events ?? s.events, "coord", `${action} kept ${owned.length} skipped ${skipped.length}`),
  };
}

export function useNet() {
  return useDesk((s) => systemNet(s.closedNet, s.positions));
}

export function focusBook(s: { books: SnapBook[]; focus: string }) {
  return s.books.find((b) => b.symbol === s.focus) ?? s.books[0];
}

export function focusIndicators(bars: Bar[]) {
  return {
    rsi: rsiLast(bars),
    ema9: emaLast(bars, 9),
    ema21: emaLast(bars, 21),
    board: indicationBoard(bars),
  };
}

export function liveHeadline(liveFills: TapeFill[], minPf?: number) {
  return headline(
    liveFills.filter((f) => f.tape === "live").map((f) => ({ symbol: f.symbol, combo: f.combo, pnl: f.pnl })),
    minPf,
  );
}

export function useRollup() {
  return useDesk((s) => cellRollup(s.cells));
}
