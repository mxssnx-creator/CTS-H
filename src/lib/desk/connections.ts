const LIVE = "https://open-api.bingx.com";
const VST = "https://open-api-vst.bingx.com";

export const CONNECTIONS = [
  { id: "bingx-public", label: "Public market data", network: "mainnet", origin: LIVE, slot: null },
  { id: "bingx-x01", label: "BingX mainnet", network: "mainnet", origin: LIVE, slot: "X01" },
  { id: "bingx-x02", label: "BingX VST demo", network: "vst", origin: VST, slot: "X02" },
] as const;

export type Connection = (typeof CONNECTIONS)[number];
export type ConnectionId = Connection["id"];
export type PrivateConnection = Exclude<Connection, { slot: null }>;

export function connectionOf(id: string) {
  const canonical =
    id === "bingx-vst-02" || id === "x02" ? "bingx-x02" : id === "x01" ? "bingx-x01" : id;
  return CONNECTIONS.find((connection) => connection.id === canonical) ?? null;
}

export function requireConnection(id: string): Connection {
  const connection = connectionOf(id);
  if (!connection) throw new Error("Choose bingx-public, bingx-x01 or bingx-x02.");
  return connection;
}

export function requireSymbol(input: string): string {
  const symbol = input.trim().toUpperCase();
  if (!/^[A-Z0-9]{1,24}-USDT$/.test(symbol))
    throw new Error("Use a BingX USDT perpetual symbol such as ETH-USDT.");
  return symbol;
}
