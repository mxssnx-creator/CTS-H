import { useEffect } from "react";
import { fetchQuoteSnapshot, fetchSnapshot } from "@/lib/desk/market";
import { REPLAY_SYMBOLS } from "@/lib/desk/constants";
import { CANDLE_INTERVALS } from "@/lib/desk/intervals";
import { mergeSnapshots } from "@/lib/desk/snapshot";
import { useDesk, type SnapBook } from "@/lib/desk/store";

export function DeskFeed() {
  const focus = useDesk((s) => s.focus);
  const connection = useDesk((s) => s.connection);
  const interval = useDesk((s) => s.strategies.interval);
  const marketCount = useDesk((s) => s.strategies.marketCount);
  const step = CANDLE_INTERVALS[interval];
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
    const active = () => !stop && useDesk.getState().connection === connection &&
      useDesk.getState().strategies.interval === interval &&
      useDesk.getState().strategies.marketCount === marketCount;
    const apply = (
      snap: { ts: number; books: SnapBook[]; unavailable: string[]; stale: boolean },
      withHistory: boolean,
    ) => {
      if (!active()) return;
      const state = useDesk.getState();
      const resetHistory = withHistory && state.bookInterval !== interval;
      const held = new Set(state.positions.map((position) => position.symbol));
      const watched = new Set([...REPLAY_SYMBOLS.slice(0, marketCount), ...held]);
      const incoming = withHistory
        ? snap.books.map((book) => ({ ...book, candleInterval: interval }))
        : snap.books;
      const books = mergeSnapshots(state.books, incoming, withHistory, resetHistory, held);
      const unavailable = snap.unavailable.filter((symbol) => watched.has(symbol));
      const note = unavailable.length
        ? `Unavailable: ${unavailable.join(", ")}`
        : undefined;
      ingest(books, Math.max(state.lastTs, snap.ts), {
        stale: snap.stale || (!withHistory && unavailable.length === watched.size),
        unavailable,
        note,
        resetHistory,
      });
    };
    const pullHistory = async () => {
      let untilNext = 30_000;
      try {
        const symbols = new Set(REPLAY_SYMBOLS.slice(0, marketCount));
        const before = useDesk.getState().books.filter((book) => symbols.has(book.symbol) &&
          (!book.candleInterval || book.candleInterval === interval));
        const finalBars = before.map((book) => book.bars.at(-1)?.t);
        const last = finalBars[0];
        const knownEnd =
          last && useDesk.getState().bookInterval === interval &&
          before.length === marketCount && finalBars.every((t) => t === last)
            ? last + step
            : undefined;
        const snap = await fetchSnapshot({ data: { connection, focus, knownEnd, interval, marketCount } });
        apply(snap, true);
        if (snap.books.length === marketCount)
          untilNext = Math.max(2_000, snap.historyEnd + step + 3_000 - snap.ts);
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
  }, [connection, focus, interval, marketCount, step, ingest, degrade, allowFeed]);

  return null;
}
