# Staged lanes: 10-day windows on 57 BingX markets

This report measures the staged position-history lanes against the coordinated engine. The design is in [docs/staged-lanes.md](../../docs/staged-lanes.md).

## Data and windows

- 60 markets from `REPLAY_SYMBOLS`. The first capture had complete candles for 57 of them (BingX rate limits); R1–R4 and TEST use those 57. The older capture had all 60; R5–R7 and TEST2 use all 60.
- 1h candles. Every window has a 240-hour holdout and a 72-hour prehistory.
- Captures are not committed (about 8 MB each). Re-run the capture command in the repository README to recreate them.

| Window | Role | Holdout (UTC) | When it was used |
| --- | --- | --- | --- |
| R1–R4 | research | 240 h windows ending 10, 20, 30 and 40 days before the latest candle | design choices |
| R5–R7 | research | 240 h windows ending 50, 60 and 70 days before the latest candle, from a second capture | design choices, after R1–R4 |
| TEST | first test window | latest 10 days | viewed in round 1, before the design was fixed; not a clean holdout |
| TEST2 | held-out window | 240 h ending 50 days before the latest candle | evaluated once, after the design was fixed |

## Design choices, made on research windows only

- Default: one validated cell per market, ranked by net P&L. Cells need at least 6 closes.
- Both lanes veto, including long. Main's short lanes are positive-only, as specified.
- Each thin stage raises the PF bar by 0.05. Thin 1 vetoed 458 cells and Thin 2 vetoed 1,519 on the held-out window, so the refinement does reject cells.
- Evidence floor: a lane gives evidence only once the cell has at least 4 closes.
- The holdout gate matters. Turning it off made research net much worse (below).

## Results

Figures are the printed outputs. "Medians" are of per-window PF. Net is in settlement units on a 10,000 book; orders are booked closes.

### Research windows R1–R4 (round 4, after the evidence floor)

| Variant | Median PF | Min PF | Net | Orders | Green % | Max DD |
| --- | --- | --- | --- | --- | --- | --- |
| Coordinated (reference) | 0.82 | 0.76 | -26.81 | 6422 | 44.1 | 14.48 |
| Staged default (1 cell, net, veto lanes) | 0.89 | 0.79 | 1.92 | 1224 | 42.8 | 2.92 |
| Staged 2 cells per market | 0.82 | 0.77 | -1.52 | 2357 | 43.3 | 7.07 |
| Staged 3 cells per market | 0.80 | 0.75 | -4.78 | 3454 | 44.5 | 11.37 |
| Staged, gate off | 0.82 | 0.68 | -51.97 | 7641 | 39.9 | 32.34 |
| Staged, rank by PF | 0.68 | 0.63 | -7.97 | 1079 | 42.6 | 5.17 |
| Staged, min closes 10 | 0.85 | 0.67 | -6.42 | 1146 | 36.9 | 4.24 |

### Research windows R5–R7 and held-out TEST2

| Variant | R5 PF | R6 PF | R7 PF | R5–R7 net | R5–R7 orders | R5–R7 max DD | TEST2 PF | TEST2 net | TEST2 orders | TEST2 green % | TEST2 max DD |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Coordinated (reference) | 0.88 | 0.92 | 0.83 | -21.26 | 4439 | 12.53 | 0.80 | -11.61 | 1613 | 44.6 | 16.14 |
| Staged default | 1.15 | 0.84 | 0.59 | -4.18 | 746 | 4.49 | 0.78 | -2.93 | 262 | 41.7 | 4.04 |
| Staged 2 cells per market | 1.13 | 0.87 | 0.64 | -6.81 | 1493 | 7.89 | 0.81 | -5.15 | 533 | 44.6 | 7.40 |
| Staged, gate off | 0.84 | 0.81 | 0.59 | -65.06 | 5462 | 40.82 | 0.84 | -13.22 | 1956 | 44.2 | 15.67 |

### Round 1 test window (TEST, viewed before the design was fixed)

Coordinated: PF 1.22, net +8.47, 1346 orders, DD 5.71. Staged default: PF 0.89, net -1.21, 316 orders, DD 2.33. These figures are from the design before the evidence floor. They are shown for transparency, not as a clean result.

## What this shows

- The staged default lost less and drew down less than the coordinated engine in the aggregated research windows and on the held-out window. Across R1–R7 its combined net was about -2 against about -48 for the coordinated engine. On the held-out window its drawdown was 4.0 against 16.1. Only aggregates are available for R1–R4, so this is not a per-window claim.
- The gate is the component that matters most. With it off, drawdown on R5–R7 rises from 4.5 to 40.8.
- Targets are not met. The staged default's PF is below 1 on the held-out window (0.78), and it places about six times fewer orders than the coordinated engine (262 against 1613). Its green-hour share (41.7%) is below the coordinated engine's (44.6%).
- Ranking by net beats ranking by PF on research. Stacking more cells per market adds orders but adds drawdown and loses net.
- The first-round test window was used to shape the design, so only TEST2 supports a claim about the held-out result.

## Limits

- The coordinated reference was run without overlays, for comparability.
- Trades are sized at the engine's standard 0.12% of equity, so absolute P&L is small. Profit factor and drawdown are the meaningful comparisons.
- Three markets had no usable candles in the first capture after retries; they are excluded from R1–R4 and TEST.
- The staged default's aggregate PF is below 1 on the held-out window and on R6–R7. The one window above 1 is R5 (1.15). This design should not be used for live or paper trading.

## Files

- `staged-held-out-window.html` and `staged-held-out-window.md`: the staged profile on TEST2, generated by the CLI. They include the stage, lane, cell and shadow tables.
- `research-round4-R1-R4.txt`: the research table for R1–R4 as printed.
- `windows-R5-R7-TEST2.json`: the per-window rows for R5–R7 and TEST2.
