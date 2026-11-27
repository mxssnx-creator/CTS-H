import type { SnapBook } from "./store.ts";

/** Keep retired markets available for position marking until their last position closes. */
export function mergeSnapshots(
  current: SnapBook[],
  incoming: SnapBook[],
  withHistory: boolean,
  resetHistory: boolean,
  heldSymbols: ReadonlySet<string>,
): SnapBook[] {
  const previous = new Map(current.map((book) => [book.symbol, book]));
  const merged: SnapBook[] = incoming.flatMap((book) => {
    const prior = previous.get(book.symbol);
    if (!prior && !withHistory && !heldSymbols.has(book.symbol)) return [];
    const newer = prior && (prior.quote.exchangeTime ?? 0) > (book.quote.exchangeTime ?? 0)
      ? prior : book;
    const bars = book.bars.length ? book.bars : resetHistory ? [] : (prior?.bars ?? []);
    return [{ ...newer, bars,
      candleInterval: book.bars.length ? book.candleInterval : prior?.candleInterval }];
  });
  if (withHistory) {
    const present = new Set(merged.map((book) => book.symbol));
    for (const prior of current)
      if (heldSymbols.has(prior.symbol) && !present.has(prior.symbol))
        merged.push(prior);
  }
  return merged;
}
