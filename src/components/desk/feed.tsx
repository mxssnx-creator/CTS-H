import { useEffect } from "react";
import { fetchQuoteSnapshot, fetchSnapshot } from "@/lib/desk/market";
import { PREFERRED_SYMBOLS } from "@/lib/desk/constants";
import { HOUR_MS } from "@/lib/desk/intervals";
import { useDesk, type SnapBook } from "@/lib/desk/store";

function mergeSnapshots(current: SnapBook[], incoming: SnapBook[], withHistory: boolean) {
  const previous = new Map(current.map((book) => [book.symbol, book]));
  return incoming.flatMap((book) => {
    const prior = previous.get(book.symbol);
    if (!prior && !withHistory) return [];
    const newer =
      prior && (prior.quote.exchangeTime ?? 0) > (book.quote.exchangeTime ?? 0) ? prior : book;
    return [{ ...newer, bars: book.bars.length ? book.bars : (prior?.bars ?? []) }];
  });
}

export function DeskFeed() {
  const focus = useDesk((s) => s.focus);
  const connection = useDesk((s) => s.connection);
  const ingest = useDesk((s) => s.ingest);
  const degrade = useDesk((s) => s.degrade);
  const allowFeed = useDesk((s) => s.allow.connect_exchange);
  const hydrate = useDesk((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!allowFeed) return;
    let stop = false;
    let quoteWait = 2_000;
    let quotesTimer = 0;
    let historyTimer = 0;
    const active = () => !stop && useDesk.getState().connection === connection;
    const apply = (
      snap: { ts: number; books: SnapBook[]; unavailable: string[]; stale: boolean },
      withHistory: boolean,
    ) => {
      if (!active()) return;
      const state = useDesk.getState();
      const books = mergeSnapshots(state.books, snap.books, withHistory);
      const note = snap.unavailable.length
        ? `Unavailable: ${snap.unavailable.join(", ")}`
        : undefined;
      ingest(books, Math.max(state.lastTs, snap.ts), {
        stale: snap.stale,
        unavailable: snap.unavailable,
        note,
      });
    };
    const pullHistory = async () => {
      let untilNext = 30_000;
      try {
        const before = useDesk.getState().books;
        const finalBars = before.map((book) => book.bars.at(-1)?.t);
        const last = finalBars[0];
        const knownEnd =
          last && before.length === PREFERRED_SYMBOLS.length && finalBars.every((t) => t === last)
            ? last + HOUR_MS
            : undefined;
        const snap = await fetchSnapshot({ data: { connection, focus, knownEnd } });
        apply(snap, true);
        if (snap.books.length === PREFERRED_SYMBOLS.length)
          untilNext = Math.max(2_000, snap.historyEnd + HOUR_MS + 3_000 - snap.ts);
      } catch (err) {
        if (active() && !useDesk.getState().books.length)
          degrade(err instanceof Error ? err.message : "BingX history failed");
      } finally {
        if (active()) historyTimer = window.setTimeout(() => void pullHistory(), untilNext);
      }
    };
    const pullQuotes = async () => {
      try {
        if (useDesk.getState().books.length) {
          const snap = await fetchQuoteSnapshot({ data: { connection, focus } });
          apply(snap, false);
          quoteWait = snap.stale ? Math.min(quoteWait * 2, 15_000) : 2_000;
        }
      } catch (err) {
        if (active()) {
          degrade(err instanceof Error ? err.message : "BingX quotes failed");
          quoteWait = Math.min(quoteWait * 2, 15_000);
        }
      } finally {
        if (active()) quotesTimer = window.setTimeout(() => void pullQuotes(), quoteWait);
      }
    };
    void pullHistory();
    void pullQuotes();
    return () => {
      stop = true;
      window.clearTimeout(quotesTimer);
      window.clearTimeout(historyTimer);
    };
  }, [connection, focus, ingest, degrade, allowFeed]);

  return null;
}
