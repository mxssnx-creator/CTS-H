import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CANDLE_INTERVALS, HOUR_MS, type CandleInterval } from "../src/lib/desk/intervals.ts";
import {
  barIndexAt,
  buildMicroBook,
  enumerateMicroSets,
  type Fill,
  MICRO_GRID,
  type MicroBook,
  newMicroAcc,
  resetMicroAcc,
  simulateMicro,
  summarizeMicro,
} from "../src/lib/desk/micro.ts";
import type { Bar } from "../src/lib/desk/process.ts";

// Regime study on native candles. The rules are fixed in docs/micro-regimes.md before the run.
//   regime <nativeDir> <outDir> <interval> [markets]

const WINDOW_MS = 240 * HOUR_MS;
const WARMUP_MS = 48 * HOUR_MS;
const ANCHOR_MS = 4 * HOUR_MS;
const BULL = 5;
const BEAR = -5;
const FIRST_TEST = 12;
const MIN_POSITIONS = 300;
const MIN_POSITIVE_SHARE = 0.6;
const FIELDS = 12;

type NativeFile = { symbol: string; end: number; complete: boolean; bars: { time: number; open: number; high: number; low: number; close: number; volume: number }[] };
type Market = { symbol: string; end: number; bars: Bar[]; book: MicroBook | null };

const [dir, outDir, intervalText, limitText = "50"] = process.argv.slice(2);
if (!dir || !outDir || !intervalText) throw new Error("Usage: regime <nativeDir> <outDir> <interval> [markets]");
const interval = intervalText as CandleInterval;
const step = CANDLE_INTERVALS[interval];
const slots = WINDOW_MS / step;

const markets: Market[] = [];
for (const name of readdirSync(dir).filter((item) => item.endsWith(".json") && item !== "_summary.json").sort()) {
  if (markets.length >= Number(limitText)) break;
  const file = JSON.parse(readFileSync(join(dir, name), "utf8")) as NativeFile;
  if (!file.complete) continue;
  const bars: Bar[] = file.bars.map((row) => ({ t: row.time, o: row.open, h: row.high, l: row.low, c: row.close, v: row.volume, closed: true }));
  markets.push({ symbol: file.symbol, end: file.end, bars, book: null });
}
if (markets.length === 0) throw new Error("No complete markets.");
const dataStart = Math.max(...markets.map((market) => market.bars[0]!.t));
const anchor = Math.floor(Math.min(...markets.map((market) => market.end)) / ANCHOR_MS) * ANCHOR_MS;

// Windows, oldest first. Each keeps WARMUP_MS of history before it.
const spans: { start: number; end: number }[] = [];
for (let j = 0; ; j++) {
  const end = anchor - j * WINDOW_MS;
  const start = end - WINDOW_MS;
  if (start - WARMUP_MS < dataStart) break;
  spans.unshift({ start, end });
}
const K = spans.length;
for (const market of markets) market.book = buildMicroBook(market.bars, interval);

// Coverage and per-window market move (open of the first bar to close of the last, in percent).
const ranges = markets.map((market) =>
  spans.map((span) => {
    const from = barIndexAt(market.bars, span.start);
    const to = barIndexAt(market.bars, span.end);
    return { from, to, ok: to - from >= 0.99 * slots };
  }),
);
const windows = spans.map((span, w) => {
  const moves = markets.flatMap((market, m) => {
    const r = ranges[m]![w]!;
    return r.ok ? [((market.bars[r.to - 1]!.c / market.bars[r.from]!.o) - 1) * 100] : [];
  });
  moves.sort((a, b) => a - b);
  const median = moves.length ? moves[Math.floor(moves.length / 2)]! : 0;
  const regime = median >= BULL ? "BULL" : median <= BEAR ? "BEAR" : "CHOP";
  return { name: `W${w}`, start: span.start, end: span.end, markets: moves.length, medianMove: Number(median.toFixed(2)), regime };
});

// BRACKET=atr runs Experiment B: target and stop as multiples of the ATR, the grid fixed in docs/micro-regimes.md.
const atrBrackets = process.env.BRACKET === "atr";
const grid = atrBrackets ? { ...MICRO_GRID, brackets: ["atr"] as const, tp: [0.5, 1.0, 1.5, 2.0, 3.0], sl: [0.5, 1.0, 1.5, 2.0] } : MICRO_GRID;
const sets = enumerateMicroSets({ ...grid, intervals: [interval] });
const S = sets.length;
const accs = windows.map((window) => newMicroAcc(window.start, step, slots));
const stats = new Float64Array(S * K * FIELDS);
const side = new Float64Array(K * 6);
let current = 0;
const sink = (fill: Fill): void => {
  const base = current * 6;
  if (fill.side > 0) {
    side[base] = side[base]! + fill.pnl;
    if (fill.pnl > 0) side[base + 1] = side[base + 1]! + fill.pnl;
    else side[base + 2] = side[base + 2]! - fill.pnl;
  } else {
    side[base + 3] = side[base + 3]! + fill.pnl;
    if (fill.pnl > 0) side[base + 4] = side[base + 4]! + fill.pnl;
    else side[base + 5] = side[base + 5]! - fill.pnl;
  }
};

const started = Date.now();
sets.forEach((set, s) => {
  side.fill(0);
  for (let w = 0; w < K; w++) resetMicroAcc(accs[w]!, windows[w]!.start);
  markets.forEach((market, m) => {
    for (let w = 0; w < K; w++) {
      const r = ranges[m]![w]!;
      if (!r.ok) continue;
      current = w;
      simulateMicro(market.book!, set, r.from, r.to, accs[w]!, { sink });
    }
  });
  for (let w = 0; w < K; w++) {
    const acc = accs[w]!;
    const base = (s * K + w) * FIELDS;
    stats[base] = acc.positions;
    stats[base + 1] = acc.net;
    stats[base + 2] = acc.grossProfit;
    stats[base + 3] = acc.grossLoss;
    stats[base + 4] = summarizeMicro(acc).maxDrawdown;
    for (let k = 0; k < 6; k++) stats[base + 5 + k] = side[w * 6 + k]!;
    stats[base + 11] = acc.legs;
  }
  if ((s + 1) % 2000 === 0) console.log(`  ${s + 1}/${S} sets, ${((Date.now() - started) / 1000).toFixed(0)}s`);
});

// Prefix sums over windows, so a training history is a difference of two numbers.
const pos = new Float64Array(S * (K + 1));
const gp = new Float64Array(S * (K + 1));
const gl = new Float64Array(S * (K + 1));
const net = new Float64Array(S * (K + 1));
const posWin = new Float64Array(S * (K + 1));
for (let s = 0; s < S; s++) {
  for (let w = 0; w < K; w++) {
    const base = (s * K + w) * FIELDS;
    const at = s * (K + 1) + w + 1;
    const prev = s * (K + 1) + w;
    pos[at] = pos[prev]! + stats[base]!;
    gp[at] = gp[prev]! + stats[base + 2]!;
    gl[at] = gl[prev]! + stats[base + 3]!;
    net[at] = net[prev]! + stats[base + 1]!;
    posWin[at] = posWin[prev]! + (stats[base + 1]! > 0 ? 1 : 0);
  }
}

// The pre-registered walk: test window k uses windows 0..k-1 for training.
const walk: Record<string, unknown>[] = [];
const oosByRegime = new Map<string, { gp: number; gl: number; net: number; traded: number; flat: number; positions: number }>();
for (let k = FIRST_TEST; k < K; k++) {
  let best = -1;
  let bestScore = -Infinity;
  let eligible = 0;
  for (let s = 0; s < S; s++) {
    const at = s * (K + 1) + k;
    const at0 = s * (K + 1);
    const p = pos[at]! - pos[at0]!;
    const g = gp[at]! - gp[at0]!;
    const l = gl[at]! - gl[at0]!;
    const n = net[at]! - net[at0]!;
    if (p < MIN_POSITIONS || l <= 0 || n <= 0) continue;
    const pf = g / l;
    if (pf < 1) continue;
    if ((posWin[at]! - posWin[at0]!) / k < MIN_POSITIVE_SHARE) continue;
    eligible += 1;
    if (pf > bestScore) {
      bestScore = pf;
      best = s;
    }
  }
  const regime = windows[k]!.regime;
  const tally = oosByRegime.get(regime) ?? { gp: 0, gl: 0, net: 0, traded: 0, flat: 0, positions: 0 };
  let test: Record<string, number> | null = null;
  if (best >= 0) {
    const base = (best * K + k) * FIELDS;
    test = { positions: stats[base]!, net: stats[base + 1]!, pf: stats[base + 3]! > 0 ? stats[base + 2]! / stats[base + 3]! : 1, maxDD: stats[base + 4]! };
    tally.gp += stats[base + 2]!;
    tally.gl += stats[base + 3]!;
    tally.net += stats[base + 1]!;
    tally.traded += 1;
    tally.positions += stats[base]!;
  } else tally.flat += 1;
  oosByRegime.set(regime, tally);
  // Population baseline for the same window: every set, pooled.
  let popGp = 0;
  let popGl = 0;
  let popNet = 0;
  for (let s = 0; s < S; s++) {
    const base = (s * K + k) * FIELDS;
    popGp += stats[base + 2]!;
    popGl += stats[base + 3]!;
    popNet += stats[base + 1]!;
  }
  walk.push({
    window: windows[k]!.name,
    regime,
    medianMove: windows[k]!.medianMove,
    eligible,
    selected: best >= 0 ? sets[best]!.id : null,
    trainingPf: best >= 0 ? Number(bestScore.toFixed(4)) : null,
    test,
    population: { pf: popGl > 0 ? Number((popGp / popGl).toFixed(4)) : null, netPerSet: Number((popNet / S).toFixed(4)) },
  });
}

// Direction by regime, population pooled over every window (diagnostic, not a selection).
const direction = new Map<string, { longGp: number; longGl: number; shortGp: number; shortGl: number; n: number }>();
for (let w = 0; w < K; w++) {
  const tally = direction.get(windows[w]!.regime) ?? { longGp: 0, longGl: 0, shortGp: 0, shortGl: 0, n: 0 };
  for (let s = 0; s < S; s++) {
    const base = (s * K + w) * FIELDS;
    tally.longGp += stats[base + 5 + 1]!;
    tally.longGl += stats[base + 5 + 2]!;
    tally.shortGp += stats[base + 5 + 4]!;
    tally.shortGl += stats[base + 5 + 5]!;
  }
  tally.n += 1;
  direction.set(windows[w]!.regime, tally);
}

const result = {
  interval,
  brackets: atrBrackets ? "atr" : "percent",
  markets: markets.length,
  sets: S,
  windows: windows.length,
  rules: { bull: BULL, bear: BEAR, firstTestWindow: FIRST_TEST, minPositions: MIN_POSITIONS, minPositiveShare: MIN_POSITIVE_SHARE },
  regimeCounts: Object.fromEntries(["BULL", "BEAR", "CHOP"].map((r) => [r, windows.filter((w) => w.regime === r).length])),
  oosByRegime: Object.fromEntries(
    [...oosByRegime.entries()].map(([regime, t]) => [
      regime,
      { tradedWindows: t.traded, flatWindows: t.flat, positions: t.positions, pf: t.gl > 0 ? Number((t.gp / t.gl).toFixed(4)) : null, net: Number(t.net.toFixed(2)) },
    ]),
  ),
  oosPooled: (() => {
    const t = [...oosByRegime.values()].reduce((a, b) => ({ gp: a.gp + b.gp, gl: a.gl + b.gl, net: a.net + b.net, traded: a.traded + b.traded, flat: a.flat + b.flat, positions: a.positions + b.positions }), { gp: 0, gl: 0, net: 0, traded: 0, flat: 0, positions: 0 });
    return { tradedWindows: t.traded, flatWindows: t.flat, positions: t.positions, pf: t.gl > 0 ? Number((t.gp / t.gl).toFixed(4)) : null, net: Number(t.net.toFixed(2)) };
  })(),
  directionByRegime: Object.fromEntries([...direction.entries()].map(([regime, t]) => [regime, { windows: t.n, longPf: t.longGl > 0 ? Number((t.longGp / t.longGl).toFixed(4)) : null, shortPf: t.shortGl > 0 ? Number((t.shortGp / t.shortGl).toFixed(4)) : null }])),
  windowsDetail: windows,
  walk,
  seconds: Math.round((Date.now() - started) / 1000),
};
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `regime-${interval}${atrBrackets ? "-atr" : ""}.json`), JSON.stringify(result, null, 1));
console.log(`${interval}: ${S} sets, ${markets.length} markets, ${windows.length} windows (${JSON.stringify(result.regimeCounts)}), ${result.seconds}s`);
console.log(`  out of sample pooled PF ${result.oosPooled.pf}, net ${result.oosPooled.net}, traded ${result.oosPooled.tradedWindows}, flat ${result.oosPooled.flatWindows}`);
for (const [regime, row] of Object.entries(result.oosByRegime)) console.log(`  ${regime}: traded ${row.tradedWindows}, flat ${row.flatWindows}, PF ${row.pf}, net ${row.net}`);
for (const [regime, row] of Object.entries(result.directionByRegime)) console.log(`  direction in ${regime} (population): long PF ${row.longPf}, short PF ${row.shortPf}`);
