import { PREFERRED_SYMBOLS } from "./constants";
import type { Bar } from "./process";

const BASE = "https://open-api.bingx.com";

type Ticker = {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
  highPrice: string;
  lowPrice: string;
  bidPrice: string;
  askPrice: string;
};

export type Quote = {
  symbol: string;
  last: number;
  changePct: number;
  quoteVolume: number;
  high: number;
  low: number;
  bid: number;
  ask: number;
};

export type BookSnap = {
  symbol: string;
  bars: Bar[];
  quote: Quote;
  funding: number | null;
  depth: { bids: [number, number][]; asks: [number, number][] };
};

let tickerCache: { t: number; rows: Ticker[] } | null = null;

async function bingx<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`BingX ${res.status} ${path}`);
  const body = (await res.json()) as { code?: number; msg?: string; data?: T };
  if (body.code !== 0) throw new Error(body.msg || `BingX error ${body.code}`);
  return body.data as T;
}

async function tickers(): Promise<Ticker[]> {
  if (tickerCache && Date.now() - tickerCache.t < 2500) return tickerCache.rows;
  const rows = await bingx<Ticker[]>("/openApi/swap/v2/quote/ticker");
  tickerCache = { t: Date.now(), rows: Array.isArray(rows) ? rows : [] };
  return tickerCache.rows;
}

function toQuote(t: Ticker): Quote {
  return {
    symbol: t.symbol,
    last: Number(t.lastPrice),
    changePct: Number(t.priceChangePercent),
    quoteVolume: Number(t.quoteVolume),
    high: Number(t.highPrice),
    low: Number(t.lowPrice),
    bid: Number(t.bidPrice),
    ask: Number(t.askPrice),
  };
}

export async function loadUniverse(): Promise<Quote[]> {
  const rows = await tickers();
  const by = new Map(rows.map((r) => [r.symbol, r]));
  const picked = PREFERRED_SYMBOLS.map((s) => by.get(s)).filter((r): r is Ticker => !!r && Number(r.lastPrice) > 0);
  return picked.map(toQuote);
}

const klineCache = new Map<string, { t: number; bars: Bar[] }>();
let lastGood: { ts: number; books: BookSnap[] } | null = null;

export async function loadKlines(symbol: string): Promise<Bar[]> {
  const key = `${symbol}:1h`;
  const hit = klineCache.get(key);
  if (hit && Date.now() - hit.t < 20_000) return hit.bars;
  try {
    const raw = await bingx<{ open: string; close: string; high: string; low: string; volume: string; time: number }[]>(
      `/openApi/swap/v2/quote/klines?symbol=${encodeURIComponent(symbol)}&interval=1h&limit=120`,
    );
    const bars: Bar[] = (raw ?? [])
      .map((k) => ({
        t: Number(k.time),
        o: Number(k.open),
        h: Number(k.high),
        l: Number(k.low),
        c: Number(k.close),
        v: Number(k.volume),
      }))
      .filter((b) => b.c > 0)
      .sort((a, b) => a.t - b.t);
    if (!bars.length) return hit?.bars ?? [];
    klineCache.set(key, { t: Date.now(), bars });
    return bars;
  } catch (err) {
    if (hit?.bars.length) return hit.bars;
    throw err;
  }
}

export async function loadDepth(symbol: string): Promise<{ bids: [number, number][]; asks: [number, number][] }> {
  const data = await bingx<{ bids?: [string, string][]; asks?: [string, string][] }>(
    `/openApi/swap/v2/quote/depth?symbol=${encodeURIComponent(symbol)}&limit=20`,
  );
  const map = (rows?: [string, string][]) =>
    (rows ?? []).slice(0, 10).map(([p, q]) => [Number(p), Number(q)] as [number, number]);
  return { bids: map(data?.bids), asks: map(data?.asks) };
}

export async function loadFunding(symbol: string): Promise<number | null> {
  try {
    const data = await bingx<{ lastFundingRate?: string }>(
      `/openApi/swap/v2/quote/premiumIndex?symbol=${encodeURIComponent(symbol)}`,
    );
    const n = Number(data?.lastFundingRate);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export async function loadSnapshot(
  symbols: string[],
  focus: string,
): Promise<{ ts: number; books: BookSnap[]; stale?: boolean; error?: string; healed?: string[] }> {
  const universe = symbols.length ? symbols : PREFERRED_SYMBOLS;
  try {
    const quotes = await loadUniverse();
    const quoteBy = new Map(quotes.map((q) => [q.symbol, q]));
    const settled = await Promise.all(
      universe.map(async (symbol) => {
        try {
          const bars = await loadKlines(symbol);
          const quote = quoteBy.get(symbol) ?? {
            symbol,
            last: bars.at(-1)?.c ?? 0,
            changePct: 0,
            quoteVolume: 0,
            high: bars.at(-1)?.h ?? 0,
            low: bars.at(-1)?.l ?? 0,
            bid: bars.at(-1)?.c ?? 0,
            ask: bars.at(-1)?.c ?? 0,
          };
          let depth = { bids: [] as [number, number][], asks: [] as [number, number][] };
          let funding: number | null = null;
          if (symbol === focus) {
            const [d, f] = await Promise.all([
              loadDepth(symbol).catch(() => ({ bids: [] as [number, number][], asks: [] as [number, number][] })),
              loadFunding(symbol),
            ]);
            depth = d;
            funding = f;
          }
          if (!bars.length) return null;
          return { symbol, bars, quote, funding, depth } satisfies BookSnap;
        } catch {
          return null;
        }
      }),
    );
    const fresh = settled.filter((b): b is BookSnap => !!b);
    const have = new Set(fresh.map((b) => b.symbol));
    const restored = (lastGood?.books ?? []).filter((b) => universe.includes(b.symbol) && !have.has(b.symbol));
    const books = [...fresh, ...restored];
    if (!books.length) throw new Error("BingX returned no klines");
    const stale = fresh.length === 0;
    const snap = { ts: Date.now(), books };
    lastGood = snap;
    return {
      ...snap,
      stale,
      healed: restored.map((b) => b.symbol),
      error: stale ? "serving the last good tape" : undefined,
    };
  } catch (err) {
    if (lastGood?.books.length) {
      return { ts: lastGood.ts, books: lastGood.books, stale: true, error: err instanceof Error ? err.message : "feed failed" };
    }
    throw err;
  }
}
