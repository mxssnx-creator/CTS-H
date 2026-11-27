import type { Bar } from "./process.ts";

export type HealBook = {
  symbol: string;
  bars: Bar[];
  quote: { last: number };
};

export type Health = {
  cycles: number;
  ok: number;
  healed: number;
  lastNote: string;
};

export const EMPTY_HEALTH: Health = { cycles: 0, ok: 0, healed: 0, lastNote: "" };

export function saneBars(bars: Bar[]): Bar[] {
  const out: Bar[] = [];
  for (const b of bars) {
    if (!Number.isFinite(b.t) || !(b.o > 0) || !(b.h > 0) || !(b.l > 0) || !(b.c > 0) || b.h < b.l) continue;
    const prev = out.at(-1);
    if (prev && b.t < prev.t) continue;
    if (prev && b.t === prev.t) out[out.length - 1] = b;
    else out.push(b);
  }
  return out;
}

export function healBooks<T extends HealBook>(prev: T[], next: T[]): { books: T[]; notes: string[] } {
  const notes: string[] = [];
  const prevBy = new Map(prev.map((b) => [b.symbol, b]));
  const seen = new Set<string>();
  const books: T[] = [];
  for (const row of next) {
    seen.add(row.symbol);
    const old = prevBy.get(row.symbol);
    const bars = old?.bars === row.bars ? row.bars : saneBars(row.bars);
    const close = bars.at(-1)?.c ?? 0;
    const last = row.quote.last > 0 ? row.quote.last : close;
    if (!bars.length || !(last > 0)) {
      if (old && saneBars(old.bars).length) {
        books.push(old);
        notes.push(`kept ${row.symbol}`);
      } else notes.push(`dropped ${row.symbol}`);
      continue;
    }
    const oldLast = old?.bars.at(-1)?.t ?? 0;
    const newLast = bars.at(-1)!.t;
    if (old && old.bars.length > bars.length + 5 && newLast < oldLast) {
      books.push(old);
      notes.push(`rewound ${row.symbol}`);
      continue;
    }
    books.push({ ...row, bars, quote: { ...row.quote, last } });
  }
  for (const old of prev) {
    if (seen.has(old.symbol) || !saneBars(old.bars).length) continue;
    books.push(old);
    notes.push(`restored ${old.symbol}`);
  }
  return { books, notes };
}

export function noteHealth(health: Health, notes: string[]): Health {
  const healed = notes.length > 0;
  return {
    cycles: health.cycles + 1,
    ok: health.ok + (healed ? 0 : 1),
    healed: health.healed + (healed ? 1 : 0),
    lastNote: healed ? notes.join(", ") : "cycle ok",
  };
}
