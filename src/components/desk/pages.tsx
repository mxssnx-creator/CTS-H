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
  type Indication,
} from "@/lib/desk/constants";
import { axisQty, blockQty, comboId, liveShortOk, pfFromPnls, positionNotional } from "@/lib/desk/math";
import { cellRollup, greenHour, type TapeFill } from "@/lib/desk/process";
import { closePnl } from "@/lib/desk/math";
import { focusBook, focusIndicators, liveHeadline, useDesk, useNet } from "@/lib/desk/store";

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

  return (
    <div className="flex flex-col gap-4">
      {status === "error" ? <Panel title="Feed">{error}</Panel> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat k="System net" v={money(net)} tone={net >= 0 ? "bid" : "ask"} />
        <Stat k="Performing" v={`${roll.valid} / ${roll.n || "—"}`} />
        <Stat k="Intern samples" v={String(roll.samples)} />
        <Stat k="Hour" v={`${hour.code} · ${money(hour.net)}`} tone={hour.code === "R1" ? "ask" : hour.code === "G1" ? "bid" : undefined} />
      </div>
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
  const flat = useDesk((s) => s.flattenOwned);
  const losers = useDesk((s) => s.flattenLosers);
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <button onClick={flat} className="rounded-md bg-ask px-3 py-2 text-sm text-bg">
          Flatten owned
        </button>
        <button onClick={losers} className="rounded-md border border-line px-3 py-2 text-sm">
          Flatten losers
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full font-mono text-xs">
          <thead className="text-dim">
            <tr>
              <th className="py-1 text-left">Sym</th>
              <th className="text-left">Side</th>
              <th className="text-left">Ind</th>
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
              return (
                <tr key={p.id} className="border-t border-line">
                  <td className="py-1">{p.symbol}</td>
                  <td className={p.side > 0 ? "text-bid" : "text-ask"}>{p.side > 0 ? "long" : "short"}</td>
                  <td>{p.indication}</td>
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
                  No owned legs. Live stage opens only cells that clear the live floor and last-N on real bars.
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
  const live = useDesk((s) => s.liveFills);
  const intern = useDesk((s) => s.internFills);
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Working CTSA tags">
        <ul className="space-y-1 font-mono text-xs">
          {positions.map((p) => (
            <li key={p.id}>
              {p.id} · {p.symbol} · {p.indication} · {p.combo} · qty {p.qty.toPrecision(4)}
              {p.dca ? ` · dca ${p.dca}` : ""}
            </li>
          ))}
          {!positions.length ? <li className="text-muted">No working tickets.</li> : null}
        </ul>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Live tape x:">
          <FillList rows={live} />
        </Panel>
        <Panel title="Intern tape i:">
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
  return (
    <Panel title="Exchange statistics">
      <p className="mb-3 text-sm text-muted">
        Funding {focus?.funding == null ? "—" : `${(focus.funding * 100).toFixed(4)}%`} on {focus?.symbol}. Prints are BingX public quotes, not a model book.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full font-mono text-xs">
          <thead className="text-dim">
            <tr>
              <th className="text-left">Symbol</th>
              <th className="text-left">Last</th>
              <th className="text-left">24h</th>
              <th className="text-left">Range</th>
              <th className="text-left">Quote vol</th>
              <th className="text-left">Bars</th>
            </tr>
          </thead>
          <tbody>
            {books.map((b) => {
              const last = b.bars.at(-1);
              const range = last ? last.h - last.l : 0;
              return (
                <tr key={b.symbol} className="border-t border-line">
                  <td className="py-1">{b.symbol}</td>
                  <td>{b.quote.last}</td>
                  <td className={b.quote.changePct >= 0 ? "text-bid" : "text-ask"}>{b.quote.changePct.toFixed(2)}%</td>
                  <td>{range.toPrecision(4)}</td>
                  <td>{Math.round(b.quote.quoteVolume).toLocaleString()}</td>
                  <td>{b.bars.length}</td>
                </tr>
              );
            })}
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
          Flatten owned
        </button>
        <button onClick={losers} className="rounded-md border border-line px-4 py-3">
          Flatten losers
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

export function ReplayPage() {
  const cells = useDesk((s) => s.cells);
  const focus = useDesk((s) => s.focus);
  const [ind, setInd] = useState<Indication | "all">("all");
  const roll = useMemo(() => cellRollup(cells), [cells]);
  const best = useMemo(() => {
    return cells
      .filter((c) => c.symbol === focus && (ind === "all" || c.indication === ind))
      .sort((a, b) => Number(b.validExec && !b.disabled) - Number(a.validExec && !a.disabled) || b.net - a.net || b.pf - a.pf)
      .slice(0, 24);
  }, [cells, focus, ind]);
  return (
    <Panel title={`Replay · ${focus}`}>
      <p className="mb-3 text-sm text-muted">
        Each relation walks closed 1h bars forward from the last cursor. Same bars do not rescore. This is not a random path.
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        <button onClick={() => setInd("all")} className={`rounded-md border px-3 py-2 text-sm ${ind === "all" ? "border-accent" : "border-line"}`}>
          all
        </button>
        {INDICATIONS.map((name) => (
          <button key={name} onClick={() => setInd(name)} className={`rounded-md border px-3 py-2 text-sm ${ind === name ? "border-accent" : "border-line"}`}>
            {name}
          </button>
        ))}
      </div>
      <Stat k="Intern samples" v={String(roll.samples)} />
      <ul className="mt-3 space-y-1 font-mono text-xs">
        {best.map((c) => (
          <li key={c.id}>
            {c.indication} {c.id.split("|").at(-1)} pf {c.pf.toFixed(2)} n {c.n} net {money(c.net)} {c.validExec && !c.disabled ? "valid" : c.disabled ? "disabled" : ""}
          </li>
        ))}
        {!best.length ? <li className="text-muted">No rows for this book yet.</li> : null}
      </ul>
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
  return (
    <Panel title="System">
      <p className="font-mono text-sm">
        status {status} · ticks {ticks} · relations {cells.length} · books {books.length}
      </p>
      <p className="mt-2 font-mono text-xs text-dim">last quote {last ? new Date(last).toLocaleTimeString() : "—"}</p>
      {error ? <p className="mt-2 text-ask">{error}</p> : <p className="mt-2 text-sm text-muted">Quotes are fetched from BingX and cached on the server. No local stand-in tape.</p>}
      <ul className="mt-3 max-h-64 space-y-1 overflow-auto font-mono text-xs text-muted">
        {events.map((e, i) => (
          <li key={`${e.t}-${i}`}>
            {new Date(e.t).toLocaleTimeString()} · {e.kind} · {e.msg}
          </li>
        ))}
      </ul>
    </Panel>
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
        Short PF gates the GRID. Overall is the desk reference floor. Edits re-gate relations already scored. {allow ? "change_floors is allowed." : "change_floors is denied."}
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
  const age = last ? Math.max(0, Math.round((Date.now() - last) / 1000)) : null;
  return (
    <Panel title="Connections">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-line p-3">
          <div className="font-mono">bingx-public</div>
          <div className={status === "live" ? "text-bid" : "text-warn"}>{status === "live" ? "quotes live" : status}</div>
          <p className="text-sm text-muted">
            {books.length} books · {age == null ? "no print yet" : `${age}s since last pull`}. Tag CTSAV2_ on paper legs. Feed {allow ? "allowed" : "denied"} still reads public quotes.
          </p>
        </div>
        <div className="rounded-md border border-line p-3">
          <div className="font-mono">bingx-vst-02</div>
          <div className="text-muted">no credentials</div>
          <p className="text-sm text-muted">Paper stage does not call the order API.</p>
        </div>
        <div className="rounded-md border border-line p-3">
          <div className="font-mono">bingx-x01</div>
          <div className="text-muted">locked</div>
          <p className="text-sm text-muted">Mainnet stays off. Allowing connect_exchange does not place real orders.</p>
        </div>
      </div>
    </Panel>
  );
}
