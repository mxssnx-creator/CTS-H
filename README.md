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

The CLI defaults to 50 USDT perpetuals available on both BingX feeds. The web desk follows 16 markets and replays their hourly candles in a Web Worker.

```sh
npm run desk -- replay --connection both --hours 48 --profile all \
  --html cts-h-replay.html --capture cts-h-candles.json
npm run desk -- replay --input cts-h-candles.json --hours 48 --profile all
npm run desk -- replay --connection both --hours 168 --pre-hours 72 --interval 1h \
  --end 2026-11-27T08:00:00Z --profile all --html cts-h-weekly.html
npm run desk -- replay --connection bingx-x02 --hours 168 --pre-hours 72 --interval 30m \
  --symbols BTC-USDT,ETH-USDT --indication break --range wide --strategies block
```

Use `--history-hours 1000` for a continuous capture that supports earlier cutoffs. BingX history requests are paced and captures exceeding 1,000 candles are paginated. The browser refreshes quotes independently of hourly candle downloads.

The CLI accepts 1m, 5m, 15m, 30m, 1h and 4h candles. The engine warms indicators on 22 contiguous candles and selects one configuration per market using the pre window. Holdout entries use the next open, ambiguous stops and targets settle at the stop, and open positions close at the boundary. The maximum hold is 24 candles. Profitable periods use hourly equity on intervals up to 1h and four-hour equity on 4h candles. Drawdown uses candle equity. The CLI models the venue taker fee and configurable `--slip-bps` per fill. The browser uses a fixed 0.12% round-trip cost. Funding payments, depth-limited execution and liquidation are outside the model.

### Configuration selection

The default **coordinated** profile qualifies each enabled indication, bracket and stop mode independently. It ranks eligible candidates by profitable periods and uses realized P&L to break ties. It adds EMA pullback and range fade. The **filtered** profile adds 0.8–2.0 ATR targets with 0.5–1.5× stop-to-target ratios to the execution-eligible short grid. The **baseline** preserves the original grid. Filtered and coordinated sizing cap modeled stop risk plus costs at 0.8% of planned position notional. Coordinated sizing reduces entry size after two consecutive losses.

Published exclusions apply to calibrated 1h configurations on their own connection, symbol, indication and bracket. An exclusion required at least 24 closes, pooled PF no greater than 0.80, at least three losing periods with six or more closes each and zero adequately sampled winning periods. The rules take effect after the last calibration cutoff.

Rebuild the evidence from a continuous capture. The optional `--policy` argument exports the lists to a new TypeScript file.

```sh
node scripts/cts-h-calibrate.ts --input cts-h-history.json \
  --end 2026-10-22T08:00:00Z --end 2026-10-26T08:00:00Z \
  --end 2026-10-30T08:00:00Z --end 2026-11-03T08:00:00Z \
  --end 2026-11-07T08:00:00Z --end 2026-11-11T08:00:00Z
```

### Strategy controls

Settings stores indication and range selections, exit modes, volume factor and strategy settings per connection. The volume factor runs from 0.1× to 10× in 0.1× steps and defaults to 1×. It applies to paper entries and coordinated replay. Signed tickets use their approved quantities.

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
