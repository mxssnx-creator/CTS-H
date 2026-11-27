# Staged lanes: position-history evaluation

## Terms

- **Cell**: one candidate configuration on one market (symbol × indication × bracket × coordination).
- **Closes**: a cell's closed positions in exit order, each with its P&L. Prehistory closes come from replaying the cell over the prehistory window; holdout closes come from the replay itself.
- **Lane**: one independent evaluation of a cell's last N closes. A lane has a kind (`long`, `short`, `last`), a window N, a mode and a minimum PF. Every lane is calculated on its own; no lane reads another lane's result.
  - `positive` mode: the lane can confirm a cell (PF ≥ minPf) but never vetoes it.
  - `both` mode: the lane can confirm a cell or veto it (PF < minPf with enough samples).
- **Stage**: a set of lanes applied to the cells that survived the previous stage.
- **Validation**: a cell is validated when no lane vetoes it and at least one lane confirms it. A lane with too few samples (fewer than `min(N, 4)` closes) gives no evidence and neither confirms nor vetoes.
- **Shadow position**: a signal that is blocked by the holdout gate still opens a position that is tracked but not booked. Its closes feed the lanes, so a vetoed cell can recover.
- **Stacking**: up to `perSymbol` validated cells trade the same market. Each cell has its own leg and notional; book totals are the sums of the cell replays.

## Stages

| Stage | Input | Lanes |
| --- | --- | --- |
| Base | every cell in the pool | long 10, 20, 30 (both); short 4, 8 (both); last 1–4 (both) |
| Main | Base-validated cells only | short 8, 12, 16 (positive); last 1–4 (both) |
| Thin 1 | Main-validated cells only | short 8–16 step 2 (positive); last 1–4 (both) |
| Thin 2 | Thin 1-validated cells only | short 8–16 step 1 (positive); long 10–30 step 5 (both); last 1–4 (both) |

Interpretation: the specification asks every lane to check negative and positive results, with Main's short lanes as the exception (positive-only). Long lanes therefore veto as well. Each thin stage raises the PF bar by 0.05 (Thin 1 at 1.05, Thin 2 at 1.10), so refinement can reject cells that the stage before validated. Stages recurse until the plan is exhausted or the validated set is empty.

Evidence floor: a lane gives evidence only when the cell has at least 4 closes in total. The window then selects the most recent closes it reads. Without the floor a single winning close could validate a cell.

## Holdout

- Every selected cell replays the holdout with its last-stage lanes applied to its closes so far, including prehistory closes.
- An entry is booked only when the cell is validated at the entry bar. Otherwise it opens a shadow position.
- Closes are recorded before the next bar's entry decision, so no lookahead is possible.

## Selection

- Per market, the top `perSymbol` validated cells are chosen by prehistory net P&L (`rank: "net"`, default), requiring at least `minCloses` closes (default 6). `rank: "pf"` is available. Ties go to more closes. The default is one cell per market.

## Statistics

- Per stage: input cells, validated, vetoed, validated share, median PF in and out, and the relation `out/in`.
- Per lane: evaluated, confirmed, vetoed, and median PF.
- Per selected cell: prehistory PF and closes, holdout booked orders, blocked (shadow) entries and shadow PF.
- Book totals, drawdown and hourly green share, as in the existing coordinated profile.

## Validation protocol

- Up to 57 usable markets (the rest were rate-limited by BingX), 10-day holdout (240 h) with a 3-day prehistory (72 h), 1h candles.
- Windows: R1–R4 and R5–R7 are research windows; TEST (latest 10 days) was used once in the first round and is not a clean holdout any more; TEST2 (a window ending 50 days back) was held out and evaluated once.
- Choices were made on research windows only. The results and their limits are in reports/staged-lanes-10d-60-markets/README.md.
- Targets: high PF, low drawdown, high share of positive hours, and a high count of booked orders. Not met (see the report).

## Out of scope

- Overlays (Axis, Block, DCA, Relate) are not applied inside the staged holdout. Use the coordinated profile for overlays.
- Daily reselection and independent indication books are not combined with the staged profile.

## Conventions and settings (current)

- PF is computed on P&L after round-trip costs. PF 1.0 is neutral, and a window with no trades reads 1.00.
- Each lane needs PF ≥ max(its floor, 1 + costMultiple × costs / gross loss), plus the auto PF term 0.15 × √(4 / max(4, closes)) and the thin-stage ratchet. The cost multiple defaults to 1.0, so PF 1.1 is one round trip of costs when costs are 10% of gross loss.
- Each relation (lane id, e.g. `short8`) has its own floor. The defaults are in `TUNED_LANE_MIN_PF`, tuned on research windows R1–R7 and checked on validation windows. Settings can be overridden with `--lane-settings`.
- Lanes and the full-history validation need positive net. Daily reselection exists (`--reselect-hours`) but is off: it performed much worse.
- Results and their limits: `reports/staged-lanes-policy/README.md`.
