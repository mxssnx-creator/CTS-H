import { createHash } from "node:crypto";
import { Bingx, requireRows } from "../src/lib/desk/bingx.server.ts";
import { type ConnectionId, requireConnection } from "../src/lib/desk/connections.ts";
import {
  CALIBRATION_CUTOFFS,
  CALIBRATION_END,
  CALIBRATION_EVIDENCE,
} from "../src/lib/desk/calibration.ts";
import type { ReplayProfile } from "../src/lib/desk/config-policy.ts";
import { BOOK, DEFAULT_FLOORS, POSITION_RT_COST_PCT } from "../src/lib/desk/constants.ts";
import { CANDLE_INTERVALS, HOUR_MS, type CandleInterval } from "../src/lib/desk/intervals.ts";
import { loadKlines } from "../src/lib/desk/market.server.ts";
import { positionNotional } from "../src/lib/desk/math.ts";
import {
  simulateSessions,
  sizedNotional,
  summarizeReplay,
  type Bar,
  type ReplayOpts,
  type ReplaySize,
  type SessionReport,
} from "../src/lib/desk/process.ts";
import {
  DEFAULT_STRATEGIES,
  STRATEGY_LABELS,
  STRATEGY_TYPES,
  type StrategySettings,
} from "../src/lib/desk/strategies.ts";

export type Capture = {
  connection: ConnectionId;
  origin: string;
  end: number;
  serverTime: number;
  duration: number;
  books: { symbol: string; bars: Bar[]; error?: string }[];
  contracts: Record<string, unknown>[];
  interval?: CandleInterval;
};

export async function captureReplay(
  connection: ConnectionId,
  symbols: string[],
  endOverride?: number,
  historyHours = 132,
  interval: CandleInterval = "1h",
): Promise<Capture> {
  const client = new Bingx(requireConnection(connection));
  const { serverTime } = await client.publicGet<{ serverTime: number }>(
    "/openApi/swap/v2/server/time",
  );
  if (!Number.isSafeInteger(serverTime) || serverTime <= 0)
    throw new Error("BingX server time is unavailable.");
  const step = CANDLE_INTERVALS[interval];
  const end = endOverride ?? Math.floor((serverTime - 3_000) / step) * step;
  const requested = (historyHours * HOUR_MS) / step;
  if (!(end > 0) || end % step !== 0 || end > serverTime - 3_000 || !Number.isInteger(requested))
    throw new Error("History and replay end must align to the closed UTC candle interval.");
  const began = performance.now();
  const built = await Promise.all([
    Promise.allSettled(
      symbols.map(async (symbol) => {
        const bars: Bar[] = [];
        let cursor = end - requested * step;
        while (cursor < end) {
          const limit = Math.min(1_000, (end - cursor) / step);
          cursor += limit * step;
          const page = await loadKlines(client, symbol, limit, cursor, interval);
          bars.push(...page);
        }
        return bars;
      }),
    ),
    client.publicGet<unknown>("/openApi/swap/v2/quote/contracts"),
  ]);
  const books = built[0].map((item, i) => ({
    symbol: symbols[i]!,
    bars: item.status === "fulfilled" ? item.value : [],
    error:
      item.status === "rejected"
        ? String(item.reason instanceof Error ? item.reason.message : "Candle request failed")
        : undefined,
  }));
  const selected = new Set(symbols);
  const contracts = requireRows(built[1], "contracts").filter((row) =>
    selected.has(String(row.symbol)),
  );
  return {
    connection,
    origin: client.connection.origin,
    serverTime,
    end,
    duration: performance.now() - began,
    interval,
    books,
    contracts,
  };
}

const SIZES: ReplaySize[] = ["base", "axis", "block", "both"];
type ReplayScope = Pick<ReplayOpts, "preHours" | "indication" | "range" | "trailing">;
const fingerprints = new WeakMap<Capture, Map<number, string>>();

export function replayCosts(capture: Capture, slipBps: number) {
  const rates = new Map(
    capture.contracts.map((row) => [row.symbol, Number(row.takerFeeRate ?? row.feeRate)]),
  );
  const costs: Record<string, number> = {};
  const feesEstimated: string[] = [];
  for (const book of capture.books) {
    const fee = rates.get(book.symbol);
    if (fee == null || !Number.isFinite(fee) || fee < 0 || fee >= 0.01) {
      feesEstimated.push(book.symbol);
      costs[book.symbol] = POSITION_RT_COST_PCT + (slipBps * 2) / 10_000;
    } else {
      costs[book.symbol] = (fee + slipBps / 10_000) * 2;
    }
  }
  return { costs, feesEstimated };
}

export function runReplay(
  capture: Capture,
  hours: number,
  slipBps: number,
  profile: ReplayProfile = "filtered",
  strategies: StrategySettings = DEFAULT_STRATEGIES,
  scope: ReplayScope = {},
) {
  const { costs, feesEstimated } = replayCosts(capture, slipBps);
  const began = performance.now();
  const report = simulateSessions(capture.books, BOOK, DEFAULT_FLOORS, {
    ...scope,
    hours,
    end: capture.end,
    costs,
    connection: capture.connection,
    profile,
    interval: capture.interval ?? "1h",
    size: "base",
    strategies,
  });
  const elapsed = performance.now() - began;
  const base = positionNotional(BOOK);
  const variants = (profile === "coordinated" ? SIZES.slice(0, 1) : SIZES).map((size) => {
    const scale =
      sizedNotional(base, {
        axis: size === "axis" || size === "both",
        block: size === "block" || size === "both",
      }) / base;
    return {
      size,
      scale,
      pre: {
        ...summarizeReplay(scaleHours(report.bookPre, scale)),
        drawdown: report.bookDrawdownPre * scale,
      },
      replay: {
        ...summarizeReplay(scaleHours(report.bookLive, scale)),
        drawdown: report.bookDrawdownLive * scale,
      },
    };
  });
  const byCost = fingerprints.get(capture) ?? new Map<number, string>();
  let evidence = byCost.get(slipBps);
  if (!evidence) {
    evidence = createHash("sha256")
      .update(
        JSON.stringify({
          origin: capture.origin,
          end: capture.end,
          interval: capture.interval,
          books: capture.books,
          costs,
        }),
      )
      .digest("hex");
    byCost.set(slipBps, evidence);
    fingerprints.set(capture, byCost);
  }
  return {
    connection: capture.connection,
    profile,
    strategies: profile === "coordinated" ? STRATEGY_TYPES.filter((key) => strategies[key]) : [],
    strategySettings: profile === "coordinated" ? strategies : null,
    origin: capture.origin,
    end: capture.end,
    requested: capture.books.length,
    hours,
    preHours: report.preHours,
    interval: report.interval,
    indication: scope.indication,
    range: scope.range,
    slipBps,
    costs,
    feesEstimated,
    evidence,
    captureMs: capture.duration,
    replayMs: elapsed,
    report,
    variants,
  };
}

function scaleHours(rows: SessionReport["bookLive"], scale: number) {
  return rows.map((row) => ({
    ...row,
    realized: row.realized * scale,
    mtm: row.mtm * scale,
    net: row.net * scale,
    grossProfit: row.grossProfit * scale,
    grossLoss: row.grossLoss * scale,
  }));
}

type ReplayRun = ReturnType<typeof runReplay>;

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 3 });
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
const cell = (v: string | number) => `<td>${esc(typeof v === "number" ? fmt(v) : v)}</td>`;
const row = (values: (string | number)[]) => `<tr>${values.map(cell).join("")}</tr>`;
const table = (head: string[], body: string) =>
  `<div class="scroll"><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>`;
const pf = (grossProfit: number, grossLoss: number) =>
  grossLoss > 0 ? fmt(grossProfit / grossLoss) : grossProfit > 0 ? "No losses" : "—";

function profileName(run: ReplayRun) {
  const label = [run.profile, ...run.strategies.map((key) => STRATEGY_LABELS[key])].join(" + ");
  return run.strategySettings?.autoPf ? `${label} · Auto PF` : label;
}

export function renderReplay(runs: ReplayRun[], introduction = ""): string {
  const comparisons = runs
    .filter((run) => run.profile !== "baseline")
    .flatMap((after) => {
      const reference =
        after.profile === "filtered"
          ? "baseline"
          : after.strategies.length
            ? "coordinated"
            : "filtered";
      const before = runs.find(
        (run) =>
          run.profile === reference &&
          run.strategies.length === 0 &&
          run.connection === after.connection &&
          run.end === after.end &&
          run.interval === after.interval &&
          run.preHours === after.preHours &&
          run.hours === after.hours &&
          run.indication === after.indication &&
          run.range === after.range &&
          run.evidence === after.evidence,
      );
      if (!before) return [];
      const base = before.variants[0]!.replay;
      const next = after.variants[0]!.replay;
      return row([
        iso(after.end),
        after.connection,
        after.interval,
        profileName(before),
        profileName(after),
        after.report.symbols,
        pf(base.grossProfit, base.grossLoss),
        pf(next.grossProfit, next.grossLoss),
        base.net,
        next.net,
        base.samples,
        next.samples,
        base.drawdown,
        next.drawdown,
        `${base.green}/${before.report.bookLive.length}`,
        `${next.green}/${after.report.bookLive.length}`,
      ]);
    })
    .join("");
  const calibration = Object.entries(CALIBRATION_EVIDENCE)
    .map(
      ([connection, items]) =>
        `<details><summary>${esc(connection)} · ${items.length} excluded configurations</summary>` +
        table(
          ["Market, indication and bracket", "Calibration closes", "Pooled PF", "Losing windows"],
          items
            .map(({ key, samples, pf, losingWindows }) => row([key, samples, pf, losingWindows]))
            .join(""),
        ) +
        "</details>",
    )
    .join("");
  const variants = runs
    .flatMap((run) =>
      run.variants.map((v) =>
        row([
          iso(run.end),
          run.connection,
          run.interval,
          profileName(run),
          v.size,
          `${fmt(v.scale)}×`,
          v.pre.samples,
          pf(v.pre.grossProfit, v.pre.grossLoss),
          v.pre.net,
          v.replay.samples,
          pf(v.replay.grossProfit, v.replay.grossLoss),
          v.replay.net,
          v.replay.drawdown,
          run.report.bookLive.length
            ? `${v.replay.green}/${run.report.bookLive.length} (${fmt((v.replay.green * 100) / run.report.bookLive.length)}%)`
            : "—",
        ]),
      ),
    )
    .join("");
  const detail = runs
    .map((run) => {
      const base = run.variants[0]!.replay;
      const raw = run.report;
      const hourly = raw.bookLive
        .map((h) =>
          row([
            iso(h.t),
            h.trades,
            h.wins,
            h.losses,
            h.realized,
            h.mtm,
            h.net,
            pf(h.grossProfit, h.grossLoss),
            h.openLegs,
          ]),
        )
        .join("");
      const selected = raw.selected
        .map((item) =>
          row([
            item.name,
            `${fmt(run.costs[item.symbol]! * 100)}%`,
            item.pre.samples,
            pf(item.pre.grossProfit, item.pre.grossLoss),
            item.requiredPf ?? "—",
            item.pre.net,
            item.replay.samples,
            pf(item.replay.grossProfit, item.replay.grossLoss),
            item.replay.net,
            item.replay.drawdown,
          ]),
        )
        .join("");
      const scale = Math.max(1e-8, ...raw.bookLive.map((h) => Math.abs(h.net)));
      const bars = raw.bookLive
        .map(
          (h) =>
            `<div class="bar" title="${iso(h.t)} · ${fmt(h.net)}"><i class="${h.net < 0 ? "down" : "up"}" style="--h:${fmt((Math.abs(h.net) / scale) * 48)}%"></i></div>`,
        )
        .join("");
      const actions = STRATEGY_TYPES.filter((kind) => run.strategies.includes(kind))
        .map((kind) => `${STRATEGY_LABELS[kind]} ${raw.strategyActions[kind]}`)
        .join(" · ");
      return `<section><details><summary>${esc(run.connection)} · ${esc(run.interval)} · ${esc(profileName(run))} · ${iso(run.end)}</summary>
      <p>${esc(run.origin)} · ${raw.symbols}/${run.requested} symbols with complete coverage · ${raw.proven} configurations cleared preselection · ${raw.selected.length} selected for replay</p>
      <p>${fmt(raw.evaluatedConfigs)} market configurations scored. ${raw.rejectedPf === undefined ? "" : `${fmt(raw.rejectedPf)} failed preselection. `}${raw.disabledConfigs} market-specific configurations excluded by the published calibration.</p>
      <p>Pre window starts ${iso(run.end - (run.hours + run.preHours) * HOUR_MS)}. Replay starts ${iso(run.end - run.hours * HOUR_MS)} and ends ${iso(run.end)}.</p>
      <p>Replay calculation ${fmt(run.replayMs)} ms. Fill win rate ${base.samples ? fmt((base.wins * 100) / base.samples) + "%" : "—"}.</p>
      ${run.strategySettings ? `<p>Volume ${fmt(run.strategySettings.volumeFactor)}× · ${actions ? "Strategy actions " + esc(actions) : "No strategy sizing overlays"}. ${run.indication ? esc(run.indication) + " indication." : ""} ${run.range ? esc(run.range) + " target grid." : ""}</p>` : ""}
      ${raw.unavailable.length ? `<p>Missing contiguous data for ${esc(raw.unavailable.join(", "))}.</p>` : ""}
      ${run.feesEstimated.length ? `<p>Fee fallback applied to ${esc(run.feesEstimated.join(", "))}.</p>` : ""}
      <h3>Holdout P&amp;L</h3><div class="chart" role="img" aria-label="Net profit and loss per reporting period">${bars}</div>
      ${table(["UTC period", "Closes", "Wins", "Losses", "Realized", "MTM change", "Net", "Trade PF", "Open"], hourly)}
      <h3>Frozen selections</h3>
      ${table(["Symbol and configuration", "Costs", "Pre closes", "Pre PF", "Required PF", "Pre net", "Replay closes", "Replay PF", "Replay net", "Replay DD"], selected)}
      <p class="hash">Capture and cost SHA-256 ${run.evidence}</p></details></section>`;
    })
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>CTS-H · BingX replay</title><style>
  :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#10151e;color:#e9f1fb;font:16px/1.5 system-ui,sans-serif}
  main{max-width:1160px;margin:auto;padding:clamp(1rem,4vw,3rem)}header{border-bottom:2px solid #57d7bf;margin-bottom:2rem}
  h1{font-size:clamp(2rem,5vw,3.3rem);margin:0}h2{margin:.2rem 0 1rem}h3{margin-top:2rem}p{color:#a7b6ca}
  summary{cursor:pointer;margin:.8rem 0}section{padding:1.25rem;margin:1.5rem 0;background:#151d2b;border:1px solid #2a3649;border-radius:14px}.scroll{overflow:auto}
  table{width:100%;border-collapse:collapse;white-space:nowrap;font:13px/1.4 ui-monospace,monospace}
  td,th{text-align:right;padding:.6rem .5rem;border-bottom:1px solid #263247}th{color:#72dec9}td:first-child,th:first-child{text-align:left}
  .chart{height:130px;display:flex;gap:3px;background:linear-gradient(transparent 49.5%,#43536b 50%,transparent 50.5%);margin:1rem 0}
  .bar{position:relative;flex:1}.bar i{position:absolute;inset-inline:0;height:var(--h);border-radius:2px}.up{bottom:50%;background:#57d7bf}.down{top:50%;background:#f37c94}.hash{font-size:.8rem;overflow-wrap:anywhere}
  </style></head><body><main><header><h1>CTS-H · BingX replay</h1><p>Walk-forward results on closed USDT perpetual candles.</p></header>
  ${introduction}
  ${comparisons ? `<section><h2>Matched holdouts</h2>${table(["End", "Connection", "Candles", "Reference", "Trial", "Symbols", "Reference PF", "Trial PF", "Reference net", "Trial net", "Reference closes", "Trial closes", "Reference drawdown", "Trial drawdown", "Reference green", "Trial green"], comparisons)}</section>` : ""}
  <section><h2>Holdout results by profile</h2>${table(["End", "Connection", "Candles", "Profile", "Sizing", "Scale", "Pre closes", "Pre PF", "Pre net", "Replay closes", "Replay PF", "Replay net", "Replay DD", "Green periods"], variants)}
  <p>The baseline uses the original short grid. The filtered profile adds 0.8–2.0 ATR targets and the calibrated 1h exclusions. The coordinated profile adds two indications, independently qualifies fixed, ATR-trailing and break-even exits, and ranks qualified candidates by positive periods. Modeled stop distance and costs are limited to 0.8% of planned notional per setup in the filtered and coordinated profiles. Legacy Axis and Block multipliers preserve the reference trade sequence. Coordinated overlays execute their own sizing and add rules.</p>
  <p>Each market advances one prequalified configuration into a flat-start holdout. Entries use the next candle open, ambiguous candles hit the stop first, managed stops update after the candle, and any remaining position closes at the boundary. Time exits use 24 candles. PF uses realized gains and losses after taker fees and ${runs[0]?.slipBps ?? 0} bp slippage per fill. P&amp;L and candle-equity drawdown are in settlement units. Positive periods use hourly equity on intervals up to 1h and four-hour equity on 4h candles. Funding, depth and liquidation are outside the model.</p></section>
  <section><h2>Exclusion evidence</h2>
  <p>Historical calibration cutoffs ${CALIBRATION_CUTOFFS.map(iso).join(" · ")}.</p>
  <p>Each exclusion applies to one connection, symbol, indication and bracket. It required at least 24 closes, at least three losing periods with six or more closes each, zero adequately sampled winning periods and pooled PF no greater than 0.80. Alternate grid configurations share market data and their fills can be correlated.</p>
  ${calibration}</section>${detail}</main></body></html>`;
}
