import { create } from "zustand";
import {
  ACTIONS,
  BOOK,
  DEFAULT_FLOORS,
  LIVE_SHORT,
  MAX_LIVE_LEGS,
  TAG,
  type ActionId,
  type Floors,
} from "./constants.ts";
import {
  SYSTEM_ID,
  canAffect,
  connectionOf,
  controlOrders,
  coordHit,
  orderScope,
  partition,
  positionScope,
  type ConnectionId,
  type CoordHit,
  type WorkingOrder,
} from "./coord.ts";
import {
  atrSeries,
  barSignature,
  applyFloors,
  cellRollup,
  emaLast,
  greenHour,
  headline,
  indicationBoard,
  lastClosedBar,
  markPositions,
  mergeFills,
  openFromPerforming,
  rsiLast,
  syncBooks,
  systemNet,
  type Bar,
  type Cell,
  type LivePos,
  type TapeFill,
} from "./process.ts";
import { EMPTY_HEALTH, healBooks, noteHealth, type Health } from "./heal.ts";
import { closePnl, comboId, positionNotional } from "./math.ts";

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
  exchangeTime?: number;
};

export type SnapBook = {
  symbol: string;
  bars: Bar[];
  quote: Quote;
  funding: number | null;
  depth: { bids: [number, number][]; asks: [number, number][] };
};

type Toggles = {
  autoEntries: boolean;
  normal: boolean;
  trailing: boolean;
  axis: boolean;
  block: boolean;
  dca: boolean;
  hedge: boolean;
};

type ConnectionState = {
  status: "loading" | "live" | "degraded" | "error";
  error: string;
  books: SnapBook[];
  cells: Cell[];
  positions: LivePos[];
  orders: WorkingOrder[];
  coord: CoordHit[];
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
  health: Health;
  phase: "intern-pre" | "performing" | "halted";
  lastEntries: Record<string, number>;
  unavailable: string[];
};

type DeskState = ConnectionState & {
  focus: string;
  focusCombo: string;
  connection: ConnectionId;
  inactive: Partial<Record<ConnectionId, ConnectionState>>;
  hydrated: boolean;
  ingest: (
    books: SnapBook[],
    ts: number,
    flags?: { stale?: boolean; note?: string; unavailable?: string[] },
  ) => void;
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
const SESSION_KEY = "cts-h-settings";
const LEGACY_KEY = "helix-ctsa-session";
type Preferences = Partial<Pick<ConnectionState, "allow" | "toggles" | "floors">>;

function log(events: DeskEvent[], kind: string, msg: string): DeskEvent[] {
  return [{ t: Date.now(), kind, msg }, ...events].slice(0, 120);
}

function readPreferences(id: ConnectionId): Preferences {
  if (typeof window === "undefined") return {};
  try {
    const saved = JSON.parse(
      localStorage.getItem(`${SESSION_KEY}:${id}`) ?? "null",
    ) as Preferences | null;
    if (saved) return saved;
    if (id === "bingx-public") return JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "null") ?? {};
    return {};
  } catch {
    return {};
  }
}

function writePreferences(id: ConnectionId, s: Required<Preferences>) {
  if (typeof window === "undefined") return;
  try {
    const { allow, toggles, floors } = s;
    localStorage.setItem(`${SESSION_KEY}:${id}`, JSON.stringify({ allow, toggles, floors }));
  } catch {
    // The active desk remains usable with storage disabled.
  }
}

function initialScope(saved: Preferences = {}): ConnectionState {
  return {
    status: "loading",
    error: "",
    books: [],
    cells: [],
    positions: [],
    orders: [],
    coord: [],
    internFills: [],
    liveFills: [],
    closedNet: 0,
    events: [],
    allow: { ...allowAll, ...saved.allow },
    toggles: {
      autoEntries: false,
      normal: false,
      trailing: true,
      axis: true,
      block: true,
      dca: false,
      hedge: true,
      ...saved.toggles,
    },
    floors: { ...DEFAULT_FLOORS, ...saved.floors },
    ticks: 0,
    lastTs: 0,
    peak: BOOK,
    hour: 0,
    barSig: "",
    health: EMPTY_HEALTH,
    phase: "intern-pre",
    lastEntries: {},
    unavailable: [],
  };
}

function activeState(state: DeskState): ConnectionState {
  return Object.fromEntries(
    Object.keys(initialScope()).map((key) => [key, state[key as keyof ConnectionState]]),
  ) as ConnectionState;
}

export const useDesk = create<DeskState>((set, get) => ({
  ...initialScope(),
  focus: "BTC-USDT",
  focusCombo: "",
  connection: "bingx-public",
  inactive: {},
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
      if (id === s.connection || !s.allow.connect_exchange || !connectionOf(id)) return s;
      const inactive = { ...s.inactive, [s.connection]: activeState(s) };
      const next = inactive[id] ?? initialScope(readPreferences(id));
      delete inactive[id];
      const hit = coordHit("connect", positionScope(id), 1, 0, "paper route");
      return {
        ...next,
        status: "loading",
        connection: id,
        inactive,
        focusCombo: "",
        coord: [hit, ...next.coord].slice(0, 40),
        events: log(next.events, "coord", `${SYSTEM_ID} · ${id} · paper route`),
      };
    }),
  hydrate: () => {
    if (get().hydrated) return;
    set({ ...initialScope(readPreferences(get().connection)), hydrated: true });
  },
  toggleAllow: (id) =>
    set((s) => {
      const allow = { ...s.allow, [id]: !s.allow[id] };
      writePreferences(s.connection, { ...s, allow });
      return {
        allow,
        orders: syncOrders({ ...s, allow }, s.positions),
        events: log(
          s.events,
          s.allow[id] ? "deny" : "allow",
          `${s.allow[id] ? "DENY" : "ALLOW"} ${id}`,
        ),
      };
    }),
  toggleStrat: (k) =>
    set((s) => {
      const toggles = { ...s.toggles, [k]: !s.toggles[k] };
      writePreferences(s.connection, { ...s, toggles });
      return { toggles, events: log(s.events, "allow", `${k} ${toggles[k] ? "ON" : "OFF"}`) };
    }),
  setFloor: (k, value) =>
    set((s) => {
      if (!s.allow.change_floors) return { events: log(s.events, "deny", "change_floors denied") };
      if (!Number.isFinite(value) || value <= 0 || value > 10) return s;
      const floors = { ...s.floors, [k]: value };
      writePreferences(s.connection, { ...s, floors });
      return {
        floors,
        cells: s.cells.length ? applyFloors(s.cells, floors) : s.cells,
        events: log(s.events, "allow", `floor ${k} ${value}`),
      };
    }),
  halt: () =>
    set((s) => ({
      phase: s.phase === "halted" ? "performing" : "halted",
      events: log(s.events, "halt", s.phase === "halted" ? "entries resumed" : "entries halted"),
    })),
  rewalk: () =>
    set((s) => ({
      cells: [],
      internFills: [],
      barSig: "",
      events: log(s.events, "bar", "rewalk armed — next closed bars rescore"),
    })),
  flattenOwned: () =>
    set((s) => {
      if (!s.allow.flatten_own) return { events: log(s.events, "deny", "flatten_own denied") };
      return affectPositions(s, s.positions, "flatten_own");
    }),
  flattenLosers: () =>
    set((s) => {
      if (!s.allow.flatten_losers)
        return { events: log(s.events, "deny", "flatten_losers denied") };
      const losers = s.positions.filter((p) => closePnl(p.side, p.entry, p.mark, p.qty) < 0);
      return affectPositions(s, losers, "flatten_losers");
    }),
  manual: (side) =>
    set((s) => {
      if (!s.allow.live_paper_execute)
        return { events: log(s.events, "deny", "live_paper_execute denied") };
      if (s.phase === "halted") return { events: log(s.events, "deny", "entries halted") };
      const scope = positionScope(s.connection);
      if (!canAffect(s.connection)) {
        const hit = coordHit("manual", scope, 0, 1, "connection has no order route");
        return {
          coord: [hit, ...s.coord].slice(0, 40),
          events: log(s.events, "coord", `manual blocked · ${s.connection}`),
        };
      }
      const book = s.books.find((b) => b.symbol === s.focus);
      if (!book) return { events: log(s.events, "alert", "no book to arm") };
      if (s.positions.length >= MAX_LIVE_LEGS)
        return { events: log(s.events, "alert", `live cap ${MAX_LIVE_LEGS}`) };
      if (
        s.status !== "live" ||
        s.unavailable.includes(book.symbol) ||
        (book.quote.exchangeTime != null && Date.now() - book.quote.exchangeTime > 20_000)
      ) {
        return { events: log(s.events, "deny", "A fresh quote is required for a paper entry.") };
      }
      const px = book.quote.last;
      if (!(px > 0)) return s;
      if (
        s.positions.some(
          (p) =>
            p.connection === s.connection &&
            p.symbol === book.symbol &&
            p.indication === "manual" &&
            p.side === side,
        )
      ) {
        return { events: log(s.events, "alert", "manual leg already open on this symbol") };
      }
      const atr = atrSeries(book.bars).at(-1) ?? px * 0.001;
      const a = Math.max(atr, px * 0.0008);
      const base = positionNotional(BOOK);
      const qty = base / px;
      const tp = LIVE_SHORT.minTp * a;
      const sl = LIVE_SHORT.minSlOfTp * tp;
      const pos: LivePos = {
        id: `x:${TAG}${s.connection}:manual:${crypto.randomUUID()}`,
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
        events: log(
          s.events,
          "open",
          `manual ${side > 0 ? "long" : "short"} ${book.symbol} @ ${px} · ${scope.system}/${scope.connection}`,
        ),
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
      const unavailable = new Set(flags?.unavailable ?? []);
      const prices: Record<string, number> = {};
      const barTime: Record<string, number> = {};
      const marks: Record<string, { price: number; atr: number }> = {};
      for (const b of books) {
        if (flags?.stale || unavailable.has(b.symbol)) continue;
        const last = b.quote.last;
        if (!(last > 0) || (b.quote.exchangeTime != null && ts - b.quote.exchangeTime > 20_000)) {
          unavailable.add(b.symbol);
          continue;
        }
        prices[b.symbol] = last;
        barTime[b.symbol] = lastClosedBar(b.bars)?.t ?? 0;
        marks[b.symbol] = { price: last, atr: 0 };
      }
      const sig = barSignature(books);
      let cells = s.cells;
      let internFills = s.internFills;
      let events = s.events;
      if (notes.length && notes.join(", ") !== s.health.lastNote)
        events = log(events, "heal", notes.join(", "));
      let phase: DeskState["phase"] = s.phase === "halted" ? "halted" : "intern-pre";
      if (sig !== s.barSig) {
        if (s.allow.intern_arm && s.allow.intern_all_pre) {
          const replay = syncBooks(
            cells,
            books.map((b) => ({ symbol: b.symbol, bars: b.bars })),
            BOOK,
            s.floors,
            s.connection,
          );
          cells = replay.cells;
          if (replay.internFills.length) internFills = mergeFills(internFills, replay.internFills);
          events = log(
            events,
            "bar",
            `closed bars ${replay.symbols} books · ${replay.closes} new intern closes`,
          );
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
      const lastEntries = { ...s.lastEntries };
      if (
        phase === "performing" &&
        s.toggles.autoEntries &&
        s.allow.live_paper_execute &&
        cells.length &&
        canAffect(s.connection)
      ) {
        const { owned } = partition(positions, scope);
        const key = (row: Pick<LivePos, "symbol" | "indication">) =>
          s.toggles.hedge ? `${row.symbol}|${row.indication}` : row.symbol;
        const have = new Set(owned.map(key));
        const room = Math.max(0, MAX_LIVE_LEGS - owned.length);
        const eligible =
          room > 0
            ? cells.filter((c) => {
                const time = barTime[c.symbol];
                return (
                  time &&
                  c.cursorT === time &&
                  !have.has(key(c)) &&
                  (lastEntries[`${c.symbol}|${c.indication}`] ?? 0) < time
                );
              })
            : [];
        if (eligible.length) {
          for (const book of books) {
            const mark = marks[book.symbol];
            if (mark) mark.atr = atrSeries(book.bars).at(-1) ?? mark.price * 0.001;
          }
          const fresh = openFromPerforming(
            eligible,
            marks,
            BOOK,
            {
              block: s.allow.block_volume && s.toggles.block,
              axis: s.allow.axis_volume && s.toggles.axis,
              normalLive: s.allow.enable_normal_live && s.toggles.normal,
              hedge: s.toggles.hedge,
              floors: s.floors,
            },
            scope,
          );
          const add = fresh.slice(0, room);
          for (const p of add) lastEntries[`${p.symbol}|${p.indication}`] = barTime[p.symbol]!;
          if (add.length) {
            positions = [...positions, ...add];
            coord = [
              coordHit("open", scope, add.length, 0, "positions stamped to the active scope"),
              ...coord,
            ].slice(0, 40);
            events = log(
              events,
              "open",
              `paper +${add.length} ${scope.system}/${scope.connection}`,
            );
            if (s.allow.protect_grid) events = log(events, "protect", "SL+TP armed on owned legs");
          }
        }
      }
      let closedNet = s.closedNet;
      let liveFills = s.liveFills;
      let asOf = 0;
      for (const b of books) {
        const closed = barTime[b.symbol] ?? 0;
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
        const held = split.skipped;
        positions = [...marked.open, ...held];
        if (marked.closed.length || marked.dca.length) {
          coord = [
            coordHit(
              "mark",
              scope,
              marked.closed.length + marked.dca.length,
              split.skipped.length,
              "closes and adds stay inside the scope",
            ),
            ...coord,
          ].slice(0, 40);
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
      }
      const orders = syncOrders(s, positions);
      const orderKey = (rows: WorkingOrder[]) =>
        rows.map((o) => `${o.id}:${o.px}:${o.qty}`).join("|");
      if (orderKey(orders) !== orderKey(s.orders)) {
        const tracked = partition(orders, orderScope(s.connection));
        coord = [
          coordHit(
            "protect",
            orderScope(s.connection),
            tracked.owned.length,
            tracked.skipped.length,
            "SL/TP follow owned positions only",
          ),
          ...coord,
        ].slice(0, 40);
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
        health: noteHealth(s.health, flags?.stale ? [...notes, "stale tape"] : notes),
        phase,
        ticks: s.ticks + 1,
        lastTs: ts,
        peak: Math.max(s.peak, equity),
        hour,
        lastEntries,
        unavailable: [...unavailable],
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

function syncOrders(
  s: Pick<DeskState, "allow" | "connection">,
  positions: LivePos[],
): WorkingOrder[] {
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
      events: log(
        s.events,
        "coord",
        `${action} blocked · ${s.connection} · skipped ${rows.length}`,
      ),
    };
  }
  const ready = owned.filter((position) => {
    const quote = s.books.find((book) => book.symbol === position.symbol)?.quote;
    return (
      s.status === "live" &&
      quote &&
      !s.unavailable.includes(position.symbol) &&
      (quote.exchangeTime == null || Date.now() - quote.exchangeTime <= 20_000)
    );
  });
  const omitted = skipped.length + owned.length - ready.length;
  const hit = coordHit(
    action,
    scope,
    ready.length,
    omitted,
    omitted > 0 ? "Closed only owned positions with fresh marks" : "scope match",
  );
  const closed = closeSome(s, ready, action);
  return {
    ...closed,
    coord: [hit, ...s.coord].slice(0, 40),
    events: log(
      closed.events ?? s.events,
      "coord",
      `${action} closed ${ready.length} · held ${omitted}`,
    ),
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
    liveFills
      .filter((f) => f.tape === "live")
      .map((f) => ({ symbol: f.symbol, combo: f.combo, pnl: f.pnl })),
    minPf,
  );
}

export function useRollup() {
  return useDesk((s) => cellRollup(s.cells));
}
