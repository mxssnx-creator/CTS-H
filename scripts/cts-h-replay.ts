import { createHash } from "node:crypto";
import { Bingx, requireRows } from "../src/lib/desk/bingx.server.ts";
import { type ConnectionId, requireConnection } from "../src/lib/desk/connections.ts";
import {
  CALIBRATION_CUTOFFS,
  CALIBRATION_END,
  CALIBRATION_EVIDENCE,
} from "../src/lib/desk/calibration.ts";
import type { ReplayProfile } from "../src/lib/desk/config-policy.ts";
import { BOOK, DEFAULT_FLOORS, LASTN, POSITION_RT_COST_PCT } from "../src/lib/desk/constants.ts";
import { CANDLE_INTERVALS, HOUR_MS, type CandleInterval } from "../src/lib/desk/intervals.ts";
import { loadKlines } from "../src/lib/desk/market.server.ts";
import { positionNotional } from "../src/lib/desk/math.ts";
import { periodRows, type PeriodRow } from "../src/lib/desk/periods.ts";
import type { LanePolicy, StagedSummary } from "../src/lib/desk/lanes.ts";
import { simulateStaged } from "../src/lib/desk/staged.ts";
import {
  simulateSessions,
  sizedNotional,
  summarizeReplay,
  type Bar,
  type CoverageRow,
  type ReplayOpts,
  type ReplaySize,
  type SessionReport,
} from "../src/lib/desk/process.ts";
import {
  defaultForInterval,
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
type ReplayScope = Pick<
  ReplayOpts, "preHours" | "indication" | "range" | "trailing" | "selectedOnly" | "reselectHours" | "independentIndications"
> & { staged?: { perSymbol: number; minPf?: number; thins: number; minCloses: number; policy?: Partial<LanePolicy>; progression?: boolean } };
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
  preferences?: StrategySettings,
  scope: ReplayScope = {},
) {
  const strategies = preferences ?? defaultForInterval(capture.interval ?? "1h");
  const { costs, feesEstimated } = replayCosts(capture, slipBps);
  const began = performance.now();
  const { staged, ...engineScope } = scope;
  const common = {
    hours,
    end: capture.end,
    costs,
    connection: capture.connection,
    interval: capture.interval ?? "1h",
    strategies,
  };
  const report =
    profile === "staged"
      ? simulateStaged(capture.books, BOOK, DEFAULT_FLOORS, {
          ...common,
          preHours: scope.preHours ?? hours,
          indication: scope.indication,
          range: scope.range,
          perSymbol: staged?.perSymbol,
          minPf: staged?.minPf,
          thins: staged?.thins,
          minCloses: staged?.minCloses,
          policy: staged?.policy,
          progression: staged?.progression,
          reselectHours: scope.reselectHours,
        })
      : simulateSessions(capture.books, BOOK, DEFAULT_FLOORS, {
          ...engineScope,
          ...common,
          profile,
          size: "base",
        });
  const elapsed = performance.now() - began;
  const base = positionNotional(BOOK);
  const variants = (profile === "coordinated" || profile === "staged" ? SIZES.slice(0, 1) : SIZES).map((size) => {
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
// PF 1.00 is neutral: net zero, including a window with no trades.
const pf = (grossProfit: number, grossLoss: number) =>
  grossLoss > 1e-12 ? fmt(grossProfit / grossLoss) : grossProfit > 1e-12 ? "No losses" : "1.00";

function profileName(run: ReplayRun) {
  const label = [run.profile, ...run.strategies.map((key) => STRATEGY_LABELS[key])].join(" + ");
  return run.strategySettings?.autoPf ? `${label} · Auto PF` : label;
}

const PERIOD_HEAD = [
  "UTC period start", "UTC period end", "Hours", "Closes", "Wins", "Losses", "Win rate",
  "Realized", "MTM change", "Net", "Cumulative net", "Gross profit", "Gross loss", "Trade PF",
  "Positive hours", "Period drawdown", "Open legs at end",
];
const periodCells = (row: PeriodRow): (string | number)[] => [
  iso(row.start), iso(row.end), row.hours, row.trades, row.wins, row.losses,
  row.winRate === null ? "—" : `${fmt(row.winRate * 100)}%`,
  row.realized, row.mtm, row.net, row.cumulative, row.grossProfit, row.grossLoss,
  pf(row.grossProfit, row.grossLoss), row.positiveHours, row.drawdown, row.openLegsEnd,
];

export function minimumCloses(run: { strategySettings: StrategySettings | null }) {
  return run.strategySettings?.autoPf ? run.strategySettings.autoPfSamples : LASTN.minSamples;
}

export function coverageStatus(row: CoverageRow, minSamples: number): string {
  if (row.configs === 0) return "Every configuration excluded by published calibration";
  if (row.selected) return `Selected on ${row.selected} symbol${row.selected === 1 ? "" : "s"}`;
  if (row.passed) return "Passed the gates but was not the best configuration on any symbol";
  if (row.reachedSamples) return "Reached the closes minimum; PF, net or follow-through gate failed";
  if (row.withCloses) return `Below the ${minSamples}-close minimum in the prehistory`;
  if (row.signalsPre) return "Signals in the prehistory produced no closes";
  return "No signals in the prehistory";
}

function coverageDetail(run: ReplayRun) {
  const minSamples = minimumCloses(run);
  return run.report.coverage.map((row) => {
    const picks = run.report.selected.filter(
      (item) => item.indication === row.indication && item.range === row.range,
    );
    const gp = picks.reduce((total, item) => total + item.replay.grossProfit, 0);
    const gl = picks.reduce((total, item) => total + item.replay.grossLoss, 0);
    return {
      row,
      closes: picks.reduce((total, item) => total + item.replay.samples, 0),
      gp,
      gl,
      net: picks.reduce((total, item) => total + item.replay.net, 0),
      status: coverageStatus(row, minSamples),
    };
  });
}

const COVERAGE_HEAD = [
  "Indication", "Range", "Configurations", "Excluded", "With prehistory closes",
  "At closes minimum", "Best prehistory PF at minimum", "Passed gates", "Selected symbols", "Prehistory signals",
  "Holdout signals", "Selected holdout closes", "Selected PF", "Selected net", "Status",
];
function coverageTable(run: ReplayRun) {
  return table(
    COVERAGE_HEAD,
    coverageDetail(run)
      .map(({ row, closes, gp, gl, net, status }) =>
        `<tr><td>${esc(row.indication)}</td><td>${esc(row.range)}</td>${[
          row.configs, row.excluded, row.withCloses, row.reachedSamples,
          row.reachedSamples ? fmt(row.bestPf) : "—", row.passed,
          row.selected, row.signalsPre, row.signalsReplay, closes, pf(gp, gl), net,
        ].map(cell).join("")}<td>${esc(status)}</td></tr>`,
      )
      .join(""),
  );
}

// Accepts the per-period rows produced by `periodRows` for one run.
function periodTable(rows: PeriodRow[]) {
  return table(PERIOD_HEAD, rows.map((row) => `<tr>${periodCells(row).map((v, i) => i < 2 ? `<td>${esc(String(v))}</td>` : cell(v)).join("")}</tr>`).join(""));
}

function markdownTable(head: string[], body: (string | number)[][]) {
  const text = (v: string | number) => (typeof v === "number" ? fmt(v) : v).replace(/\|/g, "\\|");
  return [
    `| ${head.join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...body.map((values) => `| ${values.map(text).join(" | ")} |`),
  ].join("\n");
}

const pct = (value: number) => `${fmt(value * 100)}%`;

// Policy in one line: PF is net of costs (1.00 is neutral) and every lane needs its cost floor.
export function policyText(policy: LanePolicy): string {
  const tuned = Object.keys(policy.laneMinPf ?? {}).length;
  return `Policy: PF is net of round-trip costs, so 1.00 is neutral. Each lane needs PF ≥ max(lane floor, 1 + ${policy.costMultiple} × costs/gross loss), plus auto PF ${policy.autoPenalty} over ${policy.autoSamples} closes; net positive ${policy.requireNet ? "required" : "not required"}; ratchet ${policy.ratchetStep} per thin stage; ${tuned} per-relation floors set (others ${policy.minPf}).`;
}

// Staged lanes: stage table, lane table, summary and per-market cells, as HTML.
function stagedHtml(run: ReplayRun): string {
  const staged = run.report.staged;
  if (!staged) return "";
  const stageRows = staged.stages.map((stage) =>
    row([stage.name, stage.input, stage.validated, stage.vetoed, pct(stage.retained), stage.medianPfIn, stage.medianPfOut, stage.relation]),
  ).join("");
  const laneRows = staged.stages.flatMap((stage) =>
    stage.lanes.map((lane) =>
      row([stage.name, lane.id, lane.window, lane.mode, lane.floor, lane.evidence, lane.confirmed, lane.vetoed, lane.netPositive, lane.medianPf]),
    ),
  ).join("");
  const cellRows = staged.cells.map((cell) =>
    row([cell.name, cell.closesPre, cell.pfPre, cell.closesHoldout, cell.pfHoldout, cell.netHoldout, cell.shadows, cell.shadowPf]),
  ).join("");
  const legacy = staged.logistics === "legacy";
  return `<h3>Staged lanes${legacy ? " (legacy logistics)" : ""}</h3>
      <p>${esc(legacy ? "Stage progression is off: each cell is validated by the per-cell last-N gate, and that gate decides every holdout entry. The lane policy is not used." : policyText(staged.policy))}</p>
      <p>${esc(legacy ? "Legacy logistics" : staged.plan.join(" → "))}. ${fmt(staged.pool)} candidate cells in the prehistory pool; ${fmt(staged.validatedFinal)} validated by the final stage; ${fmt(staged.chosen)} chosen for the holdout (up to ${staged.perSymbol} per market). ${fmt(staged.bookedCloses)} booked closes, ${fmt(staged.shadows)} entries blocked by the lanes and tracked as shadows (shadow PF ${fmt(staged.shadowPf)}).</p>
      ${legacy ? "" : table(["Stage", "Input cells", "Validated", "Vetoed", "Retained", "Median PF in", "Median PF out", "Relation out/in"], stageRows)}
      ${legacy ? "" : table(["Stage", "Lane", "Window", "Mode", "Floor (before cost and auto PF)", "Evidence", "Confirmed", "Vetoed", "Net positive", "Median PF"], laneRows)}
      ${table(["Cell", "Closes prehistory", "PF prehistory", "Closes holdout", "PF holdout", "Net holdout", "Shadow entries", "Shadow PF"], cellRows)}`;
}

function legacyStagedMarkdown(staged: StagedSummary): string[] {
  return [
    "### Staged lanes (legacy logistics)",
    "",
    `Stage progression is off: each cell is validated by the per-cell last-N gate (last 50 closes, recent window 15, suspension 12, auto PF), and that gate decides every holdout entry from the cell's own closes. ${fmt(staged.pool)} candidate cells; ${fmt(staged.validatedFinal)} validated; ${fmt(staged.chosen)} chosen (up to ${staged.perSymbol} per market). ${fmt(staged.bookedCloses)} booked closes; ${fmt(staged.shadows)} blocked entries tracked as shadows (shadow PF ${fmt(staged.shadowPf)}).`,
    "",
    markdownTable(
      ["Cell", "Closes prehistory", "PF prehistory", "Closes holdout", "PF holdout", "Net holdout", "Shadow entries", "Shadow PF"],
      staged.cells.map((cell) => [cell.name, cell.closesPre, cell.pfPre, cell.closesHoldout, cell.pfHoldout, cell.netHoldout, cell.shadows, cell.shadowPf]),
    ),
  ];
}

function stagedMarkdown(run: ReplayRun): string[] {
  const staged = run.report.staged;
  if (!staged) return [];
  if (staged.logistics === "legacy") return legacyStagedMarkdown(staged);
  return [
    "### Staged lanes",
    "",
    policyText(staged.policy),
    "",
    `${staged.plan.join(" → ")}. ${fmt(staged.pool)} candidate cells; ${fmt(staged.validatedFinal)} validated by the final stage; ${fmt(staged.chosen)} chosen (up to ${staged.perSymbol} per market). ${fmt(staged.bookedCloses)} booked closes; ${fmt(staged.shadows)} blocked entries tracked as shadows (shadow PF ${fmt(staged.shadowPf)}).`,
    "",
    markdownTable(
      ["Stage", "Input cells", "Validated", "Vetoed", "Retained", "Median PF in", "Median PF out", "Relation out/in"],
      staged.stages.map((stage) => [stage.name, stage.input, stage.validated, stage.vetoed, pct(stage.retained), stage.medianPfIn, stage.medianPfOut, stage.relation]),
    ),
    "",
    markdownTable(
      ["Stage", "Lane", "Window", "Mode", "Floor (before cost and auto PF)", "Evidence", "Confirmed", "Vetoed", "Net positive", "Median PF"],
      staged.stages.flatMap((stage) => stage.lanes.map((lane) => [stage.name, lane.id, lane.window, lane.mode, lane.floor, lane.evidence, lane.confirmed, lane.vetoed, lane.netPositive, lane.medianPf])),
    ),
    "",
    markdownTable(
      ["Cell", "Closes prehistory", "PF prehistory", "Closes holdout", "PF holdout", "Net holdout", "Shadow entries", "Shadow PF"],
      staged.cells.map((cell) => [cell.name, cell.closesPre, cell.pfPre, cell.closesHoldout, cell.pfHoldout, cell.netHoldout, cell.shadows, cell.shadowPf]),
    ),
    "",
  ];
}


export function renderMarkdown(runs: ReplayRun[], periodHours = 4): string {
  const sections = runs.map((run) => {
    const holdoutStart = run.end - run.hours * HOUR_MS;
    const holdout = periodRows(run.report.bookLive, periodHours, holdoutStart);
    const prehistory = periodRows(run.report.bookPre, periodHours, holdoutStart - run.preHours * HOUR_MS);
    const base = run.variants[0]!;
    const coverage = coverageDetail(run);
    const selected = run.report.selected.map((item) => [
      item.name, item.indication, item.range, `${fmt(run.costs[item.symbol]! * 100)}%`,
      item.pre.samples, pf(item.pre.grossProfit, item.pre.grossLoss), item.requiredPf,
      item.replay.samples, pf(item.replay.grossProfit, item.replay.grossLoss),
      item.replay.net, item.replay.drawdown, item.replay.green,
    ]);
    return [
      `## ${run.connection} · ${run.interval} · ${profileName(run)} · ${iso(run.end)}`,
      "",
      `- Source: ${run.origin}`,
      `- Symbols with complete coverage: ${run.report.symbols} of ${run.requested}`,
      `- Holdout: ${run.hours}h starting ${iso(run.end - run.hours * HOUR_MS)}; prehistory: ${run.preHours}h starting ${iso(run.end - (run.hours + run.preHours) * HOUR_MS)}`,
      `- Holdout result: ${fmt(base.replay.net)} net, ${base.replay.samples} closes, PF ${pf(base.replay.grossProfit, base.replay.grossLoss)}, ${base.replay.green} of ${run.report.bookLive.length} periods positive, drawdown ${fmt(base.replay.drawdown)}`,
      `- Configurations scored: ${fmt(run.report.evaluatedConfigs)}; failed preselection: ${fmt(run.report.rejectedPf)}; excluded by calibration: ${run.report.disabledConfigs}`,
      `- Strategy actions: ${STRATEGY_TYPES.map((kind) => `${STRATEGY_LABELS[kind]} ${run.report.strategyActions[kind]}`).join(", ")}`,
      `- Slippage: ${run.slipBps} bp per fill; costs and fee fallbacks: ${run.feesEstimated.length ? run.feesEstimated.join(", ") : "none"}`,
      `- Capture and cost SHA-256: ${run.evidence}`,
      "",
      `### Holdout by ${periodHours}-hour period (UTC, from ${iso(holdoutStart)})`,
      "",
      markdownTable(PERIOD_HEAD, holdout.map(periodCells)),
      "",
      `### Prehistory by ${periodHours}-hour period (UTC, from ${iso(holdoutStart - run.preHours * HOUR_MS)})`,
      "",
      markdownTable(PERIOD_HEAD, prehistory.map(periodCells)),
      "",
      ...stagedMarkdown(run),
      "### Indication and range coverage",
      "",
      markdownTable(
        COVERAGE_HEAD,
        coverage.map(({ row, closes, gp, gl, net, status }) => [
          row.indication, row.range, row.configs, row.excluded, row.withCloses,
          row.reachedSamples, row.reachedSamples ? row.bestPf : "—", row.passed, row.selected,
          row.signalsPre, row.signalsReplay,
          closes, pf(gp, gl), net, status,
        ]),
      ),
      "",
      "### Selections by symbol",
      "",
      markdownTable(
        ["Symbol and configuration", "Indication", "Range", "Costs", "Prehistory closes",
          "Prehistory PF", "Required PF", "Holdout closes", "Holdout PF", "Holdout net",
          "Holdout drawdown", "Positive periods"],
        selected,
      ),
      "",
    ].join("\n");
  });
  return ["# CTS-H replay · period report", "", ...sections].join("\n");
}

export function renderReplay(runs: ReplayRun[], introduction = "", periodHours = 4): string {
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
      const independent = Object.entries(raw.indicationSummaries ?? {})
        .map(([name, result]) => row([
          name, result.selected, result.samples, pf(result.grossProfit, result.grossLoss),
          result.net, result.drawdown,
          `${result.green}/${result.bookLive.length}`,
        ]))
        .join("");
      return `<section><details><summary>${esc(run.connection)} · ${esc(run.interval)} · ${esc(profileName(run))} · ${iso(run.end)}</summary>
      <p>${esc(run.origin)} · ${raw.symbols}/${run.requested} symbols with complete coverage · ${raw.proven} configurations cleared preselection · ${raw.selected.length} selected for replay</p>
      <p>${fmt(raw.evaluatedConfigs)} market configurations scored. ${raw.rejectedPf === undefined ? "" : `${fmt(raw.rejectedPf)} failed preselection. `}${raw.disabledConfigs} market-specific configurations excluded by the published calibration.</p>
      <p>Pre window starts ${iso(run.end - (run.hours + run.preHours) * HOUR_MS)}. Replay starts ${iso(run.end - run.hours * HOUR_MS)} and ends ${iso(run.end)}.</p>
      <p>Replay calculation ${fmt(run.replayMs)} ms. Fill win rate ${base.samples ? fmt((base.wins * 100) / base.samples) + "%" : "—"}.</p>
      <p>${esc(raw.note)}</p>
      ${run.strategySettings ? `<p>Volume ${fmt(run.strategySettings.volumeFactor)}× · ${actions ? "Strategy actions " + esc(actions) : "No strategy sizing overlays"}. ${run.indication ? esc(run.indication) + " indication." : ""} ${run.range ? esc(run.range) + " target grid." : ""}</p>` : ""}
      ${raw.unavailable.length ? `<p>Missing contiguous data for ${esc(raw.unavailable.join(", "))}.</p>` : ""}
      ${run.feesEstimated.length ? `<p>Fee fallback applied to ${esc(run.feesEstimated.join(", "))}.</p>` : ""}
      <h3>Holdout P&amp;L</h3><div class="chart" role="img" aria-label="Net profit and loss per reporting period">${bars}</div>
      ${table(["UTC period", "Closes", "Wins", "Losses", "Realized", "MTM change", "Net", "Trade PF", "Open"], hourly)}
      <h3>Holdout by ${periodHours}-hour period (UTC, from the window start)</h3>
      ${periodTable(periodRows(raw.bookLive, periodHours, run.end - run.hours * HOUR_MS))}
      <h3>Prehistory by ${periodHours}-hour period (UTC, from the window start)</h3>
      ${periodTable(periodRows(raw.bookPre, periodHours, run.end - (run.hours + run.preHours) * HOUR_MS))}
      ${stagedHtml(run)}
      <h3>Indication and range coverage</h3>
      <p>Every indication and range is evaluated on each symbol. A cell without a selection shows the gate that stopped it.</p>
      ${coverageTable(run)}
      ${independent ? `<h3>Independent indications</h3><p>Each indication selects its own qualifying configuration per market and period. These portfolios overlap and are not additive.</p>${table(["Indication", "Selections", "Closes", "PF", "Net", "Drawdown", "Positive hours"], independent)}` : ""}
      <h3>Selections by period</h3>
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
  <p>The baseline uses the original short grid. The filtered profile adds 0.8–2.0 ATR targets and the calibrated 1h exclusions. The coordinated profile qualifies enabled indications, fixed, ATR-trailing and break-even exits independently, and ranks qualified candidates by positive periods. Modeled stop distance and costs are limited to 0.8% of planned notional per setup in the filtered and coordinated profiles. Legacy Axis and Block multipliers preserve the reference trade sequence. Coordinated overlays execute their own sizing and add rules.</p>
  <p>Each market advances one prequalified configuration into a flat-start holdout. Entries use the next candle open, ambiguous candles hit the stop first, managed stops update after the candle, and any remaining position closes at a session boundary. Coordinated 1m, 5m and 15m sessions use their configured hold time; other profiles and intervals use 24 candles. PF uses realized gains and losses after taker fees and ${runs[0]?.slipBps ?? 0} bp slippage per fill. P&amp;L and candle-equity drawdown are in settlement units. Positive periods use hourly equity on intervals up to 1h and four-hour equity on 4h candles. Funding, depth and liquidation are outside the model.</p></section>
  <section><h2>Exclusion evidence</h2>
  <p>Historical calibration cutoffs ${CALIBRATION_CUTOFFS.map(iso).join(" · ")}.</p>
  <p>Each exclusion applies to one connection, symbol, indication and bracket. It required at least 24 closes, at least three losing periods with six or more closes each, zero adequately sampled winning periods and pooled PF no greater than 0.80. Alternate grid configurations share market data and their fills can be correlated.</p>
  ${calibration}</section>${detail}</main></body></html>`;
}
