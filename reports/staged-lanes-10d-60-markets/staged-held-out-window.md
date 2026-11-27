# CTS-H replay · period report

## bingx-x01 · 1h · staged · 2026-10-08 13:00 UTC

- Source: https://open-api.bingx.com
- Symbols with complete coverage: 60 of 60
- Holdout: 240h starting 2026-09-28 13:00 UTC; prehistory: 72h starting 2026-09-25 13:00 UTC
- Holdout result: -2.93 net, 262 closes, PF 0.78, 100 of 240 periods positive, drawdown 4.038
- Configurations scored: 314,640; failed preselection: 296,085; excluded by calibration: 0
- Strategy actions: Axis 0, Block 0, DCA 0, Relate 0
- Slippage: 1 bp per fill; costs and fee fallbacks: none
- Capture and cost SHA-256: 348b2e1fd19ca7d61d1d72229b761f7e143697df380a5a7473d044e893d0748c

### Holdout by 4-hour period (UTC, from 2026-09-28 13:00 UTC)

| UTC period start | UTC period end | Hours | Closes | Wins | Losses | Win rate | Realized | MTM change | Net | Cumulative net | Gross profit | Gross loss | Trade PF | Positive hours | Period drawdown | Open legs at end |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-09-28 13:00 UTC | 2026-09-28 17:00 UTC | 4 | 41 | 15 | 25 | 36.585% | -1.069 | 0.155 | -0.914 | -0.914 | 1.242 | 2.311 | 0.537 | 1 | 1.9 | 9 |
| 2026-09-28 17:00 UTC | 2026-09-28 21:00 UTC | 4 | 15 | 5 | 9 | 33.333% | -0.486 | -0.507 | -0.993 | -1.907 | 0.289 | 0.775 | 0.373 | 2 | 1.161 | 34 |
| 2026-09-28 21:00 UTC | 2026-09-29 01:00 UTC | 4 | 12 | 1 | 10 | 8.333% | -0.826 | 0.431 | -0.395 | -2.302 | 0.056 | 0.881 | 0.063 | 2 | 0.574 | 19 |
| 2026-09-29 01:00 UTC | 2026-09-29 05:00 UTC | 4 | 10 | 8 | 2 | 80% | 0.818 | -0.031 | 0.786 | -1.516 | 0.919 | 0.101 | 9.105 | 4 | 0 | 30 |
| 2026-09-29 05:00 UTC | 2026-09-29 09:00 UTC | 4 | 8 | 6 | 2 | 75% | 0.46 | -0.045 | 0.415 | -1.101 | 0.652 | 0.192 | 3.394 | 3 | 0.216 | 15 |
| 2026-09-29 09:00 UTC | 2026-09-29 13:00 UTC | 4 | 13 | 5 | 8 | 38.462% | -0.303 | -0.179 | -0.482 | -1.583 | 0.373 | 0.676 | 0.552 | 1 | 0.519 | 21 |
| 2026-09-29 13:00 UTC | 2026-09-29 17:00 UTC | 4 | 7 | 3 | 3 | 42.857% | 0.071 | 0.381 | 0.452 | -1.131 | 0.283 | 0.212 | 1.335 | 2 | 0.073 | 29 |
| 2026-09-29 17:00 UTC | 2026-09-29 21:00 UTC | 4 | 5 | 1 | 4 | 20% | -0.298 | -0.37 | -0.667 | -1.799 | 0.086 | 0.384 | 0.225 | 2 | 0.842 | 27 |
| 2026-09-29 21:00 UTC | 2026-09-30 01:00 UTC | 4 | 3 | 0 | 3 | 0% | -0.288 | 0.108 | -0.18 | -1.978 | 0 | 0.288 | 0 | 2 | 0.18 | 23 |
| 2026-09-30 01:00 UTC | 2026-09-30 05:00 UTC | 4 | 5 | 3 | 2 | 60% | 0.099 | 0.063 | 0.162 | -1.816 | 0.291 | 0.192 | 1.517 | 3 | 0.188 | 28 |
| 2026-09-30 05:00 UTC | 2026-09-30 09:00 UTC | 4 | 0 | 0 | 0 | — | 0 | 0.045 | 0.045 | -1.772 | 0 | 0 | — | 2 | 0.129 | 36 |
| 2026-09-30 09:00 UTC | 2026-09-30 13:00 UTC | 4 | 13 | 7 | 6 | 53.846% | 0.09 | -0.073 | 0.017 | -1.755 | 0.51 | 0.42 | 1.214 | 1 | 0.104 | 7 |
| 2026-09-30 13:00 UTC | 2026-09-30 17:00 UTC | 4 | 12 | 6 | 6 | 50% | 0.16 | 0.139 | 0.299 | -1.456 | 0.651 | 0.491 | 1.326 | 1 | 0.425 | 15 |
| 2026-09-30 17:00 UTC | 2026-09-30 21:00 UTC | 4 | 5 | 1 | 3 | 20% | -0.126 | -0.194 | -0.32 | -1.776 | 0.162 | 0.288 | 0.561 | 1 | 0.353 | 21 |
| 2026-09-30 21:00 UTC | 2026-10-01 01:00 UTC | 4 | 2 | 2 | 0 | 100% | 0.049 | 0.242 | 0.292 | -1.485 | 0.049 | 0 | No losses | 4 | 0 | 27 |
| 2026-10-01 01:00 UTC | 2026-10-01 05:00 UTC | 4 | 6 | 3 | 2 | 50% | -0.033 | -0.068 | -0.101 | -1.586 | 0.159 | 0.192 | 0.829 | 2 | 0.218 | 29 |
| 2026-10-01 05:00 UTC | 2026-10-01 09:00 UTC | 4 | 3 | 1 | 1 | 33.333% | -0.062 | -0.166 | -0.229 | -1.814 | 0.034 | 0.096 | 0.353 | 1 | 0.232 | 32 |
| 2026-10-01 09:00 UTC | 2026-10-01 13:00 UTC | 4 | 6 | 3 | 3 | 50% | 0.112 | 0.112 | 0.224 | -1.59 | 0.347 | 0.235 | 1.477 | 2 | 0.06 | 24 |
| 2026-10-01 13:00 UTC | 2026-10-01 17:00 UTC | 4 | 8 | 2 | 6 | 25% | -0.45 | -0.104 | -0.554 | -2.144 | 0.126 | 0.576 | 0.218 | 0 | 0.554 | 16 |
| 2026-10-01 17:00 UTC | 2026-10-01 21:00 UTC | 4 | 3 | 1 | 2 | 33.333% | -0.029 | 0.025 | -0.004 | -2.148 | 0.163 | 0.192 | 0.848 | 2 | 0.048 | 25 |
| 2026-10-01 21:00 UTC | 2026-10-02 01:00 UTC | 4 | 1 | 0 | 1 | 0% | -0.096 | -0.04 | -0.136 | -2.284 | 0 | 0.096 | 0 | 0 | 0.136 | 23 |
| 2026-10-02 01:00 UTC | 2026-10-02 05:00 UTC | 4 | 2 | 1 | 1 | 50% | 0.077 | 0.077 | 0.153 | -2.131 | 0.173 | 0.096 | 1.8 | 3 | 0.032 | 5 |
| 2026-10-02 05:00 UTC | 2026-10-02 09:00 UTC | 4 | 3 | 0 | 3 | 0% | -0.288 | -0.046 | -0.334 | -2.464 | 0 | 0.288 | 0 | 1 | 0.334 | 17 |
| 2026-10-02 09:00 UTC | 2026-10-02 13:00 UTC | 4 | 4 | 0 | 4 | 0% | -0.384 | 0.046 | -0.338 | -2.803 | 0 | 0.384 | 0 | 1 | 0.338 | 15 |
| 2026-10-02 13:00 UTC | 2026-10-02 17:00 UTC | 4 | 2 | 0 | 2 | 0% | -0.192 | 0.01 | -0.182 | -2.985 | 0 | 0.192 | 0 | 1 | 0.182 | 19 |
| 2026-10-02 17:00 UTC | 2026-10-02 21:00 UTC | 4 | 1 | 1 | 0 | 100% | 0.121 | -0.018 | 0.103 | -2.882 | 0.121 | 0 | No losses | 2 | 0.022 | 19 |
| 2026-10-02 21:00 UTC | 2026-10-03 01:00 UTC | 4 | 3 | 2 | 1 | 66.667% | 0.011 | 0.148 | 0.159 | -2.723 | 0.107 | 0.096 | 1.115 | 2 | 0.056 | 22 |
| 2026-10-03 01:00 UTC | 2026-10-03 05:00 UTC | 4 | 4 | 4 | 0 | 100% | 0.395 | -0.161 | 0.234 | -2.489 | 0.395 | 0 | No losses | 3 | 0.064 | 17 |
| 2026-10-03 05:00 UTC | 2026-10-03 09:00 UTC | 4 | 1 | 1 | 0 | 100% | 0.154 | 0.072 | 0.226 | -2.263 | 0.154 | 0 | No losses | 3 | 0.028 | 29 |
| 2026-10-03 09:00 UTC | 2026-10-03 13:00 UTC | 4 | 2 | 2 | 0 | 100% | 0.274 | -0.068 | 0.205 | -2.058 | 0.274 | 0 | No losses | 3 | 0.018 | 24 |
| 2026-10-03 13:00 UTC | 2026-10-03 17:00 UTC | 4 | 4 | 1 | 3 | 25% | -0.098 | -0.019 | -0.117 | -2.175 | 0.177 | 0.274 | 0.644 | 1 | 0.117 | 29 |
| 2026-10-03 17:00 UTC | 2026-10-03 21:00 UTC | 4 | 1 | 0 | 1 | 0% | -0.096 | 0.04 | -0.056 | -2.23 | 0 | 0.096 | 0 | 2 | 0.069 | 34 |
| 2026-10-03 21:00 UTC | 2026-10-04 01:00 UTC | 4 | 1 | 1 | 0 | 100% | 0.053 | -0.049 | 0.005 | -2.226 | 0.053 | 0 | No losses | 3 | 0.015 | 26 |
| 2026-10-04 01:00 UTC | 2026-10-04 05:00 UTC | 4 | 2 | 1 | 1 | 50% | 0.059 | -0.068 | -0.009 | -2.235 | 0.121 | 0.062 | 1.96 | 1 | 0.022 | 32 |
| 2026-10-04 05:00 UTC | 2026-10-04 09:00 UTC | 4 | 5 | 1 | 4 | 20% | -0.332 | 0.145 | -0.187 | -2.422 | 0.034 | 0.366 | 0.092 | 1 | 0.187 | 23 |
| 2026-10-04 09:00 UTC | 2026-10-04 13:00 UTC | 4 | 3 | 1 | 2 | 33.333% | 0.024 | -0.062 | -0.038 | -2.46 | 0.178 | 0.153 | 1.159 | 2 | 0.216 | 21 |
| 2026-10-04 13:00 UTC | 2026-10-04 17:00 UTC | 4 | 2 | 0 | 2 | 0% | -0.192 | 0.031 | -0.161 | -2.621 | 0 | 0.192 | 0 | 0 | 0.161 | 15 |
| 2026-10-04 17:00 UTC | 2026-10-04 21:00 UTC | 4 | 1 | 1 | 0 | 100% | 0.037 | 0 | 0.037 | -2.584 | 0.037 | 0 | No losses | 1 | 0 | 21 |
| 2026-10-04 21:00 UTC | 2026-10-05 01:00 UTC | 4 | 1 | 0 | 1 | 0% | -0.096 | -0.049 | -0.145 | -2.729 | 0 | 0.096 | 0 | 1 | 0.146 | 18 |
| 2026-10-05 01:00 UTC | 2026-10-05 05:00 UTC | 4 | 3 | 1 | 2 | 33.333% | -0.078 | 0.049 | -0.029 | -2.758 | 0.097 | 0.175 | 0.555 | 2 | 0.189 | 8 |
| 2026-10-05 05:00 UTC | 2026-10-05 09:00 UTC | 4 | 4 | 4 | 0 | 100% | 0.566 | 0 | 0.566 | -2.193 | 0.566 | 0 | No losses | 3 | 0 | 13 |
| 2026-10-05 09:00 UTC | 2026-10-05 13:00 UTC | 4 | 0 | 0 | 0 | — | 0 | 0.043 | 0.043 | -2.15 | 0 | 0 | — | 2 | 0.075 | 19 |
| 2026-10-05 13:00 UTC | 2026-10-05 17:00 UTC | 4 | 4 | 2 | 2 | 50% | 0.065 | -0.055 | 0.01 | -2.14 | 0.257 | 0.192 | 1.34 | 2 | 0.267 | 19 |
| 2026-10-05 17:00 UTC | 2026-10-05 21:00 UTC | 4 | 2 | 0 | 2 | 0% | -0.185 | 0.058 | -0.127 | -2.268 | 0 | 0.185 | 0 | 1 | 0.133 | 18 |
| 2026-10-05 21:00 UTC | 2026-10-06 01:00 UTC | 4 | 0 | 0 | 0 | — | 0 | -0.118 | -0.118 | -2.386 | 0 | 0 | — | 0 | 0.118 | 22 |
| 2026-10-06 01:00 UTC | 2026-10-06 05:00 UTC | 4 | 2 | 1 | 1 | 50% | 0.015 | 0.206 | 0.221 | -2.164 | 0.111 | 0.096 | 1.157 | 3 | 0.012 | 21 |
| 2026-10-06 05:00 UTC | 2026-10-06 09:00 UTC | 4 | 2 | 1 | 1 | 50% | 0.07 | -0.206 | -0.136 | -2.301 | 0.166 | 0.096 | 1.731 | 1 | 0.169 | 23 |
| 2026-10-06 09:00 UTC | 2026-10-06 13:00 UTC | 4 | 1 | 0 | 1 | 0% | -0.096 | 0.073 | -0.023 | -2.323 | 0 | 0.096 | 0 | 0 | 0.023 | 21 |
| 2026-10-06 13:00 UTC | 2026-10-06 17:00 UTC | 4 | 0 | 0 | 0 | — | 0 | 0 | 0 | -2.323 | 0 | 0 | — | 0 | 0 | 26 |
| 2026-10-06 17:00 UTC | 2026-10-06 21:00 UTC | 4 | 2 | 0 | 2 | 0% | -0.181 | 0 | -0.181 | -2.505 | 0 | 0.181 | 0 | 1 | 0.192 | 21 |
| 2026-10-06 21:00 UTC | 2026-10-07 01:00 UTC | 4 | 0 | 0 | 0 | — | 0 | 0.018 | 0.018 | -2.487 | 0 | 0 | — | 2 | 0.021 | 26 |
| 2026-10-07 01:00 UTC | 2026-10-07 05:00 UTC | 4 | 4 | 1 | 3 | 25% | -0.116 | -0.019 | -0.136 | -2.623 | 0.172 | 0.288 | 0.596 | 1 | 0.289 | 19 |
| 2026-10-07 05:00 UTC | 2026-10-07 09:00 UTC | 4 | 1 | 1 | 0 | 100% | 0.114 | -0.03 | 0.084 | -2.538 | 0.114 | 0 | No losses | 2 | 0.119 | 23 |
| 2026-10-07 09:00 UTC | 2026-10-07 13:00 UTC | 4 | 5 | 2 | 3 | 40% | -0.009 | 0.026 | 0.016 | -2.522 | 0.279 | 0.288 | 0.967 | 1 | 0.169 | 18 |
| 2026-10-07 13:00 UTC | 2026-10-07 17:00 UTC | 4 | 2 | 0 | 2 | 0% | -0.176 | 0.108 | -0.068 | -2.591 | 0 | 0.176 | 0 | 3 | 0.248 | 22 |
| 2026-10-07 17:00 UTC | 2026-10-07 21:00 UTC | 4 | 3 | 1 | 2 | 33.333% | -0.032 | -0.103 | -0.135 | -2.726 | 0.16 | 0.192 | 0.832 | 1 | 0.204 | 21 |
| 2026-10-07 21:00 UTC | 2026-10-08 01:00 UTC | 4 | 1 | 0 | 1 | 0% | -0.096 | -0.008 | -0.104 | -2.83 | 0 | 0.096 | 0 | 2 | 0.104 | 18 |
| 2026-10-08 01:00 UTC | 2026-10-08 05:00 UTC | 4 | 2 | 1 | 1 | 50% | 0.023 | -0.049 | -0.026 | -2.856 | 0.119 | 0.096 | 1.235 | 2 | 0.108 | 5 |
| 2026-10-08 05:00 UTC | 2026-10-08 09:00 UTC | 4 | 2 | 0 | 2 | 0% | -0.192 | 0.057 | -0.135 | -2.991 | 0 | 0.192 | 0 | 0 | 0.135 | 22 |
| 2026-10-08 09:00 UTC | 2026-10-08 13:00 UTC | 4 | 2 | 1 | 1 | 50% | 0.061 | 0 | 0.061 | -2.93 | 0.157 | 0.096 | 1.636 | 2 | 0.061 | 0 |

### Prehistory by 4-hour period (UTC, from 2026-09-25 13:00 UTC)

| UTC period start | UTC period end | Hours | Closes | Wins | Losses | Win rate | Realized | MTM change | Net | Cumulative net | Gross profit | Gross loss | Trade PF | Positive hours | Period drawdown | Open legs at end |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-09-25 13:00 UTC | 2026-09-25 17:00 UTC | 4 | 17 | 12 | 5 | 70.588% | 0.817 | 0.259 | 1.076 | 1.076 | 0.927 | 0.111 | 8.39 | 3 | 0 | 12 |
| 2026-09-25 17:00 UTC | 2026-09-25 21:00 UTC | 4 | 21 | 14 | 6 | 66.667% | 1.013 | -0.13 | 0.884 | 1.959 | 1.501 | 0.487 | 3.079 | 3 | 0.004 | 24 |
| 2026-09-25 21:00 UTC | 2026-09-26 01:00 UTC | 4 | 30 | 17 | 12 | 56.667% | 0.244 | -0.03 | 0.213 | 2.173 | 1.362 | 1.118 | 1.218 | 3 | 0.203 | 27 |
| 2026-09-26 01:00 UTC | 2026-09-26 05:00 UTC | 4 | 16 | 10 | 5 | 62.5% | 0.748 | 0.201 | 0.949 | 3.122 | 1.056 | 0.308 | 3.427 | 4 | 0 | 31 |
| 2026-09-26 05:00 UTC | 2026-09-26 09:00 UTC | 4 | 19 | 14 | 5 | 73.684% | 0.797 | 0.429 | 1.226 | 4.348 | 1.161 | 0.365 | 3.184 | 4 | 0 | 33 |
| 2026-09-26 09:00 UTC | 2026-09-26 13:00 UTC | 4 | 32 | 24 | 7 | 75% | 2.159 | -0.479 | 1.68 | 6.028 | 2.797 | 0.638 | 4.382 | 4 | 0 | 32 |
| 2026-09-26 13:00 UTC | 2026-09-26 17:00 UTC | 4 | 45 | 29 | 15 | 64.444% | 1.449 | 0.02 | 1.469 | 7.497 | 2.492 | 1.043 | 2.389 | 4 | 0 | 14 |
| 2026-09-26 17:00 UTC | 2026-09-26 21:00 UTC | 4 | 42 | 35 | 7 | 83.333% | 3.473 | 0.016 | 3.489 | 10.987 | 3.995 | 0.522 | 7.659 | 4 | 0 | 10 |
| 2026-09-26 21:00 UTC | 2026-09-27 01:00 UTC | 4 | 23 | 8 | 13 | 34.783% | -0.546 | -0.42 | -0.966 | 10.021 | 0.527 | 1.073 | 0.491 | 1 | 1.348 | 30 |
| 2026-09-27 01:00 UTC | 2026-09-27 05:00 UTC | 4 | 22 | 12 | 10 | 54.545% | -0.077 | -0.051 | -0.128 | 9.892 | 0.849 | 0.926 | 0.917 | 1 | 0.751 | 21 |
| 2026-09-27 05:00 UTC | 2026-09-27 09:00 UTC | 4 | 53 | 45 | 5 | 84.906% | 3.787 | 0.041 | 3.828 | 13.721 | 4.227 | 0.44 | 9.611 | 3 | 0.229 | 16 |
| 2026-09-27 09:00 UTC | 2026-09-27 13:00 UTC | 4 | 14 | 8 | 6 | 57.143% | 0.14 | 1.523 | 1.662 | 15.383 | 0.555 | 0.416 | 1.336 | 3 | 0.129 | 34 |
| 2026-09-27 13:00 UTC | 2026-09-27 17:00 UTC | 4 | 50 | 41 | 8 | 82% | 4.326 | -1.305 | 3.021 | 18.404 | 4.615 | 0.289 | 15.99 | 4 | 0 | 17 |
| 2026-09-27 17:00 UTC | 2026-09-27 21:00 UTC | 4 | 28 | 25 | 2 | 89.286% | 2.187 | 0.153 | 2.34 | 20.743 | 2.379 | 0.192 | 12.391 | 3 | 0.1 | 26 |
| 2026-09-27 21:00 UTC | 2026-09-28 01:00 UTC | 4 | 51 | 33 | 18 | 64.706% | 1.337 | 0.079 | 1.417 | 22.16 | 3.028 | 1.691 | 1.791 | 2 | 0.425 | 13 |
| 2026-09-28 01:00 UTC | 2026-09-28 05:00 UTC | 4 | 50 | 39 | 11 | 78% | 3.388 | -0.671 | 2.718 | 24.878 | 4.213 | 0.825 | 5.107 | 3 | 0.671 | 19 |
| 2026-09-28 05:00 UTC | 2026-09-28 09:00 UTC | 4 | 36 | 28 | 8 | 77.778% | 2.009 | 0.829 | 2.838 | 27.716 | 2.599 | 0.59 | 4.405 | 3 | 0.014 | 14 |
| 2026-09-28 09:00 UTC | 2026-09-28 13:00 UTC | 4 | 55 | 51 | 3 | 92.727% | 4.634 | -0.466 | 4.168 | 31.884 | 4.922 | 0.288 | 17.089 | 3 | 0.067 | 0 |

### Staged lanes

Base → Main → Thin 1 → Thin 2. 314,640 candidate cells; 18,555 validated by the final stage; 59 chosen (up to 1 per market). 262 booked closes; 1,694 blocked entries tracked as shadows (shadow PF 0.846).

| Stage | Input cells | Validated | Vetoed | Retained | Median PF in | Median PF out | Relation out/in |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Base | 314,640 | 20,532 | 151,810 | 6.526% | 0.601 | 2.714 | 4.517 |
| Main | 20,532 | 20,532 | 0 | 100% | 2.714 | 2.714 | 1 |
| Thin 1 | 20,532 | 20,074 | 458 | 97.769% | 2.714 | 2.77 | 1.021 |
| Thin 2 | 20,074 | 18,555 | 1,519 | 92.433% | 2.77 | 3.136 | 1.132 |

| Stage | Lane | Window | Mode | Min PF | Evidence | Confirmed | Vetoed | Median PF |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Base | long10 | 10 | both | 1 | 172,342 | 52,442 | 119,900 | 0.609 |
| Base | long20 | 20 | both | 1 | 172,342 | 50,246 | 122,096 | 0.607 |
| Base | long30 | 30 | both | 1 | 172,342 | 49,812 | 122,530 | 0.608 |
| Base | short4 | 4 | both | 1 | 172,342 | 64,898 | 107,444 | 0.655 |
| Base | short8 | 8 | both | 1 | 172,342 | 55,352 | 116,990 | 0.625 |
| Base | last1 | 1 | both | 1 | 172,342 | 86,786 | 85,556 | 4 |
| Base | last2 | 2 | both | 1 | 172,342 | 62,827 | 109,515 | 0.595 |
| Base | last3 | 3 | both | 1 | 172,342 | 64,282 | 108,060 | 0.678 |
| Base | last4 | 4 | both | 1 | 172,342 | 64,898 | 107,444 | 0.655 |
| Main | short8 | 8 | positive | 1 | 20,532 | 20,532 | 0 | 3.144 |
| Main | short12 | 12 | positive | 1 | 20,532 | 20,462 | 0 | 2.768 |
| Main | short16 | 16 | positive | 1 | 20,532 | 20,513 | 0 | 2.734 |
| Main | last1 | 1 | both | 1 | 20,532 | 20,532 | 0 | 4 |
| Main | last2 | 2 | both | 1 | 20,532 | 20,532 | 0 | 4 |
| Main | last3 | 3 | both | 1 | 20,532 | 20,532 | 0 | 4 |
| Main | last4 | 4 | both | 1 | 20,532 | 20,532 | 0 | 4 |
| Thin 1 | short8 | 8 | positive | 1.05 | 20,532 | 20,066 | 0 | 3.144 |
| Thin 1 | short10 | 10 | positive | 1.05 | 20,532 | 20,072 | 0 | 2.871 |
| Thin 1 | short12 | 12 | positive | 1.05 | 20,532 | 19,993 | 0 | 2.768 |
| Thin 1 | short14 | 14 | positive | 1.05 | 20,532 | 20,020 | 0 | 2.745 |
| Thin 1 | short16 | 16 | positive | 1.05 | 20,532 | 20,024 | 0 | 2.734 |
| Thin 1 | last1 | 1 | both | 1.05 | 20,532 | 20,532 | 0 | 4 |
| Thin 1 | last2 | 2 | both | 1.05 | 20,532 | 20,413 | 119 | 4 |
| Thin 1 | last3 | 3 | both | 1.05 | 20,532 | 20,407 | 125 | 4 |
| Thin 1 | last4 | 4 | both | 1.05 | 20,532 | 20,302 | 230 | 4 |
| Thin 2 | short8 | 8 | positive | 1.1 | 20,074 | 19,245 | 0 | 3.253 |
| Thin 2 | short9 | 9 | positive | 1.1 | 20,074 | 19,266 | 0 | 3.077 |
| Thin 2 | short10 | 10 | positive | 1.1 | 20,074 | 19,222 | 0 | 2.958 |
| Thin 2 | short11 | 11 | positive | 1.1 | 20,074 | 19,190 | 0 | 2.872 |
| Thin 2 | short12 | 12 | positive | 1.1 | 20,074 | 19,136 | 0 | 2.835 |
| Thin 2 | short13 | 13 | positive | 1.1 | 20,074 | 19,168 | 0 | 2.804 |
| Thin 2 | short14 | 14 | positive | 1.1 | 20,074 | 19,139 | 0 | 2.799 |
| Thin 2 | short15 | 15 | positive | 1.1 | 20,074 | 19,142 | 0 | 2.798 |
| Thin 2 | short16 | 16 | positive | 1.1 | 20,074 | 19,134 | 0 | 2.79 |
| Thin 2 | last1 | 1 | both | 1.1 | 20,074 | 20,074 | 0 | 4 |
| Thin 2 | last2 | 2 | both | 1.1 | 20,074 | 19,904 | 170 | 4 |
| Thin 2 | last3 | 3 | both | 1.1 | 20,074 | 19,924 | 150 | 4 |
| Thin 2 | last4 | 4 | both | 1.1 | 20,074 | 19,808 | 266 | 4 |
| Thin 2 | long10 | 10 | both | 1.1 | 20,074 | 19,222 | 852 | 2.958 |
| Thin 2 | long15 | 15 | both | 1.1 | 20,074 | 19,142 | 932 | 2.798 |
| Thin 2 | long20 | 20 | both | 1.1 | 20,074 | 19,103 | 971 | 2.771 |
| Thin 2 | long25 | 25 | both | 1.1 | 20,074 | 19,073 | 1,001 | 2.77 |
| Thin 2 | long30 | 30 | both | 1.1 | 20,074 | 19,062 | 1,012 | 2.77 |

| Cell | Closes prehistory | PF prehistory | Closes holdout | PF holdout | Net holdout | Shadow entries | Shadow PF |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BTC-USDT move tp1.60_sl1.00 dynamic | 11 | 17.348 | 1 | 0 | -0.096 | 40 | 0.667 |
| ETH-USDT break tp2.00_sl0.75 dynamic | 6 | 2.208 | 1 | 0 | -0.004 | 20 | 0.791 |
| SOL-USDT stochRsi tp0.55_sl1.75 fixed | 9 | 4 | 7 | 0.518 | -0.139 | 26 | 0.734 |
| XRP-USDT stochRsi tp1.80_sl0.50 breakeven | 8 | 6.635 | 5 | 2.142 | 0.175 | 24 | 0.907 |
| DOGE-USDT stochRsi tp1.00_sl1.25 dynamic | 8 | 2.642 | 6 | 0.226 | -0.243 | 22 | 1.253 |
| AVAX-USDT stochRsi tp1.40_sl0.50 fixed | 8 | 2.66 | 2 | 1.742 | 0.071 | 30 | 0.445 |
| LINK-USDT active tp1.60_sl0.50 fixed | 8 | 2.623 | 2 | 0 | -0.192 | 37 | 0.682 |
| BNB-USDT move tp1.80_sl0.75 dynamic | 11 | 2.975 | 3 | 0.514 | -0.093 | 40 | 1.001 |
| ARB-USDT stochRsi tp1.80_sl0.50 dynamic | 11 | 2.611 | 6 | 4.964 | 0.381 | 27 | 0.558 |
| SUI-USDT active tp0.80_sl0.50 breakeven | 11 | 3.656 | 3 | 1.652 | 0.063 | 53 | 0.646 |
| BCH-USDT move tp1.20_sl0.75 breakeven | 19 | 3.085 | 2 | 0 | -0.176 | 59 | 0.703 |
| LTC-USDT bollinger tp0.58_sl1.25 dynamic | 6 | 4 | 4 | 0.572 | -0.044 | 21 | 0.888 |
| ADA-USDT stochRsi tp1.80_sl0.50 fixed | 6 | 8.756 | 5 | 2.673 | 0.321 | 19 | 1.039 |
| HBAR-USDT move tp2.00_sl0.50 fixed | 17 | 1.364 | 7 | 1.245 | 0.094 | 23 | 1.117 |
| DOT-USDT move tp1.00_sl1.50 dynamic | 22 | 2.153 | 2 | 0 | -0.107 | 54 | 0.628 |
| NEAR-USDT stochRsi tp1.60_sl0.75 fixed | 8 | 4.054 | 3 | 0.623 | -0.072 | 21 | 0.83 |
| AAVE-USDT stochRsi tp1.00_sl1.00 fixed | 6 | 4 | 3 | 0.441 | -0.107 | 29 | 0.761 |
| UNI-USDT move tp1.00_sl1.25 dynamic | 23 | 3.371 | 6 | 0.71 | -0.083 | 59 | 0.682 |
| ATOM-USDT vwapReclaim tp1.60_sl0.75 breakeven | 6 | 3.048 | 1 | 0 | 0 | 11 | 0.497 |
| FIL-USDT active tp1.60_sl0.50 fixed | 8 | 4.025 | 4 | 0 | -0.384 | 42 | 1.016 |
| INJ-USDT move tp1.60_sl1.25 dynamic | 8 | 22.009 | 4 | 0.338 | -0.087 | 28 | 0.457 |
| OP-USDT ema tp1.20_sl0.50 dynamic | 7 | 3.547 | 5 | 0.664 | -0.097 | 27 | 1.071 |
| ETC-USDT rangeFade tp1.40_sl0.50 fixed | 6 | 3.27 | 3 | 0.829 | -0.033 | 14 | 0.67 |
| APT-USDT stochRsi tp2.00_sl0.50 fixed | 8 | 4.531 | 9 | 1.989 | 0.38 | 17 | 1.031 |
| SEI-USDT move tp1.40_sl0.75 dynamic | 21 | 4.823 | 3 | 0.152 | -0.163 | 49 | 0.752 |
| WLD-USDT active tp0.80_sl1.25 dynamic | 14 | 20.508 | 3 | 2.522 | 0.042 | 46 | 0.671 |
| ALGO-USDT stochRsi tp1.20_sl0.75 fixed | 14 | 2.876 | 1 | 0 | -0.096 | 29 | 0.689 |
| XLM-USDT active tp1.60_sl0.50 fixed | 11 | 2.612 | 3 | 0.891 | -0.021 | 37 | 0.963 |
| FET-USDT move tp0.60_sl1.50 dynamic | 27 | 1.87 | 9 | 0.722 | -0.06 | 95 | 0.711 |
| GRT-USDT squeezeBreak tp0.80_sl1.00 fixed | 7 | 4 | 5 | 0.602 | -0.115 | 25 | 0.677 |
| STX-USDT active tp1.40_sl0.50 breakeven | 8 | 8.609 | 3 | 0 | -0.192 | 29 | 0.936 |
| RUNE-USDT momentumPullback tp1.40_sl0.50 fixed | 8 | 2.881 | 1 | 0 | -0.096 | 16 | 0.768 |
| TIA-USDT stochRsi tp1.80_sl0.50 fixed | 7 | 4.468 | 10 | 1.201 | 0.116 | 11 | 3.079 |
| JUP-USDT stochRsi tp0.80_sl0.50 breakeven | 13 | 2.95 | 5 | 0 | -0.287 | 31 | 1.434 |
| ONDO-USDT bollinger tp1.20_sl0.50 fixed | 6 | 8.731 | 8 | 1.749 | 0.275 | 6 | 7.451 |
| VET-USDT stochRsi tp1.60_sl0.75 fixed | 7 | 2.984 | 3 | 0.593 | -0.078 | 23 | 0.713 |
| IMX-USDT pullback tp0.80_sl0.50 fixed | 7 | 9.695 | 2 | 1.697 | 0.067 | 8 | 0.167 |
| ENS-USDT stochRsi tp1.40_sl0.75 fixed | 6 | 3.044 | 9 | 0.73 | -0.129 | 18 | 2.038 |
| LDO-USDT momentumPullback tp0.80_sl1.25 fixed | 7 | 4 | 3 | 0.351 | -0.125 | 25 | 0.725 |
| SAND-USDT stochRsi tp1.20_sl0.50 fixed | 13 | 3.604 | 10 | 0.747 | -0.17 | 24 | 2.14 |
| MANA-USDT stochRsi tp1.40_sl0.75 fixed | 9 | 2.242 | 16 | 1.583 | 0.392 | 12 | 2.584 |
| DYDX-USDT stochRsi tp1.80_sl0.50 fixed | 9 | 3.403 | 2 | 0 | -0.192 | 23 | 0.98 |
| CRV-USDT stochRsi tp0.80_sl0.50 fixed | 12 | 8.221 | 3 | 0 | -0.288 | 33 | 1.215 |
| ZEC-USDT active tp1.80_sl0.50 dynamic | 9 | 3.465 | 7 | 0.613 | -0.149 | 39 | 0.999 |
| DASH-USDT active tp1.40_sl0.50 breakeven | 13 | 2.859 | 1 | 0 | -0.096 | 45 | 0.396 |
| PENDLE-USDT ema tp0.80_sl1.00 fixed | 10 | 7.527 | 5 | 0.542 | -0.132 | 23 | 1.239 |
| COMP-USDT stochRsi tp1.80_sl0.50 dynamic | 9 | 10.373 | 5 | 1.079 | 0.015 | 23 | 0.471 |
| ZRX-USDT momentumPullback tp1.00_sl1.25 fixed | 6 | 4 | 1 | 0 | -0.096 | 20 | 0.35 |
| NEO-USDT active tp0.80_sl1.25 dynamic | 15 | 3.167 | 3 | 0.333 | -0.128 | 38 | 0.733 |
| 1000PEPE-USDT momentumPullback tp1.60_sl0.50 breakeven | 7 | 2.528 | 2 | 0 | -0.192 | 26 | 1.071 |
| ZRO-USDT stochRsi tp0.52_sl2.50 fixed | 12 | 4 | 10 | 0.834 | -0.048 | 22 | 0.846 |
| BOME-USDT stochRsi tp1.80_sl0.50 fixed | 9 | 4.55 | 2 | 0 | -0.192 | 22 | 1.012 |
| HYPE-USDT move tp2.00_sl1.00 dynamic | 8 | 4 | 9 | 1.016 | 0.004 | 23 | 0.69 |
| ETHFI-USDT stochRsi tp0.55_sl0.75 dynamic | 12 | 7.599 | 5 | 0.365 | -0.175 | 27 | 1.289 |
| BANANA-USDT break tp2.00_sl0.50 fixed | 9 | 2.876 | 1 | 0 | -0.096 | 28 | 0.254 |
| STRK-USDT ema tp1.40_sl0.50 fixed | 9 | 2.01 | 4 | 0 | -0.384 | 17 | 1.848 |
| DYM-USDT rangeFade tp1.00_sl0.50 dynamic | 7 | 4.652 | 8 | 2.535 | 0.415 | 6 | 0.996 |
| GALA-USDT momentumPullback tp0.58_sl1.75 fixed | 8 | 4 | 3 | 0.994 | -0.001 | 27 | 0.58 |
| CFX-USDT stochRsi tp1.00_sl0.75 fixed | 14 | 2.795 | 3 | 0.564 | -0.084 | 25 | 1.125 |

### Indication and range coverage

| Indication | Range | Configurations | Excluded | With prehistory closes | At closes minimum | Best prehistory PF at minimum | Passed gates | Selected symbols | Prehistory signals | Holdout signals | Selected holdout closes | Selected PF | Selected net | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| direction | short | 8,640 | 0 | 8,496 | 4,032 | 0 | 275 | 0 | 245 | 810 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| move | short | 8,640 | 0 | 8,640 | 8,640 | 0 | 159 | 1 | 2,365 | 7,412 | 9 | 0.722 | -0.06 | Selected on 1 symbol |
| break | short | 8,640 | 0 | 8,640 | 8,640 | 0 | 76 | 0 | 680 | 2,223 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| rsi | short | 8,640 | 0 | 7,632 | 1,427 | 0 | 217 | 0 | 140 | 580 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| macd | short | 8,640 | 0 | 8,208 | 2,285 | 0 | 73 | 0 | 164 | 664 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| bollinger | short | 8,640 | 0 | 8,640 | 8,441 | 0 | 756 | 1 | 551 | 1,623 | 4 | 0.572 | -0.044 | Selected on 1 symbol |
| ema | short | 8,640 | 0 | 8,640 | 8,146 | 0 | 830 | 0 | 693 | 2,169 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| active | short | 8,640 | 0 | 8,640 | 8,636 | 0 | 454 | 0 | 892 | 3,534 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| direction | wide | 7,920 | 0 | 7,788 | 2,106 | 0 | 106 | 0 | 245 | 810 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| move | wide | 7,920 | 0 | 7,920 | 7,817 | 0 | 483 | 9 | 2,365 | 7,412 | 37 | 0.611 | -0.707 | Selected on 9 symbols |
| break | wide | 7,920 | 0 | 7,920 | 7,255 | 0 | 227 | 2 | 680 | 2,223 | 2 | 0 | -0.1 | Selected on 2 symbols |
| rsi | wide | 7,920 | 0 | 6,996 | 644 | 0 | 172 | 0 | 140 | 580 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| macd | wide | 7,920 | 0 | 7,524 | 1,282 | 0 | 49 | 0 | 164 | 664 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| bollinger | wide | 7,920 | 0 | 7,920 | 6,149 | 0 | 815 | 1 | 551 | 1,623 | 8 | 1.749 | 0.275 | Selected on 1 symbol |
| ema | wide | 7,920 | 0 | 7,920 | 4,928 | 0 | 805 | 3 | 693 | 2,169 | 14 | 0.362 | -0.613 | Selected on 3 symbols |
| active | wide | 7,920 | 0 | 7,920 | 7,303 | 0 | 713 | 9 | 892 | 3,534 | 29 | 0.398 | -1.058 | Selected on 9 symbols |
| pullback | short | 8,640 | 0 | 8,640 | 4,181 | 0 | 965 | 0 | 235 | 841 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| pullback | wide | 7,920 | 0 | 7,920 | 1,748 | 0 | 308 | 1 | 235 | 841 | 2 | 1.697 | 0.067 | Selected on 1 symbol |
| rangeFade | short | 8,640 | 0 | 8,640 | 7,341 | 0 | 1,429 | 0 | 317 | 1,054 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| rangeFade | wide | 7,920 | 0 | 7,920 | 5,030 | 0 | 1,158 | 2 | 317 | 1,054 | 11 | 1.827 | 0.382 | Selected on 2 symbols |
| volumeBreak | short | 8,640 | 0 | 7,488 | 2,304 | 0 | 221 | 0 | 155 | 579 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| volumeBreak | wide | 7,920 | 0 | 6,864 | 1,513 | 0 | 205 | 0 | 155 | 579 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| momentumPullback | short | 8,640 | 0 | 8,640 | 8,382 | 0 | 1,059 | 1 | 573 | 2,182 | 3 | 0.994 | -0.001 | Selected on 1 symbol |
| momentumPullback | wide | 7,920 | 0 | 7,920 | 5,927 | 0 | 1,063 | 4 | 573 | 2,182 | 7 | 0.117 | -0.509 | Selected on 4 symbols |
| squeezeBreak | short | 8,640 | 0 | 8,640 | 7,488 | 0 | 358 | 0 | 393 | 1,742 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| squeezeBreak | wide | 7,920 | 0 | 7,920 | 5,429 | 0 | 543 | 1 | 393 | 1,742 | 5 | 0.602 | -0.115 | Selected on 1 symbol |
| rsiRecovery | short | 8,640 | 0 | 4,896 | 644 | 0 | 89 | 0 | 74 | 102 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| rsiRecovery | wide | 7,920 | 0 | 4,488 | 287 | 0 | 62 | 0 | 74 | 102 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| donchian | short | 8,640 | 0 | 8,352 | 3,714 | 0 | 226 | 0 | 215 | 568 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| donchian | wide | 7,920 | 0 | 7,656 | 2,179 | 0 | 161 | 0 | 215 | 568 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| supertrend | short | 8,640 | 0 | 8,064 | 0 | — | 0 | 0 | 72 | 365 | 0 | — | 0 | Below the 4-close minimum in the prehistory |
| supertrend | wide | 7,920 | 0 | 7,392 | 0 | — | 0 | 0 | 72 | 365 | 0 | — | 0 | Below the 4-close minimum in the prehistory |
| vwapReclaim | short | 8,640 | 0 | 8,496 | 7,288 | 0 | 845 | 0 | 525 | 1,614 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| vwapReclaim | wide | 7,920 | 0 | 7,788 | 4,157 | 0 | 722 | 1 | 525 | 1,614 | 1 | — | 0 | Selected on 1 symbol |
| adxDi | short | 8,640 | 0 | 7,056 | 580 | 0 | 81 | 0 | 111 | 375 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| adxDi | wide | 7,920 | 0 | 6,468 | 210 | 0 | 9 | 0 | 111 | 375 | 0 | — | 0 | Passed the gates but was not the best configuration on any symbol |
| stochRsi | short | 8,640 | 0 | 8,640 | 8,640 | 0 | 1,126 | 3 | 820 | 2,336 | 22 | 0.575 | -0.362 | Selected on 3 symbols |
| stochRsi | wide | 7,920 | 0 | 7,920 | 7,569 | 0 | 1,715 | 20 | 820 | 2,336 | 108 | 0.984 | -0.088 | Selected on 20 symbols |

### Selections by symbol

| Symbol and configuration | Indication | Range | Costs | Prehistory closes | Prehistory PF | Required PF | Holdout closes | Holdout PF | Holdout net | Holdout drawdown | Positive periods |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BTC-USDT move tp1.60_sl1.00 dynamic | move | wide | 0.12% | 11 | 17.348 | 1 | 1 | 0 | -0.096 | 0.096 | 0 |
| ETH-USDT break tp2.00_sl0.75 dynamic | break | wide | 0.12% | 6 | 2.208 | 1 | 1 | 0 | -0.004 | 0.011 | 1 |
| SOL-USDT stochRsi tp0.55_sl1.75 fixed | stochRsi | short | 0.12% | 9 | No losses | 1 | 7 | 0.518 | -0.139 | 0.155 | 11 |
| XRP-USDT stochRsi tp1.80_sl0.50 breakeven | stochRsi | wide | 0.12% | 8 | 6.635 | 1 | 5 | 2.142 | 0.175 | 0.151 | 17 |
| DOGE-USDT stochRsi tp1.00_sl1.25 dynamic | stochRsi | wide | 0.12% | 8 | 2.642 | 1 | 6 | 0.226 | -0.243 | 0.243 | 15 |
| AVAX-USDT stochRsi tp1.40_sl0.50 fixed | stochRsi | wide | 0.12% | 8 | 2.66 | 1 | 2 | 1.742 | 0.071 | 0.096 | 2 |
| LINK-USDT active tp1.60_sl0.50 fixed | active | wide | 0.12% | 8 | 2.623 | 1 | 2 | 0 | -0.192 | 0.192 | 1 |
| BNB-USDT move tp1.80_sl0.75 dynamic | move | wide | 0.12% | 11 | 2.975 | 1 | 3 | 0.514 | -0.093 | 0.192 | 1 |
| ARB-USDT stochRsi tp1.80_sl0.50 dynamic | stochRsi | wide | 0.12% | 11 | 2.611 | 1 | 6 | 4.964 | 0.381 | 0.142 | 15 |
| SUI-USDT active tp0.80_sl0.50 breakeven | active | wide | 0.12% | 11 | 3.656 | 1 | 3 | 1.652 | 0.063 | 0.096 | 2 |
| BCH-USDT move tp1.20_sl0.75 breakeven | move | wide | 0.12% | 19 | 3.085 | 1 | 2 | 0 | -0.176 | 0.176 | 0 |
| LTC-USDT bollinger tp0.58_sl1.25 dynamic | bollinger | short | 0.12% | 6 | No losses | 1 | 4 | 0.572 | -0.044 | 0.103 | 2 |
| ADA-USDT stochRsi tp1.80_sl0.50 fixed | stochRsi | wide | 0.12% | 6 | 8.756 | 1 | 5 | 2.673 | 0.321 | 0.163 | 15 |
| HBAR-USDT move tp2.00_sl0.50 fixed | move | wide | 0.12% | 17 | 1.364 | 1 | 7 | 1.245 | 0.094 | 0.248 | 13 |
| DOT-USDT move tp1.00_sl1.50 dynamic | move | wide | 0.12% | 22 | 2.153 | 1 | 2 | 0 | -0.107 | 0.146 | 1 |
| NEAR-USDT stochRsi tp1.60_sl0.75 fixed | stochRsi | wide | 0.12% | 8 | 4.054 | 1 | 3 | 0.623 | -0.072 | 0.204 | 6 |
| AAVE-USDT stochRsi tp1.00_sl1.00 fixed | stochRsi | wide | 0.12% | 6 | No losses | 1 | 3 | 0.441 | -0.107 | 0.159 | 7 |
| UNI-USDT move tp1.00_sl1.25 dynamic | move | wide | 0.12% | 23 | 3.371 | 1 | 6 | 0.71 | -0.083 | 0.151 | 5 |
| ATOM-USDT vwapReclaim tp1.60_sl0.75 breakeven | vwapReclaim | wide | 0.12% | 6 | 3.048 | 1 | 1 | — | 0 | 0.061 | 2 |
| FIL-USDT active tp1.60_sl0.50 fixed | active | wide | 0.12% | 8 | 4.025 | 1 | 4 | 0 | -0.384 | 0.387 | 3 |
| INJ-USDT move tp1.60_sl1.25 dynamic | move | wide | 0.12% | 8 | 22.009 | 1 | 4 | 0.338 | -0.087 | 0.139 | 22 |
| OP-USDT ema tp1.20_sl0.50 dynamic | ema | wide | 0.12% | 7 | 3.547 | 1 | 5 | 0.664 | -0.097 | 0.192 | 2 |
| ETC-USDT rangeFade tp1.40_sl0.50 fixed | rangeFade | wide | 0.12% | 6 | 3.27 | 1 | 3 | 0.829 | -0.033 | 0.097 | 2 |
| APT-USDT stochRsi tp2.00_sl0.50 fixed | stochRsi | wide | 0.12% | 8 | 4.531 | 1 | 9 | 1.989 | 0.38 | 0.284 | 40 |
| SEI-USDT move tp1.40_sl0.75 dynamic | move | wide | 0.12% | 21 | 4.823 | 1 | 3 | 0.152 | -0.163 | 0.226 | 2 |
| WLD-USDT active tp0.80_sl1.25 dynamic | active | wide | 0.12% | 14 | 20.508 | 1 | 3 | 2.522 | 0.042 | 0.035 | 3 |
| ALGO-USDT stochRsi tp1.20_sl0.75 fixed | stochRsi | wide | 0.12% | 14 | 2.876 | 1 | 1 | 0 | -0.096 | 0.096 | 0 |
| XLM-USDT active tp1.60_sl0.50 fixed | active | wide | 0.12% | 11 | 2.612 | 1 | 3 | 0.891 | -0.021 | 0.192 | 1 |
| FET-USDT move tp0.60_sl1.50 dynamic | move | short | 0.12% | 27 | 1.87 | 1 | 9 | 0.722 | -0.06 | 0.192 | 5 |
| GRT-USDT squeezeBreak tp0.80_sl1.00 fixed | squeezeBreak | wide | 0.12% | 7 | No losses | 1 | 5 | 0.602 | -0.115 | 0.319 | 23 |
| STX-USDT active tp1.40_sl0.50 breakeven | active | wide | 0.12% | 8 | 8.609 | 1 | 3 | 0 | -0.192 | 0.287 | 1 |
| RUNE-USDT momentumPullback tp1.40_sl0.50 fixed | momentumPullback | wide | 0.12% | 8 | 2.881 | 1 | 1 | 0 | -0.096 | 0.16 | 4 |
| TIA-USDT stochRsi tp1.80_sl0.50 fixed | stochRsi | wide | 0.12% | 7 | 4.468 | 1 | 10 | 1.201 | 0.116 | 0.266 | 44 |
| JUP-USDT stochRsi tp0.80_sl0.50 breakeven | stochRsi | wide | 0.12% | 13 | 2.95 | 1 | 5 | 0 | -0.287 | 0.349 | 3 |
| ONDO-USDT bollinger tp1.20_sl0.50 fixed | bollinger | wide | 0.12% | 6 | 8.731 | 1 | 8 | 1.749 | 0.275 | 0.205 | 11 |
| VET-USDT stochRsi tp1.60_sl0.75 fixed | stochRsi | wide | 0.12% | 7 | 2.984 | 1 | 3 | 0.593 | -0.078 | 0.143 | 8 |
| IMX-USDT pullback tp0.80_sl0.50 fixed | pullback | wide | 0.12% | 7 | 9.695 | 1 | 2 | 1.697 | 0.067 | 0.136 | 2 |
| ENS-USDT stochRsi tp1.40_sl0.75 fixed | stochRsi | wide | 0.12% | 6 | 3.044 | 1 | 9 | 0.73 | -0.129 | 0.333 | 21 |
| LDO-USDT momentumPullback tp0.80_sl1.25 fixed | momentumPullback | wide | 0.12% | 7 | No losses | 1 | 3 | 0.351 | -0.125 | 0.192 | 1 |
| SAND-USDT stochRsi tp1.20_sl0.50 fixed | stochRsi | wide | 0.12% | 13 | 3.604 | 1 | 10 | 0.747 | -0.17 | 0.385 | 11 |
| MANA-USDT stochRsi tp1.40_sl0.75 fixed | stochRsi | wide | 0.12% | 9 | 2.242 | 1 | 16 | 1.583 | 0.392 | 0.31 | 38 |
| DYDX-USDT stochRsi tp1.80_sl0.50 fixed | stochRsi | wide | 0.12% | 9 | 3.403 | 1 | 2 | 0 | -0.192 | 0.192 | 0 |
| CRV-USDT stochRsi tp0.80_sl0.50 fixed | stochRsi | wide | 0.12% | 12 | 8.221 | 1 | 3 | 0 | -0.288 | 0.349 | 2 |
| ZEC-USDT active tp1.80_sl0.50 dynamic | active | wide | 0.12% | 9 | 3.465 | 1 | 7 | 0.613 | -0.149 | 0.35 | 6 |
| DASH-USDT active tp1.40_sl0.50 breakeven | active | wide | 0.12% | 13 | 2.859 | 1 | 1 | 0 | -0.096 | 0.096 | 0 |
| PENDLE-USDT ema tp0.80_sl1.00 fixed | ema | wide | 0.12% | 10 | 7.527 | 1 | 5 | 0.542 | -0.132 | 0.212 | 4 |
| COMP-USDT stochRsi tp1.80_sl0.50 dynamic | stochRsi | wide | 0.12% | 9 | 10.373 | 1 | 5 | 1.079 | 0.015 | 0.122 | 7 |
| ZRX-USDT momentumPullback tp1.00_sl1.25 fixed | momentumPullback | wide | 0.12% | 6 | No losses | 1 | 1 | 0 | -0.096 | 0.096 | 0 |
| NEO-USDT active tp0.80_sl1.25 dynamic | active | wide | 0.12% | 15 | 3.167 | 1 | 3 | 0.333 | -0.128 | 0.192 | 3 |
| 1000PEPE-USDT momentumPullback tp1.60_sl0.50 breakeven | momentumPullback | wide | 0.12% | 7 | 2.528 | 1 | 2 | 0 | -0.192 | 0.192 | 1 |
| ZRO-USDT stochRsi tp0.52_sl2.50 fixed | stochRsi | short | 0.12% | 12 | No losses | 1 | 10 | 0.834 | -0.048 | 0.158 | 15 |
| BOME-USDT stochRsi tp1.80_sl0.50 fixed | stochRsi | wide | 0.12% | 9 | 4.55 | 1 | 2 | 0 | -0.192 | 0.192 | 1 |
| HYPE-USDT move tp2.00_sl1.00 dynamic | move | wide | 0.12% | 8 | No losses | 1 | 9 | 1.016 | 0.004 | 0.137 | 32 |
| ETHFI-USDT stochRsi tp0.55_sl0.75 dynamic | stochRsi | short | 0.12% | 12 | 7.599 | 1 | 5 | 0.365 | -0.175 | 0.178 | 2 |
| BANANA-USDT break tp2.00_sl0.50 fixed | break | wide | 0.12% | 9 | 2.876 | 1 | 1 | 0 | -0.096 | 0.096 | 0 |
| STRK-USDT ema tp1.40_sl0.50 fixed | ema | wide | 0.12% | 9 | 2.01 | 1 | 4 | 0 | -0.384 | 0.384 | 2 |
| DYM-USDT rangeFade tp1.00_sl0.50 dynamic | rangeFade | wide | 0.12% | 7 | 4.652 | 1 | 8 | 2.535 | 0.415 | 0.27 | 10 |
| GALA-USDT momentumPullback tp0.58_sl1.75 fixed | momentumPullback | short | 0.12% | 8 | No losses | 1 | 3 | 0.994 | -0.001 | 0.096 | 3 |
| CFX-USDT stochRsi tp1.00_sl0.75 fixed | stochRsi | wide | 0.12% | 14 | 2.795 | 1 | 3 | 0.564 | -0.084 | 0.219 | 4 |
