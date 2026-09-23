import { useMemo, useState } from "react";
import { CandleChart } from "./chart";
import { Panel, Stat } from "./shell";
import {
  ACTION_COPY,
  ACTIONS,
  BLOCK_ADD,
  BLOCK_SHARED,
  BOOK,
  INDICATIONS,
  LIVE_BLOCK_COUNTS,
  LIVE_SHORT,
  SHORT_SL,
  SHORT_TP,
  TRAIL_PCT,
  type Floors,
} from "@/lib/desk/constants";
import { axisQty, blockQty, comboId, liveShortOk, pfFromPnls, positionNotional } from "@/lib/desk/math";
import { atrSeries, barSignature, cellRollup, greenHour, simulateSessions, type HourPoint, type ReplaySize, type TapeFill } from "@/lib/desk/process";
import { closePnl } from "@/lib/desk/math";
import { focusBook, focusIndicators, liveHeadline, useDesk, useNet } from "@/lib/desk/store";
import { CONNECTIONS, SYSTEM_ID, canAffect, orderStats, owns, positionScope } from "@/lib/desk/coord";

function money(n: number) {
  const sign = n < 0 ? "-" : n > 0 ? "+" : "";
  return `${sign}${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

function pfOf(gw: number, gl: number) {
  if (gl < 1e-12) return gw > 1e-12 ? 4 : 0;
  return gw / gl;
}

export function OverviewPage() {
  const books = useDesk((s) => s.books);
  const focus = useDesk((s) => s.focus);
  const setFocus = useDesk((s) => s.setFocus);
  const book = useDesk((s) => focusBook(s));
  const positions = useDesk((s) => s.positions);
  const events = useDesk((s) => s.events);
  const cells = useDesk((s) => s.cells);
  const status = useDesk((s) => s.status);
  const error = useDesk((s) => s.error);
  const live = useDesk((s) => s.liveFills);
  const lastTs = useDesk((s) => s.lastTs);
  const phase = useDesk((s) => s.phase);
  const net = useNet();
  const roll = useMemo(() => cellRollup(cells), [cells]);
  const hour = greenHour(live, lastTs || Date.now());
  const session = useDesk((s) => s.session);

  return (
    <div className="flex flex-col gap-4">
      {status === "error" ? <Panel title="Feed">{error}</Panel> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat k="System net" v={money(net)} tone={net >= 0 ? "bid" : "ask"} />
        <Stat k="Performing" v={`${roll.valid} / ${roll.n || "—"}`} />
        <Stat k="Intern samples" v={String(roll.samples)} />
        <Stat k="Hour" v={`${hour.code} · ${money(hour.net)}`} tone={hour.code === "R1" ? "ask" : hour.code === "G1" ? "bid" : undefined} />
      </div>
      {session?.ready ? (
        <Panel title="24h book · prior day locked, latest day replayed">
          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            <Stat k="Pre 24h" v={`${money(session.bookNetPre)} · ${session.greenBookPre}/24`} tone={session.bookNetPre >= 0 ? "bid" : "ask"} />
            <Stat k="Live 24h" v={`${money(session.bookNetLive)} · ${session.greenBookLive}/24`} tone={session.bookNetLive >= 0 ? "bid" : "ask"} />
          </div>
          <HourDiagram rows={session.bookLive} />
          <p className="mt-3 text-sm text-muted">{session.note}</p>
        </Panel>
      ) : null}
      <div className="flex gap-2 overflow-x-auto">
        {books.map((b) => (
          <button
            key={b.symbol}
            onClick={() => setFocus(b.symbol)}
            className={`min-w-28 rounded-md border px-3 py-2 text-left font-mono text-xs ${b.symbol === focus ? "border-accent bg-surface-2" : "border-line"}`}
          >
            <div>{b.symbol}</div>
            <div className={b.quote.changePct >= 0 ? "text-bid" : "text-ask"}>
              {b.quote.last} {b.quote.changePct.toFixed(2)}%
            </div>
          </button>
        ))}
      </div>
      {book ? <CandleChart bars={book.bars} symbol={book.symbol} /> : <Panel title="Chart">Waiting for live 1h bars.</Panel>}
      {book && book.depth.bids.length ? (
        <Panel title="Book">
          <div className="grid grid-cols-2 gap-4 font-mono text-xs">
            <div>
              {book.depth.asks
                .slice(0, 6)
                .reverse()
                .map(([p, q]) => (
                  <div key={`a${p}`} className="text-ask">
                    {p} · {q}
                  </div>
                ))}
            </div>
            <div>
              {book.depth.bids.slice(0, 6).map(([p, q]) => (
                <div key={`b${p}`} className="text-bid">
                  {p} · {q}
                </div>
              ))}
            </div>
          </div>
        </Panel>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={`Owned legs · ${phase}`}>
          <PosTable />
        </Panel>
        <Panel title="Events">
          <ul className="max-h-72 space-y-1 overflow-auto font-mono text-xs text-muted">
            {events.map((e, i) => (
              <li key={`${e.t}-${i}`}>
                <span className="text-dim">{e.kind}</span> · {e.msg}
              </li>
            ))}
            {!events.length ? <li>No events yet. The first closed-bar pass scores the GRID.</li> : null}
          </ul>
        </Panel>
      </div>
      <p className="font-mono text-xs text-dim">
        Intern net {money(roll.net)} stays off the live tape. Disabled {roll.disabled}. Open {positions.length}.
      </p>
    </div>
  );
}

function PosTable() {
  const positions = useDesk((s) => s.positions);
  const connection = useDesk((s) => s.connection);
  const flat = useDesk((s) => s.flattenOwned);
  const losers = useDesk((s) => s.flattenLosers);
  const scope = positionScope(connection);
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <button onClick={flat} className="rounded-md bg-ask px-3 py-2 text-sm text-bg">
          Flatten in scope
        </button>
        <button onClick={losers} className="rounded-md border border-line px-3 py-2 text-sm">
          Flatten losers in scope
        </button>
      </div>
      <p className="mb-3 text-sm text-muted">
        Exchange actions use {scope.system} · {scope.connection} · {scope.type}. Other rows stay tracked and are not closed, trailed, or added to.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full font-mono text-xs">
          <thead className="text-dim">
            <tr>
              <th className="py-1 text-left">Sym</th>
              <th className="text-left">Side</th>
              <th className="text-left">Scope</th>
              <th className="text-left">Entry</th>
              <th className="text-left">Mark</th>
              <th className="text-left">SL</th>
              <th className="text-left">TP</th>
              <th className="text-left">uPnL</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => {
              const u = closePnl(p.side, p.entry, p.mark, p.qty);
              const mine = owns(p, scope);
              return (
                <tr key={p.id} className="border-t border-line">
                  <td className="py-1">{p.symbol}</td>
                  <td className={p.side > 0 ? "text-bid" : "text-ask"}>{p.side > 0 ? "long" : "short"}</td>
                  <td className={mine ? "text-bid" : "text-warn"}>
                    {p.system} · {p.connection} · {p.type}
                    {mine ? "" : " · held"}
                  </td>
                  <td>{p.entry}</td>
                  <td>{p.mark}</td>
                  <td>{p.sl.toPrecision(6)}</td>
                  <td>{p.tp.toPrecision(6)}</td>
                  <td className={u >= 0 ? "text-bid" : "text-ask"}>{money(u)}</td>
                </tr>
              );
            })}
            {!positions.length ? (
              <tr>
                <td colSpan={8} className="py-2 text-muted">
                  No tracked positions. New legs are stamped {SYSTEM_ID} · {connection} · position.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AllowPage() {
  const allow = useDesk((s) => s.allow);
  const toggle = useDesk((s) => s.toggleAllow);
  const on = ACTIONS.filter((id) => allow[id]).length;
  return (
    <Panel title={`Explicit allow · ${on}/${ACTIONS.length}`}>
      <p className="mb-3 text-sm text-muted">
        This session starts with every action allowed. Deny stops that step on the next event. connect_exchange arms the public quote feed only — the desk never sends a signed order.
      </p>
      <div className="grid gap-2">
        {ACTIONS.map((id) => (
          <button
            key={id}
            onClick={() => toggle(id)}
            className={`flex items-center justify-between gap-3 rounded-md border px-3 py-3 text-left font-mono text-sm ${allow[id] ? "border-bid bg-surface-2 text-bid" : "border-line text-muted"}`}
          >
            <span>
              <span className="block">{id}</span>
              <span className="block text-xs text-muted">{ACTION_COPY[id]}</span>
            </span>
            <span>{allow[id] ? "ALLOW" : "DENY"}</span>
          </button>
        ))}
      </div>
    </Panel>
  );
}

export function StrategiesPage() {
  const toggles = useDesk((s) => s.toggles);
  const allow = useDesk((s) => s.allow);
  const toggle = useDesk((s) => s.toggleStrat);
  const rows: { k: keyof typeof toggles; need: string; note: string }[] = [
    { k: "normal", need: "enable_normal_live", note: "Unadjusted direction lane. Off so it does not print unless you arm both." },
    { k: "trailing", need: "trail_1_5", note: "1.5% stop from peak on owned legs." },
    { k: "axis", need: "axis_volume", note: "3.0× partial, depth 2, capped at 2.5× base." },
    { k: "block", need: "block_volume", note: "Additive 0.2 on N=1,3,4,5,6. N=2 is skipped." },
    { k: "dca", need: "enable_dca", note: "One extra clip only after price is well through the stop path. Default off." },
    { k: "hedge", need: "live_paper_execute", note: "Both directions may be open. Off keeps a single leg per symbol." },
  ];
  return (
    <Panel title="Playbooks">
      <div className="grid gap-2">
        {rows.map((row) => {
          const armed = toggles[row.k] && allow[row.need as keyof typeof allow];
          return (
            <button key={row.k} onClick={() => toggle(row.k)} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-3 text-left">
              <span>
                <span className="block font-mono">{row.k}</span>
                <span className="block text-sm text-muted">{row.note}</span>
              </span>
              <span className={armed ? "text-bid" : "text-muted"}>{armed ? "ARMED" : toggles[row.k] ? "ON · gated" : "OFF"}</span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

export function TacticsPage() {
  const base = positionNotional(BOOK);
  const block = blockQty(base);
  const axis = axisQty(base);
  const both = Math.min(base * 2.5, block + (axis - base));
  return (
    <Panel title="Sizing on the live book">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat k="Base notional" v={money(base)} />
        <Stat k="Block size" v={money(block)} />
        <Stat k="Axis size" v={money(axis)} />
        <Stat k="Block + axis cap" v={money(both)} />
      </div>
      <ul className="mt-4 space-y-2 text-sm text-muted">
        <li>Trail {TRAIL_PCT}% from peak. Disabled trail distances snap back to 1.5.</li>
        <li>Block counts {LIVE_BLOCK_COUNTS.join(", ")} · additive {BLOCK_ADD} · shared book factor {BLOCK_SHARED} · hard cap 2.5×.</li>
        <li>0.08 and any non-positive size fall back to the canonical 0.2 / 3.0 factors.</li>
        <li>Live short floor TP ≥ {LIVE_SHORT.minTp}, SL/TP ≥ {LIVE_SHORT.minSlOfTp}, TP ≤ {LIVE_SHORT.maxTp}.</li>
        <li>Protect keeps the wide SL and the TP from the cell. Trail may only tighten the stop.</li>
        <li>Round trip deducts 0.12% of the average fill on every close, intern and live.</li>
      </ul>
    </Panel>
  );
}

export function LanesPage() {
  const book = useDesk((s) => focusBook(s));
  const cells = useDesk((s) => s.cells);
  const ind = book ? focusIndicators(book.bars) : null;
  const counts = useMemo(() => {
    const map = new Map<string, { n: number; valid: number }>();
    const symbol = book?.symbol;
    for (const c of cells) {
      if (symbol && c.symbol !== symbol) continue;
      const g = map.get(c.indication) ?? { n: 0, valid: 0 };
      g.n += c.n;
      if (c.validExec && !c.disabled) g.valid += 1;
      map.set(c.indication, g);
    }
    return map;
  }, [cells, book?.symbol]);
  return (
    <Panel title={book ? `Indications · ${book.symbol}` : "Indications"}>
      <div className="grid gap-2 sm:grid-cols-2">
        {(ind?.board ?? INDICATIONS.map((name) => ({ name, side: 0 as const, detail: "—" }))).map((row) => {
          const c = counts.get(row.name);
          return (
            <div key={row.name} className="rounded-md border border-line p-3">
              <div className="flex items-center justify-between font-mono text-sm">
                <span>{row.name}</span>
                <span className={row.side > 0 ? "text-bid" : row.side < 0 ? "text-ask" : "text-dim"}>
                  {row.side > 0 ? "long" : row.side < 0 ? "short" : "flat"}
                </span>
              </div>
              <div className="text-sm text-muted">{row.detail}</div>
              <div className="font-mono text-xs text-dim">
                samples {c?.n ?? 0} · performing {c?.valid ?? 0}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

export function CombinationsPage() {
  const cells = useDesk((s) => s.cells);
  const focusCombo = useDesk((s) => s.focusCombo);
  const setFocusCombo = useDesk((s) => s.setFocusCombo);
  const grid = useMemo(() => {
    const map = new Map<string, { n: number; gw: number; gl: number; net: number; valid: number }>();
    for (const c of cells) {
      const id = comboId(c.tpAtr, c.slOfTp);
      const g = map.get(id) ?? { n: 0, gw: 0, gl: 0, net: 0, valid: 0 };
      g.n += c.n;
      g.gw += c.gw;
      g.gl += c.gl;
      g.net += c.net;
      if (c.validExec && !c.disabled) g.valid += 1;
      map.set(id, g);
    }
    return map;
  }, [cells]);
  const detail = useMemo(() => {
    if (!focusCombo) return [];
    return cells
      .filter((c) => c.id.endsWith(focusCombo))
      .sort((a, b) => b.pf - a.pf)
      .slice(0, 12);
  }, [cells, focusCombo]);

  return (
    <div className="flex flex-col gap-4">
      <Panel title="Short GRID 14 × 9">
        <p className="mb-3 text-sm text-muted">
          {SHORT_TP.length * SHORT_SL.length} cells scored on closed BingX 1h bars, across eight indications. Dim cells miss the live floor. Select a cell to read its relations.
        </p>
        <div className="overflow-x-auto">
          <div className="grid min-w-[640px] grid-cols-[4rem_repeat(9,minmax(0,1fr))] gap-1">
            <div />
            {SHORT_SL.map((sl) => (
              <div key={sl} className="text-center font-mono text-xs text-dim">
                {sl}
              </div>
            ))}
            {SHORT_TP.map((tp) => (
              <div key={tp} className="contents">
                <div className="font-mono text-xs text-dim">{tp.toFixed(2)}</div>
                {SHORT_SL.map((sl) => {
                  const id = comboId(tp, sl);
                  const g = grid.get(id);
                  const pf = g ? pfOf(g.gw, g.gl) : 0;
                  const live = liveShortOk(tp, sl);
                  const tone = !live ? "bg-line text-dim" : pf >= 0.95 && (g?.net ?? 0) > 0 ? "bg-bid text-bg" : (g?.n ?? 0) > 0 ? "bg-warn text-bg" : "bg-ask text-bg";
                  return (
                    <button
                      key={id}
                      onClick={() => setFocusCombo(id)}
                      className={`h-11 rounded-sm font-mono text-xs ${tone} ${focusCombo === id ? "ring-2 ring-accent" : ""}`}
                    >
                      {g && g.n ? pf.toFixed(1) : "·"}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </Panel>
      <Panel title={focusCombo || "Relation"}>
        {detail.length ? (
          <ul className="space-y-1 font-mono text-xs">
            {detail.map((c) => (
              <li key={c.id}>
                {c.symbol} {c.indication} pf {c.pf.toFixed(2)} n {c.n} net {money(c.net)} {c.validExec && !c.disabled ? "valid" : c.disabled ? "disabled" : "held"}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Pick a cell. Empty until the first closed-bar pass finishes.</p>
        )}
      </Panel>
    </div>
  );
}

export function HeatmapPage() {
  const cells = useDesk((s) => s.cells);
  const heat = useMemo(() => {
    const symbols: string[] = [];
    const map = new Map<string, { net: number; gw: number; gl: number; n: number }>();
    for (const c of cells) {
      if (!symbols.includes(c.symbol)) symbols.push(c.symbol);
      const k = `${c.symbol}|${c.indication}`;
      const g = map.get(k) ?? { net: 0, gw: 0, gl: 0, n: 0 };
      g.net += c.net;
      g.gw += c.gw;
      g.gl += c.gl;
      g.n += c.n;
      map.set(k, g);
    }
    return { symbols, map };
  }, [cells]);
  return (
    <Panel title="Symbol × indication">
      <p className="mb-3 text-sm text-muted">Net of the short GRID on each live book. This is not the combo grid.</p>
      <div className="overflow-x-auto">
        <table className="w-full font-mono text-xs">
          <thead className="text-dim">
            <tr>
              <th className="py-1 text-left">Symbol</th>
              {INDICATIONS.map((n) => (
                <th key={n} className="text-left">
                  {n}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {heat.symbols.map((symbol) => (
              <tr key={symbol} className="border-t border-line">
                <td className="py-1">{symbol}</td>
                {INDICATIONS.map((ind) => {
                  const g = heat.map.get(`${symbol}|${ind}`);
                  const net = g?.net ?? 0;
                  return (
                    <td key={ind} className={net > 0 ? "text-bid" : net < 0 ? "text-ask" : "text-dim"}>
                      {g && g.n ? money(net) : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!heat.symbols.length ? (
              <tr>
                <td colSpan={9} className="py-2 text-muted">
                  Waiting for the intern pass.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function PositionsPage() {
  return (
    <Panel title="Positions · symbol × direction">
      <PosTable />
    </Panel>
  );
}

export function OrdersPage() {
  const positions = useDesk((s) => s.positions);
  const orders = useDesk((s) => s.orders);
  const connection = useDesk((s) => s.connection);
  const protect = useDesk((s) => s.allow.protect_grid);
  const live = useDesk((s) => s.liveFills);
  const intern = useDesk((s) => s.internFills);
  const scope = { system: SYSTEM_ID, connection, type: "order" as const };
  const stats = orderStats(positions, orders, { protect, connection });
  const owned = orders.filter((o) => owns(o, scope));
  const held = orders.filter((o) => !owns(o, scope));
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat k="In-scope qty" v={stats.qty.toPrecision(4)} />
        <Stat k="Vs base" v={stats.base > 0 ? `${stats.mul.toFixed(2)}×` : "—"} />
        <Stat k="Notional" v={money(stats.notional)} />
        <Stat k="Order mismatches" v={String(stats.mismatches)} tone={stats.mismatches ? "ask" : "bid"} />
      </div>
      <Panel title={`Control orders · ${scope.system} · ${scope.connection} · ${scope.type}`}>
        <p className="mb-3 text-sm text-muted">
          Each owned position has one reduce-only stop and one reduce-only target. The close side is opposite the position. Quantity tracks the sized leg, capped at 2.5× base, including block, axis, and adds. A stop or target fills at its own price. {owned.length} in scope, {held.length} tracked on another connection and not amended. Protect {protect ? "on" : "off"}.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-xs">
            <thead className="text-dim">
              <tr>
                <th className="py-1 text-left">Order</th>
                <th className="text-left">Kind</th>
                <th className="text-left">Close</th>
                <th className="text-left">Sym</th>
                <th className="text-left">Qty</th>
                <th className="text-left">Px</th>
                <th className="text-left">Scope</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const mine = owns(o, scope);
                return (
                  <tr key={o.id} className="border-t border-line">
                    <td className="py-1">{o.kind === "sl" ? "stop" : "target"}</td>
                    <td>{o.reduceOnly ? "reduce" : "open"}</td>
                    <td className={o.side > 0 ? "text-bid" : "text-ask"}>{o.side > 0 ? "buy" : "sell"}</td>
                    <td>{o.symbol}</td>
                    <td>{o.qty.toPrecision(4)}</td>
                    <td>{o.px}</td>
                    <td className={mine ? "text-bid" : "text-warn"}>
                      {o.system} · {o.connection}
                      {mine ? "" : " · held"}
                    </td>
                  </tr>
                );
              })}
              {!orders.length ? (
                <tr>
                  <td colSpan={7} className="py-2 text-muted">
                    No working orders.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Live tape x:">
          <FillList rows={live} />
        </Panel>
        <Panel title="Intern tape i: · not an exchange type">
          <FillList rows={intern} />
        </Panel>
      </div>
    </div>
  );
}

function FillList({ rows }: { rows: TapeFill[] }) {
  return (
    <ul className="max-h-80 space-y-1 overflow-auto font-mono text-xs">
      {rows.slice(0, 40).map((f) => (
        <li key={f.id} className={f.pnl >= 0 ? "text-bid" : "text-ask"}>
          {f.symbol} {f.indication ?? ""} {f.combo} @ {f.px} {money(f.pnl)}
        </li>
      ))}
      {!rows.length ? <li className="text-muted">Empty.</li> : null}
    </ul>
  );
}

export function PerformancePage() {
  const cells = useDesk((s) => s.cells);
  const live = useDesk((s) => s.liveFills);
  const peak = useDesk((s) => s.peak);
  const net = useNet();
  const livePf = pfFromPnls(live);
  const roll = useMemo(() => cellRollup(cells), [cells]);
  const wins = live.filter((f) => f.pnl > 0).length;
  const byInd = useMemo(() => {
    const map = new Map<string, { gw: number; gl: number; n: number; net: number }>();
    for (const c of cells) {
      const g = map.get(c.indication) ?? { gw: 0, gl: 0, n: 0, net: 0 };
      g.gw += c.gw;
      g.gl += c.gl;
      g.n += c.n;
      g.net += c.net;
      map.set(c.indication, g);
    }
    return [...map.entries()].sort((a, b) => b[1].net - a[1].net);
  }, [cells]);
  const curve = useMemo(() => {
    const rows = [...live].sort((a, b) => a.ts - b.ts);
    let y = 0;
    return rows.map((f) => {
      y += f.pnl;
      return y;
    });
  }, [live]);
  const equity = BOOK + net;
  const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat k="Intern net" v={money(roll.net)} tone={roll.net >= 0 ? "bid" : "ask"} />
        <Stat k="Live PF" v={live.length ? livePf.toFixed(2) : "—"} />
        <Stat k="Live win rate" v={live.length ? `${Math.round((wins / live.length) * 100)}%` : "—"} />
        <Stat k="Peak drawdown" v={`${dd.toFixed(2)}%`} />
      </div>
      <Panel title="Live equity steps">
        <Curve points={curve} />
      </Panel>
      <Panel title="Intern PF by indication">
        <ul className="space-y-1 font-mono text-xs">
          {byInd.map(([name, g]) => (
            <li key={name}>
              {name} pf {pfOf(g.gw, g.gl).toFixed(2)} n {g.n} net {money(g.net)}
            </li>
          ))}
          {!byInd.length ? <li className="text-muted">No scored relations yet.</li> : null}
        </ul>
      </Panel>
    </div>
  );
}

function Curve({ points }: { points: number[] }) {
  if (points.length < 2) return <p className="text-sm text-muted">Live closes draw this. Intern fills stay off it.</p>;
  const lo = Math.min(...points, 0);
  const hi = Math.max(...points, 0);
  const span = hi - lo || 1;
  const d = points
    .map((y, i) => {
      const x = (i / (points.length - 1)) * 100;
      const yy = 40 - ((y - lo) / span) * 36;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${yy.toFixed(2)}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 100 44" className="h-36 w-full">
      <path d={d} fill="none" className="stroke-accent" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function ResultsPage() {
  const fills = useDesk((s) => s.liveFills);
  const floors = useDesk((s) => s.floors);
  const lastTs = useDesk((s) => s.lastTs);
  const head = liveHeadline(fills, floors.short);
  const hour = greenHour(fills, lastTs || Date.now());
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat k="Green hour" v={hour.code} tone={hour.code === "R1" ? "ask" : hour.code === "G1" ? "bid" : undefined} />
        <Stat k="Hour net" v={money(hour.net)} tone={hour.net >= 0 ? "bid" : "ask"} />
        <Stat k="Headline rows" v={String(head.length)} />
      </div>
      <Panel title="Headline · live tape only">
        {head.length ? (
          head.map((h) => (
            <div key={h.id} className="font-mono text-sm">
              {h.id} PF {h.pf.toFixed(2)} n {h.n} net {money(h.net)}
            </div>
          ))
        ) : (
          <p className="text-sm text-muted">No live subset yet. Needs n at least 4, positive net, and PF at or above {floors.short} on x: closes. Intern paper is ignored.</p>
        )}
      </Panel>
      <Panel title="Live tape">
        <FillList rows={fills} />
      </Panel>
    </div>
  );
}

export function StatisticsPage() {
  const books = useDesk((s) => s.books);
  const focus = useDesk((s) => focusBook(s));
  const rows = useMemo(
    () =>
      books.map((b) => {
        const closed = b.bars.length > 1 ? b.bars.slice(0, -1) : b.bars;
        const day = closed.slice(-24);
        const hi = day.reduce((m, bar) => Math.max(m, bar.h), 0);
        const lo = day.reduce((m, bar) => Math.min(m, bar.l), Number.POSITIVE_INFINITY);
        const first = day[0]?.o ?? 0;
        const last = day.at(-1)?.c ?? 0;
        const ret = first > 0 ? last / first - 1 : 0;
        const atr = atrSeries(closed).at(-1) ?? 0;
        return { symbol: b.symbol, last: b.quote.last, change: b.quote.changePct, hi, lo, ret, atr, bars: closed.length, closes: day.map((bar) => bar.c), vol: b.quote.quoteVolume };
      }),
    [books],
  );
  return (
    <Panel title="Exchange statistics">
      <p className="mb-3 text-sm text-muted">
        Funding {focus?.funding == null ? "—" : `${(focus.funding * 100).toFixed(4)}%`} on {focus?.symbol}. Range, return, and ATR use the last 24 closed BingX hours. The quote change is the exchange 24h print.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full font-mono text-xs">
          <thead className="text-dim">
            <tr>
              <th className="py-1 text-left">Symbol</th>
              <th className="text-left">Last</th>
              <th className="text-left">24h quote</th>
              <th className="text-left">24h return</th>
              <th className="text-left">24h range</th>
              <th className="text-left">ATR</th>
              <th className="text-left">Quote vol</th>
              <th className="text-left">Path</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.symbol} className="border-t border-line">
                <td className="py-1">{b.symbol}</td>
                <td>{b.last}</td>
                <td className={b.change >= 0 ? "text-bid" : "text-ask"}>{b.change.toFixed(2)}%</td>
                <td className={b.ret >= 0 ? "text-bid" : "text-ask"}>{(b.ret * 100).toFixed(2)}%</td>
                <td>{b.lo === Number.POSITIVE_INFINITY ? "—" : `${((b.hi - b.lo) / (b.last || 1) * 100).toFixed(2)}%`}</td>
                <td>{b.atr ? b.atr.toPrecision(4) : "—"}</td>
                <td>{Math.round(b.vol).toLocaleString()}</td>
                <td>
                  <Spark values={b.closes} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function EnginePage() {
  const ticks = useDesk((s) => s.ticks);
  const last = useDesk((s) => s.lastTs);
  const phase = useDesk((s) => s.phase);
  const halt = useDesk((s) => s.halt);
  const flat = useDesk((s) => s.flattenOwned);
  const losers = useDesk((s) => s.flattenLosers);
  const rewalk = useDesk((s) => s.rewalk);
  const manual = useDesk((s) => s.manual);
  const events = useDesk((s) => s.events);
  const allow = useDesk((s) => s.allow);
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of events) map.set(e.kind, (map.get(e.kind) ?? 0) + 1);
    return [...map.entries()];
  }, [events]);
  const steps = [
    ["quotes", allow.connect_exchange],
    ["intern score", allow.intern_arm && allow.intern_all_pre],
    ["last-N promote", allow.promote_real],
    ["live paper", allow.live_paper_execute],
    ["protect", allow.protect_grid],
    ["trail", allow.trail_1_5],
  ] as const;
  return (
    <Panel title="Event engine">
      <p className="mb-3 font-mono text-sm">
        ticks {ticks} · phase {phase} · last {last ? new Date(last).toLocaleTimeString() : "—"}
      </p>
      <ol className="mb-4 space-y-1 font-mono text-sm">
        {steps.map(([name, on]) => (
          <li key={name} className={on ? "text-bid" : "text-muted"}>
            {on ? "on" : "off"} · {name}
          </li>
        ))}
      </ol>
      <div className="mb-4 flex flex-wrap gap-2">
        <button onClick={flat} className="rounded-md bg-ask px-4 py-3 text-bg">
          Flatten in scope
        </button>
        <button onClick={losers} className="rounded-md border border-line px-4 py-3">
          Flatten losers in scope
        </button>
        <button onClick={halt} className="rounded-md border border-line px-4 py-3">
          {phase === "halted" ? "Resume entries" : "Halt entries"}
        </button>
        <button onClick={rewalk} className="rounded-md border border-line px-4 py-3">
          Rewalk bars
        </button>
        <button onClick={() => manual(1)} className="rounded-md border border-line px-4 py-3">
          Paper long
        </button>
        <button onClick={() => manual(-1)} className="rounded-md border border-line px-4 py-3">
          Paper short
        </button>
      </div>
      <p className="font-mono text-xs text-dim">{counts.map(([k, n]) => `${k} ${n}`).join(" · ") || "no events"}</p>
    </Panel>
  );
}

const REPLAY_HOURS = [12, 24, 48] as const;
const REPLAY_SIZES: ReplaySize[] = ["base", "block", "axis", "both"];

export function ReplayPage() {
  const books = useDesk((s) => s.books);
  const floors = useDesk((s) => s.floors);
  const cells = useDesk((s) => s.cells);
  const roll = useMemo(() => cellRollup(cells), [cells]);
  const [hours, setHours] = useState<(typeof REPLAY_HOURS)[number]>(24);
  const [size, setSize] = useState<ReplaySize>("both");
  const sig = useMemo(() => barSignature(books), [books]);
  const session = useMemo(
    () =>
      simulateSessions(
        books.map((b) => ({ symbol: b.symbol, bars: b.bars })),
        BOOK,
        floors,
        { hours, size },
      ),
    [sig, floors, hours, size],
  );
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Replay settings">
        <p className="mb-3 text-sm text-muted">
          The pre window picks one cell per symbol. The next window replays that book only. Floors are the ones on Settings. Short floor {floors.short}. Changing the range or size reruns the closed-bar simulation. It does not look into the replay window.
        </p>
        <div className="flex flex-wrap gap-2">
          {REPLAY_HOURS.map((n) => (
            <button key={n} onClick={() => setHours(n)} className={`rounded-md border px-3 py-2 font-mono text-sm ${hours === n ? "border-accent bg-surface-2 text-fg" : "border-line text-muted"}`}>
              {n}h + {n}h
            </button>
          ))}
          {REPLAY_SIZES.map((name) => (
            <button key={name} onClick={() => setSize(name)} className={`rounded-md border px-3 py-2 font-mono text-sm ${size === name ? "border-accent bg-surface-2 text-fg" : "border-line text-muted"}`}>
              {name}
            </button>
          ))}
        </div>
      </Panel>
      {!session.ready ? (
        <Panel title="24h session">
          <p className="text-sm text-muted">{session.note} The replay does not invent bars.</p>
        </Panel>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat k={`Pre ${hours}h`} v={money(session.bookNetPre)} tone={session.bookNetPre >= 0 ? "bid" : "ask"} />
            <Stat k="Pre green" v={`${session.greenBookPre}/${hours}`} />
            <Stat k={`Replay ${hours}h`} v={money(session.bookNetLive)} tone={session.bookNetLive >= 0 ? "bid" : "ask"} />
            <Stat k="Replay green" v={`${session.greenBookLive}/${hours}`} tone={session.greenBookLive === hours ? "bid" : "ask"} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat k="Pre PF" v={sessionBookPf(session.bookPre).toFixed(2)} />
            <Stat k="Replay PF" v={sessionBookPf(session.bookLive).toFixed(2)} />
            <Stat k="Pre drawdown" v={money(sessionDd(session.bookPre))} tone="ask" />
            <Stat k="Replay drawdown" v={money(sessionDd(session.bookLive))} tone="ask" />
          </div>
          <Panel title={`Pre ${hours}h book`}>
            <HourDiagram rows={session.bookPre} />
          </Panel>
          <Panel title={`Replay ${hours}h · frozen book · ${size}`}>
            <HourDiagram rows={session.bookLive} />
            <p className="mt-3 text-sm text-muted">{session.note}</p>
          </Panel>
          <Panel title="Armed book">
            <ul className="space-y-1 font-mono text-xs">
              {session.bookNames.map((name) => (
                <li key={name}>{name}</li>
              ))}
              {!session.bookNames.length ? <li className="text-muted">No cell cleared the pre-window gate at this floor.</li> : null}
            </ul>
          </Panel>
          <div className="grid gap-4 xl:grid-cols-2">
            <HourLedger title={`Pre ${hours}h · calculation`} rows={session.bookPre} />
            <HourLedger title={`Replay ${hours}h · frozen book`} rows={session.bookLive} />
          </div>
          <Panel title="Full grid · not a portfolio">
            <p className="text-sm text-muted">
              Every short-GRID cell is scored. Summing them counts the same hour many times, so this is the calculation, not the book. Pre net {money(session.preNet)} across {session.samplesPre} closes. Replay promotions {money(session.promotedNet)} on {session.proven} cells, {session.samplesPromoted} closes. Intern samples now {roll.samples}.
            </p>
          </Panel>
        </>
      )}
    </div>
  );
}

function sessionBookPf(rows: HourPoint[]) {
  let gw = 0;
  let gl = 0;
  for (const r of rows) {
    if (r.net > 0) gw += r.net;
    else if (r.net < 0) gl -= r.net;
  }
  if (gl < 1e-12) return gw > 1e-12 ? 4 : 0;
  return gw / gl;
}

function sessionDd(rows: HourPoint[]) {
  let y = 0;
  let peak = 0;
  let dd = 0;
  for (const r of rows) {
    y += r.net;
    peak = Math.max(peak, y);
    dd = Math.max(dd, peak - y);
  }
  return dd;
}

function HourDiagram({ rows }: { rows: HourPoint[] }) {
  if (rows.length < 2) return <p className="text-sm text-muted">Not enough hours to draw.</p>;
  const w = 640;
  const h = 168;
  const pad = 16;
  const max = Math.max(...rows.map((r) => Math.abs(r.net)), 1e-9);
  const gap = 3;
  const bw = (w - pad * 2 - gap * (rows.length - 1)) / rows.length;
  let y = 0;
  const eq = rows.map((r) => (y += r.net));
  const elo = Math.min(...eq, 0);
  const ehi = Math.max(...eq, 0);
  const espan = ehi - elo || 1;
  const ey = (v: number) => pad + (1 - (v - elo) / espan) * (h - pad * 2);
  const line = eq
    .map((v, i) => {
      const x = pad + i * (bw + gap) + bw / 2;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ey(v).toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-44 w-full">
      <line x1={pad} x2={w - pad} y1={h / 2} y2={h / 2} className="stroke-line" strokeWidth="1" />
      {rows.map((r, i) => {
        const x = pad + i * (bw + gap);
        const mag = (Math.abs(r.net) / max) * ((h - pad * 2) / 2);
        const top = r.net >= 0 ? h / 2 - mag : h / 2;
        return <rect key={r.t} x={x} y={top} width={Math.max(1, bw)} height={Math.max(1, mag)} className={r.net >= 0 ? "fill-bid" : "fill-ask"} opacity="0.85" />;
      })}
      <path d={line} fill="none" className="stroke-accent" strokeWidth="1.6" />
      <text x={pad} y={12} className="fill-muted" fontSize="10">
        {new Date(rows[0]!.t).toISOString().slice(5, 16).replace("T", " ")} UTC
      </text>
      <text x={w - pad} y={12} textAnchor="end" className="fill-muted" fontSize="10">
        {new Date(rows.at(-1)!.t).toISOString().slice(5, 16).replace("T", " ")} · equity {money(eq.at(-1) ?? 0)}
      </text>
    </svg>
  );
}

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="text-dim">—</span>;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const d = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 80;
      const y = 22 - ((v - lo) / span) * 18;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const up = values.at(-1)! >= values[0]!;
  return (
    <svg viewBox="0 0 80 24" className="h-6 w-20">
      <path d={d} fill="none" className={up ? "stroke-bid" : "stroke-ask"} strokeWidth="1.5" />
    </svg>
  );
}

function HourLedger({ title, rows }: { title: string; rows: HourPoint[] }) {
  const net = rows.reduce((a, r) => a + r.net, 0);
  const green = rows.filter((r) => r.net > 0).length;
  return (
    <Panel title={title}>
      <p className="mb-3 font-mono text-sm">
        {money(net)} · {green}/{rows.length} hours green
      </p>
      <div className="overflow-x-auto">
        <table className="w-full font-mono text-xs">
          <thead className="text-dim">
            <tr>
              <th className="py-1 text-left">Hour UTC</th>
              <th className="text-left">Result</th>
              <th className="text-left">Net</th>
              <th className="text-left">Closes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.t} className="border-t border-line">
                <td className="py-1">{new Date(r.t).toISOString().replace("T", " ").slice(0, 16)}</td>
                <td className={r.net > 0 ? "text-bid" : r.net < 0 ? "text-ask" : ""}>{r.net > 0 ? "green" : r.net < 0 ? "red" : "flat"}</td>
                <td className={r.net > 0 ? "text-bid" : r.net < 0 ? "text-ask" : ""}>{money(r.net)}</td>
                <td>{r.trades}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function SystemPage() {
  const status = useDesk((s) => s.status);
  const error = useDesk((s) => s.error);
  const ticks = useDesk((s) => s.ticks);
  const events = useDesk((s) => s.events);
  const cells = useDesk((s) => s.cells);
  const books = useDesk((s) => s.books);
  const last = useDesk((s) => s.lastTs);
  const coord = useDesk((s) => s.coord);
  const connection = useDesk((s) => s.connection);
  const health = useDesk((s) => s.health);
  return (
    <div className="flex flex-col gap-4">
      <Panel title="System">
        <p className="font-mono text-sm">
          {SYSTEM_ID} · {connection} · {canAffect(connection) ? "paper route" : "observe only"} · status {status} · ticks {ticks} · relations {cells.length} · books {books.length}
        </p>
        <p className="mt-2 font-mono text-xs text-dim">
          cycles {health.cycles} · ok {health.ok} · healed {health.healed}
          {health.lastNote ? ` · ${health.lastNote}` : ""}
        </p>
        <p className="mt-2 font-mono text-xs text-dim">last quote {last ? new Date(last).toLocaleTimeString() : "—"}</p>
        {error ? <p className="mt-2 text-ask">{error}</p> : <p className="mt-2 text-sm text-muted">A failed pull keeps the last good tape and retries. A bad book is repaired or dropped. Hour results stay the real book.</p>}
        <ul className="mt-3 max-h-64 space-y-1 overflow-auto font-mono text-xs text-muted">
          {events.map((e, i) => (
            <li key={`${e.t}-${i}`}>
              {new Date(e.t).toLocaleTimeString()} · {e.kind} · {e.msg}
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="Coordination ledger">
        <ul className="max-h-72 space-y-1 overflow-auto font-mono text-xs">
          {coord.map((hit, i) => (
            <li key={`${hit.t}-${i}`}>
              {new Date(hit.t).toLocaleTimeString()} · {hit.action} · {hit.system}/{hit.connection}/{hit.type} · kept {hit.kept} · skipped {hit.skipped} · {hit.note}
            </li>
          ))}
          {!coord.length ? <li className="text-muted">No coordination decisions yet.</li> : null}
        </ul>
      </Panel>
    </div>
  );
}

const FLOOR_KEYS: (keyof Floors)[] = ["overall", "short", "base", "axis", "block"];

export function SettingsPage() {
  const floors = useDesk((s) => s.floors);
  const setFloor = useDesk((s) => s.setFloor);
  const allow = useDesk((s) => s.allow.change_floors);
  return (
    <Panel title="CTS-A floors">
      <p className="mb-3 text-sm text-muted">
        Short PF gates the GRID. Overall is the desk reference floor. Edits re-gate relations already scored and rerun the stored 24h book. {allow ? "change_floors is allowed." : "change_floors is denied."}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {FLOOR_KEYS.map((k) => (
          <label key={k} className="block font-mono text-sm">
            <span className="text-dim">{k}</span>
            <input
              type="number"
              step="0.01"
              min="0.1"
              max="10"
              disabled={!allow}
              value={floors[k]}
              onChange={(e) => setFloor(k, Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-line bg-bg px-3 py-2"
            />
          </label>
        ))}
      </div>
      <ul className="mt-4 space-y-1 font-mono text-sm text-muted">
        <li>Live TP {LIVE_SHORT.minTp} · SL/TP {LIVE_SHORT.minSlOfTp}</li>
        <li>Position 0.12% of {BOOK.toLocaleString()} · round-trip 0.12%</li>
        <li>Last-N eval 50 / valid 15 / disable 12 / min samples 4</li>
      </ul>
    </Panel>
  );
}

export function ConnectionsPage() {
  const status = useDesk((s) => s.status);
  const allow = useDesk((s) => s.allow.connect_exchange);
  const books = useDesk((s) => s.books);
  const last = useDesk((s) => s.lastTs);
  const connection = useDesk((s) => s.connection);
  const setConnection = useDesk((s) => s.setConnection);
  const positions = useDesk((s) => s.positions);
  const orders = useDesk((s) => s.orders);
  const age = last ? Math.max(0, Math.round((Date.now() - last) / 1000)) : null;
  return (
    <Panel title="Connections">
      <p className="mb-3 text-sm text-muted">
        Active scope is {SYSTEM_ID} · {connection} · position and order. Flatten, trail, adds, and new tickets affect that triple only. Intern scoring is not an exchange type. Feed {allow ? "allowed" : "denied"}. {books.length} books · {age == null ? "no print yet" : `${age}s since last pull`}.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {CONNECTIONS.map((c) => {
          const on = connection === c.id;
          const pos = positions.filter((p) => p.connection === c.id && p.system === SYSTEM_ID && p.type === "position").length;
          const ords = orders.filter((o) => o.connection === c.id && o.system === SYSTEM_ID && o.type === "order").length;
          return (
            <button
              key={c.id}
              onClick={() => setConnection(c.id)}
              className={`rounded-md border p-3 text-left ${on ? "border-accent bg-surface-2" : "border-line"}`}
            >
              <div className="font-mono">{c.id}</div>
              <div className={c.route === "paper" ? "text-bid" : "text-muted"}>{c.route === "paper" ? (status === "live" ? "paper route · quotes live" : "paper route") : "no order route"}</div>
              <p className="text-sm text-muted">
                {c.label}. {pos} positions · {ords} orders. {c.route === "paper" ? "In-scope actions are applied here." : "Observed only. Nothing on this connection is amended."}
              </p>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}
