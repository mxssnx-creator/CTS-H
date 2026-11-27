export const HOUR_MS = 3_600_000;

export const CANDLE_INTERVALS = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": HOUR_MS,
  "4h": 4 * HOUR_MS,
} as const;

export type CandleInterval = keyof typeof CANDLE_INTERVALS;

export function isCandleInterval(value: string): value is CandleInterval {
  return Object.hasOwn(CANDLE_INTERVALS, value);
}
