import { createServerFn } from "@tanstack/react-start";
import { PREFERRED_SYMBOLS, REPLAY_SYMBOLS } from "./constants.ts";
import { requireConnection } from "./connections.ts";
import { isCandleInterval } from "./intervals.ts";

function validateSnapshot(input: { connection?: string; focus?: string; knownEnd?: number; interval?: string; marketCount?: number }) {
  const connection = requireConnection(input?.connection ?? "bingx-public").id;
  const focus = REPLAY_SYMBOLS.find((symbol) => symbol === input?.focus) ?? PREFERRED_SYMBOLS[0]!;
  const interval = input?.interval && isCandleInterval(input.interval) ? input.interval : "1h" as const;
  const rawCount = Number(input?.marketCount);
  const marketCount = Number.isFinite(rawCount)
    ? Math.max(1, Math.min(interval === "1m" ? 32 : 60, Math.round(rawCount)))
    : 16;
  return {
    connection,
    focus,
    knownEnd: Number.isSafeInteger(input?.knownEnd) ? input.knownEnd : undefined,
    interval,
    marketCount,
  };
}

export const fetchSnapshot = createServerFn({ method: "POST" })
  .validator(validateSnapshot)
  .handler(async ({ data }) => {
    const { loadSnapshot } = await import("./market.server.ts");
    return loadSnapshot(data.connection, data.focus, data.knownEnd, data.interval, data.marketCount);
  });

export const fetchQuoteSnapshot = createServerFn({ method: "POST" })
  .validator(validateSnapshot)
  .handler(async ({ data }) => {
    const { loadQuoteSnapshot } = await import("./market.server.ts");
    return loadQuoteSnapshot(data.connection, data.focus);
  });
