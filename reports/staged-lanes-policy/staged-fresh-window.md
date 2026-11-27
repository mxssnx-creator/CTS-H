# CTS-H replay · period report

## bingx-x01 · 1h · staged · 2026-07-20 13:00 UTC

- Source: https://open-api.bingx.com
- Symbols with complete coverage: 60 of 60
- Holdout: 240h starting 2026-07-10 13:00 UTC; prehistory: 72h starting 2026-07-07 13:00 UTC
- Holdout result: -2.634 net, 141 closes, PF 0.58, 76 of 240 periods positive, drawdown 2.746
- Configurations scored: 314,640; failed preselection: 307,479; excluded by calibration: 0
- Strategy actions: Axis 0, Block 0, DCA 0, Relate 0
- Slippage: 1 bp per fill; costs and fee fallbacks: none
- Capture and cost SHA-256: 161e9134fea5e7adb05c9d4d2feecda037bebc593b02ce2c7b2f50be4687e57b

### Holdout by 4-hour period (UTC, from 2026-07-10 13:00 UTC)

| UTC period start | UTC period end | Hours | Closes | Wins | Losses | Win rate | Realized | MTM change | Net | Cumulative net | Gross profit | Gross loss | Trade PF | Positive hours | Period drawdown | Open legs at end |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-10 13:00 UTC | 2026-07-10 17:00 UTC | 4 | 25 | 3 | 22 | 12% | -1.731 | -0.386 | -2.117 | -2.117 | 0.278 | 2.009 | 0.138 | 0 | 2.117 | 21 |
| 2026-07-10 17:00 UTC | 2026-07-10 21:00 UTC | 4 | 9 | 2 | 6 | 22.222% | -0.499 | 0.187 | -0.312 | -2.429 | 0.077 | 0.576 | 0.133 | 2 | 0.312 | 23 |
| 2026-07-10 21:00 UTC | 2026-07-11 01:00 UTC | 4 | 6 | 3 | 2 | 50% | -0.045 | 0.162 | 0.117 | -2.312 | 0.138 | 0.183 | 0.754 | 3 | 0.197 | 21 |
| 2026-07-11 01:00 UTC | 2026-07-11 05:00 UTC | 4 | 11 | 8 | 3 | 72.727% | 0.32 | -0.009 | 0.311 | -2.001 | 0.529 | 0.209 | 2.531 | 3 | 0.056 | 17 |
| 2026-07-11 05:00 UTC | 2026-07-11 09:00 UTC | 4 | 4 | 3 | 1 | 75% | 0.003 | -0.109 | -0.106 | -2.107 | 0.099 | 0.096 | 1.029 | 1 | 0.167 | 17 |
| 2026-07-11 09:00 UTC | 2026-07-11 13:00 UTC | 4 | 6 | 5 | 1 | 83.333% | 0.102 | 0.038 | 0.139 | -1.968 | 0.198 | 0.096 | 2.061 | 3 | 0.037 | 17 |
| 2026-07-11 13:00 UTC | 2026-07-11 17:00 UTC | 4 | 9 | 4 | 4 | 44.444% | -0.132 | 0.031 | -0.101 | -2.068 | 0.185 | 0.317 | 0.583 | 3 | 0.142 | 18 |
| 2026-07-11 17:00 UTC | 2026-07-11 21:00 UTC | 4 | 6 | 4 | 2 | 66.667% | 0.128 | 0.025 | 0.152 | -1.916 | 0.286 | 0.158 | 1.808 | 3 | 0.079 | 19 |
| 2026-07-11 21:00 UTC | 2026-07-12 01:00 UTC | 4 | 9 | 2 | 7 | 22.222% | -0.421 | 0.003 | -0.418 | -2.334 | 0.235 | 0.656 | 0.358 | 0 | 0.418 | 17 |
| 2026-07-12 01:00 UTC | 2026-07-12 05:00 UTC | 4 | 5 | 2 | 3 | 40% | -0.083 | 0.106 | 0.023 | -2.311 | 0.205 | 0.288 | 0.712 | 3 | 0.171 | 19 |
| 2026-07-12 05:00 UTC | 2026-07-12 09:00 UTC | 4 | 4 | 3 | 1 | 75% | 0.049 | -0.063 | -0.014 | -2.325 | 0.145 | 0.096 | 1.511 | 2 | 0.07 | 18 |
| 2026-07-12 09:00 UTC | 2026-07-12 13:00 UTC | 4 | 4 | 1 | 3 | 25% | -0.259 | 0.006 | -0.252 | -2.577 | 0.018 | 0.277 | 0.065 | 1 | 0.252 | 16 |
| 2026-07-12 13:00 UTC | 2026-07-12 17:00 UTC | 4 | 1 | 1 | 0 | 100% | 0.079 | -0.02 | 0.058 | -2.519 | 0.079 | 0 | No losses | 2 | 0.045 | 19 |
| 2026-07-12 17:00 UTC | 2026-07-12 21:00 UTC | 4 | 0 | 0 | 0 | — | 0 | -0.097 | -0.097 | -2.616 | 0 | 0 | 1.00 | 2 | 0.19 | 23 |
| 2026-07-12 21:00 UTC | 2026-07-13 01:00 UTC | 4 | 6 | 5 | 1 | 83.333% | 0.104 | 0.153 | 0.257 | -2.359 | 0.2 | 0.096 | 2.087 | 2 | 0.095 | 4 |
| 2026-07-13 01:00 UTC | 2026-07-13 05:00 UTC | 4 | 3 | 2 | 1 | 66.667% | 0.006 | -0.041 | -0.035 | -2.394 | 0.102 | 0.096 | 1.06 | 2 | 0.051 | 27 |
| 2026-07-13 05:00 UTC | 2026-07-13 09:00 UTC | 4 | 3 | 2 | 1 | 66.667% | -0.004 | -0.052 | -0.056 | -2.45 | 0.092 | 0.096 | 0.961 | 3 | 0.127 | 25 |
| 2026-07-13 09:00 UTC | 2026-07-13 13:00 UTC | 4 | 0 | 0 | 0 | — | 0 | 0.022 | 0.022 | -2.428 | 0 | 0 | 1.00 | 2 | 0.005 | 25 |
| 2026-07-13 13:00 UTC | 2026-07-13 17:00 UTC | 4 | 4 | 2 | 2 | 50% | -0.1 | 0.049 | -0.052 | -2.479 | 0.088 | 0.188 | 0.466 | 2 | 0.07 | 17 |
| 2026-07-13 17:00 UTC | 2026-07-13 21:00 UTC | 4 | 2 | 2 | 0 | 100% | 0.112 | -0.048 | 0.065 | -2.415 | 0.112 | 0 | No losses | 1 | 0.043 | 19 |
| 2026-07-13 21:00 UTC | 2026-07-14 01:00 UTC | 4 | 3 | 1 | 2 | 33.333% | -0.16 | 0.043 | -0.117 | -2.532 | 0.032 | 0.192 | 0.169 | 0 | 0.117 | 12 |
| 2026-07-14 01:00 UTC | 2026-07-14 05:00 UTC | 4 | 0 | 0 | 0 | — | 0 | 0 | 0 | -2.532 | 0 | 0 | 1.00 | 0 | 0 | 18 |
| 2026-07-14 05:00 UTC | 2026-07-14 09:00 UTC | 4 | 1 | 1 | 0 | 100% | 0.031 | 0.029 | 0.06 | -2.471 | 0.031 | 0 | No losses | 2 | 0 | 16 |
| 2026-07-14 09:00 UTC | 2026-07-14 13:00 UTC | 4 | 2 | 1 | 1 | 50% | -0.038 | -0.029 | -0.067 | -2.538 | 0.058 | 0.096 | 0.609 | 1 | 0.107 | 3 |
| 2026-07-14 13:00 UTC | 2026-07-14 17:00 UTC | 4 | 0 | 0 | 0 | — | 0 | 0.016 | 0.016 | -2.522 | 0 | 0 | 1.00 | 1 | 0 | 13 |
| 2026-07-14 17:00 UTC | 2026-07-14 21:00 UTC | 4 | 1 | 1 | 0 | 100% | 0.03 | -0.016 | 0.013 | -2.508 | 0.03 | 0 | No losses | 1 | 0.015 | 18 |
| 2026-07-14 21:00 UTC | 2026-07-15 01:00 UTC | 4 | 0 | 0 | 0 | — | 0 | 0 | 0 | -2.508 | 0 | 0 | 1.00 | 0 | 0 | 18 |
| 2026-07-15 01:00 UTC | 2026-07-15 05:00 UTC | 4 | 1 | 0 | 1 | 0% | -0.096 | 0 | -0.096 | -2.604 | 0 | 0.096 | 0 | 0 | 0.096 | 16 |
| 2026-07-15 05:00 UTC | 2026-07-15 09:00 UTC | 4 | 0 | 0 | 0 | — | 0 | 0 | 0 | -2.604 | 0 | 0 | 1.00 | 0 | 0 | 24 |
| 2026-07-15 09:00 UTC | 2026-07-15 13:00 UTC | 4 | 2 | 2 | 0 | 100% | 0.089 | 0 | 0.089 | -2.515 | 0.089 | 0 | No losses | 2 | 0 | 5 |
| 2026-07-15 13:00 UTC | 2026-07-15 17:00 UTC | 4 | 1 | 1 | 0 | 100% | 0.003 | 0 | 0.003 | -2.512 | 0.003 | 0 | No losses | 1 | 0.009 | 2 |
| 2026-07-15 17:00 UTC | 2026-07-15 21:00 UTC | 4 | 0 | 0 | 0 | — | 0 | -0.04 | -0.04 | -2.552 | 0 | 0 | 1.00 | 1 | 0.04 | 17 |
| 2026-07-15 21:00 UTC | 2026-07-16 01:00 UTC | 4 | 0 | 0 | 0 | — | 0 | 0.04 | 0.04 | -2.513 | 0 | 0 | 1.00 | 3 | 0.004 | 18 |
| 2026-07-16 01:00 UTC | 2026-07-16 05:00 UTC | 4 | 1 | 1 | 0 | 100% | 0.028 | 0 | 0.028 | -2.484 | 0.028 | 0 | No losses | 1 | 0 | 21 |
| 2026-07-16 05:00 UTC | 2026-07-16 09:00 UTC | 4 | 0 | 0 | 0 | — | 0 | 0 | 0 | -2.484 | 0 | 0 | 1.00 | 0 | 0 | 10 |
| 2026-07-16 09:00 UTC | 2026-07-16 13:00 UTC | 4 | 0 | 0 | 0 | — | 0 | 0 | 0 | -2.484 | 0 | 0 | 1.00 | 0 | 0 | 16 |
| 2026-07-16 13:00 UTC | 2026-07-16 17:00 UTC | 4 | 1 | 0 | 1 | 0% | -0.096 | 0 | -0.096 | -2.58 | 0 | 0.096 | 0 | 0 | 0.096 | 16 |
| 2026-07-16 17:00 UTC | 2026-07-16 21:00 UTC | 4 | 0 | 0 | 0 | — | 0 | 0 | 0 | -2.58 | 0 | 0 | 1.00 | 0 | 0 | 19 |
| 2026-07-16 21:00 UTC | 2026-07-17 01:00 UTC | 4 | 2 | 2 | 0 | 100% | 0.054 | -0.041 | 0.013 | -2.567 | 0.054 | 0 | No losses | 2 | 0.041 | 10 |
| 2026-07-17 01:00 UTC | 2026-07-17 05:00 UTC | 4 | 1 | 0 | 0 | 0% | 0 | 0.018 | 0.018 | -2.549 | 0 | 0 | 1.00 | 1 | 0.054 | 20 |
| 2026-07-17 05:00 UTC | 2026-07-17 09:00 UTC | 4 | 1 | 0 | 1 | 0% | -0.096 | -0.025 | -0.121 | -2.67 | 0 | 0.096 | 0 | 0 | 0.121 | 8 |
| 2026-07-17 09:00 UTC | 2026-07-17 13:00 UTC | 4 | 1 | 0 | 1 | 0% | -0.096 | 0.048 | -0.048 | -2.718 | 0 | 0.096 | 0 | 0 | 0.048 | 14 |
| 2026-07-17 13:00 UTC | 2026-07-17 17:00 UTC | 4 | 0 | 0 | 0 | — | 0 | 0 | 0 | -2.718 | 0 | 0 | 1.00 | 0 | 0 | 9 |
| 2026-07-17 17:00 UTC | 2026-07-17 21:00 UTC | 4 | 0 | 0 | 0 | — | 0 | 0 | 0 | -2.718 | 0 | 0 | 1.00 | 0 | 0 | 16 |
| 2026-07-17 21:00 UTC | 2026-07-18 01:00 UTC | 4 | 0 | 0 | 0 | — | 0 | 0 | 0 | -2.718 | 0 | 0 | 1.00 | 0 | 0 | 20 |
| 2026-07-18 01:00 UTC | 2026-07-18 05:00 UTC | 4 | 0 | 0 | 0 | — | 0 | 0 | 0 | -2.718 | 0 | 0 | 1.00 | 0 | 0 | 19 |
| 2026-07-18 05:00 UTC | 2026-07-18 09:00 UTC | 4 | 0 | 0 | 0 | — | 0 | 0 | 0 | -2.718 | 0 | 0 | 1.00 | 0 | 0 | 18 |
| 2026-07-18 09:00 UTC | 2026-07-18 13:00 UTC | 4 | 0 | 0 | 0 | — | 0 | 0 | 0 | -2.718 | 0 | 0 | 1.00 | 0 | 0 | 12 |
| 2026-07-18 13:00 UTC | 2026-07-18 17:00 UTC | 4 | 0 | 0 | 0 | — | 0 | 0.05 | 0.05 | -2.668 | 0 | 0 | 1.00 | 3 | 0.008 | 20 |
| 2026-07-18 17:00 UTC | 2026-07-18 21:00 UTC | 4 | 0 | 0 | 0 | — | 0 | 0.01 | 0.01 | -2.658 | 0 | 0 | 1.00 | 3 | 0.019 | 22 |
| 2026-07-18 21:00 UTC | 2026-07-19 01:00 UTC | 4 | 0 | 0 | 0 | — | 0 | 0.044 | 0.044 | -2.614 | 0 | 0 | 1.00 | 3 | 0.048 | 18 |
| 2026-07-19 01:00 UTC | 2026-07-19 05:00 UTC | 4 | 1 | 1 | 0 | 100% | 0.161 | -0.104 | 0.058 | -2.557 | 0.161 | 0 | No losses | 2 | 0.07 | 21 |
| 2026-07-19 05:00 UTC | 2026-07-19 09:00 UTC | 4 | 0 | 0 | 0 | — | 0 | 0 | 0 | -2.557 | 0 | 0 | 1.00 | 0 | 0 | 17 |
| 2026-07-19 09:00 UTC | 2026-07-19 13:00 UTC | 4 | 0 | 0 | 0 | — | 0 | 0 | 0 | -2.557 | 0 | 0 | 1.00 | 0 | 0 | 17 |
| 2026-07-19 13:00 UTC | 2026-07-19 17:00 UTC | 4 | 1 | 0 | 1 | 0% | -0.096 | 0 | -0.096 | -2.653 | 0 | 0.096 | 0 | 1 | 0.102 | 16 |
| 2026-07-19 17:00 UTC | 2026-07-19 21:00 UTC | 4 | 0 | 0 | 0 | — | 0 | -0.041 | -0.041 | -2.694 | 0 | 0 | 1.00 | 0 | 0.041 | 19 |
| 2026-07-19 21:00 UTC | 2026-07-20 01:00 UTC | 4 | 1 | 0 | 1 | 0% | -0.067 | 0.04 | -0.027 | -2.721 | 0 | 0.067 | 0 | 3 | 0.087 | 8 |
| 2026-07-20 01:00 UTC | 2026-07-20 05:00 UTC | 4 | 0 | 0 | 0 | — | 0 | 0.009 | 0.009 | -2.712 | 0 | 0 | 1.00 | 2 | 0.026 | 17 |
| 2026-07-20 05:00 UTC | 2026-07-20 09:00 UTC | 4 | 1 | 1 | 0 | 100% | 0.029 | -0.026 | 0.003 | -2.71 | 0.029 | 0 | No losses | 1 | 0.019 | 15 |
| 2026-07-20 09:00 UTC | 2026-07-20 13:00 UTC | 4 | 2 | 2 | 0 | 100% | 0.057 | 0.019 | 0.076 | -2.634 | 0.057 | 0 | No losses | 2 | 0 | 0 |

### Prehistory by 4-hour period (UTC, from 2026-07-07 13:00 UTC)

| UTC period start | UTC period end | Hours | Closes | Wins | Losses | Win rate | Realized | MTM change | Net | Cumulative net | Gross profit | Gross loss | Trade PF | Positive hours | Period drawdown | Open legs at end |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-07 13:00 UTC | 2026-07-07 17:00 UTC | 4 | 32 | 28 | 4 | 87.5% | 1.716 | -0.003 | 1.713 | 1.713 | 2.017 | 0.3 | 6.714 | 3 | 0 | 19 |
| 2026-07-07 17:00 UTC | 2026-07-07 21:00 UTC | 4 | 31 | 18 | 11 | 58.065% | 0.321 | -0.055 | 0.266 | 1.979 | 1.116 | 0.795 | 1.403 | 2 | 0.049 | 19 |
| 2026-07-07 21:00 UTC | 2026-07-08 01:00 UTC | 4 | 22 | 15 | 7 | 68.182% | 0.414 | -0.043 | 0.371 | 2.351 | 0.997 | 0.583 | 1.711 | 1 | 0.267 | 22 |
| 2026-07-08 01:00 UTC | 2026-07-08 05:00 UTC | 4 | 39 | 33 | 6 | 84.615% | 1.695 | 0.387 | 2.082 | 4.433 | 2.271 | 0.576 | 3.943 | 4 | 0 | 27 |
| 2026-07-08 05:00 UTC | 2026-07-08 09:00 UTC | 4 | 28 | 23 | 5 | 82.143% | 1.28 | 0.166 | 1.446 | 5.879 | 1.726 | 0.446 | 3.868 | 3 | 0.228 | 11 |
| 2026-07-08 09:00 UTC | 2026-07-08 13:00 UTC | 4 | 22 | 14 | 6 | 63.636% | 0.567 | -0.358 | 0.209 | 6.088 | 0.994 | 0.428 | 2.325 | 3 | 0.324 | 20 |
| 2026-07-08 13:00 UTC | 2026-07-08 17:00 UTC | 4 | 25 | 16 | 7 | 64% | 0.689 | -0.464 | 0.225 | 6.313 | 1.31 | 0.622 | 2.108 | 2 | 0.857 | 17 |
| 2026-07-08 17:00 UTC | 2026-07-08 21:00 UTC | 4 | 16 | 12 | 4 | 75% | 0.419 | 0.708 | 1.127 | 7.44 | 0.803 | 0.384 | 2.092 | 4 | 0 | 21 |
| 2026-07-08 21:00 UTC | 2026-07-09 01:00 UTC | 4 | 17 | 13 | 3 | 76.471% | 0.602 | -0.596 | 0.006 | 7.446 | 0.89 | 0.288 | 3.092 | 1 | 0.137 | 23 |
| 2026-07-09 01:00 UTC | 2026-07-09 05:00 UTC | 4 | 39 | 25 | 14 | 64.103% | 0.288 | 0.488 | 0.776 | 8.222 | 1.271 | 0.982 | 1.294 | 3 | 0.022 | 16 |
| 2026-07-09 05:00 UTC | 2026-07-09 09:00 UTC | 4 | 28 | 23 | 5 | 82.143% | 0.962 | -0.211 | 0.752 | 8.974 | 1.442 | 0.48 | 3.005 | 2 | 0.282 | 24 |
| 2026-07-09 09:00 UTC | 2026-07-09 13:00 UTC | 4 | 20 | 13 | 5 | 65% | 0.374 | 0.07 | 0.444 | 9.418 | 0.728 | 0.354 | 2.056 | 3 | 0.02 | 19 |
| 2026-07-09 13:00 UTC | 2026-07-09 17:00 UTC | 4 | 29 | 21 | 6 | 72.414% | 0.485 | -0.231 | 0.254 | 9.673 | 0.942 | 0.457 | 2.061 | 3 | 0.146 | 26 |
| 2026-07-09 17:00 UTC | 2026-07-09 21:00 UTC | 4 | 24 | 14 | 8 | 58.333% | 0.281 | -0.049 | 0.232 | 9.904 | 0.804 | 0.523 | 1.537 | 2 | 0.117 | 32 |
| 2026-07-09 21:00 UTC | 2026-07-10 01:00 UTC | 4 | 24 | 20 | 2 | 83.333% | 0.957 | -0.09 | 0.866 | 10.771 | 1.149 | 0.192 | 5.983 | 3 | 0.05 | 22 |
| 2026-07-10 01:00 UTC | 2026-07-10 05:00 UTC | 4 | 38 | 33 | 3 | 86.842% | 2.312 | 0.338 | 2.65 | 13.421 | 2.595 | 0.283 | 9.167 | 4 | 0 | 34 |
| 2026-07-10 05:00 UTC | 2026-07-10 09:00 UTC | 4 | 32 | 30 | 0 | 93.75% | 1.835 | 0.303 | 2.138 | 15.559 | 1.835 | 0 | No losses | 4 | 0 | 19 |
| 2026-07-10 09:00 UTC | 2026-07-10 13:00 UTC | 4 | 45 | 45 | 0 | 100% | 2.697 | -0.361 | 2.336 | 17.895 | 2.697 | 0 | No losses | 4 | 0 | 0 |

### Staged lanes

Policy: PF is net of round-trip costs, so 1.00 is neutral. Each lane needs PF ≥ max(lane floor, 1 + 1 × costs/gross loss), plus auto PF 0.15 over 4 closes; net positive required; ratchet 0.05 per thin stage; 5 per-relation floors set (others 1).

Base → Main → Thin 1 → Thin 2. 314,640 candidate cells; 7,161 validated by the final stage; 57 chosen (up to 1 per market). 141 booked closes; 1,568 blocked entries tracked as shadows (shadow PF 0.664).

| Stage | Input cells | Validated | Vetoed | Retained | Median PF in | Median PF out | Relation out/in |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Base | 314,640 | 7,575 | 153,590 | 2.408% | 0.612 | 4 | 6.534 |
| Main | 7,575 | 7,575 | 0 | 100% | 4 | 4 | 1 |
| Thin 1 | 7,575 | 7,494 | 81 | 98.931% | 4 | 4 | 1 |
| Thin 2 | 7,494 | 7,161 | 333 | 95.556% | 4 | 4 | 1 |

| Stage | Lane | Window | Mode | Floor (before cost and auto PF) | Evidence | Confirmed | Vetoed | Net positive | Median PF |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Base | long10 | 10 | both | 1.15 | 161,165 | 21,776 | 139,389 | 40,433 | 0.54 |
| Base | long20 | 20 | both | 1 | 161,165 | 20,903 | 140,262 | 38,862 | 0.547 |
| Base | long30 | 30 | both | 1 | 161,165 | 20,890 | 140,275 | 38,790 | 0.553 |
| Base | short4 | 4 | both | 1.3 | 161,165 | 30,442 | 130,723 | 50,350 | 0.531 |
| Base | short8 | 8 | both | 1.5 | 161,165 | 18,979 | 142,186 | 40,669 | 0.532 |
| Base | last1 | 1 | both | 1 | 161,165 | 74,826 | 86,339 | 74,826 | 1 |
| Base | last2 | 2 | both | 1 | 161,165 | 52,657 | 108,508 | 61,823 | 0.562 |
| Base | last3 | 3 | both | 1.5 | 161,165 | 36,587 | 124,578 | 54,542 | 0.545 |
| Base | last4 | 4 | both | 1 | 161,165 | 31,236 | 129,929 | 50,350 | 0.531 |
| Main | short8 | 8 | positive | 1.5 | 7,575 | 7,575 | 0 | 7,575 | 4 |
| Main | short12 | 12 | positive | 1 | 7,575 | 7,563 | 0 | 7,575 | 4 |
| Main | short16 | 16 | positive | 1 | 7,575 | 7,568 | 0 | 7,573 | 4 |
| Main | last1 | 1 | both | 1 | 7,575 | 7,575 | 0 | 7,575 | 4 |
| Main | last2 | 2 | both | 1 | 7,575 | 7,575 | 0 | 7,575 | 4 |
| Main | last3 | 3 | both | 1.5 | 7,575 | 7,575 | 0 | 7,575 | 4 |
| Main | last4 | 4 | both | 1 | 7,575 | 7,575 | 0 | 7,575 | 4 |
| Thin 1 | short8 | 8 | positive | 1.55 | 7,575 | 7,375 | 0 | 7,575 | 4 |
| Thin 1 | short10 | 10 | positive | 1.05 | 7,575 | 7,453 | 0 | 7,575 | 4 |
| Thin 1 | short12 | 12 | positive | 1.05 | 7,575 | 7,446 | 0 | 7,575 | 4 |
| Thin 1 | short14 | 14 | positive | 1.05 | 7,575 | 7,450 | 0 | 7,575 | 4 |
| Thin 1 | short16 | 16 | positive | 1.05 | 7,575 | 7,443 | 0 | 7,573 | 4 |
| Thin 1 | last1 | 1 | both | 1.05 | 7,575 | 7,575 | 0 | 7,575 | 4 |
| Thin 1 | last2 | 2 | both | 1.05 | 7,575 | 7,551 | 24 | 7,575 | 4 |
| Thin 1 | last3 | 3 | both | 1.55 | 7,575 | 7,544 | 31 | 7,575 | 4 |
| Thin 1 | last4 | 4 | both | 1.05 | 7,575 | 7,547 | 28 | 7,575 | 4 |
| Thin 2 | short8 | 8 | positive | 1.6 | 7,494 | 7,117 | 0 | 7,494 | 4 |
| Thin 2 | short9 | 9 | positive | 1.1 | 7,494 | 7,288 | 0 | 7,494 | 4 |
| Thin 2 | short10 | 10 | positive | 1.1 | 7,494 | 7,287 | 0 | 7,494 | 4 |
| Thin 2 | short11 | 11 | positive | 1.1 | 7,494 | 7,285 | 0 | 7,494 | 4 |
| Thin 2 | short12 | 12 | positive | 1.1 | 7,494 | 7,270 | 0 | 7,494 | 4 |
| Thin 2 | short13 | 13 | positive | 1.1 | 7,494 | 7,268 | 0 | 7,494 | 4 |
| Thin 2 | short14 | 14 | positive | 1.1 | 7,494 | 7,271 | 0 | 7,494 | 4 |
| Thin 2 | short15 | 15 | positive | 1.1 | 7,494 | 7,264 | 0 | 7,493 | 4 |
| Thin 2 | short16 | 16 | positive | 1.1 | 7,494 | 7,264 | 0 | 7,492 | 4 |
| Thin 2 | last1 | 1 | both | 1.1 | 7,494 | 7,494 | 0 | 7,494 | 4 |
| Thin 2 | last2 | 2 | both | 1.1 | 7,494 | 7,481 | 13 | 7,494 | 4 |
| Thin 2 | last3 | 3 | both | 1.6 | 7,494 | 7,470 | 24 | 7,494 | 4 |
| Thin 2 | last4 | 4 | both | 1.1 | 7,494 | 7,466 | 28 | 7,494 | 4 |
| Thin 2 | long10 | 10 | both | 1.25 | 7,494 | 7,286 | 208 | 7,494 | 4 |
| Thin 2 | long15 | 15 | both | 1.1 | 7,494 | 7,264 | 230 | 7,493 | 4 |
| Thin 2 | long20 | 20 | both | 1.1 | 7,494 | 7,267 | 227 | 7,494 | 4 |
| Thin 2 | long25 | 25 | both | 1.5 | 7,494 | 7,237 | 257 | 7,494 | 4 |
| Thin 2 | long30 | 30 | both | 1.1 | 7,494 | 7,266 | 228 | 7,494 | 4 |

| Cell | Closes prehistory | PF prehistory | Closes holdout | PF holdout | Net holdout | Shadow entries | Shadow PF |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BTC-USDT squeezeBreak tp0.60_sl1.50 dynamic | 8 | 5.863 | 1 | 0 | -0.049 | 21 | 0.29 |
| ETH-USDT ema tp1.60_sl0.75 dynamic | 6 | 4 | 1 | 0 | -0.096 | 12 | 1.589 |
| SOL-USDT squeezeBreak tp0.80_sl0.75 fixed | 6 | 4.67 | 1 | 0 | -0.071 | 19 | 0.151 |
| DOGE-USDT move tp0.58_sl2.00 fixed | 20 | 3.03 | 1 | 0 | -0.096 | 67 | 0.492 |
| AVAX-USDT move tp1.60_sl1.00 dynamic | 8 | 4 | 1 | 0 | -0.096 | 44 | 0.619 |
| LINK-USDT move tp0.58_sl2.50 fixed | 20 | 5.399 | 1 | 0 | -0.096 | 61 | 0.588 |
| BNB-USDT ema tp0.52_sl2.50 fixed | 9 | 4 | 1 | 0 | -0.089 | 25 | 0.264 |
| ARB-USDT break tp1.40_sl1.25 fixed | 7 | 4 | 4 | 2.193 | 0.115 | 12 | 0.714 |
| SUI-USDT ema tp1.60_sl0.50 dynamic | 6 | 5.516 | 4 | 0.196 | -0.15 | 21 | 0.482 |
| BCH-USDT break tp2.00_sl0.50 fixed | 6 | 3.356 | 1 | 0 | -0.096 | 20 | 0.764 |
| LTC-USDT active tp1.20_sl0.50 breakeven | 9 | 1.826 | 1 | 0 | -0.061 | 39 | 0.41 |
| ADA-USDT ema tp0.48_sl1.75 fixed | 6 | 1.953 | 1 | 0 | -0.096 | 24 | 0.34 |
| HBAR-USDT vwapReclaim tp0.52_sl1.25 fixed | 6 | 2.551 | 1 | 0 | -0.08 | 16 | 0.553 |
| DOT-USDT move tp0.58_sl2.50 fixed | 19 | 2.596 | 1 | 0 | -0.096 | 54 | 0.79 |
| NEAR-USDT move tp1.60_sl1.25 dynamic | 9 | 4 | 3 | 1.079 | 0.008 | 30 | 0.369 |
| AAVE-USDT break tp0.48_sl2.50 fixed | 11 | 3.005 | 1 | 0 | -0.096 | 38 | 1.126 |
| UNI-USDT rangeFade tp2.00_sl0.50 fixed | 6 | 3.576 | 4 | 0.561 | -0.127 | 15 | 1.423 |
| ATOM-USDT ema tp0.60_sl2.50 fixed | 8 | 4 | 1 | 0 | -0.096 | 11 | 0.712 |
| FIL-USDT active tp1.20_sl1.50 fixed | 6 | 4 | 5 | 0.82 | -0.035 | 11 | 1.645 |
| INJ-USDT rangeFade tp1.00_sl0.50 fixed | 8 | 1.693 | 3 | 0.813 | -0.032 | 22 | 0.898 |
| OP-USDT momentumPullback tp1.40_sl0.50 breakeven | 7 | 5.485 | 1 | 0 | -0.096 | 37 | 0.61 |
| ETC-USDT momentumPullback tp1.20_sl1.50 dynamic | 8 | 2.032 | 1 | 0 | -0.096 | 22 | 0.818 |
| APT-USDT vwapReclaim tp0.55_sl2.50 fixed | 7 | 1.943 | 6 | 1.426 | 0.041 | 2 | 0.489 |
| SEI-USDT move tp1.20_sl0.50 dynamic | 25 | 2.261 | 1 | 0 | -0.096 | 88 | 0.411 |
| WLD-USDT stochRsi tp1.00_sl1.00 fixed | 6 | 1.723 | 2 | 0.841 | -0.015 | 31 | 0.831 |
| ALGO-USDT active tp0.50_sl1.50 fixed | 15 | 6.101 | 4 | 1.341 | 0.026 | 48 | 0.448 |
| XLM-USDT active tp1.40_sl0.50 fixed | 11 | 2.178 | 3 | 0.79 | -0.04 | 49 | 0.492 |
| FET-USDT vwapReclaim tp0.52_sl1.25 dynamic | 7 | 4.544 | 1 | 0 | -0.096 | 25 | 0.286 |
| GRT-USDT active tp1.20_sl1.25 fixed | 7 | 4 | 3 | 1.267 | 0.026 | 29 | 0.546 |
| STX-USDT pullback tp0.60_sl1.00 fixed | 6 | 4 | 4 | 0.763 | -0.035 | 14 | 1.317 |
| RUNE-USDT move tp2.50_sl0.75 dynamic | 6 | 4 | 2 | 0.602 | -0.038 | 25 | 0.911 |
| TIA-USDT vwapReclaim tp1.60_sl0.50 dynamic | 6 | 2.849 | 3 | 1.948 | 0.091 | 15 | 0.77 |
| JUP-USDT stochRsi tp0.80_sl0.75 fixed | 12 | 2.019 | 1 | 0 | -0.096 | 32 | 0.868 |
| ONDO-USDT move tp2.00_sl0.50 fixed | 9 | 1.863 | 1 | 0 | -0.096 | 38 | 0.73 |
| IMX-USDT stochRsi tp1.20_sl1.00 fixed | 7 | 5.175 | 6 | 1.649 | 0.125 | 27 | 0.737 |
| ENS-USDT momentumPullback tp0.58_sl2.00 fixed | 13 | 4.424 | 12 | 3.434 | 0.234 | 19 | 0.48 |
| LDO-USDT donchian tp1.20_sl0.50 dynamic | 6 | 2.904 | 2 | 1.678 | 0.065 | 10 | 0.354 |
| SAND-USDT move tp1.00_sl1.50 breakeven | 18 | 8.443 | 3 | 2.566 | 0.03 | 60 | 0.489 |
| MANA-USDT bollinger tp1.20_sl1.25 dynamic | 6 | 2.995 | 9 | 2.945 | 0.187 | 6 | 2.731 |
| DYDX-USDT break tp1.80_sl0.75 breakeven | 6 | 4.352 | 1 | 1 | -0 | 23 | 0.58 |
| CRV-USDT pullback tp0.52_sl1.00 fixed | 6 | 4 | 2 | 0 | -0.185 | 10 | 1.054 |
| ZEC-USDT squeezeBreak tp0.80_sl0.75 fixed | 10 | 2.38 | 1 | 0 | -0.096 | 24 | 0.744 |
| DASH-USDT break tp1.80_sl0.50 breakeven | 8 | 2.235 | 1 | 0 | -0.096 | 23 | 0.503 |
| PENDLE-USDT stochRsi tp1.60_sl0.50 dynamic | 12 | 1.871 | 3 | 0.861 | -0.027 | 35 | 0.725 |
| COMP-USDT active tp1.00_sl1.00 fixed | 6 | 3.302 | 2 | 0.745 | -0.025 | 10 | 0.249 |
| ZRX-USDT bollinger tp1.20_sl0.75 dynamic | 6 | 3.686 | 1 | 0 | -0.096 | 20 | 1.088 |
| NEO-USDT move tp2.00_sl1.25 fixed | 6 | 2.943 | 1 | 0 | -0.096 | 17 | 0.945 |
| 1000PEPE-USDT move tp1.60_sl0.50 breakeven | 13 | 1.693 | 2 | 0 | -0.192 | 67 | 0.786 |
| ZRO-USDT stochRsi tp1.00_sl1.50 breakeven | 10 | 25.061 | 3 | 1.167 | 0.016 | 25 | 0.605 |
| BOME-USDT rangeFade tp1.00_sl0.75 dynamic | 6 | 3.39 | 1 | 0 | -0.09 | 16 | 0.948 |
| HYPE-USDT move tp1.80_sl1.25 breakeven | 7 | 4 | 3 | 0 | -0.096 | 23 | 1.64 |
| ETHFI-USDT active tp0.60_sl1.00 breakeven | 10 | 3.728 | 1 | 0 | -0.096 | 16 | 0.891 |
| BANANA-USDT move tp0.80_sl1.25 fixed | 13 | 2.407 | 6 | 0.655 | -0.099 | 65 | 0.924 |
| STRK-USDT ema tp1.20_sl1.00 fixed | 6 | 4.228 | 1 | 0 | -0.096 | 13 | 0.671 |
| DYM-USDT pullback tp0.60_sl1.00 fixed | 6 | 3.626 | 1 | 0 | -0.09 | 18 | 0.826 |
| GALA-USDT active tp0.55_sl2.50 fixed | 8 | 2.174 | 7 | 1.715 | 0.069 | 10 | 2.591 |
| CFX-USDT rangeFade tp0.60_sl0.75 fixed | 6 | 4.081 | 2 | 0.612 | -0.024 | 14 | 0.701 |

### Indication and range coverage

| Indication | Range | Configurations | Excluded | With prehistory closes | At closes minimum | Best prehistory PF at minimum | Passed gates | Selected symbols | Prehistory signals | Holdout signals | Selected holdout closes | Selected PF | Selected net | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| direction | short | 8,640 | 0 | 8,640 | 2,339 | 0 | 64 | 0 | 187 | 656 | 0 | 1.00 | 0 | Passed the gates but was not the best configuration on any symbol |
| move | short | 8,640 | 0 | 8,640 | 8,640 | 0 | 9 | 3 | 2,092 | 7,244 | 3 | 0 | -0.288 | Selected on 3 symbols |
| break | short | 8,640 | 0 | 8,640 | 8,496 | 0 | 237 | 1 | 554 | 1,994 | 1 | 0 | -0.096 | Selected on 1 symbol |
| rsi | short | 8,640 | 0 | 7,056 | 1,092 | 0 | 77 | 0 | 120 | 769 | 0 | 1.00 | 0 | Passed the gates but was not the best configuration on any symbol |
| macd | short | 8,640 | 0 | 8,352 | 1,131 | 0 | 0 | 0 | 127 | 523 | 0 | 1.00 | 0 | Reached the closes minimum; PF, net or follow-through gate failed |
| bollinger | short | 8,640 | 0 | 8,640 | 8,260 | 0 | 492 | 0 | 548 | 1,666 | 0 | 1.00 | 0 | Passed the gates but was not the best configuration on any symbol |
| ema | short | 8,640 | 0 | 8,640 | 7,867 | 0 | 334 | 3 | 580 | 2,043 | 3 | 0 | -0.281 | Selected on 3 symbols |
| active | short | 8,640 | 0 | 8,640 | 8,640 | 0 | 98 | 3 | 822 | 2,385 | 12 | 0.995 | -0.001 | Selected on 3 symbols |
| direction | wide | 7,920 | 0 | 7,920 | 1,094 | 0 | 12 | 0 | 187 | 656 | 0 | 1.00 | 0 | Passed the gates but was not the best configuration on any symbol |
| move | wide | 7,920 | 0 | 7,920 | 7,588 | 0 | 208 | 10 | 2,092 | 7,244 | 23 | 0.341 | -0.772 | Selected on 10 symbols |
| break | wide | 7,920 | 0 | 7,920 | 6,481 | 0 | 276 | 4 | 554 | 1,994 | 7 | 0.731 | -0.077 | Selected on 4 symbols |
| rsi | wide | 7,920 | 0 | 6,468 | 465 | 0 | 65 | 0 | 120 | 769 | 0 | 1.00 | 0 | Passed the gates but was not the best configuration on any symbol |
| macd | wide | 7,920 | 0 | 7,656 | 421 | 0 | 22 | 0 | 127 | 523 | 0 | 1.00 | 0 | Passed the gates but was not the best configuration on any symbol |
| bollinger | wide | 7,920 | 0 | 7,920 | 5,322 | 0 | 330 | 2 | 548 | 1,666 | 10 | 1.473 | 0.091 | Selected on 2 symbols |
| ema | wide | 7,920 | 0 | 7,920 | 4,494 | 0 | 228 | 3 | 580 | 2,043 | 6 | 0.096 | -0.342 | Selected on 3 symbols |
| active | wide | 7,920 | 0 | 7,920 | 7,072 | 0 | 326 | 5 | 822 | 2,385 | 14 | 0.789 | -0.134 | Selected on 5 symbols |
| pullback | short | 8,640 | 0 | 8,640 | 5,510 | 0 | 530 | 3 | 277 | 894 | 7 | 0.266 | -0.31 | Selected on 3 symbols |
| pullback | wide | 7,920 | 0 | 7,920 | 3,061 | 0 | 271 | 0 | 277 | 894 | 0 | 1.00 | 0 | Passed the gates but was not the best configuration on any symbol |
| rangeFade | short | 8,640 | 0 | 8,640 | 7,910 | 0 | 552 | 1 | 362 | 1,092 | 2 | 0.612 | -0.024 | Selected on 1 symbol |
| rangeFade | wide | 7,920 | 0 | 7,920 | 5,319 | 0 | 375 | 3 | 362 | 1,092 | 8 | 0.548 | -0.248 | Selected on 3 symbols |
| volumeBreak | short | 8,640 | 0 | 7,344 | 1,440 | 0 | 214 | 0 | 124 | 355 | 0 | 1.00 | 0 | Passed the gates but was not the best configuration on any symbol |
| volumeBreak | wide | 7,920 | 0 | 6,732 | 699 | 0 | 23 | 0 | 124 | 355 | 0 | 1.00 | 0 | Passed the gates but was not the best configuration on any symbol |
| momentumPullback | short | 8,640 | 0 | 8,640 | 8,412 | 0 | 268 | 1 | 674 | 2,439 | 12 | 3.434 | 0.234 | Selected on 1 symbol |
| momentumPullback | wide | 7,920 | 0 | 7,920 | 6,183 | 0 | 253 | 2 | 674 | 2,439 | 2 | 0 | -0.192 | Selected on 2 symbols |
| squeezeBreak | short | 8,640 | 0 | 8,352 | 5,748 | 0 | 265 | 1 | 322 | 1,123 | 1 | 0 | -0.049 | Selected on 1 symbol |
| squeezeBreak | wide | 7,920 | 0 | 7,656 | 4,161 | 0 | 213 | 2 | 322 | 1,123 | 2 | 0 | -0.167 | Selected on 2 symbols |
| rsiRecovery | short | 8,640 | 0 | 4,608 | 565 | 0 | 80 | 0 | 72 | 116 | 0 | 1.00 | 0 | Passed the gates but was not the best configuration on any symbol |
| rsiRecovery | wide | 7,920 | 0 | 4,224 | 185 | 0 | 58 | 0 | 72 | 116 | 0 | 1.00 | 0 | Passed the gates but was not the best configuration on any symbol |
| donchian | short | 8,640 | 0 | 8,496 | 3,426 | 0 | 380 | 0 | 205 | 558 | 0 | 1.00 | 0 | Passed the gates but was not the best configuration on any symbol |
| donchian | wide | 7,920 | 0 | 7,788 | 2,126 | 0 | 156 | 1 | 205 | 558 | 2 | 1.678 | 0.065 | Selected on 1 symbol |
| supertrend | short | 8,640 | 0 | 8,064 | 0 | — | 0 | 0 | 110 | 321 | 0 | 1.00 | 0 | Below the 4-close minimum in the prehistory |
| supertrend | wide | 7,920 | 0 | 7,392 | 0 | — | 0 | 0 | 110 | 321 | 0 | 1.00 | 0 | Below the 4-close minimum in the prehistory |
| vwapReclaim | short | 8,640 | 0 | 8,496 | 6,822 | 0 | 341 | 3 | 428 | 1,512 | 8 | 0.503 | -0.135 | Selected on 3 symbols |
| vwapReclaim | wide | 7,920 | 0 | 7,788 | 3,636 | 0 | 132 | 1 | 428 | 1,512 | 3 | 1.948 | 0.091 | Selected on 1 symbol |
| adxDi | short | 8,640 | 0 | 6,624 | 620 | 0 | 19 | 0 | 103 | 416 | 0 | 1.00 | 0 | Passed the gates but was not the best configuration on any symbol |
| adxDi | wide | 7,920 | 0 | 6,072 | 220 | 0 | 7 | 0 | 103 | 416 | 0 | 1.00 | 0 | Passed the gates but was not the best configuration on any symbol |
| stochRsi | short | 8,640 | 0 | 8,640 | 8,640 | 0 | 63 | 0 | 799 | 2,555 | 0 | 1.00 | 0 | Passed the gates but was not the best configuration on any symbol |
| stochRsi | wide | 7,920 | 0 | 7,920 | 7,080 | 0 | 183 | 5 | 799 | 2,555 | 15 | 1.004 | 0.003 | Selected on 5 symbols |

### Selections by symbol

| Symbol and configuration | Indication | Range | Costs | Prehistory closes | Prehistory PF | Required PF | Holdout closes | Holdout PF | Holdout net | Holdout drawdown | Positive periods |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BTC-USDT squeezeBreak tp0.60_sl1.50 dynamic | squeezeBreak | short | 0.12% | 8 | 5.863 | 1 | 1 | 0 | -0.049 | 0.049 | 0 |
| ETH-USDT ema tp1.60_sl0.75 dynamic | ema | wide | 0.12% | 6 | No losses | 1 | 1 | 0 | -0.096 | 0.096 | 0 |
| SOL-USDT squeezeBreak tp0.80_sl0.75 fixed | squeezeBreak | wide | 0.12% | 6 | 4.67 | 1 | 1 | 0 | -0.071 | 0.071 | 0 |
| DOGE-USDT move tp0.58_sl2.00 fixed | move | short | 0.12% | 20 | 3.03 | 1 | 1 | 0 | -0.096 | 0.096 | 0 |
| AVAX-USDT move tp1.60_sl1.00 dynamic | move | wide | 0.12% | 8 | No losses | 1 | 1 | 0 | -0.096 | 0.096 | 0 |
| LINK-USDT move tp0.58_sl2.50 fixed | move | short | 0.12% | 20 | 5.399 | 1 | 1 | 0 | -0.096 | 0.096 | 0 |
| BNB-USDT ema tp0.52_sl2.50 fixed | ema | short | 0.12% | 9 | No losses | 1 | 1 | 0 | -0.089 | 0.089 | 0 |
| ARB-USDT break tp1.40_sl1.25 fixed | break | wide | 0.12% | 7 | No losses | 1 | 4 | 2.193 | 0.115 | 0.134 | 17 |
| SUI-USDT ema tp1.60_sl0.50 dynamic | ema | wide | 0.12% | 6 | 5.516 | 1 | 4 | 0.196 | -0.15 | 0.15 | 5 |
| BCH-USDT break tp2.00_sl0.50 fixed | break | wide | 0.12% | 6 | 3.356 | 1 | 1 | 0 | -0.096 | 0.096 | 0 |
| LTC-USDT active tp1.20_sl0.50 breakeven | active | wide | 0.12% | 9 | 1.826 | 1 | 1 | 0 | -0.061 | 0.061 | 0 |
| ADA-USDT ema tp0.48_sl1.75 fixed | ema | short | 0.12% | 6 | 1.953 | 1 | 1 | 0 | -0.096 | 0.096 | 0 |
| HBAR-USDT vwapReclaim tp0.52_sl1.25 fixed | vwapReclaim | short | 0.12% | 6 | 2.551 | 1 | 1 | 0 | -0.08 | 0.08 | 0 |
| DOT-USDT move tp0.58_sl2.50 fixed | move | short | 0.12% | 19 | 2.596 | 1 | 1 | 0 | -0.096 | 0.096 | 0 |
| NEAR-USDT move tp1.60_sl1.25 dynamic | move | wide | 0.12% | 9 | No losses | 1 | 3 | 1.079 | 0.008 | 0.096 | 17 |
| AAVE-USDT break tp0.48_sl2.50 fixed | break | short | 0.12% | 11 | 3.005 | 1 | 1 | 0 | -0.096 | 0.096 | 0 |
| UNI-USDT rangeFade tp2.00_sl0.50 fixed | rangeFade | wide | 0.12% | 6 | 3.576 | 1 | 4 | 0.561 | -0.127 | 0.2 | 12 |
| ATOM-USDT ema tp0.60_sl2.50 fixed | ema | short | 0.12% | 8 | No losses | 1 | 1 | 0 | -0.096 | 0.096 | 4 |
| FIL-USDT active tp1.20_sl1.50 fixed | active | wide | 0.12% | 6 | No losses | 1 | 5 | 0.82 | -0.035 | 0.107 | 13 |
| INJ-USDT rangeFade tp1.00_sl0.50 fixed | rangeFade | wide | 0.12% | 8 | 1.693 | 1 | 3 | 0.813 | -0.032 | 0.087 | 2 |
| OP-USDT momentumPullback tp1.40_sl0.50 breakeven | momentumPullback | wide | 0.12% | 7 | 5.485 | 1 | 1 | 0 | -0.096 | 0.096 | 0 |
| ETC-USDT momentumPullback tp1.20_sl1.50 dynamic | momentumPullback | wide | 0.12% | 8 | 2.032 | 1 | 1 | 0 | -0.096 | 0.096 | 0 |
| APT-USDT vwapReclaim tp0.55_sl2.50 fixed | vwapReclaim | short | 0.12% | 7 | 1.943 | 1 | 6 | 1.426 | 0.041 | 0.096 | 20 |
| SEI-USDT move tp1.20_sl0.50 dynamic | move | wide | 0.12% | 25 | 2.261 | 1 | 1 | 0 | -0.096 | 0.096 | 0 |
| WLD-USDT stochRsi tp1.00_sl1.00 fixed | stochRsi | wide | 0.12% | 6 | 1.723 | 1 | 2 | 0.841 | -0.015 | 0.161 | 8 |
| ALGO-USDT active tp0.50_sl1.50 fixed | active | short | 0.12% | 15 | 6.101 | 1 | 4 | 1.341 | 0.026 | 0.076 | 4 |
| XLM-USDT active tp1.40_sl0.50 fixed | active | wide | 0.12% | 11 | 2.178 | 1 | 3 | 0.79 | -0.04 | 0.192 | 1 |
| FET-USDT vwapReclaim tp0.52_sl1.25 dynamic | vwapReclaim | short | 0.12% | 7 | 4.544 | 1 | 1 | 0 | -0.096 | 0.096 | 0 |
| GRT-USDT active tp1.20_sl1.25 fixed | active | wide | 0.12% | 7 | No losses | 1 | 3 | 1.267 | 0.026 | 0.096 | 9 |
| STX-USDT pullback tp0.60_sl1.00 fixed | pullback | short | 0.12% | 6 | No losses | 1 | 4 | 0.763 | -0.035 | 0.088 | 3 |
| RUNE-USDT move tp2.50_sl0.75 dynamic | move | wide | 0.12% | 6 | No losses | 1 | 2 | 0.602 | -0.038 | 0.136 | 17 |
| TIA-USDT vwapReclaim tp1.60_sl0.50 dynamic | vwapReclaim | wide | 0.12% | 6 | 2.849 | 1 | 3 | 1.948 | 0.091 | 0.096 | 4 |
| JUP-USDT stochRsi tp0.80_sl0.75 fixed | stochRsi | wide | 0.12% | 12 | 2.019 | 1 | 1 | 0 | -0.096 | 0.096 | 0 |
| ONDO-USDT move tp2.00_sl0.50 fixed | move | wide | 0.12% | 9 | 1.863 | 1 | 1 | 0 | -0.096 | 0.096 | 0 |
| IMX-USDT stochRsi tp1.20_sl1.00 fixed | stochRsi | wide | 0.12% | 7 | 5.175 | 1 | 6 | 1.649 | 0.125 | 0.137 | 17 |
| ENS-USDT momentumPullback tp0.58_sl2.00 fixed | momentumPullback | short | 0.12% | 13 | 4.424 | 1 | 12 | 3.434 | 0.234 | 0.096 | 21 |
| LDO-USDT donchian tp1.20_sl0.50 dynamic | donchian | wide | 0.12% | 6 | 2.904 | 1 | 2 | 1.678 | 0.065 | 0.096 | 1 |
| SAND-USDT move tp1.00_sl1.50 breakeven | move | wide | 0.12% | 18 | 8.443 | 1 | 3 | 2.566 | 0.03 | 0.058 | 4 |
| MANA-USDT bollinger tp1.20_sl1.25 dynamic | bollinger | wide | 0.12% | 6 | 2.995 | 1 | 9 | 2.945 | 0.187 | 0.105 | 15 |
| DYDX-USDT break tp1.80_sl0.75 breakeven | break | wide | 0.12% | 6 | 4.352 | 1 | 1 | 1.00 | -0 | 0.056 | 5 |
| CRV-USDT pullback tp0.52_sl1.00 fixed | pullback | short | 0.12% | 6 | No losses | 1 | 2 | 0 | -0.185 | 0.185 | 0 |
| ZEC-USDT squeezeBreak tp0.80_sl0.75 fixed | squeezeBreak | wide | 0.12% | 10 | 2.38 | 1 | 1 | 0 | -0.096 | 0.096 | 0 |
| DASH-USDT break tp1.80_sl0.50 breakeven | break | wide | 0.12% | 8 | 2.235 | 1 | 1 | 0 | -0.096 | 0.096 | 1 |
| PENDLE-USDT stochRsi tp1.60_sl0.50 dynamic | stochRsi | wide | 0.12% | 12 | 1.871 | 1 | 3 | 0.861 | -0.027 | 0.237 | 9 |
| COMP-USDT active tp1.00_sl1.00 fixed | active | wide | 0.12% | 6 | 3.302 | 1 | 2 | 0.745 | -0.025 | 0.096 | 1 |
| ZRX-USDT bollinger tp1.20_sl0.75 dynamic | bollinger | wide | 0.12% | 6 | 3.686 | 1 | 1 | 0 | -0.096 | 0.096 | 0 |
| NEO-USDT move tp2.00_sl1.25 fixed | move | wide | 0.12% | 6 | 2.943 | 1 | 1 | 0 | -0.096 | 0.096 | 0 |
| 1000PEPE-USDT move tp1.60_sl0.50 breakeven | move | wide | 0.12% | 13 | 1.693 | 1 | 2 | 0 | -0.192 | 0.192 | 0 |
| ZRO-USDT stochRsi tp1.00_sl1.50 breakeven | stochRsi | wide | 0.12% | 10 | 25.061 | 1 | 3 | 1.167 | 0.016 | 0.096 | 7 |
| BOME-USDT rangeFade tp1.00_sl0.75 dynamic | rangeFade | wide | 0.12% | 6 | 3.39 | 1 | 1 | 0 | -0.09 | 0.09 | 0 |
| HYPE-USDT move tp1.80_sl1.25 breakeven | move | wide | 0.12% | 7 | No losses | 1 | 3 | 0 | -0.096 | 0.152 | 13 |
| ETHFI-USDT active tp0.60_sl1.00 breakeven | active | short | 0.12% | 10 | 3.728 | 1 | 1 | 0 | -0.096 | 0.096 | 0 |
| BANANA-USDT move tp0.80_sl1.25 fixed | move | wide | 0.12% | 13 | 2.407 | 1 | 6 | 0.655 | -0.099 | 0.226 | 6 |
| STRK-USDT ema tp1.20_sl1.00 fixed | ema | wide | 0.12% | 6 | 4.228 | 1 | 1 | 0 | -0.096 | 0.096 | 0 |
| DYM-USDT pullback tp0.60_sl1.00 fixed | pullback | short | 0.12% | 6 | 3.626 | 1 | 1 | 0 | -0.09 | 0.09 | 0 |
| GALA-USDT active tp0.55_sl2.50 fixed | active | short | 0.12% | 8 | 2.174 | 1 | 7 | 1.715 | 0.069 | 0.137 | 11 |
| CFX-USDT rangeFade tp0.60_sl0.75 fixed | rangeFade | short | 0.12% | 6 | 4.081 | 1 | 2 | 0.612 | -0.024 | 0.062 | 1 |
