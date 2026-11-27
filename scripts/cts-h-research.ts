import { profitFactor } from "../src/lib/desk/math.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { BOOK, DEFAULT_FLOORS, INDICATIONS, SHORT_SL, SHORT_TP, WIDE_SL_OF_TP, WIDE_TP_ATR, type Indication } from "../src/lib/desk/constants.ts";
import { HOUR_MS } from "../src/lib/desk/intervals.ts";
import { REPLAY_WARMUP_BARS, simulateSessions, summarizeReplay, traceTrades, type Bar } from "../src/lib/desk/process.ts";
import { defaultForInterval, normalizeStrategies } from "../src/lib/desk/strategies.ts";
import type { Coordination } from "../src/lib/desk/management.ts";

// Walk-forward research over one capture of 1h candles. The windows are disjoint 5-day holdouts,
// each with a 3-day prehistory. The TEST window is never used to choose anything; it only reports
// the outcome of choices made on the research windows.
const [input, outDir = "."] = process.argv.slice(2);
if (!input) throw new Error("Usage: cts-h-research.ts capture.json [outDir]");
const capture = JSON.parse(readFileSync(input, "utf8"))[0] as { end: number; books: { symbol: string; bars: Bar[] }[] };
const HOLD = 120;
const PRE = 72;
const GRID = 192; // hours between window ends
const windows = [
  { name: "TEST", end: capture.end - GRID * HOUR_MS, role: "test" },
  { name: "R1", end: capture.end - 2 * GRID * HOUR_MS, role: "research" },
  { name: "R2", end: capture.end - 3 * GRID * HOUR_MS, role: "research" },
  { name: "R3", end: capture.end - 4 * GRID * HOUR_MS, role: "research" },
  { name: "R4", end: capture.end - 5 * GRID * HOUR_MS, role: "research" },
];
const base = defaultForInterval("1h");
const prefs = (extended: boolean) => normalizeStrategies({ ...base, enabledIndications: [...INDICATIONS], extendedTargets: extended });

type Row = { window: string; role: string; indication: string; range: string; extended: boolean; net: number; closes: number; grossProfit: number; grossLoss: number; drawdown: number; green: number; hours: number; selected: number };
const sweep: Row[] = [];
for (const window of windows) {
  for (const extended of [false, true]) {
    for (const indication of [...INDICATIONS, undefined] as (Indication | undefined)[]) {
      for (const range of [undefined, "short", "wide"] as const) {
        if (indication === undefined && range !== undefined) continue;
        const report = simulateSessions(capture.books, BOOK, DEFAULT_FLOORS, {
          hours: HOLD, preHours: PRE, end: window.end, profile: "coordinated",
          strategies: prefs(extended), selectedOnly: true, indication, range,
        });
        const live = summarizeReplay(report.bookLive);
        sweep.push({
          window: window.name, role: window.role, indication: indication ?? "all", range: range ?? "both", extended,
          net: live.net, closes: live.samples, grossProfit: live.grossProfit, grossLoss: live.grossLoss,
          drawdown: report.bookDrawdownLive, green: report.greenBookLive, hours: report.bookLive.length, selected: report.selected.length,
        });
      }
    }
  }
}

// Trade-level loss analysis on fixed brackets, research windows only, aggregated in memory.
type Bucket = { n: number; wins: number; gp: number; gl: number; net: number; tp: number; sl: number; time: number; end: number };
const brackets = new Map<string, Bucket>();
const grid: { tp: number; sl: number; range: "short" | "wide" }[] = [
  ...SHORT_TP.flatMap((tp) => SHORT_SL.map((sl) => ({ tp, sl, range: "short" as const }))),
  ...WIDE_TP_ATR.flatMap((tp) => WIDE_SL_OF_TP.map((sl) => ({ tp, sl, range: "wide" as const }))),
];
for (const window of windows.filter((w) => w.role === "research")) {
  const start = window.end - (PRE + HOLD + REPLAY_WARMUP_BARS) * HOUR_MS;
  for (const book of capture.books) {
    const bars = book.bars.filter((bar) => bar.t >= start && bar.t < window.end);
    for (const indication of INDICATIONS) {
      for (const { tp, sl, range } of grid) {
        for (const coord of ["fixed"] as Coordination[]) {
          for (const leg of traceTrades(bars, indication, tp, sl, coord)) {
            const key = `${indication}|${range}|${tp}|${sl}|${coord}`;
            const b = brackets.get(key) ?? { n: 0, wins: 0, gp: 0, gl: 0, net: 0, tp: 0, sl: 0, time: 0, end: 0 };
            b.n += 1;
            b.net += leg.pnl;
            if (leg.pnl > 0) { b.wins += 1; b.gp += leg.pnl; } else b.gl -= leg.pnl;
            if (leg.reason === "tp") b.tp += 1;
            else if (leg.reason === "sl") b.sl += 1;
            else if (leg.reason === "time") b.time += 1;
            else b.end += 1;
            brackets.set(key, b);
          }
        }
      }
    }
  }
}
const bracketRows = [...brackets].map(([key, b]) => {
  const [indication, range, tp, sl, coordination] = key.split("|");
  return { indication, range, tp: Number(tp), sl: Number(sl), coordination, ...b, pf: profitFactor(b.gp, b.gl) };
});

writeFileSync(`${outDir}/research-sweep.json`, JSON.stringify(sweep, null, 1));
writeFileSync(`${outDir}/research-brackets.json`, JSON.stringify(bracketRows));
console.log(`windows=${windows.map((w) => w.name).join(",")} sweepRows=${sweep.length} bracketRows=${bracketRows.length}`);
