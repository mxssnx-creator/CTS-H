import { readFileSync, writeFileSync } from "node:fs";
import { BOOK, DEFAULT_FLOORS, INDICATIONS } from "../src/lib/desk/constants.ts";
import { HOUR_MS } from "../src/lib/desk/intervals.ts";
import { simulateSessions, summarizeReplay, type Bar } from "../src/lib/desk/process.ts";
import { simulateStaged } from "../src/lib/desk/staged.ts";
import { defaultForInterval, normalizeStrategies } from "../src/lib/desk/strategies.ts";

// Staged lanes versus the coordinated engine, on 10-day holdouts with a 3-day prehistory.
// Research windows R1..R4 were used to choose the default; TEST is the most recent window and was evaluated once for that choice.
const [input, outFile = "staged-study.json"] = process.argv.slice(2);
if (!input) throw new Error("Usage: cts-h-staged-study.ts capture.json [out.json]");
const capture = JSON.parse(readFileSync(input, "utf8"))[0] as { end: number; books: { symbol: string; bars: Bar[] }[] };
const usable = capture.books.filter((book) => book.bars.length > 0);
const HOLD = 240;
const PRE = 72;
const windows = [
  { name: "R1", end: capture.end - HOUR_MS * 240, role: "research" },
  { name: "R2", end: capture.end - HOUR_MS * 480, role: "research" },
  { name: "R3", end: capture.end - HOUR_MS * 720, role: "research" },
  { name: "R4", end: capture.end - HOUR_MS * 960, role: "research" },
  { name: "TEST", end: capture.end, role: "test" },
];
const preferences = normalizeStrategies({ ...defaultForInterval("1h"), enabledIndications: [...INDICATIONS], extendedTargets: true });
const variantSpecs: { name: string; run: (end: number) => ReturnType<typeof simulateSessions> }[] = [
  {
    name: "coordinated (reference)",
    run: (end) => simulateSessions(usable, BOOK, DEFAULT_FLOORS, { hours: HOLD, preHours: PRE, end, profile: "coordinated", strategies: preferences, selectedOnly: true }),
  },
  { name: "staged default (1 cell, net, veto lanes)", run: (end) => simulateStaged(usable, BOOK, DEFAULT_FLOORS, { hours: HOLD, preHours: PRE, end, strategies: preferences }) },
  { name: "staged 2 cells per market", run: (end) => simulateStaged(usable, BOOK, DEFAULT_FLOORS, { hours: HOLD, preHours: PRE, end, strategies: preferences, perSymbol: 2 }) },
  { name: "staged 3 cells per market", run: (end) => simulateStaged(usable, BOOK, DEFAULT_FLOORS, { hours: HOLD, preHours: PRE, end, strategies: preferences, perSymbol: 3 }) },
  { name: "staged rank by PF", run: (end) => simulateStaged(usable, BOOK, DEFAULT_FLOORS, { hours: HOLD, preHours: PRE, end, strategies: preferences, rank: "pf" }) },
  { name: "staged gate off", run: (end) => simulateStaged(usable, BOOK, DEFAULT_FLOORS, { hours: HOLD, preHours: PRE, end, strategies: preferences, gate: false }) },
  { name: "staged min closes 12", run: (end) => simulateStaged(usable, BOOK, DEFAULT_FLOORS, { hours: HOLD, preHours: PRE, end, strategies: preferences, minCloses: 12 }) },
];
type Row = { variant: string; window: string; role: string; pf: number; net: number; closes: number; drawdown: number; green: number; hours: number; cells: number };
const rows: Row[] = [];
for (const variant of variantSpecs) {
  for (const window of windows) {
    const report = variant.run(window.end);
    const live = summarizeReplay(report.bookLive);
    rows.push({
      variant: variant.name,
      window: window.name,
      role: window.role,
      pf: live.pf,
      net: live.net,
      closes: live.samples,
      drawdown: report.bookDrawdownLive,
      green: report.greenBookLive,
      hours: report.bookLive.length,
      cells: report.selected.length,
    });
  }
}
writeFileSync(outFile, JSON.stringify(rows, null, 1));
console.log(`variants=${variantSpecs.length} windows=${windows.length} markets=${usable.length} rows=${rows.length}`);
