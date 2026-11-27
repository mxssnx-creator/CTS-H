import type { ReplayProfile } from "./config-policy.ts";
import { excludedConfigurations } from "./config-policy.ts";
import type { ConnectionId } from "./connections.ts";
import { DEFAULT_FLOORS, INDICATIONS, POSITION_RT_COST_PCT, type Floors, type Indication } from "./constants.ts";
import { saneBars } from "./heal.ts";
import { CANDLE_INTERVALS, HOUR_MS, type CandleInterval } from "./intervals.ts";
import { comboId, positionNotional } from "./math.ts";
import {
  buildPlan,
  DEFAULT_LANE_POLICY,
  laneValue,
  median,
  scanStage,
  verdict,
  type Closes,
  type Lane,
  type LanePolicy,
  type LaneStage,
  type LaneSummary,
  type LaneTally,
  type StageSummary,
  type StagedSummary,
} from "./lanes.ts";
import type { Coordination } from "./management.ts";
import {
  addHours,
  buildSeries,
  clockHours,
  closedBars,
  coordinatedConfigs,
  gateState,
  gateStateOf,
  hourAccumulator,
  REPLAY_WARMUP_BARS,
  replayWindow,
  signalAt,
  simulateSessions,
  summarizeReplay,
  type Bar,
  type HourAcc,
  type LanedReplay,
  type ReplayOpts,
  type Side,
  type SessionReport,
  type TradeLeg,
} from "./process.ts";
import { defaultForInterval, newStrategyActions, normalizeStrategies, type StrategySettings } from "./strategies.ts";

const WARMUP = REPLAY_WARMUP_BARS;
// One validated cell per market is the default; research windows R1–R7 chose it (see docs/staged-lanes.md).
export const DEFAULT_PER_SYMBOL = 1;

export type StagedOpts = {
  hours: number;
  preHours: number;
  end?: number;
  interval?: CandleInterval;
  connection?: ConnectionId;
  // Preferences for the candidate pool: enabledIndications, extendedTargets, range flags and coordination modes.
  strategies?: StrategySettings;
  // Lane policy overrides: minimum PF, auto PF penalty and samples, net requirement and ratchet step.
  policy?: Partial<LanePolicy>;
  plan?: LaneStage[];
  // Stage progression: on by default. Off, cells are validated by the legacy per-cell last-N gate, and that gate also
  // decides every holdout entry from the cell's own closes.
  progression?: boolean;
  thins?: number;
  // Shortcut for policy.minPf.
  minPf?: number;
  perSymbol?: number;
  minCloses?: number;
  // Ranks validated cells per market by prehistory net P&L (default) or by PF.
  rank?: "pf" | "net";
  // When false, the holdout enters every signal (lanes still select cells); used to measure the gate.
  gate?: boolean;
  // Re-run the lanes on a rolling prehistory every this many hours; open positions are flattened at each boundary.
  reselectHours?: number;
  costs?: Readonly<Record<string, number>>;
  indication?: Indication;
  range?: "short" | "wide";
};

// One candidate cell: a configuration on one market, with its prehistory closes.
type StagedCell = {
  symbol: string;
  name: string;
  indication: Indication;
  range: "short" | "wide";
  tpAtr: number;
  slOfTp: number;
  coordination: Coordination;
  closes: Closes;
  cost: number;
};

type MarketContext = {
  symbol: string;
  bars: Bar[];
  atr: number[];
  signals: Map<Indication, (Side | 0)[]>;
  cost: number;
};

type CoverageRow = {
  indication: Indication;
  range: "short" | "wide";
  configs: number;
  excluded: number;
  withCloses: number;
  reachedSamples: number;
  signalsPre: number;
  signalsReplay: number;
};

type Pool = {
  cells: StagedCell[];
  contexts: MarketContext[];
  aligned: { symbol: string; bars: Bar[] }[];
  unavailable: string[];
  disabledConfigs: number;
  coverage: Map<string, CoverageRow>;
  span: number;
  preLength: number;
  replayLength: number;
  replayFrom: number;
  notional: number;
};

// The prehistory pool depends on the window and the preferences, not on the lane policy, the stage plan or the
// cells per market. Tuning runs over the same windows therefore reuse one pool.
const poolCache = new WeakMap<object, Map<string, Pool>>();
// Rolling runs build one pool per block; the cache keeps only the most recent few so memory stays bounded.
const MAX_CACHED_POOLS = 8;

function buildPool(
  books: { symbol: string; bars: Bar[] }[],
  equity: number,
  opts: StagedOpts,
  preferences: StrategySettings,
  interval: CandleInterval,
): Pool {
  const key = JSON.stringify([equity, opts.end ?? null, opts.hours, opts.preHours, interval, opts.connection ?? null, opts.indication ?? null, opts.range ?? null, opts.costs ?? null, preferences]);
  const cached = poolCache.get(books)?.get(key);
  if (cached) return cached;
  const step = CANDLE_INTERVALS[interval];
  const preLength = (opts.preHours * HOUR_MS) / step;
  const replayLength = (opts.hours * HOUR_MS) / step;
  const span = WARMUP + preLength + replayLength;
  const latest = Math.max(0, ...books.map((book) => closedBars(saneBars(book.bars)).at(-1)?.t ?? 0));
  const end = opts.end ?? latest + step;
  const start = end - span * step;
  const aligned = books.flatMap((book) => {
    const bars = closedBars(saneBars(book.bars)).filter((bar) => bar.t >= start && bar.t < end);
    return bars.length === span && bars.every((bar, i) => bar.t === start + i * step) ? [{ symbol: book.symbol, bars }] : [];
  });
  const present = new Set(aligned.map((book) => book.symbol));
  const unavailable = books.map((book) => book.symbol).filter((symbol) => !present.has(symbol));
  const configs = coordinatedConfigs(true, preferences, step).filter(
    (config) => (!opts.indication || config.indication === opts.indication) && (!opts.range || config.range === opts.range),
  );
  const excluded = excludedConfigurations(opts.connection, start + WARMUP * step);
  const notional = positionNotional(equity);
  const replayFrom = WARMUP + preLength;
  const coverage = new Map<string, CoverageRow>();
  for (const config of configs) {
    const id = `${config.indication}|${config.range}`;
    if (!coverage.has(id)) coverage.set(id, { indication: config.indication, range: config.range, configs: 0, excluded: 0, withCloses: 0, reachedSamples: 0, signalsPre: 0, signalsReplay: 0 });
  }
  const cells: StagedCell[] = [];
  const contexts: MarketContext[] = [];
  let disabledConfigs = 0;
  for (const { symbol, bars } of aligned) {
    const series = buildSeries(bars);
    const cost = opts.costs?.[symbol] ?? POSITION_RT_COST_PCT;
    const signals = new Map<Indication, (Side | 0)[]>();
    for (const indication of new Set(configs.map((config) => config.indication))) {
      const row = bars.map((_, i) => signalAt(indication, bars, series, i));
      signals.set(indication, row);
      for (const item of coverage.values()) {
        if (item.indication !== indication) continue;
        for (let i = WARMUP; i < row.length; i++) {
          if (!row[i]) continue;
          if (i < replayFrom) item.signalsPre += 1;
          else item.signalsReplay += 1;
        }
      }
    }
    contexts.push({ symbol, bars, atr: series.atr, signals, cost });
    const preSlots: HourAcc[] = Array.from({ length: preLength }, (_, k) => hourAccumulator(bars[WARMUP + k]!.t));
    for (const config of configs) {
      const item = coverage.get(`${config.indication}|${config.range}`)!;
      if (excluded.has(`${symbol}|${config.key}`)) {
        disabledConfigs += 1;
        item.excluded += 1;
        continue;
      }
      item.configs += 1;
      const ledger: TradeLeg[] = [];
      replayWindow(
        bars, series.atr, signals.get(config.indication)!, WARMUP, preSlots, notional, cost,
        config.tpAtr, config.slOfTp, true, config.coordination, true, preferences, interval,
        undefined, undefined, ledger,
      );
      const pnls = ledger.map((leg) => leg.pnl);
      const costs = ledger.map((leg) => leg.cost);
      if (pnls.length >= 1) item.withCloses += 1;
      if (pnls.length >= 4) item.reachedSamples += 1;
      cells.push({
        symbol,
        name: `${symbol} ${config.indication} ${comboId(config.tpAtr, config.slOfTp)} ${config.coordination}`,
        indication: config.indication,
        range: config.range,
        tpAtr: config.tpAtr,
        slOfTp: config.slOfTp,
        coordination: config.coordination,
        closes: { pnls, costs },
        cost,
      });
    }
  }
  const pool: Pool = { cells, contexts, aligned, unavailable, disabledConfigs, coverage, span, preLength, replayLength, replayFrom, notional };
  const per = poolCache.get(books) ?? new Map<string, Pool>();
  if (!poolCache.has(books)) poolCache.set(books, per);
  per.set(key, pool);
  while (per.size > MAX_CACHED_POOLS) per.delete(per.keys().next().value as string);
  return pool;
}

function resolvePolicy(opts: StagedOpts): LanePolicy {
  const policy: LanePolicy = {
    ...DEFAULT_LANE_POLICY,
    ...opts.policy,
    ...(opts.minPf === undefined ? {} : { minPf: opts.minPf }),
  };
  if (!(policy.minPf > 0)) throw new Error("The minimum PF must be positive.");
  if (!(policy.autoPenalty >= 0) || !(policy.autoSamples >= 1)) throw new Error("Auto PF needs a non-negative penalty and at least one sample.");
  if (!(policy.ratchetStep >= 0)) throw new Error("The ratchet step must be non-negative.");
  return policy;
}

export function simulateStaged(
  books: { symbol: string; bars: Bar[] }[],
  equity: number,
  floors: Floors = DEFAULT_FLOORS,
  opts: StagedOpts,
): SessionReport {
  const reselect = opts.reselectHours ?? 0;
  if (reselect > 0 && opts.hours > reselect) return simulateStagedReselected(books, equity, floors, opts, reselect);
  return simulateStagedWindow(books, equity, opts);
}

// Rolling version: the lanes are re-run on each block's own prehistory, and block results are chained.
function simulateStagedReselected(
  books: { symbol: string; bars: Bar[] }[],
  equity: number,
  floors: Floors,
  opts: StagedOpts,
  reselectHours: number,
): SessionReport {
  const interval = opts.interval ?? "1h";
  const step = CANDLE_INTERVALS[interval];
  const latest = Math.max(0, ...books.map((book) => closedBars(saneBars(book.bars)).at(-1)?.t ?? 0));
  const end = opts.end ?? latest + step;
  const start = end - opts.hours * HOUR_MS;
  const parts: SessionReport[] = [];
  for (let from = start; from < end; from += reselectHours * HOUR_MS) {
    const until = Math.min(end, from + reselectHours * HOUR_MS);
    parts.push(simulateStaged(books, equity, floors, { ...opts, end: until, hours: (until - from) / HOUR_MS, reselectHours: 0 }));
  }
  const first = parts[0]!;
  const live = parts.flatMap((part) => part.bookLive);
  const total = summarizeReplay(live);
  let running = 0;
  let peak = 0;
  let drawdown = 0;
  for (const row of live) {
    running += row.net;
    peak = Math.max(peak, running);
    drawdown = Math.max(drawdown, peak - running);
  }
  const stagedParts = parts.flatMap((part) => (part.staged ? [part.staged] : []));
  const shadowTotal = stagedParts.reduce((sum, item) => sum + item.shadowCloses, 0);
  const staged: StagedSummary | undefined = first.staged
    ? {
        ...first.staged,
        pool: stagedParts.reduce((sum, item) => sum + item.pool, 0),
        validatedFinal: stagedParts.reduce((sum, item) => sum + item.validatedFinal, 0),
        chosen: stagedParts.reduce((sum, item) => sum + item.chosen, 0),
        bookedCloses: total.samples,
        shadows: stagedParts.reduce((sum, item) => sum + item.shadows, 0),
        shadowCloses: shadowTotal,
        shadowPf: shadowTotal ? stagedParts.reduce((sum, item) => sum + item.shadowPf * item.shadowCloses, 0) / shadowTotal : 0,
        cells: stagedParts.flatMap((item) => item.cells),
      }
    : undefined;
  return {
    ...first,
    ready: parts.every((part) => part.ready),
    note: `Each ${reselectHours}h block re-runs the lanes on the preceding ${opts.preHours}h. Open positions are flattened at each block boundary.`,
    replayHours: opts.hours,
    bookLive: live,
    live,
    promoted: live,
    samplesLive: total.samples,
    samplesPromoted: total.samples,
    liveNet: total.net,
    bookNetLive: total.net,
    promotedNet: total.net,
    livePf: total.pf,
    promotedPf: total.pf,
    greenLive: total.green,
    greenPromoted: total.green,
    greenBookLive: total.green,
    bookDrawdownLive: drawdown,
    evaluatedConfigs: parts.reduce((sum, part) => sum + part.evaluatedConfigs, 0),
    disabledConfigs: parts.reduce((sum, part) => sum + part.disabledConfigs, 0),
    rejectedPf: parts.reduce((sum, part) => sum + part.rejectedPf, 0),
    proven: parts.reduce((sum, part) => sum + part.proven, 0),
    selected: parts.flatMap((part) => part.selected),
    bookNames: parts.flatMap((part) => part.bookNames),
    staged,
  };
}

function simulateStagedWindow(
  books: { symbol: string; bars: Bar[] }[],
  equity: number,
  opts: StagedOpts,
): SessionReport {
  const interval = opts.interval ?? "1h";
  const step = CANDLE_INTERVALS[interval];
  if (!Number.isInteger((opts.preHours * HOUR_MS) / step) || !Number.isInteger((opts.hours * HOUR_MS) / step) || opts.hours < 1 || opts.preHours < 1 || opts.hours > 336 || opts.preHours > 336)
    throw new Error("Staged windows must align with the candle interval and span at most 336 hours.");
  const policy = resolvePolicy(opts);
  const perSymbol = opts.perSymbol ?? DEFAULT_PER_SYMBOL;
  const minCloses = opts.minCloses ?? 6;
  if (!Number.isInteger(perSymbol) || perSymbol < 1 || perSymbol > 10) throw new Error("Choose 1 to 10 cells per market.");
  if (!Number.isInteger(minCloses) || minCloses < 1) throw new Error("The closes requirement must be a positive whole number.");
  const preferences = opts.strategies ?? normalizeStrategies({ ...defaultForInterval(interval), extendedTargets: true, enabledIndications: [...INDICATIONS] });
  // Stage progression is on by default. Off, the run uses the legacy per-cell logistics instead of the stages.
  const progressive = opts.progression ?? preferences.stageProgression;
  const plan = progressive ? (opts.plan ?? buildPlan(opts.thins ?? 2, policy)) : [];
  if (progressive && !plan.length) throw new Error("A staged run needs at least one stage.");
  const pool = buildPool(books, equity, opts, preferences, interval);
  const { cells, contexts, aligned, unavailable, disabledConfigs, coverage, span, preLength, replayLength, replayFrom, notional } = pool;

  // Stages: each one evaluates only the cells validated before it.
  const stageSummaries: StageSummary[] = [];
  let active = cells;
  let finalLanes: Lane[] = plan[0]?.lanes ?? [];
  if (progressive) {
    for (const stage of plan) {
      const input = active;
      const scan = scanStage(input.map((cell) => cell.closes), stage.lanes, policy.requireNet);
      const output = input.filter((_, i) => scan.validated[i] === 1);
      stageSummaries.push(summarizeStage(stage, input, scan, output));
      finalLanes = stage.lanes;
      active = output;
      if (!output.length) break;
    }
  } else {
    // Legacy logistics: one pass of the per-cell last-N gate over each cell's prehistory closes.
    active = cells.filter((cell) => gateState(gateStateOf(cell.closes.pnls), DEFAULT_FLOORS, preferences).validExec);
  }
  // Holdout entries pass the final stage's lanes, or in legacy logistics the per-cell gate on the cell's own closes.
  const entryGate = progressive
    ? (replay: LanedReplay) => verdict({ pnls: replay.closes, costs: replay.costs }, finalLanes, policy.requireNet).validated
    : (replay: LanedReplay) => gateState(gateStateOf(replay.closes), DEFAULT_FLOORS, preferences).validExec;

  // Selection: top validated cells per market, with a minimum of closes and positive net P&L when required.
  const byMarket = new Map<string, StagedCell[]>();
  for (const cell of active) {
    const list = byMarket.get(cell.symbol) ?? [];
    list.push(cell);
    byMarket.set(cell.symbol, list);
  }
  const chosen: StagedCell[] = [];
  for (const { symbol } of aligned) {
    const candidates = (byMarket.get(symbol) ?? [])
      .filter((cell) => cell.closes.pnls.length >= minCloses)
      .map((cell) => ({ cell, value: laneValue(cell.closes, cell.closes.pnls.length) }))
      .filter((item) => !policy.requireNet || item.value.net > 0)
      .sort((a, b) => (opts.rank === "pf" ? b.value.pf - a.value.pf : b.value.net - a.value.net) || b.value.n - a.value.n);
    for (const item of candidates.slice(0, perSymbol)) chosen.push(item.cell);
  }

  // Holdout: each chosen cell trades with the final lanes gating entries; blocked entries become shadows.
  const bookPreAcc = aligned.length ? Array.from({ length: preLength }, (_, k) => hourAccumulator(aligned[0]!.bars[WARMUP + k]!.t)) : [];
  const bookLiveAcc = aligned.length ? Array.from({ length: replayLength }, (_, k) => hourAccumulator(aligned[0]!.bars[replayFrom + k]!.t)) : [];
  const contextBySymbol = new Map(contexts.map((context) => [context.symbol, context]));
  const selected: SessionReport["selected"] = [];
  const cellRows: StagedSummary["cells"] = [];
  let shadows = 0;
  const shadowPnl: number[] = [];
  const gated = opts.gate !== false;
  for (const cell of chosen) {
    const { bars, atr, signals } = contextBySymbol.get(cell.symbol)!;
    const cellSignals = signals.get(cell.indication)!;
    const pre: HourAcc[] = Array.from({ length: preLength }, (_, k) => hourAccumulator(bars[WARMUP + k]!.t));
    replayWindow(bars, atr, cellSignals, WARMUP, pre, notional, cell.cost, cell.tpAtr, cell.slOfTp, true, cell.coordination, true, preferences, interval);
    addHours(bookPreAcc, pre);
    const live: HourAcc[] = Array.from({ length: replayLength }, (_, k) => hourAccumulator(bars[replayFrom + k]!.t));
    const laned: LanedReplay = {
      closes: cell.closes.pnls.slice(),
      costs: cell.closes.costs.slice(),
      allow: (replay) => !gated || entryGate(replay),
      shadows: 0,
      shadowPnl: [],
    };
    replayWindow(bars, atr, cellSignals, replayFrom, live, notional, cell.cost, cell.tpAtr, cell.slOfTp, true, cell.coordination, true, preferences, interval, undefined, undefined, undefined, laned);
    addHours(bookLiveAcc, live);
    shadows += laned.shadows;
    shadowPnl.push(...laned.shadowPnl);
    const preSummary = summarizeReplay(clockHours(pre, step));
    const liveSummary = summarizeReplay(clockHours(live, step));
    selected.push({ name: cell.name, symbol: cell.symbol, indication: cell.indication, range: cell.range, requiredPf: policy.minPf, pre: preSummary, replay: liveSummary });
    const prePnl = laneValue(cell.closes, cell.closes.pnls.length);
    cellRows.push({
      symbol: cell.symbol,
      name: cell.name,
      closesPre: cell.closes.pnls.length,
      pfPre: prePnl.pf,
      netPre: prePnl.net,
      closesHoldout: liveSummary.samples,
      pfHoldout: liveSummary.pf,
      netHoldout: liveSummary.net,
      shadows: laned.shadows,
      shadowPf: laneValue({ pnls: laned.shadowPnl, costs: laned.shadowPnl.map(() => 0) }, laned.shadowPnl.length).pf,
    });
  }

  const pre = clockHours(bookPreAcc, step);
  const live = clockHours(bookLiveAcc, step);
  const preSum = summarizeReplay(pre);
  const liveSum = summarizeReplay(live);
  const shadow = laneValue({ pnls: shadowPnl, costs: shadowPnl.map(() => 0) }, shadowPnl.length);
  const staged: StagedSummary = {
    logistics: progressive ? "progressive" : "legacy",
    plan: plan.map((stage) => stage.name),
    policy,
    stages: stageSummaries,
    finalStage: progressive ? (stageSummaries.at(-1)?.name ?? "") : "",
    perSymbol,
    minPf: policy.minPf,
    minCloses,
    pool: cells.length,
    validatedFinal: active.length,
    chosen: chosen.length,
    bookedCloses: liveSum.samples,
    shadows,
    shadowCloses: shadowPnl.length,
    shadowPf: shadow.pf,
    cells: cellRows,
  };
  let peak = 0;
  let trough = 0;
  let running = 0;
  for (const row of live) {
    running += row.net;
    peak = Math.max(peak, running);
    trough = Math.min(trough, running);
  }
  const coverageRows = [...coverage.values()].map((row) => ({
    ...row,
    passed: active.filter((cell) => cell.indication === row.indication && cell.range === row.range).length,
    bestPf: 0,
    selected: selected.filter((item) => item.indication === row.indication && item.range === row.range).length,
  }));
  const profile: ReplayProfile = "staged";
  return {
    ready: aligned.length > 0,
    note: aligned.length
      ? progressive ? `Staged lanes: ${plan.map((stage) => stage.name).join(" → ")}. Each lane applies its own auto PF (minimum ${policy.minPf}) and each stage evaluates only the cells validated before it. Up to ${perSymbol} validated cells per market trade the holdout with the final lanes gating entries; blocked entries are tracked as shadow positions.` : `Legacy logistics: stage progression is off. Each cell is validated once by the per-cell last-N gate (last 50 closes, recent window 15, suspension 12, auto PF), and that gate decides every holdout entry from each cell's own closes. ${cells.length} candidate cells, ${active.length} validated, up to ${perSymbol} per market.`
      : `Need ${span} contiguous closed BingX ${interval} candles for a ${opts.hours}h staged replay.`,
    pre,
    live,
    promoted: live,
    proven: active.length,
    symbols: aligned.length,
    profile,
    interval,
    preHours: opts.preHours,
    replayHours: opts.hours,
    evaluatedConfigs: cells.length,
    disabledConfigs,
    rejectedPf: cells.length - active.length,
    strategyActions: newStrategyActions(),
    indicationSummaries: undefined,
    unavailable,
    preNet: preSum.net,
    liveNet: liveSum.net,
    promotedNet: liveSum.net,
    greenPre: preSum.green,
    greenLive: liveSum.green,
    greenPromoted: liveSum.green,
    prePf: preSum.pf,
    livePf: liveSum.pf,
    promotedPf: liveSum.pf,
    samplesPre: preSum.samples,
    samplesLive: liveSum.samples,
    samplesPromoted: liveSum.samples,
    bookPre: pre,
    bookLive: live,
    bookNetPre: preSum.net,
    bookNetLive: liveSum.net,
    bookDrawdownPre: preSum.drawdown,
    bookDrawdownLive: liveSum.drawdown,
    bookEquityLive: { net: liveSum.net, peak, trough, drawdown: liveSum.drawdown },
    greenBookPre: preSum.green,
    greenBookLive: liveSum.green,
    bookNames: selected.map((item) => item.name),
    coverage: coverageRows,
    selected,
    staged: staged,
  };
}

function summarizeStage(
  stage: LaneStage,
  input: StagedCell[],
  scan: { vetoedCells: number; tallies: LaneTally[] },
  output: StagedCell[],
): StageSummary {
  const lanes: LaneSummary[] = stage.lanes.map((lane, index) => {
    const tally = scan.tallies[index]!;
    return {
      id: lane.id,
      kind: lane.kind,
      window: lane.window,
      mode: lane.mode,
      floor: lane.minPf + lane.ratchet,
      evidence: tally.evidence,
      confirmed: tally.confirmed,
      vetoed: tally.vetoed,
      netPositive: tally.netPositive,
      medianPf: median(tally.pfs),
    };
  });
  const medianIn = median(input.filter((cell) => cell.closes.pnls.length).map((cell) => laneValue(cell.closes, cell.closes.pnls.length).pf));
  const medianOut = median(output.map((cell) => laneValue(cell.closes, cell.closes.pnls.length).pf));
  return {
    id: stage.id,
    name: stage.name,
    input: input.length,
    validated: output.length,
    vetoed: scan.vetoedCells,
    retained: input.length ? output.length / input.length : 0,
    medianPfIn: medianIn,
    medianPfOut: medianOut,
    relation: medianIn > 0 ? medianOut / medianIn : 0,
    lanes,
  };
}

// Dispatches a replay: the staged lanes, or the coordinated and baseline engines.
export function simulateProfile(
  books: { symbol: string; bars: Bar[] }[],
  equity: number,
  floors: Floors,
  opts: StagedOpts & ReplayOpts & { profile?: ReplayProfile },
): SessionReport {
  if (opts.profile === "staged") return simulateStaged(books, equity, floors, opts);
  return simulateSessions(books, equity, floors, opts);
}
