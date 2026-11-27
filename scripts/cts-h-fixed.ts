// Fixed-bracket walk-forward check: replays chosen brackets on every market, with no prehistory selection.
// Usage: node scripts/cts-h-fixed.ts capture.json
import { readFileSync } from "node:fs";
import { BOOK, DEFAULT_FLOORS, type Indication } from "../src/lib/desk/constants.ts";
import { HOUR_MS } from "../src/lib/desk/intervals.ts";
import { simulateSessions, summarizeReplay, type Bar } from "../src/lib/desk/process.ts";
import { defaultForInterval, normalizeStrategies } from "../src/lib/desk/strategies.ts";
import type { Coordination } from "../src/lib/desk/management.ts";
const capture = JSON.parse(readFileSync(process.argv[2]!, "utf8"))[0] as { end: number; books: { symbol: string; bars: Bar[] }[] };
const windows = [
  { n: "TEST", end: capture.end - 192 * HOUR_MS }, { n: "R1", end: capture.end - 2 * 192 * HOUR_MS },
  { n: "R2", end: capture.end - 3 * 192 * HOUR_MS }, { n: "R3", end: capture.end - 4 * 192 * HOUR_MS },
  { n: "R4", end: capture.end - 5 * 192 * HOUR_MS },
];
const prefs = normalizeStrategies({ ...defaultForInterval("1h"), enabledIndications: ["stochRsi", "bollinger", "rangeFade", "ema", "adxDi", "vwapReclaim", "supertrend", "donchian"], extendedTargets: true, dynamic: true, breakeven: true });
const cases: [Indication, number, number, Coordination][] = [
  ["stochRsi", 4, 1.5, "breakeven"], ["stochRsi", 4, 1.5, "dynamic"], ["stochRsi", 4, 1, "dynamic"], ["stochRsi", 4, 1.5, "fixed"],
  ["bollinger", 4, 1.5, "breakeven"], ["bollinger", 3, 1.5, "fixed"], ["rangeFade", 3, 1, "fixed"], ["ema", 3, 1.5, "dynamic"],
];
for (const [ind, tp, sl, c] of cases) {
  const cells: string[] = [];
  for (const w of windows) {
    const r = simulateSessions(capture.books, BOOK, DEFAULT_FLOORS, {
      hours: 120, preHours: 72, end: w.end, profile: "coordinated", strategies: prefs, selectedOnly: true,
      fixed: { indication: ind, tpAtr: tp, slOfTp: sl, coordination: c },
    });
    const s = summarizeReplay(r.bookLive);
    const g = r.bookLive.length ? (r.greenBookLive / r.bookLive.length) * 100 : 0;
    cells.push(`${w.n} PF ${s.pf.toFixed(2)} n ${s.samples} net ${s.net.toFixed(2)} DD ${r.bookDrawdownLive.toFixed(2)} grn ${g.toFixed(0)}%`);
  }
  console.log(`${ind} tp${tp} sl${sl} ${c}`.padEnd(30), cells.join(" | "));
}
