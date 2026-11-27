# Micro strategies across regimes (pre-registered)

Why this study exists. Every window used so far is a bear market: the median of 50 markets fell 11% to 15% over the research windows and 5% over the holdout, so the earlier "winners" were largely short-side exposure to a falling market. Validation needs many windows across bull, bear and chop phases. This study uses native candles, about 40 ten-day windows, and an expanding walk-forward with one out-of-sample test per window.

Rules, fixed before the run.

- Data: native BingX mainnet candles for the first 50 markets of `REPLAY_SYMBOLS`.
  - 4h and 1h: 15 July 2025 to 27 November 2026.
  - 30m: 1 January 2026 to 27 November 2026.
  Markets with less than 99% of candles present in a window are excluded from it.
- Windows: 240 hours each, anchored on the four-hour grid of the latest capture. Each window has 48 hours of history before it, so indicator series have converged. Windows run oldest to newest.
- Regime label, per window: the median move across the markets, from the first open to the last close, in percent. BULL at +5% or more, BEAR at −5% or less, CHOP otherwise.
- Grid: the full micro grid for the interval, 18,620 sets, both directions.
- Walk-forward: a test window k is any window from the 13th onward (k ≥ 12, zero-based), so every test has at least 12 windows of training. The training history is windows 0 to k−1, expanding.
  - Eligible: pooled training positions of at least 300, pooled training net above zero, pooled training PF of at least 1.00, and positive net in at least 60% of the training windows.
  - Score: pooled training PF. The highest-scoring eligible set is selected. If none is eligible, the window is flat.
  - The selected set is run on window k and that result is reported without change.
- Reported: out-of-sample pooled PF and net, windows traded and flat, results by regime, and a population baseline (all sets pooled per window). Also the long and short PF of the whole grid by regime, to show direction dependence.
- Success, judged pre-registration: a configuration is profitable across regimes if its out-of-sample pooled PF is above 1.00 in each of the BULL, BEAR and CHOP regimes, with at least five traded windows in each. Anything else is reported as not profitable across regimes.
- Limits: windows overlap no test with its own training history. Fills are bar-based, costs are the model's round trip, and there is no funding or slippage beyond the model.

## Experiment A result: percent brackets, 4 hours (recorded, not changed)

- 48 markets, 49 windows: 9 BULL, 19 BEAR, 21 CHOP. Test windows from window 12: 37.
- Eligible sets per test window: median 0, maximum 5. The walk traded 2 windows: BEAR with PF 0.70 (net −29), CHOP with PF 0.65 (net −78). It stayed flat in the other 35.
- Out of sample: pooled PF 0.67, net −107. Population median PF per window 0.54 over all 18,620 sets.
- Population by regime: BULL long PF 0.68 and short PF 0.40; BEAR long 0.44 and short 0.75; CHOP long 0.66 and short 0.54. Both directions lose in every regime.
- Cause identified: the median 4-hour ATR14 is 2.38% of price (interquartile 1.84% to 3.07%). The percent grid's stops are 0.32% to 0.92% including cost, inside one candle's normal range. That explains why 82% of exits at 4 hours are stop-outs.

## Experiment B: ATR-scaled brackets (pre-registered before any run)

- Brackets: target = tpMult × ATR14 + round-trip cost, stop = slMult × ATR14 + cost. ATR14 is taken on the last closed bar before entry, and is causal.
- tpMult in {0.5, 1.0, 1.5, 2.0, 3.0}. slMult in {0.5, 1.0, 1.5, 2.0}.
- Everything else as before: 19 indications, both directions, fixed or dynamic trail (retrace 0.3 to 0.6), two holds per timeframe, partial 0 or 0.5. That is 7,600 sets per timeframe.
- Windows, regime labels, walk rule and success criterion as in Experiment A.
- Timeframes: 4h first, then 1h and 30m as their candles finish.
- Not part of the brief's percent grid: it is a second bracket family, reported separately.

## Experiment B result: ATR brackets, 4 hours (recorded)

- 7,600 sets, 48 markets, 49 windows. Out of sample: pooled PF 0.75, net −1,536, traded 35 of 37 windows.
- BULL: PF 0.33, net −1,088 (7 windows). BEAR: PF 0.83. CHOP: PF 0.96.
- Population direction by regime: BULL long PF 1.33, short PF 0.48. BEAR long PF 0.52, short PF 1.42. CHOP long 0.93, short 0.84.
- Reading: the ATR brackets carry a trend-following signature. Longs win in rising markets and shorts win in falling ones. The walk still traded counter-trend, because it selects on pooled history.

## Experiment C: trend-filtered entries (pre-registered before the run)

- Filter: a long is allowed only if the instrument's trailing return over the last 10 days (60 bars at 4 hours, measured on the signal bar) is above zero. A short is allowed only if it is below zero. The lookback is fixed, not tuned.
- Brackets, grid, windows, regime labels and walk rule as Experiment B.
- Validation: the test windows are split in time. First half: test windows 12 to 30. Second half: test windows 31 to 48. The direction table in Experiment B was computed over all windows, so this experiment is a test only in the time split, and the report says so.
- Success: out-of-sample pooled PF above 1.00 in each half of the time split, and above 1.00 in each regime with at least five traded windows. Anything else is reported as not profitable.
