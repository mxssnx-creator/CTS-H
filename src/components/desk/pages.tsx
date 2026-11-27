import { Link } from "@tanstack/react-router";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  Clipboard,
  FlaskConical,
  Radio,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CandleChart, EquityChart } from "./chart";
import { Panel, Stat } from "./shell";
import { ACTION_COPY, ACTIONS, BOOK, MAX_LIVE_LEGS, type Floors } from "@/lib/desk/constants";
import { CONNECTIONS } from "@/lib/desk/connections";
import { closePnl } from "@/lib/desk/math";
import {
  barSignature,
  indicationBoard,
  summarizeReplay,
  type ReplaySize,
  type SessionReport,
} from "@/lib/desk/process";
import { focusBook, useDesk, useNet } from "@/lib/desk/store";

const num = new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 });
const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const hour = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "UTC",
});
const sign = (n: number, digits = 2) => `${n > 0 ? "+" : ""}${n.toFixed(digits)}`;
const tone = (n: number): "positive" | "negative" => (n >= 0 ? "positive" : "negative");
const PFText = (win: number, loss: number) =>
  loss > 0 ? (win / loss).toFixed(2) : win > 0 ? "No losses" : "—";

function Heading({
  title,
  secondary,
  aside,
}: {
  title: string;
  secondary: string;
  aside?: ReactNode;
}) {
  return (
    <div className="desk-title">
      <div>
        <h1>{title}</h1>
        <p>{secondary}</p>
      </div>
      {aside}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="desk-empty">{children}</p>;
}

function PaperSummary() {
  const net = useNet();
  const positions = useDesk((s) => s.positions);
  const fills = useDesk((s) => s.liveFills);
  const realized = useDesk((s) => s.closedNet);
  const peak = useDesk((s) => s.peak);
  const gain = fills.reduce((sum, fill) => sum + Math.max(fill.pnl, 0), 0);
  const loss = fills.reduce((sum, fill) => sum + Math.max(-fill.pnl, 0), 0);
  const dd = Math.max(0, ((peak - (BOOK + net)) / peak) * 100);
  return (
    <div className="stats-grid">
      <Stat
        label="Paper equity"
        value={dollars.format(BOOK + net)}
        detail={`Drawdown ${dd.toFixed(2)}%`}
      />
      <Stat
        label="Net P&L"
        value={dollars.format(net)}
        detail={`${dollars.format(realized)} realized`}
        tone={tone(net)}
      />
      <Stat
        label="Trade profit factor"
        value={PFText(gain, loss)}
        detail={`Last ${fills.length} paper closes`}
      />
      <Stat
        label="Open paper positions"
        value={String(positions.length)}
        detail={`${MAX_LIVE_LEGS} position capacity`}
      />
    </div>
  );
}

function MarketPanel() {
  const book = useDesk(focusBook);
  const status = useDesk((s) => s.status);
  const [range, setRange] = useState(48);
  const bars = useMemo(() => book?.bars.slice(-range) ?? [], [book?.bars, range]);
  return (
    <Panel
      title={book?.symbol ?? "Market chart"}
      aside={
        <div className="segmented">
          {[12, 24, 48, 96].map((n) => (
            <button key={n} aria-pressed={range === n} onClick={() => setRange(n)}>
              {n}H
            </button>
          ))}
        </div>
      }
    >
      <div className="market-value">
        <strong>{book ? num.format(book.quote.last) : "—"}</strong>
        {book && (
          <span className={tone(book.quote.changePct)}>
            {sign(book.quote.changePct)}% <small>24h</small>
          </span>
        )}
      </div>
      {book && (
        <div className="quote-strip">
          <span>
            Bid <strong>{book.quote.bid ? num.format(book.quote.bid) : "—"}</strong>
          </span>
          <span>
            Ask <strong>{book.quote.ask ? num.format(book.quote.ask) : "—"}</strong>
          </span>
          <span>
            Funding{" "}
            <strong>{book.funding == null ? "—" : `${(book.funding * 100).toFixed(4)}%`}</strong>
          </span>
        </div>
      )}
      {bars.length ? (
        <CandleChart bars={bars} symbol={book!.symbol} />
      ) : (
        <div className="chart-empty">
          {status === "loading" ? "Loading closed BingX candles…" : "Waiting for BingX candles."}
        </div>
      )}
    </Panel>
  );
}

function Watchlist() {
  const books = useDesk((s) => s.books);
  const focus = useDesk((s) => s.focus);
  const setFocus = useDesk((s) => s.setFocus);
  const unavailable = useDesk((s) => s.unavailable);
  return (
    <Panel title="Watchlist" aside={<span className="muted mono">USDT-M</span>}>
      {books.length ? (
        <div className="watch-list">
          {books.map(({ symbol, quote }) => {
            const ticker = symbol.split("-")[0]!;
            return (
              <button key={symbol} onClick={() => setFocus(symbol)} aria-pressed={focus === symbol}>
                <span className={`asset-icon asset-${ticker.toLowerCase()}`} aria-hidden="true">
                  {ticker.slice(0, 1)}
                </span>
                <span className="watch-asset">
                  <strong>{ticker}</strong>
                  <small>{unavailable.includes(symbol) ? "Delayed" : "Perpetual"}</small>
                </span>
                <span className="watch-value">
                  <strong>{num.format(quote.last)}</strong>
                  <small className={tone(quote.changePct)}>{sign(quote.changePct)}%</small>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <Empty>Fetching the connection watchlist.</Empty>
      )}
    </Panel>
  );
}

function Signals() {
  const book = useDesk(focusBook);
  const board = useMemo(() => (book ? indicationBoard(book.bars) : []), [book?.bars]);
  return (
    <Panel title="Indications" aside={<span className="muted mono">{book?.symbol ?? "1h"}</span>}>
      {board.length ? (
        <div className="signal-list">
          {board.map((signal) => (
            <div className="signal-row" key={signal.name}>
              <strong>{signal.name}</strong>
              <span>{signal.detail}</span>
              <span className={`direction ${signal.side ? tone(signal.side) : "muted"}`}>
                {signal.side > 0 ? (
                  <ArrowUpRight size={14} />
                ) : signal.side < 0 ? (
                  <ArrowDownRight size={14} />
                ) : null}
                {signal.side > 0 ? "Long" : signal.side < 0 ? "Short" : "Flat"}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <Empty>Indications appear after closed candles arrive.</Empty>
      )}
    </Panel>
  );
}

function PaperControls() {
  const focus = useDesk((s) => s.focus);
  const phase = useDesk((s) => s.phase);
  const status = useDesk((s) => s.status);
  const blocked = useDesk(
    (s) =>
      s.unavailable.includes(s.focus) || !s.allow.live_paper_execute || !s.allow.connect_exchange,
  );
  const manual = useDesk((s) => s.manual);
  const halt = useDesk((s) => s.halt);
  const disabled = blocked || status !== "live" || phase === "halted";
  return (
    <div className="button-row">
      <button className="desk-button positive" disabled={disabled} onClick={() => manual(1)}>
        <ArrowUpRight size={15} />
        Paper long<span className="sr-only"> {focus}</span>
      </button>
      <button className="desk-button negative" disabled={disabled} onClick={() => manual(-1)}>
        <ArrowDownRight size={15} />
        Paper short<span className="sr-only"> {focus}</span>
      </button>
      <button className="desk-button" onClick={halt}>
        {phase === "halted" ? "Resume entries" : "Pause entries"}
      </button>
    </div>
  );
}

function DeskLog() {
  const events = useDesk((s) => s.events);
  return (
    <Panel title="Activity">
      {events.length ? (
        <ul className="activity-list">
          {events.slice(0, 8).map((event, i) => (
            <li key={`${event.t}-${i}`}>
              <span className="event-badge">{event.kind}</span>
              <span>{event.msg}</span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Feed and order events will appear here.</Empty>
      )}
    </Panel>
  );
}

export function OverviewPage() {
  const status = useDesk((s) => s.status);
  const error = useDesk((s) => s.error);
  return (
    <>
      <Heading
        title="Market overview"
        secondary="BingX USDT perpetuals"
        aside={
          <Link to="/replay" className="desk-button primary">
            <FlaskConical size={16} /> Trade replay
          </Link>
        }
      />
      {(status === "degraded" || status === "error") && (
        <div className="desk-alert" role="status">
          <WifiOff size={17} />
          {error || "BingX market data is delayed."}
        </div>
      )}
      <PaperSummary />
      <div className="overview-grid">
        <MarketPanel />
        <Watchlist />
      </div>
      <div className="columns-even">
        <Panel
          title="Paper execution"
          aside={
            <Link className="text-link" to="/positions">
              Portfolio <ArrowRight size={14} />
            </Link>
          }
        >
          <PaperControls />
          <PositionTable compact />
        </Panel>
        <Signals />
      </div>
    </>
  );
}

function PositionTable({ compact = false }: { compact?: boolean }) {
  const positions = useDesk((s) => s.positions);
  if (!positions.length) return <Empty>No open paper positions.</Empty>;
  return (
    <div className="table-scroll">
      <table className="desk-table">
        <thead>
          <tr>
            <th>Market</th>
            <th>Side</th>
            <th>Quantity</th>
            <th>Entry</th>
            {!compact && (
              <>
                <th>Mark</th>
                <th>Stop</th>
                <th>Target</th>
              </>
            )}
            <th>P&L</th>
          </tr>
        </thead>
        <tbody>
          {positions.slice(0, compact ? 5 : undefined).map((p) => {
            const pnl = closePnl(p.side, p.entry, p.mark, p.qty);
            return (
              <tr key={p.id}>
                <td>
                  <strong>{p.symbol}</strong>
                </td>
                <td className={tone(p.side)}>{p.side > 0 ? "Long" : "Short"}</td>
                <td>{num.format(p.qty)}</td>
                <td>{num.format(p.entry)}</td>
                {!compact && (
                  <>
                    <td>{num.format(p.mark)}</td>
                    <td>{num.format(p.sl)}</td>
                    <td>{num.format(p.tp)}</td>
                  </>
                )}
                <td className={tone(pnl)}>{sign(pnl)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function PositionsPage() {
  const orders = useDesk((s) => s.orders);
  const positions = useDesk((s) => s.positions);
  const fills = useDesk((s) => s.liveFills);
  const flattenOwned = useDesk((s) => s.flattenOwned);
  const flattenLosers = useDesk((s) => s.flattenLosers);
  const allow = useDesk((s) => s.allow);
  const connection = useDesk((s) => s.connection);
  const feedReady = useDesk((s) => s.status === "live" && s.allow.connect_exchange);
  const [pending, setPending] = useState<{ action: "owned" | "losers"; connection: string } | null>(
    null,
  );
  const flatten = pending?.connection === connection ? pending.action : null;
  return (
    <>
      <Heading
        title="Paper portfolio"
        secondary="Positions and orders on the active connection"
        aside={<PaperControls />}
      />
      <PaperSummary />
      <Panel
        title="Positions"
        aside={
          positions.length > 0 && (
            <div className="button-row">
              {flatten ? (
                <>
                  <button
                    className="desk-button negative"
                    disabled={!feedReady}
                    onClick={() => {
                      if (flatten === "owned") flattenOwned();
                      else flattenLosers();
                      setPending(null);
                    }}
                  >
                    Confirm {flatten === "owned" ? "close all" : "close losing"}
                  </button>
                  <button className="desk-button" onClick={() => setPending(null)}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="desk-button"
                    disabled={!feedReady || !allow.flatten_losers}
                    onClick={() => setPending({ action: "losers", connection })}
                  >
                    Close losing
                  </button>
                  <button
                    className="desk-button"
                    disabled={!feedReady || !allow.flatten_own}
                    onClick={() => setPending({ action: "owned", connection })}
                  >
                    Close all
                  </button>
                </>
              )}
            </div>
          )
        }
      >
        <PositionTable />
      </Panel>
      <div className="columns-even">
        <Panel title="Protective orders" aside={<ShieldCheck size={18} className="muted" />}>
          {orders.length ? (
            <div className="table-scroll">
              <table className="desk-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Protection</th>
                    <th>Trigger</th>
                    <th>Quantity</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td>{order.symbol}</td>
                      <td>{order.kind === "sl" ? "Stop loss" : "Take profit"}</td>
                      <td>{num.format(order.px)}</td>
                      <td>{num.format(order.qty)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No working paper orders.</Empty>
          )}
        </Panel>
        <Panel title="Recent fills">
          {fills.length ? (
            <div className="table-scroll">
              <table className="desk-table">
                <thead>
                  <tr>
                    <th>Market</th>
                    <th>Fill price</th>
                    <th>Net P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {fills.slice(0, 12).map((fill) => (
                    <tr key={fill.id}>
                      <td>{fill.symbol}</td>
                      <td>{num.format(fill.px)}</td>
                      <td className={tone(fill.pnl)}>{sign(fill.pnl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No paper closes yet.</Empty>
          )}
        </Panel>
      </div>
      <DeskLog />
    </>
  );
}

const ROLES = [
  ["Desk Lead", "Coordinates the brief, proposal and review."],
  ["Market Analyst", "Checks venue timestamps, quotes, candles and liquidity."],
  ["Research Analyst", "Records source links and contrary evidence."],
  ["Strategist", "Replays an idea on closed candles and measures holdout results."],
  ["Risk Manager", "Checks the bracket, exposure, margin and modeled loss."],
  ["Execution Trader", "Reconciles one approved ticket with its BingX order."],
  ["Trade Reviewer", "Records outcome, protection status and execution exceptions."],
];

function TicketDraft() {
  const book = useDesk(focusBook);
  const connection = useDesk((s) => s.connection);
  const [copied, setCopied] = useState(false);
  const [side, setSide] = useState("long");
  const [qty, setQty] = useState("");
  const [stop, setStop] = useState("");
  const [target, setTarget] = useState("");
  const [why, setWhy] = useState("");
  const symbol = book?.symbol ?? "ETH-USDT";
  const active = connection === "bingx-x02" ? "bingx-x02" : "bingx-x01";
  const numeric = [qty, stop, target].every(
    (v) => /^\d+(?:\.\d+)?$/.test(v) && Number.isFinite(Number(v)) && Number(v) > 0,
  );
  const valid =
    numeric &&
    why.trim().length > 0 &&
    (side === "long" ? Number(stop) < Number(target) : Number(stop) > Number(target));
  const shellQuote = (text: string) => "'" + text.replaceAll("'", "'\"'\"'") + "'";
  const draft = valid
    ? `npm run desk -- propose --connection ${active} --symbol ${symbol} --side ${side} --qty ${qty} --stop ${stop} --target ${target} --why ${shellQuote(why.trim())}`
    : "";
  return (
    <Panel title="Trade proposal" aside={<span className="feed-badge">Operator ticket</span>}>
      <div className="form-grid">
        <label>
          Connection <output>{active}</output>
        </label>
        <label>
          Market <output>{symbol}</output>
        </label>
        <label>
          Direction{" "}
          <select value={side} onChange={(e) => setSide(e.target.value)}>
            <option value="long">Long</option>
            <option value="short">Short</option>
          </select>
        </label>
        <label>
          Quantity{" "}
          <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" />
        </label>
        <label>
          Stop loss{" "}
          <input value={stop} onChange={(e) => setStop(e.target.value)} inputMode="decimal" />
        </label>
        <label>
          Take profit{" "}
          <input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" />
        </label>
        <label className="form-wide">
          Trade thesis and evidence{" "}
          <textarea
            value={why}
            maxLength={2_000}
            onChange={(e) => setWhy(e.target.value)}
            rows={2}
          />
        </label>
      </div>
      <button
        className="desk-button"
        disabled={!draft}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(draft);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1_500);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? <Check size={15} /> : <Clipboard size={15} />}
        {copied ? "Copied" : "Copy proposal command"}
      </button>
      {draft && <pre className="proposal-command">{draft}</pre>}
    </Panel>
  );
}

export function IndicationsPage() {
  const book = useDesk(focusBook);
  const cells = useDesk((s) => s.cells);
  const qualified = useMemo(
    () =>
      cells
        .filter((c) => c.symbol === book?.symbol && c.validExec && !c.disabled)
        .sort((a, b) => b.pf - a.pf || b.net - a.net)
        .slice(0, 12),
    [cells, book?.symbol],
  );
  return (
    <>
      <Heading
        title="Market research"
        secondary={
          book
            ? `${book.symbol} · closed hourly candles and desk signals`
            : "Close-bar evidence and trade proposals"
        }
      />
      <div className="overview-grid">
        <MarketPanel />
        <Watchlist />
      </div>
      <div className="columns-even">
        <Signals />
        <TicketDraft />
      </div>
      <Panel title="Qualified paper configurations">
        {qualified.length ? (
          <div className="table-scroll">
            <table className="desk-table">
              <thead>
                <tr>
                  <th>Indication</th>
                  <th>TP / ATR</th>
                  <th>SL / TP</th>
                  <th>Closes</th>
                  <th>PF</th>
                  <th>Net</th>
                </tr>
              </thead>
              <tbody>
                {qualified.map((cell) => (
                  <tr key={cell.id}>
                    <td>{cell.indication}</td>
                    <td>{cell.tpAtr}</td>
                    <td>{cell.slOfTp}</td>
                    <td>{cell.n}</td>
                    <td>{PFText(cell.gw, cell.gl)}</td>
                    <td className={tone(cell.net)}>{sign(cell.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No cell has cleared its filter on this market.</Empty>
        )}
      </Panel>
      <Panel title="Desk roles">
        <div className="role-grid">
          {ROLES.map(([role, detail]) => (
            <div key={role}>
              <strong>{role}</strong>
              <p>{detail}</p>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}

const REPLAY_HOURS = [12, 24, 48] as const;
const REPLAY_SIZING: { size: ReplaySize; label: string }[] = [
  { size: "base", label: "Base" },
  { size: "axis", label: "Axis" },
  { size: "block", label: "Block" },
  { size: "both", label: "Axis + Block" },
];

export function ReplayPage() {
  const books = useDesk((s) => s.books);
  const floors = useDesk((s) => s.floors);
  const connection = useDesk((s) => s.connection);
  const [hours, setHours] = useState<(typeof REPLAY_HOURS)[number]>(48);
  const [size, setSize] = useState<ReplaySize>("base");
  const [report, setReport] = useState<SessionReport | null>(null);
  const [error, setError] = useState("");
  const sig = barSignature(books);
  useEffect(() => {
    setError("");
    setReport(null);
    if (!sig) return;
    const worker = new Worker(new URL("../../lib/desk/replay.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = ({ data }: MessageEvent<{ result?: SessionReport; error?: string }>) => {
      if (data.result) setReport(data.result);
      else setError(data.error ?? "Replay failed.");
    };
    worker.onerror = () => setError("Replay worker failed.");
    const source = useDesk.getState().books.map(({ symbol, bars }) => ({ symbol, bars }));
    worker.postMessage({ books: source, floors, opts: { hours, size } });
    return () => worker.terminate();
  }, [sig, floors, hours, size, connection]);
  const pre = report?.ready ? summarizeReplay(report.bookPre) : null;
  const replay = report?.ready ? summarizeReplay(report.bookLive) : null;
  return (
    <>
      <Heading
        title="Trade replay"
        secondary="Select on the pre window. Measure on the next closed BingX candles."
      />
      <Panel title="Simulation settings">
        <div className="replay-controls">
          <div>
            <span>Prehistory + replay</span>
            <div className="segmented">
              {REPLAY_HOURS.map((n) => (
                <button key={n} onClick={() => setHours(n)} aria-pressed={hours === n}>
                  {n}h + {n}h
                </button>
              ))}
            </div>
          </div>
          <div>
            <span>Position sizing</span>
            <div className="segmented">
              {REPLAY_SIZING.map(({ size: choice, label }) => (
                <button key={choice} onClick={() => setSize(choice)} aria-pressed={size === choice}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Panel>
      {pre && replay && report ? (
        <>
          <div className="stats-grid">
            <Stat
              label="Holdout net P&L"
              value={dollars.format(replay.net)}
              detail={`Pre-window ${dollars.format(pre.net)}`}
              tone={tone(replay.net)}
            />
            <Stat
              label="Holdout profit factor"
              value={PFText(replay.grossProfit, replay.grossLoss)}
              detail={`${replay.samples} closed trades`}
            />
            <Stat
              label="Holdout drawdown"
              value={dollars.format(replay.drawdown)}
              detail="Measured hourly"
            />
            <Stat
              label="Profitable hours"
              value={`${replay.green} / ${hours}`}
              detail={`${report.symbols} symbols with coverage`}
            />
          </div>
          <Panel title="Holdout equity" aside={<span className="muted mono">{connection}</span>}>
            <EquityChart hours={report.bookLive} />
            <p className="muted detail-copy">
              {report.note} Paper replay applies the desk’s 0.12% round-trip cost.
            </p>
            {report.unavailable.length ? (
              <p className="warn detail-copy">
                Missing contiguous candles for {report.unavailable.join(", ")}.
              </p>
            ) : null}
          </Panel>
          <div className="columns-even">
            <Panel title="Selected configurations">
              {report.selected.length ? (
                <div className="table-scroll">
                  <table className="desk-table">
                    <thead>
                      <tr>
                        <th>Configuration</th>
                        <th>Closes</th>
                        <th>PF</th>
                        <th>Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.selected.map((item) => (
                        <tr key={item.name}>
                          <td>{item.name}</td>
                          <td>{item.replay.samples}</td>
                          <td>{PFText(item.replay.grossProfit, item.replay.grossLoss)}</td>
                          <td className={tone(item.replay.net)}>{sign(item.replay.net)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty>No configuration cleared the pre-window filter.</Empty>
              )}
            </Panel>
            <Panel title="Hourly ledger">
              <div className="table-scroll replay-ledger">
                <table className="desk-table">
                  <thead>
                    <tr>
                      <th>UTC hour</th>
                      <th>Closes</th>
                      <th>Realized</th>
                      <th>Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.bookLive.map((row) => (
                      <tr key={row.t}>
                        <td>{hour.format(row.t)}</td>
                        <td>{row.trades}</td>
                        <td>{sign(row.realized)}</td>
                        <td className={tone(row.net)}>{sign(row.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        </>
      ) : (
        <Panel title="Simulation result">
          <Empty>
            {error ||
              report?.note ||
              (sig ? "Calculating the replay…" : "Waiting for the connection’s candle history.")}
          </Empty>
        </Panel>
      )}
    </>
  );
}

const FLOOR_NAMES: Record<keyof Floors, string> = {
  base: "Replay preselection PF",
  short: "Short grid PF",
  overall: "Lifetime paper PF",
  axis: "Axis PF floor",
  block: "Block PF floor",
};
const STRATEGIES = {
  autoEntries: "Automatic paper entries",
  normal: "Direction lane",
  trailing: "Trailing stop",
  axis: "Axis sizing",
  block: "Block sizing",
  dca: "DCA",
  hedge: "Multiple same-market lanes",
} as const;

export function SettingsPage() {
  const connection = useDesk((s) => s.connection);
  const floors = useDesk((s) => s.floors);
  const setFloor = useDesk((s) => s.setFloor);
  const toggles = useDesk((s) => s.toggles);
  const toggleStrat = useDesk((s) => s.toggleStrat);
  const allow = useDesk((s) => s.allow);
  const toggleAllow = useDesk((s) => s.toggleAllow);
  return (
    <>
      <Heading title="Desk settings" secondary={`Paper strategy settings for ${connection}`} />
      <div className="columns-even">
        <Panel title="Strategy controls">
          <div className="option-list">
            {(Object.keys(STRATEGIES) as (keyof typeof STRATEGIES)[]).map((key) => (
              <label key={key}>
                <span>{STRATEGIES[key]}</span>
                <input type="checkbox" checked={toggles[key]} onChange={() => toggleStrat(key)} />
              </label>
            ))}
          </div>
        </Panel>
        <Panel title="Qualification thresholds">
          <div className="form-grid">
            {(Object.keys(FLOOR_NAMES) as (keyof Floors)[]).map((key) => (
              <label key={`${connection}-${key}-${floors[key]}`}>
                {FLOOR_NAMES[key]}
                <input
                  type="number"
                  min=".01"
                  max="10"
                  step=".05"
                  defaultValue={floors[key]}
                  disabled={!allow.change_floors}
                  onBlur={(e) => {
                    setFloor(key, Number(e.target.value));
                    e.target.value = String(useDesk.getState().floors[key]);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                />
              </label>
            ))}
          </div>
        </Panel>
      </div>
      <Panel title="Paper permissions">
        <div className="option-list">
          {ACTIONS.filter((key) => key !== "connect_exchange").map((key) => (
            <label key={key}>
              <span>{ACTION_COPY[key]}</span>
              <input type="checkbox" checked={allow[key]} onChange={() => toggleAllow(key)} />
            </label>
          ))}
        </div>
      </Panel>
    </>
  );
}

export function ConnectionsPage() {
  const connection = useDesk((s) => s.connection);
  const setConnection = useDesk((s) => s.setConnection);
  const status = useDesk((s) => s.status);
  const inactive = useDesk((s) => s.inactive);
  const positions = useDesk((s) => s.positions);
  const allow = useDesk((s) => s.allow.connect_exchange);
  const toggle = useDesk((s) => s.toggleAllow);
  return (
    <>
      <Heading
        title="Connections"
        secondary="BingX market routing and independent paper portfolios"
        aside={
          <button className="desk-button" onClick={() => toggle("connect_exchange")}>
            {allow ? "Pause feed" : "Resume feed"}
          </button>
        }
      />
      <div className="connection-grid">
        {CONNECTIONS.map((item) => {
          const active = item.id === connection;
          const count = active ? positions.length : (inactive[item.id]?.positions.length ?? 0);
          return (
            <Panel
              key={item.id}
              title={item.label}
              aside={
                <Radio size={18} className={active && status === "live" ? "positive" : "muted"} />
              }
            >
              <p className="mono detail-copy">{item.id}</p>
              <p className="muted detail-copy">{count} paper positions</p>
              <button
                className={`desk-button ${active ? "primary" : ""}`}
                aria-pressed={active}
                disabled={!allow}
                onClick={() => setConnection(item.id)}
              >
                {active ? "Active" : "Switch connection"}
              </button>
            </Panel>
          );
        })}
      </div>
      <Panel title="Signed operator routes">
        <p className="detail-copy">
          X01 routes to BingX mainnet. X02 routes to BingX VST. An operator can set a connection’s
          credentials, sign off risk, and explicitly approve a ticket in the CLI.
        </p>
        <pre className="proposal-command">npm run desk -- doctor</pre>
      </Panel>
    </>
  );
}

// Existing desk URLs keep resolving to their new workspace view.
export const LanesPage = IndicationsPage;
export const CombinationsPage = IndicationsPage;
export const HeatmapPage = IndicationsPage;
export const OrdersPage = PositionsPage;
export const PerformancePage = ReplayPage;
export const ResultsPage = ReplayPage;
export const StatisticsPage = ReplayPage;
export const AllowPage = SettingsPage;
export const StrategiesPage = SettingsPage;
export const TacticsPage = SettingsPage;
export const EnginePage = OverviewPage;
export const SystemPage = ConnectionsPage;
