import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Bingx } from "../src/lib/desk/bingx.server.ts";
import { requireConnection } from "../src/lib/desk/connections.ts";
import { REPLAY_SYMBOLS } from "../src/lib/desk/constants.ts";

// Resumable 1-minute capture, one file per market. Retries with backoff, so BingX rate limits cannot lose progress.
// Usage: cts-h-capture-micro.ts <connection> <outDir> <hours> <endIsoOrNow> <symbolCount>
const [connection = "bingx-x01", outDir = "micro-1m", hoursText = "800", endText = "now", countText = "50"] = process.argv.slice(2);
const hours = Number(hoursText);
const count = Number(countText);
const STEP = 60_000;
const PAGE = 1000;
const client = new Bingx(requireConnection(connection));

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function page(symbol: string, start: number, end: number): Promise<{ time: number; open: number; high: number; low: number; close: number; volume: number }[]> {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const raw = await client.publicGet<unknown>("/openApi/swap/v3/quote/klines", {
        symbol,
        interval: "1m",
        startTime: start,
        endTime: end,
        limit: PAGE,
      });
      const rows = Array.isArray(raw) ? raw : (raw as { data?: unknown }).data ?? [];
      return (rows as Record<string, string | number>[]).map((row) => ({
        time: Number(row.time),
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: Number(row.volume),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Non-retryable client errors (bad symbol, bad parameters) stop at once.
      if (/\b(400|404)\b/.test(message) && !/429|100410|100429/.test(message)) throw error;
      await sleep(Math.min(60_000, 2_000 * 2 ** attempt));
    }
  }
  throw new Error(`${symbol}: klines failed after retries`);
}

async function main() {
  const serverTime = Number((await client.publicGet<{ serverTime: number }>("/openApi/swap/v2/server/time")).serverTime);
  const end = endText === "now" ? Math.floor((serverTime - 5_000) / STEP) * STEP : Date.parse(endText);
  if (!Number.isSafeInteger(end) || end % STEP !== 0) throw new Error("The end must be an aligned minute.");
  mkdirSync(outDir, { recursive: true });
  const start = end - hours * 3_600_000;
  const symbols = REPLAY_SYMBOLS.slice(0, count);
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
    const bars: { time: number; open: number; high: number; low: number; close: number; volume: number }[] = [];
    try {
      for (let cursor = start; cursor < end; cursor += PAGE * STEP) {
        const pageEnd = Math.min(end, cursor + PAGE * STEP);
        const rows = await page(symbol, cursor, pageEnd);
        bars.push(...rows.filter((row) => row.time >= cursor && row.time < pageEnd));
        await sleep(1_250);
      }
      const unique = [...new Map(bars.map((bar) => [bar.time, bar])).values()].sort((a, b) => a.time - b.time);
      const expected = Math.round((end - start) / STEP);
      writeFileSync(file, JSON.stringify({ symbol, interval: "1m", start, end, complete: unique.length === expected, expected, bars: unique }));
      summary[symbol] = `${unique.length}/${expected}`;
    } catch (error) {
      summary[symbol] = `failed: ${error instanceof Error ? error.message : String(error)}`;
    }
    console.log(`${symbol} ${summary[symbol]}`);
  }
  writeFileSync(join(outDir, "_summary.json"), JSON.stringify({ connection, end, hours, summary }, null, 1));
  console.log("CAPTURE_DONE");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "capture failed");
  process.exitCode = 1;
});
