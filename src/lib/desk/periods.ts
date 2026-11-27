import { HOUR_MS } from "./intervals.ts";
import { profitFactor } from "./math.ts";
import type { HourPoint } from "./process.ts";

export type PeriodRow = {
  start: number;
  end: number;
  hours: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  realized: number;
  mtm: number;
  net: number;
  cumulative: number;
  grossProfit: number;
  grossLoss: number;
  pf: number;
  positiveHours: number;
  drawdown: number;
  openLegsEnd: number;
};

// Buckets hourly rows into fixed-length periods measured from `origin` (a UTC epoch
// millisecond, normally the start of the replay window). Cumulative net and the open-leg
// count carry across periods; drawdown is measured from the start of each period.
export function periodRows(
  rows: readonly HourPoint[],
  periodHours: number,
  origin = 0,
): PeriodRow[] {
  if (!Number.isInteger(periodHours) || periodHours < 1)
    throw new Error("Period hours must be a positive whole number.");
  if (!Number.isSafeInteger(origin)) throw new Error("Period origin must be a UTC millisecond timestamp.");
  const span = periodHours * HOUR_MS;
  const out: PeriodRow[] = [];
  let bucket: { start: number; rows: HourPoint[] } | null = null;
  let cumulative = 0;
  const flush = () => {
    if (!bucket) return;
    let trades = 0;
    let wins = 0;
    let losses = 0;
    let realized = 0;
    let mtm = 0;
    let net = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let positiveHours = 0;
    let equity = 0;
    let peak = 0;
    let drawdown = 0;
    for (const row of bucket.rows) {
      trades += row.trades;
      wins += row.wins;
      losses += row.losses;
      realized += row.realized;
      mtm += row.mtm;
      net += row.net;
      grossProfit += row.grossProfit;
      grossLoss += row.grossLoss;
      if (row.net > 1e-9) positiveHours += 1;
      equity += row.net;
      peak = Math.max(peak, equity);
      drawdown = Math.max(drawdown, peak - equity);
    }
    cumulative += net;
    const last = bucket.rows.at(-1)!;
    out.push({
      start: bucket.start,
      end: bucket.start + span,
      hours: bucket.rows.length,
      trades,
      wins,
      losses,
      winRate: trades ? wins / trades : null,
      realized,
      mtm,
      net,
      cumulative,
      grossProfit,
      grossLoss,
      pf: profitFactor(grossProfit, grossLoss),
      positiveHours,
      drawdown,
      openLegsEnd: last.openLegs,
    });
    bucket = null;
  };
  for (const row of rows) {
    const start = origin + Math.floor((row.t - origin) / span) * span;
    if (!bucket || bucket.start !== start) {
      flush();
      bucket = { start, rows: [] };
    }
    bucket.rows.push(row);
  }
  flush();
  return out;
}
