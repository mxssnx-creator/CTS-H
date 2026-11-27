# Micro strategies

A micro set is one indication on one timeframe, traded in both directions, with a target, a protective stop, a trail, a time stop and an optional partial close. This document fixes the rules, the windows, the selection protocol and the metrics, so that a result can be read without the code.

## Sets

Set = indication × timeframe × direction × target × stop × trail × hold × partial.

- Indications: the 19 in `INDICATIONS`.
- Timeframes: 1m, 5m, 15m, 30m, 1h, 4h. Shorter timeframes are aggregated from one-minute candles, and only whole candles are kept.
- Direction: `both` for the main search, as the brief asks. `long` and `short` are diagnostics for chosen sets.
- Target and stop: 0.2% to 0.8% in steps of 0.1%.
- Trail: `fixed`, or `dyn` with a retracement of 0.3, 0.4, 0.5 or 0.6.
- Hold: two time stops per timeframe, from `MICRO_HOLDS`.
- Partial: 0 or 0.5.

The full grid is 19 × 7 × 7 × 5 × 2 × 2 = 18,620 sets per timeframe, or 111,720 across six timeframes.

## Price rules

- A signal is read on closed bar i. The position opens at the open of bar i+1. Only one position is open per set per market.
- The target sits `tp% × entry + round-trip cost` from entry, on the profit side. A winning target therefore nets `+tp%` after cost.
- The stop sits `sl% × entry + round-trip cost` from entry, on the loss side. A stopped trade nets `−(sl% + 2 × cost)`, because the stop distance includes the cost and the round trip is charged again on exit. This is the literal reading of "additionally to costs" for both sides. A reading that makes the stop net `−sl%` would change the stop distance to `sl% − cost`, and would need a separate run.
- The round-trip cost is `POSITION_RT_COST_PCT` (0.12%), charged on each closed leg at its average price, as `positionRtCost` does everywhere else in the desk.
- Within a bar the stop is checked before the target, because the order of the high and low inside a bar is unknown. A tie is taken as a stop.
- A gap through the stop fills at the open, which is worse than the stop.
- Fixed trail, no partial: the target closes the whole position.
- Fixed trail, partial p: p closes at the target. The rest moves to break-even and runs to the stop, the time stop or the window end. It has no second target.
- Dynamic trail: the first touch of the target activates the trail. With a partial, p closes at the target and the rest trails. The stop follows the best price reached, at `r × (peak − entry)` behind the peak, and only tightens. The stop checked on a bar is the one set by earlier bars.
- Time stop: the position closes at the close of the bar on which the hold is reached.
- Window end: any open position closes at the close of the window's last bar. Each window stands alone and starts flat.

## One implementation for batch and live

`MicroState` in `src/lib/desk/micro.ts` is the only implementation of these rules. `simulateMicro` is a batch wrapper over it. The forward runner `scripts/cts-h-micro-live.ts` feeds it one closed candle at a time. The tests check that:

- the exit arithmetic matches the rules, by hand
- a gap, a tie, a dynamic trail, a partial, a time stop and a window end each behave as described
- a blocked entry is a shadow: not booked, but its close is evidence
- the indicator signals of each of the 19 indications on a prefix equal the signals on the full history, so no signal reads a later bar
- the streamed fills equal the batch fills on the same random bars

The forward runner also re-runs the batch simulator on the candles it stored, and compares every fill.

## Evidence and the lane gate

- A gate, when used, is the lane verdict on the cell's own closes. Its evidence is every closed leg of that cell, booked or shadow. A blocked cell keeps being tracked, so it can earn its way back in.
- Booked P&L counts only booked legs.
- Gate variants: `validated` is the shipped rule (no veto, and at least one confirmation). `noveto` lets any entry through unless a lane vetoes it. `lastnet` allows an entry when the cell's last 20 closes are net positive.
- The lane policy is the shipped default. It is not tuned on any window.

## Windows and the selection protocol

- Capture: one-minute candles for the 50 USDT perpetuals in `REPLAY_SYMBOLS`, from BingX mainnet, 800 hours, ending at the capture time.
- Windows are anchored to the capture end on a four-hour grid, so every timeframe shares the same boundaries:
  - R1 = [anchor − 720 h, anchor − 480 h)
  - R2 = [anchor − 480 h, anchor − 240 h)
  - H = [anchor − 240 h, anchor), the holdout
- Each window has 240 hours. R1 has 80 hours of warm-up before it, which is enough for the indicator series.
- Research rule, applied to R1 and R2 only: at least 100 positions in each research window, positive net in each, ranked by the lower of the two PFs, with ties broken by the lower of the two drawdowns.
- H is reported after the choice. It is never used to choose.

## Metrics

- PF: gross profit over gross loss, over booked closed legs, after costs. 1.0 is neutral: zero net gives 1.00.
- Drawdown: the largest peak-to-trough fall in the cumulative hourly booked net of the whole portfolio. This is a closed-trade drawdown. Open-position mark-to-market is not included.
- Hourly success: the share of active hours, meaning hours with at least one booked leg closed, whose booked net is positive.
- Win rate: the share of booked positions, including all their legs, whose total net is positive.

## Results

Filled in from the 50-market run, with the report under `reports/`.

## Limitations

- Fills are at the bar's open, the target or the stop price, or the bar's close. There is no order book, no slippage beyond the model, and no funding.
- The portfolio is a sum of independent markets at a fixed notional per position. There are no capital, concurrency or correlation limits.
- The live forward test runs on five-minute candles. One-minute candles across 100 symbols cannot keep up with the 1.25-second request spacing: a cycle would take about two minutes.
- The desk's browser loop does not run micro sets yet. The forward runner is headless.
