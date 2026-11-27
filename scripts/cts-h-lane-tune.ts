import { readFileSync, writeFileSync } from "node:fs";
import { BOOK, DEFAULT_FLOORS, INDICATIONS } from "../src/lib/desk/constants.ts";
import { profitFactor } from "../src/lib/desk/math.ts";
import { HOUR_MS } from "../src/lib/desk/intervals.ts";
import { buildPlan, DEFAULT_LANE_POLICY } from "../src/lib/desk/lanes.ts";
import { simulateSessions, summarizeReplay, type Bar } from "../src/lib/desk/process.ts";
import { simulateStaged } from "../src/lib/desk/staged.ts";
import { defaultForInterval, normalizeStrategies } from "../src/lib/desk/strategies.ts";

// Per-relation PF floors for the staged lanes.
//   search <out.json> <captureA.json> <captureB.json>   coordinate search on research windows R1–R7 only
//   validate <floors.json|-> <capture.json>             score floors on three windows that the search never read
//
// Capture A supplies R1–R4 (its TEST window is not used); capture B supplies R5–R7 (its TEST2 window is not used).
type Capture = { end: number; books: { symbol: string; bars: Bar[] }[] };
type Market = { symbol: string; bars: Bar[] };
type Floors = Record<string, number>;

const preferences = normalizeStrategies({ ...defaultForInterval("1h"), enabledIndications: [...INDICATIONS], extendedTargets: true });
const markets = (capture: Capture): Market[] => capture.books.filter((book) => book.bars.length > 0);
const laneIds = [...new Set(buildPlan(2).flatMap((stage) => stage.lanes.map((lane) => lane.id)))];
const CANDIDATES = (process.env.CANDIDATES ?? "1.0,1.1,1.2,1.3").split(",").map(Number);
const MIN_ORDERS = 800;

type Window = { name: string; markets: Market[]; end: number };
type Result = { net: number; gp: number; gl: number; orders: number; drawdown: number; green: number; hours: number; positive: number; windows: number };

function runWindows(windows: Window[], floors: Floors | null): Result {
  const rows = windows.map((window) => {
    const report = floors === null
      ? simulateSessions(window.markets, BOOK, DEFAULT_FLOORS, { hours: 240, preHours: 72, end: window.end, profile: "coordinated", strategies: preferences, selectedOnly: true })
      : simulateStaged(window.markets, BOOK, DEFAULT_FLOORS, {
          hours: 240,
          preHours: 72,
          end: window.end,
          strategies: preferences,
          perSymbol: 1,
          minCloses: 6,
          rank: "net",
          thins: 2,
          policy: { laneMinPf: floors, costMultiple: DEFAULT_LANE_POLICY.costMultiple, autoPenalty: DEFAULT_LANE_POLICY.autoPenalty, requireNet: true },
        });
    const live = summarizeReplay(report.bookLive);
    return { net: live.net, gp: live.grossProfit, gl: live.grossLoss, orders: live.samples, drawdown: report.bookDrawdownLive, green: report.greenBookLive, hours: report.bookLive.length };
  });
  return {
    net: rows.reduce((total, row) => total + row.net, 0),
    gp: rows.reduce((total, row) => total + row.gp, 0),
    gl: rows.reduce((total, row) => total + row.gl, 0),
    orders: rows.reduce((total, row) => total + row.orders, 0),
    drawdown: Math.max(...rows.map((row) => row.drawdown)),
    green: rows.reduce((total, row) => total + row.hours, 0) ? (rows.reduce((total, row) => total + row.green, 0) / rows.reduce((total, row) => total + row.hours, 0)) * 100 : 0,
    positive: rows.filter((row) => row.net > 0).length,
    windows: rows.length,
  };
}

function search(outPath: string, captureA: Capture, captureB: Capture) {
  const marketsA = markets(captureA);
  const marketsB = markets(captureB);
  const research: Window[] = [
    ...[1, 2, 3, 4].map((k) => ({ name: `R${k}`, markets: marketsA, end: captureA.end - 240 * k * HOUR_MS })),
    ...[1, 2, 3].map((k) => ({ name: `R${k + 4}`, markets: marketsB, end: captureB.end - 240 * k * HOUR_MS })),
  ];
  let floors: Floors = {};
  let best = runWindows(research, floors);
  const log: string[] = [`start: net ${best.net.toFixed(2)} PF ${(best.gp / best.gl).toFixed(3)} orders ${best.orders}`];
  const passes = Number(process.env.PASSES ?? "1");
  for (let pass = 1; pass <= passes; pass++) {
    for (const id of laneIds) {
      for (const candidate of CANDIDATES) {
        if ((floors[id] ?? 1.0) === candidate) continue;
        const trial = { ...floors, [id]: candidate };
        const result = runWindows(research, trial);
        if (result.orders < MIN_ORDERS) continue;
        if (result.net > best.net + 1e-9) {
          best = result;
          floors = trial;
          log.push(`pass ${pass} ${id} -> ${candidate}: net ${best.net.toFixed(2)} orders ${best.orders}`);
        }
      }
    }
  }
  writeFileSync(outPath, JSON.stringify({ floors, research: best, log }, null, 1));
  console.log(log.join("\n"));
  console.log(`final floors: ${JSON.stringify(floors)}`);
  console.log(`research net ${best.net.toFixed(2)} PF ${profitFactor(best.gp, best.gl).toFixed(3)} orders ${best.orders} maxDD ${best.drawdown.toFixed(2)} green ${best.green.toFixed(1)}% positive ${best.positive}/${best.windows}`);
}

function validate(floorsPath: string, capture: Capture) {
  const floors: Floors = floorsPath === "-" ? {} : (JSON.parse(readFileSync(floorsPath, "utf8")).floors ?? JSON.parse(readFileSync(floorsPath, "utf8")));
  const marketsV = markets(capture);
  const windows: Window[] = [
    { name: "N1", markets: marketsV, end: capture.end },
    { name: "N2", markets: marketsV, end: capture.end - 240 * HOUR_MS },
    { name: "N3", markets: marketsV, end: capture.end - 480 * HOUR_MS },
  ];
  const rows: Record<string, Result> = {
    "coordinated reference": runWindows(windows, null),
    "staged, untuned floors": runWindows(windows, {}),
    "staged, tuned floors": runWindows(windows, floors),
  };
  for (const [name, result] of Object.entries(rows)) {
    console.log(`${name.padEnd(26)} net ${result.net.toFixed(2)} PF ${profitFactor(result.gp, result.gl).toFixed(3)} orders ${result.orders} maxDD ${result.drawdown.toFixed(2)} green ${result.green.toFixed(1)}% positive ${result.positive}/${result.windows}`);
  }
  console.log(JSON.stringify({ floors, rows }, null, 1));
}

const [mode, a, b, c] = process.argv.slice(2);
if (mode === "search") {
  if (!a || !b || !c) throw new Error("Usage: cts-h-lane-tune.ts search out.json captureA.json captureB.json");
  search(a, JSON.parse(readFileSync(b, "utf8"))[0] as Capture, JSON.parse(readFileSync(c, "utf8"))[0] as Capture);
} else if (mode === "validate") {
  if (!a || !b) throw new Error("Usage: cts-h-lane-tune.ts validate floors.json|- capture.json");
  validate(a, JSON.parse(readFileSync(b, "utf8"))[0] as Capture);
} else {
  throw new Error("Choose search or validate.");
}
