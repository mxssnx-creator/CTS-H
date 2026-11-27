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
