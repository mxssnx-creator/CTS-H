import { useEffect } from "react";
import { fetchSnapshot } from "@/lib/desk/market";
import { PREFERRED_SYMBOLS } from "@/lib/desk/constants";
import { useDesk } from "@/lib/desk/store";

export function DeskFeed() {
  const focus = useDesk((s) => s.focus);
  const ingest = useDesk((s) => s.ingest);
  const fail = useDesk((s) => s.fail);
  const hydrate = useDesk((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    let stop = false;
    const pull = async () => {
      try {
        const snap = await fetchSnapshot({ data: { symbols: PREFERRED_SYMBOLS, focus } });
        if (!stop) ingest(snap.books, snap.ts);
      } catch (err) {
        if (!stop) fail(err instanceof Error ? err.message : "Market feed failed");
      }
    };
    void pull();
    const id = window.setInterval(() => void pull(), 5000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [focus, ingest, fail]);

  return null;
}