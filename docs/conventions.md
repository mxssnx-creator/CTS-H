# Conventions (audited)

Every profit factor, net and cost in the desk follows these rules. The audit suite (`src/lib/desk/audit.test.ts`) checks them as invariants on the real functions.

## Costs and P&L
- The round-trip cost is `POSITION_RT_COST_PCT` (0.12%), charged on each closed leg at its average price (`positionRtCost`).
- A closed trade's net P&L is `closePnl`, after cost. Gross is net plus cost: `gross = (exit - entry) x side x qty`.

## Profit factor
- PF = gross profit over gross loss, both on closed-trade net P&L after costs.
- 1.00 is neutral: net zero reads 1.00, and so does a window or cell with no trades.
- A record with gains and no losses reads the no-loss cap (4.00 in computations, "No losses" in displays).
- PF is never computed on gross P&L, and never with a hand-written formula: every place goes through `profitFactor`.

## Net
- Net is closed-trade P&L after costs. It equals gross profit minus gross loss.
- Open positions are marked to market at the close, and the mark includes the cost of exiting. The mark is equity, not net.

## Equity and drawdown
- Equity is net plus the open marks. Drawdown, the hourly green count and the staged book's equity follow equity.
- Net and PF never include the open marks.

## Cost floor and "1.1 = one round trip"
- Costs relative to losses: `costRatio = sum of costs / sum of net losses`, the same denominator as PF.
- The lane floor is `1 + costMultiple x costRatio`. With `costMultiple` 1, a PF of 1.1 is one round trip of costs when costs are 10% of gross loss.

## Micro sets
- Percent brackets: target = entry + side x (tp% x entry + cost), stop = entry - side x (sl% x entry + cost). A target nets +tp%. A stop nets -(sl% + 2 x cost), because the stop distance includes the cost and the round trip is charged again on exit. This is the literal reading of "additionally to costs", and it is the largest structural drag on tight brackets.
- ATR brackets: target and stop are multiples of the ATR at the signal bar, plus the cost on the same side.
- Sets that never trade have net 0 and PF 1.00. Their IDs carry an `atr` token only on ATR brackets.

## Where each number is shown
- Replay and staged reports: "net" is closed-trade net; equity and drawdown are shown separately.
- Period tables: net is closed-trade; drawdown and positive hours use equity.
- Micro studies: net and PF are booked-fill values; equityEnd equals net once every position is flat.
