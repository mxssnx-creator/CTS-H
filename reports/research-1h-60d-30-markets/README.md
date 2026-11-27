# Research: walk-forward study on 60 days of 1h candles

Data: 30 BingX USDT perpetuals (`bingx-x01`), 1440 closed hours per market captured on the run date. Every window is a 120-hour holdout with a 72-hour prehistory. Four research windows (R1–R4) choose nothing that the TEST window sees. TEST is the most recent 5 days and was used only to report outcomes. Profile: coordinated, selected-only, 1 bp slippage, 0.12% round-trip cost.

## Engine results by indication and range

Research = R1–R4 combined. `minWin` is the weakest research window. `ext` marks the opt-in 2.5–4 ATR target grid. Rows need at least 300 research closes to count.

| indication | range | ext | research PF | minWin PF | research net | research closes | research green % | research max DD | TEST PF | TEST net | TEST closes | TEST green % | TEST DD |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| stochRsi | wide | on | 0.95 | 0.69 | -1.33 | 850 | 48.8 | 3.79 | 1.06 | 0.34 | 200 | 51.7 | 2.72 |
| rangeFade | both | on | 0.94 | 0.67 | -1.07 | 481 | 44.8 | 2.77 | 0.95 | -0.12 | 69 | 45.8 | 1.38 |
| stochRsi | both | on | 0.94 | 0.69 | -1.67 | 885 | 49.0 | 3.79 | 1.06 | 0.34 | 200 | 51.7 | 2.72 |
| bollinger | wide | on | 0.94 | 0.72 | -1.41 | 584 | 49.0 | 4.30 | 1.14 | 0.62 | 147 | 53.3 | 3.52 |
| bollinger | both | on | 0.93 | 0.72 | -1.64 | 592 | 49.4 | 4.30 | 1.14 | 0.62 | 147 | 53.3 | 3.52 |
| rangeFade | wide | on | 0.91 | 0.66 | -1.71 | 471 | 43.8 | 2.96 | 1.05 | 0.08 | 46 | 43.3 | 0.86 |
| ema | wide | on | 0.89 | 0.70 | -2.42 | 637 | 41.9 | 4.55 | 0.42 | -5.04 | 195 | 35.0 | 6.26 |
| ema | both | on | 0.89 | 0.67 | -2.54 | 653 | 41.7 | 4.80 | 0.40 | -5.44 | 199 | 33.3 | 6.38 |
| squeezeBreak | wide | off | 0.89 | 0.54 | -2.89 | 660 | 46.7 | 5.01 | 0.83 | -1.62 | 230 | 46.7 | 6.64 |
| ema | wide | off | 0.86 | 0.61 | -3.62 | 697 | 41.9 | 5.54 | 0.34 | -8.11 | 241 | 37.5 | 9.27 |
| ema | both | off | 0.86 | 0.60 | -3.74 | 723 | 41.9 | 5.67 | 0.33 | -8.51 | 245 | 35.8 | 9.47 |
| move | both | off | 0.85 | 0.67 | -10.08 | 1864 | 44.0 | 6.53 | 0.53 | -16.59 | 717 | 40.8 | 21.70 |
| rangeFade | both | off | 0.85 | 0.56 | -3.16 | 512 | 42.3 | 2.94 | 0.88 | -0.31 | 71 | 40.8 | 1.40 |
| active | wide | off | 0.85 | 0.67 | -7.32 | 1251 | 47.3 | 5.24 | 0.67 | -5.80 | 383 | 42.5 | 11.76 |
| squeezeBreak | wide | on | 0.85 | 0.57 | -3.19 | 586 | 47.1 | 4.37 | 0.91 | -0.68 | 205 | 45.8 | 5.38 |
| squeezeBreak | both | off | 0.85 | 0.52 | -4.21 | 735 | 45.2 | 5.18 | 0.79 | -2.05 | 242 | 46.7 | 7.05 |
| move | wide | off | 0.85 | 0.67 | -9.87 | 1745 | 43.5 | 6.53 | 0.55 | -15.07 | 660 | 40.8 | 21.00 |
| vwapReclaim | both | off | 0.85 | 0.56 | -2.93 | 544 | 37.9 | 3.10 | 0.40 | -7.00 | 216 | 30.8 | 7.96 |
| vwapReclaim | both | on | 0.85 | 0.59 | -2.75 | 516 | 41.0 | 2.88 | 0.38 | -6.32 | 198 | 32.5 | 7.01 |
| break | both | off | 0.84 | 0.52 | -5.88 | 1031 | 46.2 | 6.04 | 0.80 | -2.34 | 280 | 46.7 | 9.04 |
| active | both | off | 0.84 | 0.67 | -8.15 | 1337 | 48.1 | 5.24 | 0.68 | -5.88 | 417 | 40.8 | 11.70 |
| vwapReclaim | wide | off | 0.83 | 0.59 | -3.12 | 515 | 37.5 | 3.21 | 0.38 | -6.96 | 205 | 31.7 | 7.95 |
| vwapReclaim | wide | on | 0.83 | 0.61 | -2.92 | 495 | 40.6 | 2.99 | 0.36 | -6.28 | 187 | 33.3 | 7.00 |
| break | wide | off | 0.83 | 0.52 | -5.66 | 899 | 45.4 | 6.04 | 0.80 | -2.34 | 280 | 46.7 | 9.04 |
| bollinger | both | off | 0.83 | 0.58 | -4.56 | 645 | 48.1 | 6.23 | 1.17 | 0.94 | 165 | 51.7 | 4.08 |
| bollinger | wide | off | 0.82 | 0.58 | -4.66 | 612 | 47.3 | 6.23 | 1.17 | 0.94 | 165 | 51.7 | 4.08 |
| rangeFade | wide | off | 0.82 | 0.56 | -3.79 | 502 | 41.2 | 3.14 | 0.94 | -0.11 | 48 | 39.2 | 0.89 |
| momentumPullback | wide | off | 0.82 | 0.53 | -5.03 | 699 | 44.6 | 3.72 | 0.47 | -4.30 | 185 | 45.0 | 5.41 |
| rangeFade | short | off | 0.82 | 0.48 | -3.02 | 527 | 35.4 | 2.36 | 0.61 | -1.07 | 72 | 23.3 | 1.54 |
| rangeFade | short | on | 0.82 | 0.48 | -3.02 | 527 | 35.4 | 2.36 | 0.61 | -1.07 | 72 | 23.3 | 1.54 |
| move | both | on | 0.81 | 0.63 | -9.68 | 1434 | 44.8 | 6.03 | 0.57 | -12.71 | 619 | 37.5 | 17.66 |
| move | wide | on | 0.81 | 0.63 | -9.84 | 1402 | 45.4 | 6.03 | 0.59 | -11.99 | 600 | 40.0 | 17.50 |
| all | both | on | 0.81 | 0.63 | -9.69 | 1371 | 45.0 | 5.94 | 0.65 | -8.23 | 518 | 38.3 | 13.27 |
| squeezeBreak | both | on | 0.81 | 0.55 | -4.50 | 661 | 45.8 | 4.54 | 0.88 | -0.94 | 217 | 45.8 | 5.69 |
| all | both | off | 0.81 | 0.67 | -13.42 | 1821 | 43.8 | 6.53 | 0.54 | -15.56 | 697 | 39.2 | 21.10 |
| stochRsi | wide | off | 0.80 | 0.48 | -8.09 | 1092 | 47.3 | 6.97 | 0.72 | -3.35 | 284 | 45.8 | 5.37 |
| active | both | on | 0.80 | 0.61 | -7.55 | 1076 | 48.1 | 5.24 | 0.84 | -1.61 | 289 | 43.3 | 6.17 |
| stochRsi | both | off | 0.80 | 0.48 | -8.72 | 1152 | 47.3 | 6.97 | 0.72 | -3.35 | 284 | 45.8 | 5.37 |
| break | both | on | 0.80 | 0.60 | -6.48 | 930 | 45.6 | 5.35 | 0.92 | -0.73 | 253 | 47.5 | 7.22 |
| active | wide | on | 0.79 | 0.61 | -7.62 | 1042 | 47.9 | 5.24 | 0.85 | -1.39 | 274 | 40.0 | 5.86 |

Small-sample rows (fewer than 300 research closes) are left out of this table. In the full JSON, `supertrend` wide reports a research PF of 2.26 on 46 closes, which is too few to trust.

## Losing trades: fixed brackets, research windows

Each row is a trade-level PF for every trade the indication fires on, with the given bracket and no selection. `tp`, `sl`, `time` show the exit mix.

| indication | range | trades | PF | tp % | sl % | time % |
|---|---|---|---|---|---|---|
| volumeBreak | short | 147543 | 0.44 | 48.7 | 51.2 | 0.0 |
| macd | short | 105958 | 0.47 | 50.1 | 49.3 | 0.0 |
| direction | short | 138751 | 0.48 | 50.7 | 48.8 | 0.0 |
| squeezeBreak | short | 288871 | 0.49 | 51.1 | 48.7 | 0.0 |
| momentumPullback | short | 383565 | 0.50 | 51.3 | 48.3 | 0.0 |
| break | short | 446216 | 0.51 | 51.8 | 48.0 | 0.0 |
| active | short | 651868 | 0.51 | 51.4 | 48.3 | 0.0 |
| donchian | short | 145341 | 0.52 | 51.8 | 48.1 | 0.0 |
| vwapReclaim | short | 248552 | 0.52 | 51.6 | 47.7 | 0.1 |
| ema | short | 320580 | 0.52 | 51.4 | 48.0 | 0.0 |
| bollinger | short | 297017 | 0.53 | 51.5 | 48.4 | 0.0 |
| move | short | 1294690 | 0.53 | 51.5 | 48.3 | 0.0 |
| pullback | short | 149412 | 0.53 | 53.0 | 46.4 | 0.0 |
| stochRsi | short | 451101 | 0.55 | 53.3 | 46.3 | 0.0 |
| supertrend | short | 80892 | 0.57 | 53.9 | 46.0 | 0.0 |
| rsi | short | 133829 | 0.60 | 55.4 | 44.5 | 0.0 |
| adxDi | short | 91713 | 0.61 | 54.9 | 44.9 | 0.0 |
| rangeFade | short | 201363 | 0.62 | 56.4 | 43.3 | 0.0 |
| rsiRecovery | short | 20417 | 0.63 | 55.9 | 44.1 | 0.0 |
| volumeBreak | wide | 36572 | 0.73 | 43.8 | 52.2 | 2.6 |
| macd | wide | 26704 | 0.75 | 43.5 | 51.9 | 2.7 |
| momentumPullback | wide | 65787 | 0.76 | 43.3 | 51.2 | 2.8 |
| direction | wide | 33369 | 0.78 | 44.1 | 50.6 | 3.1 |
| pullback | wide | 32097 | 0.78 | 43.1 | 49.1 | 3.8 |
| rsi | wide | 32656 | 0.79 | 43.0 | 50.3 | 4.0 |
| break | wide | 87790 | 0.81 | 45.4 | 49.9 | 2.9 |
| move | wide | 163659 | 0.82 | 44.7 | 51.5 | 2.1 |
| donchian | wide | 35798 | 0.82 | 46.4 | 49.4 | 2.6 |
| squeezeBreak | wide | 63960 | 0.83 | 46.1 | 49.3 | 2.8 |
| active | wide | 110192 | 0.83 | 45.3 | 50.4 | 2.4 |
| stochRsi | wide | 84672 | 0.84 | 44.9 | 49.7 | 2.8 |
| ema | wide | 55000 | 0.90 | 45.6 | 47.1 | 3.4 |
| vwapReclaim | wide | 46151 | 0.92 | 46.0 | 46.5 | 3.4 |
| bollinger | wide | 58642 | 0.92 | 48.4 | 48.7 | 1.8 |
| supertrend | wide | 22361 | 0.93 | 48.7 | 46.0 | 3.5 |
| rangeFade | wide | 45929 | 0.94 | 48.4 | 46.7 | 2.7 |
| rsiRecovery | wide | 5092 | 1.00 | 49.3 | 45.3 | 2.3 |
| adxDi | wide | 21404 | 1.05 | 50.7 | 44.4 | 3.4 |

Short-range brackets (targets of 0.3–0.6 ATR) lose most. At this timeframe the 0.12% round-trip cost takes most of a target that small, and stop exits are about as frequent as target exits. Wide brackets lose less. Only the widest targets with trailing exits come close to break-even.

## BTC trend relation gate

Longs allowed only when BTC 1h EMA21 is above EMA26, shorts only when below. Trade-level PF, same brackets.

```
stochRsi    tp4    sl1.5   breakeven ungated : research PF 1.58 n 1037 | TEST PF 1.46 n 244   BTC-gated: research PF 0.56 n 679 | TEST PF 3.96 n 201
stochRsi    tp4    sl1.5   dynamic   ungated : research PF 1.48 n 1107 | TEST PF 1.45 n 253   BTC-gated: research PF 0.56 n 694 | TEST PF 3.94 n 203
stochRsi    tp4    sl1     dynamic   ungated : research PF 1.33 n 1192 | TEST PF 1.43 n 273   BTC-gated: research PF 0.61 n 713 | TEST PF 3.89 n 204
bollinger   tp4    sl1.5   breakeven ungated : research PF 1.38 n 841 | TEST PF 0.90 n 206   BTC-gated: research PF 0.80 n 426 | TEST PF 4.82 n 72
bollinger   tp3    sl1.5   fixed     ungated : research PF 1.32 n 915 | TEST PF 1.00 n 226   BTC-gated: research PF 0.86 n 434 | TEST PF 4.61 n 72
rangeFade   tp3    sl1     fixed     ungated : research PF 1.27 n 863 | TEST PF 0.94 n 189   BTC-gated: research PF 1.12 n 471 | TEST PF 4.47 n 101
ema         tp3    sl1.5   dynamic   ungated : research PF 1.34 n 932 | TEST PF 0.86 n 210   BTC-gated: research PF 0.96 n 632 | TEST PF 2.48 n 171
adxDi       tp4    sl1.5   dynamic   ungated : research PF 1.16 n 456 | TEST PF 0.32 n 79   BTC-gated: research PF 1.31 n 231 | TEST PF 6.31 n 43
vwapReclaim tp2.5  sl1.5   breakeven ungated : research PF 1.27 n 846 | TEST PF 0.58 n 203   BTC-gated: research PF 0.92 n 544 | TEST PF 2.83 n 154
```

The gate reverses sign between the research and test windows for `stochRsi`, `bollinger`, `ema`, `adxDi` and `vwapReclaim`. A filter that helps one period and hurts the other is regime fitting. It is not adopted.
## Fixed-bracket portfolio, per window

`scripts/cts-h-fixed.ts` replays one bracket on every market, with no prehistory selection, and reports the same hourly portfolio metrics. Output is in `fixed-bracket-windows.txt`.

```
stochRsi tp4 sl1.5 breakeven   TEST PF 1.46 n 151 net 0.63 DD 1.33 grn 52% | R1 PF 0.63 n 170 net -1.21 DD 2.06 grn 48% | R2 PF 2.19 n 167 net 2.07 DD 0.76 grn 50% | R3 PF 0.79 n 164 net -0.61 DD 1.54 grn 47% | R4 PF 2.35 n 154 net 1.85 DD 1.12 grn 50%
stochRsi tp4 sl1.5 dynamic     TEST PF 1.35 n 155 net 0.49 DD 1.43 grn 51% | R1 PF 0.62 n 174 net -1.26 DD 2.14 grn 51% | R2 PF 2.07 n 173 net 1.94 DD 0.95 grn 48% | R3 PF 0.80 n 177 net -0.56 DD 1.82 grn 46% | R4 PF 1.96 n 159 net 1.41 DD 1.39 grn 47%
stochRsi tp4 sl1 dynamic       TEST PF 1.11 n 170 net 0.34 DD 2.24 grn 49% | R1 PF 0.74 n 186 net -1.24 DD 2.50 grn 50% | R2 PF 1.88 n 182 net 2.64 DD 1.76 grn 48% | R3 PF 0.87 n 185 net -0.56 DD 2.12 grn 50% | R4 PF 1.31 n 173 net 1.18 DD 2.45 grn 54%
stochRsi tp4 sl1.5 fixed       TEST PF 1.35 n 145 net 0.50 DD 1.33 grn 53% | R1 PF 1.15 n 166 net 0.44 DD 1.95 grn 53% | R2 PF 1.86 n 161 net 1.66 DD 1.16 grn 48% | R3 PF 0.84 n 158 net -0.48 DD 1.38 grn 44% | R4 PF 2.43 n 150 net 1.96 DD 1.11 grn 51%
bollinger tp4 sl1.5 breakeven  TEST PF 0.79 n 132 net -0.43 DD 2.66 grn 46% | R1 PF 1.41 n 127 net 0.69 DD 1.31 grn 57% | R2 PF 1.44 n 122 net 0.63 DD 1.25 grn 52% | R3 PF 1.05 n 115 net 0.09 DD 1.47 grn 48% | R4 PF 0.75 n 120 net -0.66 DD 1.90 grn 49%
bollinger tp3 sl1.5 fixed      TEST PF 1.11 n 139 net 0.33 DD 3.22 grn 50% | R1 PF 1.58 n 139 net 1.38 DD 1.76 grn 56% | R2 PF 1.42 n 131 net 0.93 DD 1.53 grn 50% | R3 PF 0.83 n 128 net -0.57 DD 2.64 grn 48% | R4 PF 0.71 n 127 net -1.07 DD 2.69 grn 46%
rangeFade tp3 sl1 fixed        TEST PF 0.93 n 117 net -0.23 DD 2.23 grn 50% | R1 PF 0.64 n 112 net -1.49 DD 2.07 grn 49% | R2 PF 1.72 n 136 net 2.31 DD 1.43 grn 51% | R3 PF 0.92 n 140 net -0.37 DD 2.33 grn 43% | R4 PF 0.65 n 131 net -2.04 DD 2.21 grn 45%
ema tp3 sl1.5 dynamic          TEST PF 0.74 n 133 net -0.40 DD 1.19 grn 45% | R1 PF 0.58 n 131 net -1.27 DD 1.75 grn 47% | R2 PF 1.43 n 163 net 1.00 DD 1.31 grn 47% | R3 PF 0.79 n 128 net -0.60 DD 2.34 grn 48% | R4 PF 0.79 n 125 net -0.52 DD 1.02 grn 48%
```

## What this study shows

- **Targets not met.** No indication reaches a research profit factor above 1 in aggregate under the engine's per-market selection. Hourly success rates sit near 40–52% for every candidate. The target was PF 1.3 or higher, low drawdown and a high share of positive hours.
- **Best candidate: `stochRsi`, 4 ATR target, 1.5× stop, break-even trailing.** Fixed-bracket PF is 1.46 on the test window (151 trades) and 2.19 and 2.35 on two research windows. It falls to 0.63 and 0.79 on the other two. Positive hours are about 50%. It is consistent across research and test in trade-level PF, but not stable across the windows. Treat it as a research candidate, not a result.
- **The portfolio selection step dilutes the edge.** The `stochRsi` candidate reaches a test-window PF of 1.46 with a fixed bracket, but 1.06 under the engine's per-market selection with the same indication and extended targets.
- **Losing configurations.** Short targets (0.3–0.6 ATR) lose at trade level. The 0.12% round-trip cost takes most of a small target, and stop exits are as common as target exits. Wide brackets lose less. Trailing exits matter for the wider targets.
- **Relation gate.** A BTC trend gate reverses sign between research and test windows, so it is not adopted.
- **Sizing.** Each leg is sized at 0.12% of equity by the engine (`POSITION_COST_PCT`), so absolute P&L in these numbers is small. Profit factor and the hourly rates are the meaningful comparisons, not the net totals.
- **Selection bias.** Candidates were chosen on the research windows, which is why the test window is the only out-of-sample check. Over 1,080 brackets, a PF near 1.5 can appear by chance, so the candidate needs forward validation on new data before any use.
