import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Bingx } from "../src/lib/desk/bingx.server.ts";
import { requireConnection } from "../src/lib/desk/connections.ts";
import { REPLAY_SYMBOLS } from "../src/lib/desk/constants.ts";
import { CANDLE_INTERVALS, type CandleInterval } from "../src/lib/desk/intervals.ts";

// Resumable capture of native candles for one interval, one file per market, paged by 1000 candles.
// Usage: capture-native.ts <connection> <outDir> <interval> <startIso> <endIso> [symbolCount]
const [connection = "bingx-x01", outDir = "native", intervalText = "1h", startText, endText, countText = "50"] = process.argv.slice(2);
const interval = intervalText as CandleInterval;
const step = CANDLE_INTERVALS[interval];
const start = Date.parse(startText ?? "");
const end = Date.parse(endText ?? "");
if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start % step !== 0 || end % step !== 0 || end <= start) {
  throw new Error("Give an aligned start and end (ISO) for the interval.");
}
const PAGE = 1000;
const SPACING_MS = 1_250;
const client = new Bingx(requireConnection(connection));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let nextSlot = 0;
async function pace(): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + SPACING_MS;
  if (slot > now) await sleep(slot - now);
}

type Row = { time: number; open: number; high: number; low: number; close: number; volume: number };
async function page(symbol: string, from: number, to: number): Promise<Row[]> {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      await pace();
      const raw = await client.publicGet<unknown>("/openApi/swap/v3/quote/klines", { symbol, interval, startTime: from, endTime: to, limit: PAGE });
      const rows = (Array.isArray(raw) ? raw : ((raw as { data?: unknown[] }).data ?? [])) as Record<string, string | number>[];
      return rows.map((row) => ({ time: Number(row.time), open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume) }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/\b(400|404)\b/.test(message) && !/429|100410|100429/.test(message)) throw error;
      await sleep(Math.min(60_000, 2_000 * 2 ** attempt));
    }
  }
  throw new Error(`${symbol}: candles failed after retries`);
}

mkdirSync(outDir, { recursive: true });
const symbols = REPLAY_SYMBOLS.slice(0, Number(countText));
const expected = Math.round((end - start) / step);
const summary: Record<string, string> = {};
for (const symbol of symbols) {
  const file = join(outDir, `${symbol}.json`);
  if (existsSync(file)) {
    const prior = JSON.parse(readFileSync(file, "utf8")) as { complete: boolean; bars: unknown[] };
    if (prior.complete) {
      summary[symbol] = `cached ${prior.bars.length}`;
      continue;
    }
  }
  const bars = new Map<number, Row>();
  try {
    for (let cursor = start; cursor < end; cursor += PAGE * step) {
      const pageEnd = Math.min(end, cursor + PAGE * step);
      for (const row of await page(symbol, cursor, pageEnd)) {
        if (row.time >= start && row.time < end && row.time % step === 0 && Number.isFinite(row.close)) bars.set(row.time, row);
      }
    }
    const sorted = [...bars.values()].sort((a, b) => a.time - b.time);
    writeFileSync(file, JSON.stringify({ symbol, interval, start, end, complete: sorted.length >= 0.99 * expected, expected, bars: sorted }));
    summary[symbol] = `${sorted.length}/${expected}`;
  } catch (error) {
    summary[symbol] = `failed: ${error instanceof Error ? error.message : String(error)}`;
  }
  console.log(`${symbol} ${summary[symbol]}`);
}
writeFileSync(join(outDir, "_summary.json"), JSON.stringify({ connection, interval, start, end, summary }, null, 1));
console.log("CAPTURE_DONE");
