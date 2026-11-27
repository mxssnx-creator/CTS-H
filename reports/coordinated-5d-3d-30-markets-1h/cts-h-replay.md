# CTS-H replay · period report

## bingx-x01 · 1h · coordinated + Axis + Block + DCA + Relate · Auto PF · 2026-11-27 13:00 UTC

- Source: https://open-api.bingx.com
- Symbols with complete coverage: 30 of 30
- Holdout: 120h starting 2026-11-22 13:00 UTC; prehistory: 72h starting 2026-11-19 13:00 UTC
- Holdout result: 7.51 net, 444 closes, PF 1.741, 63 of 120 periods positive, drawdown 1.058
- Configurations scored: 104,378; failed preselection: 88,944; excluded by calibration: 202
- Strategy actions: Axis 192, Block 172, DCA 153, Relate 60
- Slippage: 1 bp per fill; costs and fee fallbacks: none
- Capture and cost SHA-256: 7f44854735a15e3b9e938af3ba4eb3bf12341f37c50a4ad2d7ee9a7edb57ab98

### Holdout by 4-hour period (UTC, from 2026-11-22 13:00 UTC)

| UTC period start | UTC period end | Hours | Closes | Wins | Losses | Win rate | Realized | MTM change | Net | Cumulative net | Gross profit | Gross loss | Trade PF | Positive hours | Period drawdown | Open legs at end |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-11-22 13:00 UTC | 2026-11-22 17:00 UTC | 4 | 0 | 0 | 0 | — | 0 | -0.114 | -0.114 | -0.114 | 0 | 0 | — | 1 | 0.121 | 15 |
| 2026-11-22 17:00 UTC | 2026-11-22 21:00 UTC | 4 | 1 | 0 | 1 | 0% | -0.075 | -0.059 | -0.134 | -0.248 | 0 | 0.075 | 0 | 1 | 0.262 | 25 |
| 2026-11-22 21:00 UTC | 2026-11-23 01:00 UTC | 4 | 3 | 2 | 1 | 66.667% | 0.032 | 0.017 | 0.049 | -0.199 | 0.118 | 0.086 | 1.365 | 3 | 0.105 | 28 |
| 2026-11-23 01:00 UTC | 2026-11-23 05:00 UTC | 4 | 26 | 11 | 15 | 42.308% | -0.404 | 0.01 | -0.395 | -0.594 | 0.682 | 1.087 | 0.628 | 0 | 0.395 | 26 |
| 2026-11-23 05:00 UTC | 2026-11-23 09:00 UTC | 4 | 12 | 9 | 3 | 75% | 0.275 | 0.021 | 0.296 | -0.298 | 0.509 | 0.234 | 2.176 | 2 | 0.163 | 27 |
| 2026-11-23 09:00 UTC | 2026-11-23 13:00 UTC | 4 | 11 | 9 | 2 | 81.818% | 0.29 | -0.381 | -0.091 | -0.389 | 0.453 | 0.163 | 2.785 | 2 | 0.331 | 25 |
| 2026-11-23 13:00 UTC | 2026-11-23 17:00 UTC | 4 | 58 | 43 | 15 | 74.138% | 1.386 | 0.276 | 1.662 | 1.273 | 2.597 | 1.211 | 2.144 | 2 | 0.529 | 19 |
| 2026-11-23 17:00 UTC | 2026-11-23 21:00 UTC | 4 | 28 | 15 | 12 | 53.571% | -0.043 | 0.775 | 0.732 | 2.005 | 0.939 | 0.983 | 0.956 | 3 | 0.099 | 23 |
| 2026-11-23 21:00 UTC | 2026-11-24 01:00 UTC | 4 | 14 | 11 | 2 | 78.571% | 0.427 | -0.685 | -0.259 | 1.746 | 0.592 | 0.165 | 3.583 | 1 | 0.615 | 24 |
| 2026-11-24 01:00 UTC | 2026-11-24 05:00 UTC | 4 | 8 | 7 | 1 | 87.5% | 0.335 | -0.311 | 0.023 | 1.769 | 0.413 | 0.078 | 5.298 | 1 | 0.497 | 28 |
| 2026-11-24 05:00 UTC | 2026-11-24 09:00 UTC | 4 | 6 | 0 | 5 | 0% | -0.404 | 0.45 | 0.045 | 1.814 | 0 | 0.404 | 0 | 3 | 0.466 | 28 |
| 2026-11-24 09:00 UTC | 2026-11-24 13:00 UTC | 4 | 6 | 2 | 4 | 33.333% | -0.134 | 0.613 | 0.479 | 2.293 | 0.119 | 0.254 | 0.47 | 3 | 0.215 | 26 |
| 2026-11-24 13:00 UTC | 2026-11-24 17:00 UTC | 4 | 24 | 20 | 4 | 83.333% | 1.064 | -0.314 | 0.75 | 3.043 | 1.405 | 0.341 | 4.12 | 2 | 0.577 | 28 |
| 2026-11-24 17:00 UTC | 2026-11-24 21:00 UTC | 4 | 3 | 2 | 1 | 66.667% | -0.002 | -0.43 | -0.433 | 2.611 | 0.077 | 0.079 | 0.971 | 2 | 0.916 | 28 |
| 2026-11-24 21:00 UTC | 2026-11-25 01:00 UTC | 4 | 2 | 1 | 1 | 50% | -0.072 | 0.152 | 0.079 | 2.69 | 0.012 | 0.085 | 0.145 | 2 | 0.323 | 26 |
| 2026-11-25 01:00 UTC | 2026-11-25 05:00 UTC | 4 | 8 | 6 | 2 | 75% | 0.185 | 0.105 | 0.29 | 2.98 | 0.323 | 0.138 | 2.336 | 3 | 0.341 | 26 |
| 2026-11-25 05:00 UTC | 2026-11-25 09:00 UTC | 4 | 1 | 1 | 0 | 100% | 0.047 | -0.258 | -0.211 | 2.769 | 0.047 | 0 | No losses | 1 | 0.555 | 30 |
| 2026-11-25 09:00 UTC | 2026-11-25 13:00 UTC | 4 | 14 | 12 | 2 | 85.714% | 0.722 | 0.642 | 1.364 | 4.133 | 0.874 | 0.152 | 5.745 | 3 | 0.108 | 26 |
| 2026-11-25 13:00 UTC | 2026-11-25 17:00 UTC | 4 | 32 | 26 | 6 | 81.25% | 1.384 | -1.101 | 0.282 | 4.415 | 1.818 | 0.435 | 4.182 | 2 | 0.619 | 25 |
| 2026-11-25 17:00 UTC | 2026-11-25 21:00 UTC | 4 | 41 | 25 | 16 | 60.976% | 0.07 | 1.218 | 1.288 | 5.704 | 1.398 | 1.327 | 1.053 | 3 | 0.098 | 28 |
| 2026-11-25 21:00 UTC | 2026-11-26 01:00 UTC | 4 | 22 | 21 | 0 | 95.455% | 1.328 | -0.608 | 0.72 | 6.424 | 1.328 | 0 | No losses | 2 | 0.325 | 10 |
| 2026-11-26 01:00 UTC | 2026-11-26 05:00 UTC | 4 | 7 | 6 | 1 | 85.714% | 0.265 | -0.005 | 0.26 | 6.684 | 0.347 | 0.082 | 4.238 | 2 | 0.028 | 22 |
| 2026-11-26 05:00 UTC | 2026-11-26 09:00 UTC | 4 | 7 | 4 | 3 | 57.143% | 0.02 | -0.217 | -0.197 | 6.487 | 0.262 | 0.242 | 1.083 | 2 | 0.489 | 24 |
| 2026-11-26 09:00 UTC | 2026-11-26 13:00 UTC | 4 | 6 | 2 | 3 | 33.333% | -0.127 | -0.199 | -0.326 | 6.161 | 0.118 | 0.245 | 0.481 | 1 | 0.348 | 27 |
| 2026-11-26 13:00 UTC | 2026-11-26 17:00 UTC | 4 | 13 | 5 | 8 | 38.462% | -0.252 | 0.228 | -0.024 | 6.137 | 0.398 | 0.65 | 0.612 | 2 | 0.294 | 23 |
| 2026-11-26 17:00 UTC | 2026-11-26 21:00 UTC | 4 | 5 | 3 | 2 | 60% | 0.004 | 0.295 | 0.3 | 6.437 | 0.142 | 0.138 | 1.033 | 3 | 0.001 | 27 |
| 2026-11-26 21:00 UTC | 2026-11-27 01:00 UTC | 4 | 12 | 5 | 7 | 41.667% | -0.186 | -0.281 | -0.466 | 5.97 | 0.2 | 0.386 | 0.519 | 2 | 0.7 | 22 |
| 2026-11-27 01:00 UTC | 2026-11-27 05:00 UTC | 4 | 21 | 16 | 5 | 76.19% | 0.755 | 0.49 | 1.245 | 7.215 | 1.055 | 0.3 | 3.515 | 4 | 0 | 28 |
| 2026-11-27 05:00 UTC | 2026-11-27 09:00 UTC | 4 | 22 | 18 | 3 | 81.818% | 0.809 | -0.305 | 0.505 | 7.72 | 1.085 | 0.276 | 3.936 | 3 | 0.345 | 21 |
| 2026-11-27 09:00 UTC | 2026-11-27 13:00 UTC | 4 | 31 | 12 | 19 | 38.71% | -0.187 | -0.023 | -0.21 | 7.51 | 0.33 | 0.517 | 0.639 | 2 | 0.281 | 0 |

### Prehistory by 4-hour period (UTC, from 2026-11-19 13:00 UTC)

| UTC period start | UTC period end | Hours | Closes | Wins | Losses | Win rate | Realized | MTM change | Net | Cumulative net | Gross profit | Gross loss | Trade PF | Positive hours | Period drawdown | Open legs at end |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-11-19 13:00 UTC | 2026-11-19 17:00 UTC | 4 | 25 | 19 | 6 | 76% | 0.903 | 0.31 | 1.213 | 1.213 | 1.479 | 0.576 | 2.567 | 2 | 0.288 | 26 |
| 2026-11-19 17:00 UTC | 2026-11-19 21:00 UTC | 4 | 7 | 3 | 0 | 42.857% | 0.233 | 0.07 | 0.303 | 1.515 | 0.233 | 0 | No losses | 2 | 0.737 | 27 |
| 2026-11-19 21:00 UTC | 2026-11-20 01:00 UTC | 4 | 12 | 11 | 1 | 91.667% | 0.71 | -0.693 | 0.017 | 1.532 | 0.806 | 0.096 | 8.393 | 3 | 1.036 | 28 |
| 2026-11-20 01:00 UTC | 2026-11-20 05:00 UTC | 4 | 18 | 17 | 1 | 94.444% | 1.181 | 1.02 | 2.201 | 3.734 | 1.277 | 0.096 | 13.307 | 3 | 0.728 | 26 |
| 2026-11-20 05:00 UTC | 2026-11-20 09:00 UTC | 4 | 1 | 0 | 0 | 0% | 0 | -1.042 | -1.042 | 2.692 | 0 | 0 | — | 2 | 1.342 | 29 |
| 2026-11-20 09:00 UTC | 2026-11-20 13:00 UTC | 4 | 12 | 11 | 1 | 91.667% | 0.669 | 0.766 | 1.435 | 4.127 | 0.765 | 0.096 | 7.968 | 3 | 0.337 | 22 |
| 2026-11-20 13:00 UTC | 2026-11-20 17:00 UTC | 4 | 29 | 29 | 0 | 100% | 2.245 | -0.673 | 1.572 | 5.699 | 2.245 | 0 | No losses | 1 | 0.285 | 30 |
| 2026-11-20 17:00 UTC | 2026-11-20 21:00 UTC | 4 | 10 | 10 | 0 | 100% | 0.727 | 0.877 | 1.604 | 7.303 | 0.727 | 0 | No losses | 4 | 0 | 27 |
| 2026-11-20 21:00 UTC | 2026-11-21 01:00 UTC | 4 | 4 | 2 | 0 | 50% | 0.132 | -1.396 | -1.264 | 6.039 | 0.132 | 0 | No losses | 2 | 1.831 | 28 |
| 2026-11-21 01:00 UTC | 2026-11-21 05:00 UTC | 4 | 27 | 25 | 2 | 92.593% | 1.755 | 1.038 | 2.793 | 8.831 | 1.947 | 0.192 | 10.14 | 4 | 0 | 29 |
| 2026-11-21 05:00 UTC | 2026-11-21 09:00 UTC | 4 | 21 | 16 | 4 | 76.19% | 0.864 | -1.018 | -0.153 | 8.678 | 1.208 | 0.344 | 3.513 | 2 | 0.973 | 30 |
| 2026-11-21 09:00 UTC | 2026-11-21 13:00 UTC | 4 | 10 | 4 | 6 | 40% | -0.24 | 1.052 | 0.813 | 9.491 | 0.336 | 0.576 | 0.584 | 3 | 0.001 | 28 |
| 2026-11-21 13:00 UTC | 2026-11-21 17:00 UTC | 4 | 24 | 23 | 0 | 95.833% | 1.765 | -0.893 | 0.872 | 10.363 | 1.765 | 0 | No losses | 1 | 0.435 | 29 |
| 2026-11-21 17:00 UTC | 2026-11-21 21:00 UTC | 4 | 0 | 0 | 0 | — | 0 | 0.311 | 0.311 | 10.674 | 0 | 0 | — | 4 | 0 | 30 |
| 2026-11-21 21:00 UTC | 2026-11-22 01:00 UTC | 4 | 0 | 0 | 0 | — | 0 | -0.03 | -0.03 | 10.644 | 0 | 0 | — | 1 | 0.154 | 30 |
| 2026-11-22 01:00 UTC | 2026-11-22 05:00 UTC | 4 | 4 | 4 | 0 | 100% | 0.217 | -0.649 | -0.432 | 10.211 | 0.217 | 0 | No losses | 1 | 0.47 | 26 |
| 2026-11-22 05:00 UTC | 2026-11-22 09:00 UTC | 4 | 3 | 2 | 1 | 66.667% | 0.061 | 0.435 | 0.496 | 10.707 | 0.076 | 0.016 | 4.892 | 2 | 0.278 | 27 |
| 2026-11-22 09:00 UTC | 2026-11-22 13:00 UTC | 4 | 35 | 21 | 13 | 60% | 0.48 | 0.515 | 0.996 | 11.703 | 0.853 | 0.373 | 2.288 | 3 | 0.075 | 0 |

### Indication and range coverage

| Indication | Range | Configurations | Excluded | With prehistory closes | At closes minimum | Best prehistory PF at minimum | Passed gates | Selected symbols | Prehistory signals | Holdout signals | Selected holdout closes | Selected PF | Selected net | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| direction | short | 4,320 | 0 | 4,320 | 2,371 | 3.384 | 101 | 0 | 98 | 119 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| move | short | 4,290 | 30 | 4,290 | 4,290 | 3.632 | 449 | 0 | 1,067 | 1,834 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| break | short | 4,309 | 11 | 4,309 | 4,309 | 20.071 | 774 | 0 | 385 | 548 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| rsi | short | 4,320 | 0 | 4,320 | 285 | 4 | 90 | 0 | 70 | 213 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| macd | short | 4,320 | 0 | 4,176 | 1,411 | 1.581 | 20 | 0 | 80 | 90 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| bollinger | short | 4,320 | 0 | 4,320 | 4,263 | 58.43 | 900 | 0 | 279 | 483 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| ema | short | 4,320 | 0 | 4,320 | 3,467 | 74.536 | 2,022 | 0 | 152 | 351 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| active | short | 4,231 | 89 | 4,231 | 4,231 | 73.96 | 511 | 0 | 468 | 665 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| direction | wide | 3,150 | 0 | 3,150 | 986 | 2.334 | 10 | 0 | 98 | 119 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| move | wide | 3,111 | 39 | 3,111 | 3,111 | 76.702 | 743 | 27 | 1,067 | 1,834 | 413 | 1.793 | 7.429 | Selected on 27 symbols |
| break | wide | 3,146 | 4 | 3,146 | 3,146 | 71.033 | 907 | 2 | 385 | 548 | 25 | 1.025 | 0.015 | Selected on 2 symbols |
| rsi | wide | 3,150 | 0 | 3,150 | 90 | 43.067 | 21 | 0 | 70 | 213 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| macd | wide | 3,150 | 0 | 3,045 | 717 | 1.29 | 0 | 0 | 80 | 90 | 0 | — | 0 | Reached the closes minimum; PF, net or follow-through gate failed |
| bollinger | wide | 3,150 | 0 | 3,150 | 2,732 | 58.196 | 470 | 0 | 279 | 483 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| ema | wide | 3,150 | 0 | 3,150 | 1,659 | 8,827.888 | 937 | 0 | 152 | 351 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| active | wide | 3,121 | 29 | 3,121 | 3,090 | 23.426 | 849 | 1 | 468 | 665 | 6 | 1.391 | 0.066 | Selected on 1 symbol |
| pullback | short | 4,320 | 0 | 4,320 | 1,569 | 12.894 | 555 | 0 | 103 | 235 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| pullback | wide | 3,150 | 0 | 3,150 | 882 | 16.98 | 236 | 0 | 103 | 235 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| rangeFade | short | 4,320 | 0 | 4,320 | 4,176 | 7.691 | 364 | 0 | 217 | 241 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| rangeFade | wide | 3,150 | 0 | 3,150 | 2,959 | 20.763 | 271 | 0 | 217 | 241 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| volumeBreak | short | 4,320 | 0 | 4,032 | 1,728 | 28.134 | 641 | 0 | 95 | 139 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| volumeBreak | wide | 3,150 | 0 | 2,940 | 991 | 193.159 | 411 | 0 | 95 | 139 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| momentumPullback | short | 4,320 | 0 | 4,320 | 4,032 | 52.229 | 1,484 | 0 | 261 | 560 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| momentumPullback | wide | 3,150 | 0 | 3,150 | 2,799 | 13.827 | 1,045 | 0 | 261 | 560 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| squeezeBreak | short | 4,320 | 0 | 4,176 | 3,450 | 41.024 | 826 | 0 | 185 | 222 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| squeezeBreak | wide | 3,150 | 0 | 3,045 | 2,364 | 193.159 | 787 | 0 | 185 | 222 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| rsiRecovery | short | 4,320 | 0 | 2,448 | 144 | 1.307 | 4 | 0 | 30 | 14 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| rsiRecovery | wide | 3,150 | 0 | 1,785 | 32 | 1.912 | 6 | 0 | 30 | 14 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |

### Selections by symbol

| Symbol and configuration | Indication | Range | Costs | Prehistory closes | Prehistory PF | Required PF | Holdout closes | Holdout PF | Holdout net | Holdout drawdown | Positive periods |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BTC-USDT move tp1.60_sl1.25 fixed | move | wide | 0.12% | 8 | No losses | 1.106 | 10 | 1.402 | 0.092 | 0.099 | 52 |
| ETH-USDT move tp2.00_sl1.50 fixed | move | wide | 0.12% | 7 | 2.598 | 1.113 | 10 | 0.843 | -0.046 | 0.132 | 56 |
| SOL-USDT move tp1.80_sl1.00 fixed | move | wide | 0.12% | 7 | 1.607 | 1.113 | 15 | 22.45 | 0.946 | 0.044 | 70 |
| XRP-USDT move tp2.00_sl1.00 fixed | move | wide | 0.12% | 7 | 4.549 | 1.113 | 12 | 2.5 | 0.353 | 0.167 | 59 |
| DOGE-USDT move tp1.40_sl1.50 fixed | move | wide | 0.12% | 9 | 3.806 | 1.1 | 15 | 1.783 | 0.21 | 0.126 | 62 |
| AVAX-USDT move tp1.20_sl1.25 fixed | move | wide | 0.12% | 9 | No losses | 1.1 | 17 | 9.948 | 0.812 | 0.083 | 66 |
| LINK-USDT move tp1.40_sl1.50 fixed | move | wide | 0.12% | 7 | No losses | 1.113 | 16 | 2.095 | 0.329 | 0.157 | 55 |
| BNB-USDT move tp1.80_sl1.00 fixed | move | wide | 0.12% | 9 | No losses | 1.1 | 11 | 1.604 | 0.178 | 0.117 | 56 |
| ARB-USDT move tp1.80_sl1.25 fixed | move | wide | 0.12% | 9 | 5.363 | 1.1 | 12 | 1.064 | 0.022 | 0.186 | 60 |
| SUI-USDT move tp1.60_sl1.50 fixed | move | wide | 0.12% | 9 | No losses | 1.1 | 16 | 3.158 | 0.374 | 0.086 | 65 |
| BCH-USDT move tp1.60_sl1.00 fixed | move | wide | 0.12% | 8 | 4.364 | 1.106 | 17 | 1.456 | 0.227 | 0.159 | 59 |
| LTC-USDT move tp1.80_sl1.00 fixed | move | wide | 0.12% | 8 | No losses | 1.106 | 13 | 4.938 | 0.65 | 0.104 | 65 |
| ADA-USDT move tp1.60_sl1.25 fixed | move | wide | 0.12% | 7 | 1.596 | 1.113 | 13 | 1.359 | 0.127 | 0.148 | 55 |
| HBAR-USDT move tp1.80_sl1.00 fixed | move | wide | 0.12% | 7 | 1.679 | 1.113 | 17 | 2.98 | 0.603 | 0.144 | 64 |
| DOT-USDT move tp2.00_sl1.00 breakeven | move | wide | 0.12% | 9 | 1.694 | 1.1 | 16 | 2.068 | 0.301 | 0.233 | 60 |
| NEAR-USDT move tp1.40_sl1.00 fixed | move | wide | 0.12% | 12 | 10.175 | 1.087 | 19 | 1.21 | 0.126 | 0.204 | 57 |
| AAVE-USDT move tp2.00_sl0.50 breakeven | move | wide | 0.12% | 14 | 2.076 | 1.08 | 18 | 2.568 | 0.787 | 0.18 | 53 |
| UNI-USDT move tp1.60_sl1.00 fixed | move | wide | 0.12% | 7 | 33.371 | 1.113 | 15 | 1.653 | 0.249 | 0.161 | 57 |
| ATOM-USDT move tp2.00_sl1.00 fixed | move | wide | 0.12% | 6 | 2.949 | 1.122 | 11 | 0.629 | -0.166 | 0.279 | 46 |
| FIL-USDT move tp1.40_sl1.25 fixed | move | wide | 0.12% | 9 | No losses | 1.1 | 19 | 0.817 | -0.109 | 0.269 | 50 |
| INJ-USDT active tp2.00_sl1.25 fixed | active | wide | 0.12% | 6 | No losses | 1.122 | 6 | 1.391 | 0.066 | 0.097 | 28 |
| OP-USDT move tp1.20_sl1.25 fixed | move | wide | 0.12% | 8 | 15.772 | 1.106 | 25 | 0.945 | -0.043 | 0.333 | 51 |
| ETC-USDT move tp1.80_sl1.00 fixed | move | wide | 0.12% | 7 | No losses | 1.113 | 13 | 0.884 | -0.047 | 0.299 | 54 |
| APT-USDT move tp1.40_sl1.25 fixed | move | wide | 0.12% | 8 | No losses | 1.106 | 16 | 0.778 | -0.13 | 0.235 | 47 |
| SEI-USDT move tp1.60_sl1.25 fixed | move | wide | 0.12% | 7 | 28.979 | 1.113 | 19 | 3.325 | 0.658 | 0.126 | 61 |
| WLD-USDT move tp1.60_sl1.00 fixed | move | wide | 0.12% | 9 | 6.792 | 1.1 | 15 | 1.908 | 0.32 | 0.197 | 61 |
| ALGO-USDT move tp1.40_sl1.50 fixed | move | wide | 0.12% | 8 | 3.751 | 1.106 | 19 | 2.647 | 0.439 | 0.116 | 71 |
| XLM-USDT move tp1.80_sl1.25 fixed | move | wide | 0.12% | 7 | 3.103 | 1.113 | 14 | 1.567 | 0.168 | 0.088 | 68 |
| TRX-USDT break tp2.00_sl1.25 breakeven | break | wide | 0.12% | 8 | 4.504 | 1.106 | 15 | 0.373 | -0.274 | 0.294 | 30 |
| FET-USDT break tp2.00_sl1.25 fixed | break | wide | 0.12% | 6 | 5.387 | 1.122 | 10 | 2.857 | 0.289 | 0.173 | 49 |
