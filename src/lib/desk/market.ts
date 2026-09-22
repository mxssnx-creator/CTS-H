import { createServerFn } from "@tanstack/react-start";
import { PREFERRED_SYMBOLS } from "./constants";

export const fetchUniverse = createServerFn({ method: "GET" }).handler(async () => {
  const { loadUniverse } = await import("./market.server");
  return loadUniverse();
});

export const fetchSnapshot = createServerFn({ method: "POST" })
  .validator((input: { symbols?: string[]; focus?: string }) => {
    const symbols = (input?.symbols ?? PREFERRED_SYMBOLS).filter((s) => typeof s === "string").slice(0, 10);
    const focus = typeof input?.focus === "string" ? input.focus : symbols[0] ?? "BTC-USDT";
    return { symbols, focus };
  })
  .handler(async ({ data }) => {
    const { loadSnapshot } = await import("./market.server");
    return loadSnapshot(data.symbols, data.focus);
  });
