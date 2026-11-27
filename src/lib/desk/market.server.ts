import { setTimeout as delay } from "node:timers/promises";
import { Bingx, BingxError, requireRows } from "./bingx.server.ts";
import { requireConnection, requireSymbol, type ConnectionId } from "./connections.ts";
import { PREFERRED_SYMBOLS } from "./constants.ts";
import { saneBars } from "./heal.ts";
import { CANDLE_INTERVALS, HOUR_MS, type CandleInterval } from "./intervals.ts";
import type { Bar } from "./process.ts";

export { HOUR_MS } from "./intervals.ts";
export const MAX_QUOTE_AGE_MS = 20_000;
const KLINE_LOOKBACK = 132;
const KLINE_MIN_SPACING = 1_075;

export type Quote = {
  symbol: string;
  last: number;
  changePct: number;
  quoteVolume: number;
  high: number;
  low: number;
  bid: number;
  ask: number;
  exchangeTime: number;
};

type Depth = { bids: [number, number][]; asks: [number, number][] };

export type BookSnap = {
  symbol: string;
  bars: Bar[];
  quote: Quote;
  funding: number | null;
  depth: Depth;
};

export type Snapshot = {
  ts: number;
  books: BookSnap[];
  stale: boolean;
  unavailable: string[];
  historyEnd: number;
};

type CacheRow = { until: number; value: Promise<unknown> };
const reads = new Map<string, CacheRow>();
let nextCandleSlot = 0;

function cached<T>(
  key: string,
  ttl: number | ((value: T) => number),
  load: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = reads.get(key);
  if (hit && hit.until > now) return hit.value as Promise<T>;
  const value = load();
  const row = { value, until: Infinity };
  reads.set(key, row);
  void value.then(
    (item) => {
      row.until = Date.now() + (typeof ttl === "number" ? ttl : ttl(item));
    },
    () => {
      if (reads.get(key) === row) reads.delete(key);
    },
  );
  if (reads.size > 256) {
    for (const [id, item] of reads) if (item.until <= now) reads.delete(id);
  }
  return value;
}

function toQuote(row: Record<string, unknown>): Quote {
  const {
    symbol,
    lastPrice,
    priceChangePercent,
    quoteVolume,
    highPrice,
    lowPrice,
    bidPrice,
    askPrice,
    closeTime,
  } = row;
  return {
    symbol: String(symbol),
    last: Number(lastPrice),
    changePct: Number(priceChangePercent) || 0,
    quoteVolume: Number(quoteVolume) || 0,
    high: Number(highPrice) || 0,
    low: Number(lowPrice) || 0,
    bid: Number(bidPrice) || 0,
    ask: Number(askPrice) || 0,
    exchangeTime: Number(closeTime) || 0,
  };
}

export function quoteIsFresh(q: Quote, now: number) {
  const age = now - q.exchangeTime;
  return Number.isFinite(q.last) && q.last > 0 && age >= -5_000 && age <= MAX_QUOTE_AGE_MS;
}

export async function loadQuote(client: Bingx, symbol: string): Promise<Quote> {
  const normalized = requireSymbol(symbol);
  const row = await client.publicGet<Record<string, unknown>>("/openApi/swap/v2/quote/ticker", {
    symbol: normalized,
  });
  const quote = toQuote(row);
  if (quote.symbol !== normalized || !Number.isFinite(quote.last) || quote.last <= 0)
    throw new Error(`No quote for ${normalized}.`);
  return quote;
}

async function loadTickers(client: Bingx): Promise<Map<string, Quote>> {
  return cached(`${client.connection.origin}:tickers`, 2_000, async () => {
    const data = await client.publicGet<unknown>("/openApi/swap/v2/quote/ticker");
    const quotes = requireRows(data, "tickers")
      .map(toQuote)
      .filter((quote) => Number.isFinite(quote.last) && quote.last > 0);
    return new Map(quotes.map((quote) => [quote.symbol, quote]));
  });
}

export async function loadUniverse(connection: ConnectionId = "bingx-public"): Promise<Quote[]> {
  const quotes = await loadTickers(new Bingx(requireConnection(connection)));
  return PREFERRED_SYMBOLS.flatMap((symbol) => {
    const quote = quotes.get(symbol);
    return quote ? [quote] : [];
  });
}

async function candleRequest(
  client: Bingx,
  symbol: string,
  limit: number,
  end: number,
  interval: CandleInterval,
): Promise<unknown> {
  const start = Date.now();
  const slot = Math.max(start, nextCandleSlot);
  nextCandleSlot = slot + KLINE_MIN_SPACING;
  if (slot > start) await delay(slot - start);
  return client.publicGet("/openApi/swap/v3/quote/klines", {
    symbol,
    interval,
    startTime: end - limit * CANDLE_INTERVALS[interval],
    endTime: end - 1,
    limit,
  });
}

function contiguous(bars: Bar[], end: number, step = HOUR_MS as number) {
  return bars.length > 0 && bars.every((bar, i) => bar.t === end - (bars.length - i) * step);
}

export async function loadKlines(
  client: Bingx,
  symbol: string,
  limit: number,
  end: number,
  interval: CandleInterval = "1h",
): Promise<Bar[]> {
  const normalized = requireSymbol(symbol);
  const step = CANDLE_INTERVALS[interval];
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 1440 ||
    !Number.isSafeInteger(end) ||
    !step ||
    end % step !== 0
  ) {
    throw new Error("Historical candles need an aligned UTC end and a limit of 1 to 1440 bars.");
  }
  const origin = client.connection.origin;
  return cached(
    `${origin}:${normalized}:${interval}:${end}:${limit}`,
    (bars: Bar[]) => (bars.length === limit && contiguous(bars, end, step) ? HOUR_MS : 5_000),
    async () => {
      let raw: unknown;
      try {
        raw = await candleRequest(client, normalized, limit, end, interval);
      } catch (error) {
        if (
          error instanceof BingxError &&
          error.status < 500 &&
          error.status !== 429 &&
          ![100410, 109429, 100429].includes(error.code)
        )
          throw error;
        await delay(5_000);
        raw = await candleRequest(client, normalized, limit, end, interval);
      }
      const bars = requireRows(raw, "candles").map((row) => ({
        t: Number(row.time),
        o: Number(row.open),
        h: Number(row.high),
        l: Number(row.low),
        c: Number(row.close),
        v: Number(row.volume),
        closed: true,
      }));
      return saneBars(bars.sort((a, b) => a.t - b.t)).filter(
        (bar) =>
          Number.isSafeInteger(bar.t) &&
          bar.t % step === 0 &&
          bar.t >= end - limit * step &&
          bar.t < end,
      );
    },
  );
}

export async function loadDepth(client: Bingx, symbol: string): Promise<Depth> {
  const data = await client.publicGet<{ bids?: [string, string][]; asks?: [string, string][] }>(
    "/openApi/swap/v2/quote/depth",
    {
      symbol: requireSymbol(symbol),
      limit: 20,
    },
  );
  const levels = (rows: [string, string][] = []) =>
    rows
      .slice(0, 10)
      .map(([p, q]): [number, number] => [Number(p), Number(q)])
      .filter(([p, q]) => Number.isFinite(p) && Number.isFinite(q) && p > 0 && q > 0);
  return { bids: levels(data.bids), asks: levels(data.asks) };
}

export async function loadFunding(client: Bingx, symbol: string): Promise<number | null> {
  const data = await client.publicGet<
    { lastFundingRate?: string } | { lastFundingRate?: string }[]
  >("/openApi/swap/v2/quote/premiumIndex", {
    symbol: requireSymbol(symbol),
  });
  const rate = Number((Array.isArray(data) ? data[0] : data)?.lastFundingRate);
  return Number.isFinite(rate) ? rate : null;
}

const EMPTY_DEPTH: Depth = { bids: [], asks: [] };
const EMPTY_DETAIL = { depth: EMPTY_DEPTH, funding: null };

async function focusDetails(client: Bingx, focus: string, quote: Quote | undefined) {
  if (!quote) return EMPTY_DETAIL;
  return cached(`${client.connection.origin}:${focus}:detail`, 5_000, async () => {
    const [depth, funding] = await Promise.allSettled([
      loadDepth(client, focus),
      loadFunding(client, focus),
    ]);
    return {
      depth: depth.status === "fulfilled" ? depth.value : EMPTY_DEPTH,
      funding: funding.status === "fulfilled" ? funding.value : null,
    };
  });
}

export async function loadQuoteSnapshot(connection: ConnectionId, focus: string) {
  const client = new Bingx(requireConnection(connection));
  const quotes = await loadTickers(client);
  const detail = await focusDetails(client, focus, quotes.get(focus));
  const ts = client.now();
  const books: BookSnap[] = [];
  const unavailable: string[] = [];
  for (const symbol of PREFERRED_SYMBOLS) {
    const quote = quotes.get(symbol);
    if (!quote || !quoteIsFresh(quote, ts)) unavailable.push(symbol);
    if (quote)
      books.push({ symbol, quote, bars: [], ...(focus === symbol ? detail : EMPTY_DETAIL) });
  }
  return { ts, books, unavailable, stale: unavailable.length === PREFERRED_SYMBOLS.length };
}

export async function loadSnapshot(
  connection: ConnectionId,
  focus: string,
  knownEnd?: number,
): Promise<Snapshot> {
  const client = new Bingx(requireConnection(connection));
  // The brief delay after each hour gives the exchange time to finalize the candle.
  const end = Math.floor((client.now() - 3_000) / HOUR_MS) * HOUR_MS;
  const history = await Promise.allSettled(
    PREFERRED_SYMBOLS.map((symbol) => loadKlines(client, symbol, KLINE_LOOKBACK, end)),
  );
  const quotes = await loadTickers(client);
  const detail = await focusDetails(client, focus, quotes.get(focus));
  const unavailable: string[] = [];
  const books: BookSnap[] = [];
  const ts = client.now();
  for (const [i, symbol] of PREFERRED_SYMBOLS.entries()) {
    const result = history[i];
    const quote = quotes.get(symbol);
    if (
      !quote ||
      result?.status !== "fulfilled" ||
      result.value.length < 48 ||
      !contiguous(result.value, end)
    ) {
      unavailable.push(symbol);
      continue;
    }
    if (!quoteIsFresh(quote, ts)) unavailable.push(symbol);
    books.push({
      symbol,
      quote,
      bars: knownEnd === end ? [] : result.value,
      ...(focus === symbol ? detail : EMPTY_DETAIL),
    });
  }
  return {
    ts,
    books,
    stale: unavailable.length === PREFERRED_SYMBOLS.length,
    unavailable,
    historyEnd: end,
  };
}
