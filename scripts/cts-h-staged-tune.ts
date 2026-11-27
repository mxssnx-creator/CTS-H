import { profitFactor } from "../src/lib/desk/math.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { BOOK, DEFAULT_FLOORS, INDICATIONS } from "../src/lib/desk/constants.ts";
import { HOUR_MS } from "../src/lib/desk/intervals.ts";
import { simulateSessions, summarizeReplay, type Bar } from "../src/lib/desk/process.ts";
import { simulateStaged, type StagedOpts } from "../src/lib/desk/staged.ts";
import { defaultForInterval, normalizeStrategies } from "../src/lib/desk/strategies.ts";

// Grid search over the staged lane policy, on research windows only.
// Usage: cts-h-staged-tune.ts out.json capture-a.json capture-b.json
// Capture A supplies R1–R4 (its own TEST window is excluded); capture B supplies R5–R7 (its TEST2 window is excluded).
// Validation windows are never read here; they are scored by a separate run.
type Capture = { end: number; books: { symbol: string; bars: Bar[] }[] };
const [out = "staged-tune.json", captureAPath, captureBPath] = process.argv.slice(2);
if (!captureAPath || !captureBPath) throw new Error("Usage: cts-h-staged-tune.ts out.json capture-a.json capture-b.json");
const loadCapture = (path: string) => JSON.parse(readFileSync(path, "utf8"))[0] as Capture;
const captureA = loadCapture(captureAPath);
const captureB = loadCapture(captureBPath);
// One market list per capture, reused by every run so the candidate pool cache can hit.
const marketsA = captureA.books.filter((book) => book.bars.length > 0);
const marketsB = captureB.books.filter((book) => book.bars.length > 0);
const windows = [
  ...[1, 2, 3, 4].map((k) => ({ name: `R${k}`, markets: marketsA, end: captureA.end - 240 * k * HOUR_MS })),
  ...[1, 2, 3].map((k) => ({ name: `R${k + 4}`, markets: marketsB, end: captureB.end - 240 * k * HOUR_MS })),
];
const preferences = normalizeStrategies({ ...defaultForInterval("1h"), enabledIndications: [...INDICATIONS], extendedTargets: true });

type Market = { symbol: string; bars: Bar[] };
type Variant = { name: string; run: (markets: Market[], end: number) => ReturnType<typeof simulateSessions> };
const variants: Variant[] = [
  {
    name: "coordinated reference",
    run: (markets, end) => simulateSessions(markets, BOOK, DEFAULT_FLOORS, { hours: 240, preHours: 72, end, profile: "coordinated", strategies: preferences, selectedOnly: true }),
  },
];
// Grid 1 scanned the floor from 1.05 up; grid 2 refines around its optimum. Set GRID=2 to run it.
const gridSpecs = process.env.GRID === "2"
  ? [
      ...[1.2, 1.25, 1.3, 1.4].flatMap((minPf) =>
        [0.1, 0.15, 0.2].flatMap((autoPenalty) =>
          [6, 10].map((minCloses) => ({ minPf, autoPenalty, perSymbol: 1, minCloses, requireNet: true })),
        ),
      ),
      { minPf: 1.2, autoPenalty: 0.15, perSymbol: 1, minCloses: 6, requireNet: false },
    ]
  : [1.05, 1.1, 1.15, 1.2].flatMap((minPf) =>
      [0, 0.15, 0.3].flatMap((autoPenalty) =>
        [1, 2].map((perSymbol) => ({ minPf, autoPenalty, perSymbol, minCloses: 6, requireNet: true })),
      ),
    );
for (const spec of gridSpecs) {
  const opts: Partial<StagedOpts> = {
    perSymbol: spec.perSymbol,
    thins: 2,
    minCloses: spec.minCloses,
    rank: "net",
    policy: { minPf: spec.minPf, autoPenalty: spec.autoPenalty, autoSamples: 4, requireNet: spec.requireNet },
  };
  variants.push({
    name: `staged minPf ${spec.minPf} auto ${spec.autoPenalty} per ${spec.perSymbol} mc ${spec.minCloses}${spec.requireNet ? "" : " no-net"}`,
    run: (markets, end) => simulateStaged(markets, BOOK, DEFAULT_FLOORS, { hours: 240, preHours: 72, end, strategies: preferences, ...opts } as StagedOpts),
  });
}

type Row = { variant: string; window: string; pf: number; net: number; closes: number; drawdown: number; green: number; hours: number; gp: number; gl: number };
const rows: Row[] = [];
for (const variant of variants) {
  for (const window of windows) {
    const report = variant.run(window.markets, window.end);
    const live = summarizeReplay(report.bookLive);
    rows.push({
      variant: variant.name,
      window: window.name,
      pf: live.pf,
      net: live.net,
      closes: live.samples,
      drawdown: report.bookDrawdownLive,
      green: report.greenBookLive,
      hours: report.bookLive.length,
      gp: live.grossProfit,
      gl: live.grossLoss,
    });
  }
}
writeFileSync(out, JSON.stringify(rows, null, 1));

// Summary table, ordered by research net.
const byVariant = new Map<string, Row[]>();
for (const row of rows) byVariant.set(row.variant, [...(byVariant.get(row.variant) ?? []), row]);
const summary = [...byVariant].map(([name, list]) => {
  const gp = list.reduce((total, row) => total + row.gp, 0);
  const gl = list.reduce((total, row) => total + row.gl, 0);
  const net = list.reduce((total, row) => total + row.net, 0);
  const hours = list.reduce((total, row) => total + row.hours, 0);
  return {
    name,
    net,
    pf: profitFactor(gp, gl),
    closes: list.reduce((total, row) => total + row.closes, 0),
    drawdown: Math.max(...list.map((row) => row.drawdown)),
    green: hours ? (list.reduce((total, row) => total + row.green, 0) / hours) * 100 : 0,
    positiveWindows: list.filter((row) => row.net > 0).length,
    windows: list.length,
  };
});
summary.sort((a, b) => b.net - a.net);
console.log(`research windows: ${windows.map((w) => w.name).join(", ")} (10-day holdouts, 72h prehistory)`);
console.log("variant".padEnd(40) + "net".padEnd(10) + "PF".padEnd(8) + "orders".padEnd(9) + "maxDD".padEnd(9) + "green%".padEnd(9) + "positive windows");
for (const item of summary) {
  console.log(item.name.padEnd(40) + item.net.toFixed(2).padEnd(10) + item.pf.toFixed(2).padEnd(8) + String(item.closes).padEnd(9) + item.drawdown.toFixed(2).padEnd(9) + item.green.toFixed(1).padEnd(9) + `${item.positiveWindows}/${item.windows}`);
}
