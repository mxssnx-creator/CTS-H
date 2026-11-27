# Micro strategies

A micro set is one indication on one timeframe, traded in both directions, with a target, a protective stop, a trail, a time stop and an optional partial close. This document fixes the rules, the windows, the selection protocol and the metrics, so that a result can be read without the code.

## Sets

Set = indication × timeframe × direction × target × stop × trail × hold × partial.

- Indications: the 25 in `INDICATIONS`: the original 19, plus PSAR flip, Keltner band breakout, engulfing, pin bar, internal bar strength reversion and money flow reversal.
- Timeframes: 1m, 5m, 15m, 30m, 1h, 4h. Shorter timeframes are aggregated from one-minute candles, and only whole candles are kept.
- Direction: `both` for the main search, as the brief asks. `long` and `short` are diagnostics for chosen sets.
- Target and stop: 0.2% to 0.8% in steps of 0.1%.
- Trail: `fixed`, or `dyn` with a retracement of 0.3, 0.4, 0.5 or 0.6.
- Hold: two time stops per timeframe, from `MICRO_HOLDS`.
- Partial: 0 or 0.5.
- Bracket: `percent` for the main search (target and stop are percent of the entry). `atr` is the variant in which target and stop are multiples of the Wilder ATR14 at the signal bar. Both add the round-trip cost on their own side.

The grid is 25 × 7 × 7 × 5 × 2 × 2 = 24,500 sets per timeframe and bracket: 147,000 per bracket across six timeframes, and 294,000 with both brackets.

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
- the indicator signals of each of the 25 indications on a prefix equal the signals on the full history, so no signal reads a later bar
- the streamed fills equal the batch fills on the same random bars

`src/lib/desk/micro-reference.test.ts` checks every set of both brackets, in all six timeframes, against a separate reference model written from this document and sharing no code with `micro.ts` except the cost constant. For each set on the same random bars it compares every fill (reason, bar, price, partial share, cost, P&L), the legs of each closed position summing to one whole position, the summary (positions, net, PF, win rate, drawdown, equity, hourly success), and the streamed run against the batch run. A separate scenario test for each partial path is in `micro.test.ts`.

The forward runner also re-runs the batch simulator on the candles it stored, and compares every fill.

## Evidence and the lane gate

- A gate, when used, is the lane verdict on the cell's own closes. Its evidence is every closed leg of that cell, booked or shadow. A blocked cell keeps being tracked, so it can earn its way back in.
- Booked P&L counts only booked legs.
- Gate variants: `validated` is the shipped rule (no veto, and at least one confirmation). `noveto` lets any entry through unless a lane vetoes it. `lastnet` allows an entry when the cell's last 20 closes are net positive.
- The lane policy is the shipped default. It is not tuned on any window.

## Windows and the walk-forward protocol

- Capture: one-minute candles for the 50 USDT perpetuals in `REPLAY_SYMBOLS`, from BingX mainnet. The history is captured in segments (the newest 800 hours, then the 640 hours before it) and merged by symbol.
- Windows are anchored to the latest capture end on a four-hour grid, so every timeframe shares the same boundaries. Each window has 240 hours and keeps 48 hours of history before it.
  - H is the holdout: the last 240 hours before the anchor.
  - R1, R2, ... are the research windows before H, oldest first. Their number follows the history the data allows: three windows from 800 hours, five from 1440 hours.
- Walk-forward rule, fixed before any walk result is read:
  - Test windows are every window after the first two, so each has at least two windows of training.
  - A set is eligible for a test window when every training window has at least 100 booked positions, positive booked net, and PF of at least 1.00.
  - The score is the lowest PF across the training windows. Ties go to the lower largest drawdown.
  - The selected set runs on the test window, and that result is reported without change.
- Flat fallback: when no set is eligible, the window is traded flat. Flat windows carry no P&L and a neutral PF of 1.00.
- The out-of-sample PF pools the gross profit and gross loss of the test windows. The in-sample PF of each selected set is shown next to its out-of-sample PF, so the drop is visible.

## Metrics

- PF: gross profit over gross loss, over booked closed legs, after costs. 1.0 is neutral: zero net gives 1.00.
- Drawdown: the largest peak-to-trough fall of bar-close equity, where equity is the realized booked P&L plus the mark of the booked open position at each bar close. Open losses count before they close, and shadows never count.
- Hourly success: the share of active buckets whose equity rose. A bucket is one hour, or one bar when the bar is longer than an hour. Active means the equity changed inside the bucket.
- Win rate: the share of booked positions, including all their legs, whose total net is positive.

## Results

Filled in from the 50-market run, with the report under `reports/`.

## Limitations

- Fills are at the bar's open, the target or the stop price, or the bar's close. Drawdown is measured on bar closes, so an excursion inside a bar is not seen. There is no order book, no slippage beyond the model, and no funding.
- The portfolio is a sum of independent markets at a fixed notional per position. There are no capital, concurrency or correlation limits.
- The live forward test runs on five-minute candles. One-minute candles across 100 symbols cannot keep up with the 1.25-second request spacing: a cycle would take about two minutes.
- The desk's browser loop does not run micro sets yet. The forward runner is headless.
