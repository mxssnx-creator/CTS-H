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

| Connection | Quote and candle source | Operator credential variables |
| --- | --- | --- |
| `bingx-public` | BingX mainnet public API | None |
| `bingx-x01` | BingX mainnet | `BINGX_X01_API_KEY`, `BINGX_X01_API_SECRET` |
| `bingx-x02` | BingX VST demo | `BINGX_X02_API_KEY`, `BINGX_X02_API_SECRET` |

The CLI accepts `x01`, `x02`, and the older `bingx-vst-02` alias. It accepts `_SECRET` as an alternative to `_API_SECRET`. To use the existing CTS Redis credential layout, set `CTS_H_REDIS=1` on a host with `redis-cli`. It reads `api_key` and `api_secret` under `connection:bingx-x01` or `connection:bingx-x02`, with the shorter `connection:x01` and `connection:x02` keys as fallbacks. Set `CTS_H_STATE_DIR` to a private, persistent local directory for the operator journal. The default is `$XDG_STATE_HOME/cts-h` or `~/.local/state/cts-h`. Run the operator on a separate OS account from Grok and the public web server.

## Grok Build

```sh
grok plugin install mxssnx-creator/CTS-H --trust
grok plugin validate .
```

Run validation from the local checkout. Load `desk-operating-model`, then ask the Market Analyst for a BingX brief. Use a checkout of this repository as the Grok working directory so the roles can run the public CLI. Desk role definitions live in [agents/](agents/) and the workflows in [skills/](skills/). The operator gives Risk Manager and Execution Trader the relevant ticket receipts.

## Replay

```sh
npm run desk -- replay --connection both --hours 48 \
  --symbols BTC-USDT,ETH-USDT,SOL-USDT,XRP-USDT,BCH-USDT \
  --html cts-h-replay.html --capture cts-h-candles.json

npm run desk -- replay --input cts-h-candles.json --hours 48
```

Specify a closed UTC cutoff with `--end 2026-11-27T08:00:00Z`. The engine requires contiguous one-hour candles, uses 22 bars to warm the indicators and selects one configuration per symbol on the pre window. The holdout starts flat, prices an entry at the next open, uses the adverse stop when both triggers are touched and closes any remaining simulated position at the boundary. The CLI uses the venue taker schedule and a configurable `--slip-bps` per fill. The browser replay uses the paper desk’s fixed 0.12% round-trip cost. Reports distinguish complete coverage, trade PF, green hours, and hourly drawdown. Axis and Block in this desk scale size. They preserve the base configuration's trade sequence.

Public REST history calls are paced to BingX’s allowance. Warm browser refreshes reuse closed bars and request updated quotes. Replays in the browser run in a Web Worker. The public feed and the replay do not query account endpoints. The simulation models fees and slippage but omits funding payments, queue fills, liquidation, and execution in periods the browser was disconnected.

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

A signed submission additionally needs `CTS_H_ENABLE_ORDERS` set to the exact connection ID. With an approved ticket, `send TICKET --confirm TICKET` posts one IOC limit and its stop/target bracket. `reconcile TICKET` checks the same client ID, filled quantity, venue position and resting controls. Reconcile again after a partial fill or an uncertain submission. The journal keeps the original claim across restarts. For a close, use `close-plan TICKET --why "reason"` and take the child ticket through risk, approval, send and reconciliation. Close planning uses the position ID and the exact remaining owned amount. `review TICKET --why "outcome"` appends the review. A protection mismatch is recorded as an incident for operator review in BingX.

BingX references for [market data](https://github.com/BingX-API/api-ai-skills/blob/main/skills/swap-market/api-reference.md), [account data](https://github.com/BingX-API/api-ai-skills/blob/main/skills/swap-account/api-reference.md) and [order execution](https://github.com/BingX-API/api-ai-skills/blob/main/skills/swap-trade/api-reference.md).
