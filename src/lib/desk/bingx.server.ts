import { createHmac } from "node:crypto";
import type { Connection } from "./connections.ts";

type Params = Record<string, string | number>;
export type Credentials = { key: string; secret: string };
export type RawOrder = Record<string, unknown>;
export const RECEIVE_WINDOW_MS = 5_000;

const cooling = new Map<string, number>();
const requestTimeout = 8_000;

export class BingxError extends Error {
  readonly code: number;
  readonly status: number;
  constructor(path: string, code: number, status: number) {
    super(`BingX ${path} failed (${code || status}).`);
    this.code = code;
    this.status = status;
  }
}

export function signedQuery(params: Params, secret: string): string {
  const entries = Object.entries(params).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const plain = entries.map(([key, value]) => `${key}=${value}`).join("&");
  const signature = createHmac("sha256", secret).update(plain).digest("hex");
  const wire = entries.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&");
  return `${wire}&signature=${signature}`;
}

// A numeric JSON token cannot survive JSON.parse when BingX sends a 64-bit ID.
function preserveIds(body: string): unknown {
  return JSON.parse(
    body.replace(/("(?:orderId|orderID|positionId|positionID)"\s*:\s*)(\d+)(?=\s*[,}])/g, '$1"$2"'),
  );
}

export class Bingx {
  readonly connection: Connection;
  readonly now: () => number;
  private readonly credentials?: Credentials;
  private readonly transport: typeof fetch;

  constructor(
    connection: Connection,
    credentials?: Credentials,
    transport = fetch,
    now = Date.now,
  ) {
    this.connection = connection;
    this.credentials = credentials;
    this.transport = transport;
    this.now = now;
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    params: Params,
    signed: boolean,
  ): Promise<T> {
    const headers = new Headers({ accept: "application/json", "X-SOURCE-KEY": "BX-AI-SKILL" });
    let query: string;
    if (signed) {
      if (!this.connection.slot || !this.credentials)
        throw new Error("Set credentials for this BingX connection.");
      headers.set("X-BX-APIKEY", this.credentials.key);
      query = signedQuery(
        { ...params, recvWindow: RECEIVE_WINDOW_MS, timestamp: this.now() },
        this.credentials.secret,
      );
    } else {
      const resume = cooling.get(this.connection.origin) ?? 0;
      if (this.now() < resume) throw new BingxError(path, 429, 429);
      query = new URLSearchParams(
        Object.entries(params).map(([k, v]) => [k, String(v)]),
      ).toString();
    }
    let response: Response;
    try {
      response = await this.transport(
        `${this.connection.origin}${path}${query ? `?${query}` : ""}`,
        {
          method,
          headers,
          signal: AbortSignal.timeout(requestTimeout),
          redirect: "error",
          cache: "no-store",
        },
      );
    } catch {
      throw new Error(`BingX ${path} did not respond.`);
    }
    let result: { code?: number; data?: T };
    try {
      const body = await response.text();
      result = (signed ? preserveIds(body) : JSON.parse(body)) as typeof result;
    } catch {
      if (!signed && response.status === 429)
        cooling.set(this.connection.origin, this.now() + 5_000);
      throw new BingxError(path, 0, response.status);
    }
    if (!response.ok || result?.code !== 0 || result.data === undefined) {
      const code = Number(result?.code) || 0;
      if (!signed && (response.status === 429 || [100410, 109429, 100429].includes(code))) {
        const retrySeconds = Number(response.headers.get("retry-after")) || 5;
        cooling.set(
          this.connection.origin,
          this.now() + Math.min(60, Math.max(1, retrySeconds)) * 1_000,
        );
      }
      throw new BingxError(path, code, response.status);
    }
    return result.data;
  }

  publicGet<T>(path: string, params: Params = {}) {
    return this.request<T>("GET", path, params, false);
  }

  privateGet<T>(path: string, params: Params = {}) {
    return this.request<T>("GET", path, params, true);
  }

  place(params: Params, test = false) {
    return this.request<RawOrder>(
      "POST",
      `/openApi/swap/v2/trade/order${test ? "/test" : ""}`,
      params,
      true,
    );
  }

  async order(symbol: string, clientOrderId: string): Promise<RawOrder> {
    const data = await this.privateGet<RawOrder>("/openApi/swap/v2/trade/order", {
      symbol,
      clientOrderId,
    });
    return data.order && typeof data.order === "object" ? (data.order as RawOrder) : data;
  }

  async openOrders(symbol: string): Promise<RawOrder[]> {
    const data = await this.privateGet<RawOrder[] | { orders: RawOrder[] }>(
      "/openApi/swap/v2/trade/openOrders",
      { symbol },
    );
    return requireRows(Array.isArray(data) ? data : data.orders, "open orders");
  }

  async positions(symbol: string): Promise<RawOrder[]> {
    const data = await this.privateGet<RawOrder[]>("/openApi/swap/v2/user/positions", { symbol });
    return requireRows(data, "positions");
  }
}

export function requireRows(value: unknown, label: string): RawOrder[] {
  if (
    !Array.isArray(value) ||
    !value.every((item) => item && typeof item === "object" && !Array.isArray(item))
  ) {
    throw new Error(`BingX returned invalid ${label}.`);
  }
  return value;
}
