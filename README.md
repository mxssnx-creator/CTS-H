# CTS-H Trading Desk

CTS-H adapts the [HyperGrok Grok Build trading desk](https://github.com/galleonlabs/hypergrok-trading-desk/blob/main/docs/hyperliquid-grok-build.md) to BingX USDT perpetuals. The browser provides a market workspace, research, a paper portfolio, connection settings, and walk-forward replay. The operator CLI handles the signed ticket lifecycle. Seven Grok roles guide research, risk, execution handoff, and post-trade review.

## Run the desk

Use Node.js 22.18+ or Node.js 24.

```sh
npm ci
npm run dev
npm run desk -- brief --connection bingx-x02 --symbol ETH-USDT
npm run desk -- doctor
npm test
npm run typecheck
npm run build
```

The web desk opens at `http://localhost:8080`. The browser starts with public data and manual paper controls. Enable automatic paper entries in Settings for the active connection. Paper orders, fills, and active session state are scoped by connection. Paper positions stay in the open browser session. The selected connection receives updates. Preferences persist locally for each connection. Signed tickets persist separately in SQLite on the operator host.

Paper stops execute at the first observed quote beyond the trigger, which can be worse than the stop price. Quote polling is not a reconstruction of every exchange trade, so paper fills remain approximations.

| Connection     | Quote and candle source  | Operator credential variables               |
| -------------- | ------------------------ | ------------------------------------------- |
| `bingx-public` | BingX mainnet public API | None                                        |
| `bingx-x01`    | BingX mainnet            | `BINGX_X01_API_KEY`, `BINGX_X01_API_SECRET` |
| `bingx-x02`    | BingX VST demo           | `BINGX_X02_API_KEY`, `BINGX_X02_API_SECRET` |

The CLI accepts `x01`, `x02`, and the older `bingx-vst-02` alias. It accepts `_SECRET` as an alternative to `_API_SECRET`. To use the existing CTS Redis credential layout, set `CTS_H_REDIS=1` on a host with `redis-cli`. It reads `api_key` and `api_secret` under `connection:bingx-x01` or `connection:bingx-x02`, with the shorter `connection:x01` and `connection:x02` keys as fallbacks. Set `CTS_H_STATE_DIR` to a private, persistent local directory for the operator journal. The default is `$XDG_STATE_HOME/cts-h` or `~/.local/state/cts-h`. Run the operator on a separate OS account from Grok and the public web server.

## Grok Build

```sh
grok plugin install mxssnx-creator/CTS-H --trust
grok plugin validate .
```

Run validation from the local checkout. Load `desk-operating-model`, then ask the Market Analyst for a BingX brief. Use a checkout of this repository as the Grok working directory so the roles can run the public CLI. Desk role definitions live in [agents/](agents/) and the workflows in [skills/](skills/). The operator gives Risk Manager and Execution Trader the relevant ticket receipts.

## Replay

The CLI defaults to 60 USDT perpetuals available on both BingX feeds. The web desk's Settings choose the active market count: up to 32 markets on 1m and up to 60 on longer intervals. The 1m limit is sized to fit a REST candle refresh inside the interval at BingX's published rate; network delays or other clients sharing the IP can still make it late. Initial and renewed history downloads are paced, so a larger watchlist takes longer to load. Quotes for open paper positions remain monitored when the watchlist shrinks. The browser replays the selected candle interval in a Web Worker.

```sh
npm run desk -- replay --connection both --hours 48 --profile all \
  --html cts-h-replay.html --capture cts-h-candles.json
npm run desk -- replay --input cts-h-candles.json --hours 48 --profile all
npm run desk -- replay --connection both --hours 168 --pre-hours 72 --interval 1h \
  --end 2026-11-27T08:00:00Z --profile all --html cts-h-weekly.html
npm run desk -- replay --connection bingx-x02 --hours 168 --pre-hours 72 --interval 30m \
  --symbols BTC-USDT,ETH-USDT --indication break --range wide --strategies block
npm run desk -- replay --connection both --hours 240 --pre-hours 72 --interval 15m \
  --end 2026-11-27T08:00:00Z --selected-only --reselect-hours 24 \
  --html cts-h-intraday.html --capture cts-h-15m-candles.json
npm run desk -- replay --input cts-h-15m-candles.json --hours 240 --pre-hours 72 \
  --indication all --strategies none --selected-only --independent-indications --reselect-hours 0
npm run desk -- replay --connection both --hours 240 --pre-hours 72 --interval 1m \
  --end 2026-11-27T08:00:00Z --indication all --strategies none \
  --strategy-settings examples/intraday-study.json --selected-only --independent-indications \
  --reselect-hours 0 --slip-bps 1 --html cts-h-minute-indications.html
```

Use `--history-hours 1000` for a continuous capture that supports earlier cutoffs. BingX history requests are paced and captures exceeding 1,000 candles are paginated. A 60-market, 1-minute capture takes substantially longer than coarser intervals. The browser refreshes quotes independently of candle downloads.

The CLI and web desk accept 1m, 5m, 15m, 30m, 1h and 4h candles. Settings are retained independently per connection and interval, and open paper positions retain their original interval and hold limit. The engine warms indicators on 22 contiguous candles and selects one configuration per market using the pre window. Holdout entries use the next open, ambiguous stops and targets settle at the stop, and open positions close at the boundary. Coordinated intraday holds are configured in minutes; other cases use 24 candles. Profitable periods use hourly equity on intervals up to 1h and four-hour equity on 4h candles. Drawdown uses candle equity. The CLI models the venue taker fee and configurable `--slip-bps` per fill. The browser uses a fixed 0.12% round-trip cost. Funding payments, depth-limited execution and liquidation are outside the model.

### Period reports and coverage

`--html` writes the full report. `--markdown` writes the same results as text, and `--period-hours` (default 4) sets the period length. Periods start at the beginning of each window, so a 120-hour holdout with 4-hour periods has exactly 30 full lines, and the 72-hour prehistory has 18. Each run also includes a coverage table with one row per indication and range. The table shows how many configurations were evaluated, how many reached the closes minimum, how many passed the gates, which symbols selected them, and the signal counts in each window. The status column explains each empty row. Low-frequency indications can clear every gate with a longer prehistory, so a short window can leave them with no qualifying configuration even when their signals are sound.

The replay evaluates only the selected configuration for each market in the holdout. Candidate configurations are still scored in the prehistory. Portfolio results match the full candidate replay, and the run is much faster. `--selected-only` is accepted for compatibility and no longer changes the output.

The command below reproduces the five-day, 30-market run. The bingx-x01 candles are captured and written to the same folder as the report.

```sh
node scripts/cts-h.ts replay --connection bingx-x01 \
  --symbols BTC-USDT,ETH-USDT,SOL-USDT,XRP-USDT,DOGE-USDT,AVAX-USDT,LINK-USDT,BNB-USDT,ARB-USDT,SUI-USDT,BCH-USDT,LTC-USDT,ADA-USDT,HBAR-USDT,DOT-USDT,NEAR-USDT,AAVE-USDT,UNI-USDT,ATOM-USDT,FIL-USDT,INJ-USDT,OP-USDT,ETC-USDT,APT-USDT,SEI-USDT,WLD-USDT,ALGO-USDT,XLM-USDT,TRX-USDT,FET-USDT \
  --hours 120 --pre-hours 72 --interval 1h --profile coordinated \
  --indication all --strategies axis,block,dca,relate \
  --capture reports/coordinated-5d-3d-30-markets-1h/capture.json \
  --html reports/coordinated-5d-3d-30-markets-1h/cts-h-replay.html \
  --markdown reports/coordinated-5d-3d-30-markets-1h/cts-h-replay.md
```

Use `npm run --silent desk -- replay …` when you need JSON on stdout, because `npm run` otherwise prints its own header.

### Configuration selection

The default **coordinated** profile qualifies each enabled indication, bracket and stop mode independently. It ranks eligible candidates by profitable periods and uses realized P&L to break ties. It adds EMA pullback and range fade. The **filtered** profile adds 0.8–2.0 ATR targets with 0.5–1.5× stop-to-target ratios to the execution-eligible short grid. The **baseline** preserves the original grid. Filtered and coordinated sizing cap modeled stop risk plus costs at 0.8% of planned position notional. Coordinated sizing reduces entry size after two consecutive losses.

The 1m and 5m presets start with no indications enabled: none of the 14 individual candidates cleared PF 1 on both routes in their ten-day costed studies. The 15m preset uses MACD, wider targets, a 240-minute hold and a 1.35 minimum PF before the Auto PF margin. It also defaults to daily reselection in replay. These are research presets and their past performance does not establish future profitability. Settings can enable the other indications individually, including volume breakout, momentum pullback, compression breakout and RSI trend recovery. The CLI offers the full set through `--indication all`.

Use `--independent-indications --strategies none` to show a separate portfolio for every enabled indication, with one qualified configuration selected per market and indication. The portfolios overlap and must not be added together. `--selected-only` avoids replaying nonselected configurations and preserves the selected portfolio result. `--reselect-hours 24` requalifies using only the preceding prehistory at each 24-hour boundary, and closes open replay positions at that boundary; `--reselect-hours 0` freezes the original preselection for the full replay. Daily reselection is a replay model: the paper desk reevaluates continuously and does not automatically flatten positions every 24 hours. Paper and exchange execution therefore need separate forward validation.

Auto PF defaults to four closed trades and a 0.15 margin at four closes, above the configured minimum of 1.00 or 1.35 for the 15m preset. The margin decreases with the square root of the sample size. The recent-close check is enabled by default and requires positive follow-through when the recent sample is large enough. Replay preselection checks the later half of its prehistory; paper scoring uses recent closes and lifetime evidence, so the filters are not identical. Replay freezes eligible selections between reselection boundaries. Use `--min-pf` and `--auto-pf on|off` for direct comparisons.

Published exclusions apply to calibrated 1h configurations on their own connection, symbol, indication and bracket. An exclusion required at least 24 closes, pooled PF no greater than 0.80, at least three losing periods with six or more closes each and zero adequately sampled winning periods. The rules take effect after the last calibration cutoff.

Rebuild the evidence from a continuous capture. The optional `--policy` argument exports the lists to a new TypeScript file.

```sh
node scripts/cts-h-calibrate.ts --input cts-h-history.json \
  --end 2026-10-22T08:00:00Z --end 2026-10-26T08:00:00Z \
  --end 2026-10-30T08:00:00Z --end 2026-11-03T08:00:00Z \
  --end 2026-11-07T08:00:00Z --end 2026-11-11T08:00:00Z
```

### Strategy controls

Settings stores indication and range selections, exit modes, volume factor and strategy settings per connection and interval. The volume factor runs from 0.1× to 10× in 0.1× steps and defaults to 1×. It applies to paper entries and coordinated replay. Signed tickets use their approved quantities.

The browser's open-paper-position limit defaults to 12 and can be adjusted in Settings from 1 to 500. It caps owned paper positions, not signed exchange positions; increasing it does not reserve exchange margin or establish execution capacity.

| Strategy | Entry and position behavior                                                                                                                              |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Axis     | Increases planned size after enough prior configuration closes clear the PF floor and the last two closes are positive.                                  |
| Block    | Funds additions in the early favorable part of the target distance. Shared mode divides the ratio among steps. Additive mode applies it per funded step. |
| DCA      | Funds adverse-price additions inside the original stop. The remaining stop-risk and notional budgets constrain every fill.                               |
| Relate   | Adjusts size using prior own closes. It supports configuration, symbol and overall-by-side histories.                                                    |

Set `--strategies axis,block,dca,relate` to enable all four overlays for a replay, or choose them individually. Use `--strategy-settings config.json` to supply the keys reported in coordinated CLI output. The overlays are opt-in. Fixed, break-even and ATR trailing modes are enabled by default. Paper partial closes update the protection quantities and end further planned additions on that position.

Strategy references from related projects include [CTS-G Axis](https://github.com/mxssnx-creator/CTS-G/blob/main/server/pulse/axis_sets.py), [CTS-A-O Block study](https://github.com/mxssnx-creator/CTS-A-O/blob/main/docs/block-study-results-20261016.md), [CTS-A-O DCA sweep](https://github.com/mxssnx-creator/CTS-A-O/blob/main/docs/dca-sweep.md) and [CTS-A-O Relate study](https://github.com/mxssnx-creator/CTS-A-O/blob/main/docs/relate-evidence-20261027/REPORT.md).

## Operator tickets

Use an isolated VST account first. The commands below identify each step. Use a quote-derived, contract-valid quantity and bracket for the actual proposal.

```text
npm run desk -- propose --connection bingx-x02 --symbol ETH-USDT --side long --qty QTY --stop STOP --target TARGET --why "Thesis and evidence"
npm run desk -- risk TICKET
npm run desk -- approve TICKET --confirm TICKET
npm run desk -- send TICKET --confirm TICKET --test
npm run desk -- show TICKET
```

Risk checks market and account evidence, contract precision, quote age, margin, existing symbol exposure, and an entry price limit. The default notional ceiling is 150 settlement units. The modeled loss ceiling is 0.5% of equity, with a 10 bp entry tolerance and a 20 bp stop slippage allowance. Site-specific operator limits are listed in [.env.example](.env.example). Approvals expire with the risk result after two minutes.

A signed submission needs `CTS_H_ENABLE_ORDERS` set to the exact connection ID. With an approved ticket, `send TICKET --confirm TICKET` posts one IOC limit and its stop and target. `reconcile TICKET` verifies the exact client ID, cumulative fills, venue position and resting controls. The journal retains the send claim across restarts. Reconcile an incomplete or uncertain result by the same ID. Use `review TICKET --why "outcome"` to append a review.

Use `close-plan TICKET --why "reason"` for a full owned close. Add `--qty N` to reduce part of the owned position. Risk-check and approve the resulting child ticket before sending it. Reconcile the child to update the parent's remaining exposure and check its controls.

Use `protect TICKET --stop PRICE --control-mode overall --confirm TICKET` to move an owned stop to a valid tighter trigger that covers the whole remaining position. A fixed-quantity partial target uses `--target PRICE --qty N` after an overall stop has been verified. Add `--test` to request validation without creating an order. Reconcile after the change to confirm the venue order and scope. `clear-controls TICKET --confirm TICKET` clears known controls after the owned exposure is verified flat.

`portfolio --connection bingx-x02` reads the owned portfolio and active controls. `send-batch A,B --confirm A,B` sends up to five approved tickets on distinct markets of the same armed connection in one request. Each ticket keeps its own acknowledgement and reconciliation state. `reconcile-batch A,B` reports each observation separately. Send receipts include preflight and submit latency.

BingX references for [market data](https://github.com/BingX-API/api-ai-skills/blob/main/skills/swap-market/api-reference.md), [account data](https://github.com/BingX-API/api-ai-skills/blob/main/skills/swap-account/api-reference.md) and [order execution](https://github.com/BingX-API/api-ai-skills/blob/main/skills/swap-trade/api-reference.md).
