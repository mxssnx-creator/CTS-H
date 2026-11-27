import { useEffect } from "react";
import { fetchSnapshot } from "@/lib/desk/market";
import { PREFERRED_SYMBOLS } from "@/lib/desk/constants";
import { useDesk } from "@/lib/desk/store";

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
    let wait = 5_000;
    let timer = 0;
    const active = () => !stop && useDesk.getState().connection === connection;
    const pull = async () => {
      try {
        const before = useDesk.getState().books;
        const finalBars = before.map((book) => book.bars.at(-1)?.t);
        const last = finalBars[0];
        const knownEnd =
          last && before.length === PREFERRED_SYMBOLS.length && finalBars.every((t) => t === last)
            ? last + 3_600_000
            : undefined;
        const snap = await fetchSnapshot({ data: { connection, focus, knownEnd } });
        if (!active()) return;
        const books = snap.books.map((book) => ({
          ...book,
          bars: book.bars.length
            ? book.bars
            : (before.find((prior) => prior.symbol === book.symbol)?.bars ?? []),
        }));
        const note = snap.unavailable.length
          ? `Unavailable: ${snap.unavailable.join(", ")}`
          : undefined;
        ingest(books, snap.ts, { stale: snap.stale, unavailable: snap.unavailable, note });
        wait = snap.stale ? Math.min(wait * 2, 30_000) : 5_000;
      } catch (err) {
        if (active()) {
          degrade(err instanceof Error ? err.message : "Market feed failed");
          wait = Math.min(wait * 2, 30_000);
        }
      } finally {
        if (active()) timer = window.setTimeout(() => void pull(), wait);
      }
    };
    void pull();
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [connection, focus, ingest, degrade, allowFeed]);

  return null;
}
