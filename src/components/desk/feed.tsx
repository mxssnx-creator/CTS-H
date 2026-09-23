import { useEffect } from "react";
import { fetchSnapshot } from "@/lib/desk/market";
import { PREFERRED_SYMBOLS } from "@/lib/desk/constants";
import { useDesk } from "@/lib/desk/store";

export function DeskFeed() {
  const focus = useDesk((s) => s.focus);
  const ingest = useDesk((s) => s.ingest);
  const degrade = useDesk((s) => s.degrade);
  const allowFeed = useDesk((s) => s.allow.connect_exchange);
  const hydrate = useDesk((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    let stop = false;
    let pulling = false;
    let wait = 5_000;
    let timer = 0;
    const pull = async () => {
      if (stop || pulling) return;
      if (!allowFeed) {
        if (!stop) timer = window.setTimeout(() => void pull(), 5_000);
        return;
      }
      pulling = true;
      try {
        const snap = await fetchSnapshot({ data: { symbols: PREFERRED_SYMBOLS, focus } });
        if (stop) return;
        const restored = snap.healed?.length ? `restored ${snap.healed.join(", ")}` : "";
        ingest(snap.books, snap.ts, {
          stale: Boolean(snap.stale),
          note: snap.error || restored || undefined,
        });
        wait = 5_000;
      } catch (err) {
        if (!stop) {
          degrade(err instanceof Error ? err.message : "Market feed failed");
          wait = Math.min(wait * 2, 30_000);
        }
      } finally {
        pulling = false;
        if (!stop) timer = window.setTimeout(() => void pull(), wait);
      }
    };
    void pull();
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [focus, ingest, degrade, allowFeed]);

  return null;
}