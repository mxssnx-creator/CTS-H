import { createServerFn } from "@tanstack/react-start";
import { PREFERRED_SYMBOLS } from "./constants.ts";
import { requireConnection } from "./connections.ts";

function validateSnapshot(input: { connection?: string; focus?: string; knownEnd?: number }) {
  const connection = requireConnection(input?.connection ?? "bingx-public").id;
  const focus =
    PREFERRED_SYMBOLS.find((symbol) => symbol === input?.focus) ?? PREFERRED_SYMBOLS[0]!;
  return {
    connection,
    focus,
    knownEnd: Number.isSafeInteger(input?.knownEnd) ? input.knownEnd : undefined,
  };
}

export const fetchSnapshot = createServerFn({ method: "POST" })
  .validator(validateSnapshot)
  .handler(async ({ data }) => {
    const { loadSnapshot } = await import("./market.server.ts");
    return loadSnapshot(data.connection, data.focus, data.knownEnd);
  });

export const fetchQuoteSnapshot = createServerFn({ method: "POST" })
  .validator(validateSnapshot)
  .handler(async ({ data }) => {
    const { loadQuoteSnapshot } = await import("./market.server.ts");
    return loadQuoteSnapshot(data.connection, data.focus);
  });
