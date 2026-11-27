# Staged lanes: PF convention, per-relation floors and validation

## Conventions (applied systemwide)

- **PF is net of round-trip costs.** Trade P&L already includes costs, so PF 1.00 means net zero. A window with no trades also reads 1.00 (neutral), in the engine math, the replay tables, the coverage tables and the replay page.
- **Cost floor.** Each lane needs PF ≥ max(its floor, 1 + costMultiple × costs / gross loss), with costMultiple 1.0 by default. Net profit then has to cover one round trip of costs. "PF 1.1 is 1× costs" holds whenever costs are 10% of gross loss.
- **Measured ratio.** On the research windows the costs-to-gross-loss ratio is 0.095 (median over 1,227 four-close lane windows) and 0.112 (pooled over 6,189 trades). The cost floor therefore sits at about 1.10 on this data.
- **Auto PF.** Each lane adds the engine's auto PF term, 0.15 × √(4 / max(4, closes)), so short evidence needs a higher PF.
- **Net positive.** Lanes need positive net over their window (PF ≥ 1 already implies this), and a cell needs positive net over its full history to validate and to be selected.
- **Per-relation floors.** Each lane (relation, e.g. `short8`) can have its own tuned floor. Lanes without one use `minPf` (neutral 1.0).

The coordinated engine's own gate floors (`DEFAULT_FLOORS`, calibrated exclusions) are unchanged. The convention covers the staged lanes, the PF displays and the reports.

## Settings

| Setting | Default | Where |
| --- | --- | --- |
| `minPf` | 1.00 | `DEFAULT_LANE_POLICY`, `--min-pf` |
| `laneMinPf` | `long10` 1.15, `long25` 1.40, `short4` 1.30, `short8` 1.50, `last3` 1.50 | `TUNED_LANE_MIN_PF`, `--lane-settings` |
| `costMultiple` | 1.0 | `--lane-settings` |
| `autoPenalty` / `autoSamples` | 0.15 / 4 | `--auto-penalty` |
| `requireNet` | on | `--require-net on|off` |
| `ratchetStep` | 0.05 per thin stage | `--lane-settings` |
| `reselectHours` | off | `--reselect-hours` (see below) |

`--lane-settings` takes a JSON file. [tuned-floors.json](tuned-floors.json) has the defaults.

## Tuning

The search is a coordinate search over each relation's floor, from 1.00 to 1.50 in steps of 0.05, with two passes. It runs on research windows R1–R7 only, which are 10-day holdouts with 72-hour prehistories. It is constrained to at least 800 orders and maximises net. Output: [search-research-R1-R7.json](search-research-R1-R7.json).

| Search | Floors | Research net | Research PF | Orders | Max DD | Positive windows |
| --- | --- | --- | --- | --- | --- | --- |
| Start: cost floor only | none | +1.41 | 1.023 | 1473 | — | — |
| Pass 1, grid 1.0–1.3 | short4 1.3, last3 1.3 | +1.73 | 1.028 | 1468 | 3.44 | 3/7 |
| Two passes, grid 1.00–1.50 | long10 1.15, short4 1.3, short8 1.5, last3 1.5, long25 1.4 | +3.70 | 1.063 | 1419 | 3.18 | 3/7 |

## Validation on windows the search never read

Both validation sets are used once, to score the floors. Nothing was tuned on them.

**Fresh windows** (never used anywhere, 60 markets, 130 to 160 days back) — [validation-fresh-V1-V3.txt](validation-fresh-V1-V3.txt)

| Variant | Net | PF | Orders | Max DD | Positive windows |
| --- | --- | --- | --- | --- | --- |
| Coordinated reference | −45.76 | 0.724 | 4486 | 19.60 | 0/3 |
| Staged, no per-relation floors | −7.00 | 0.697 | 526 | 3.17 | 0/3 |
| Staged, tuned floors (defaults) | −6.84 | 0.700 | 522 | 3.34 | 0/3 |

**Earlier validation windows** (used once before, 100 to 130 days back) — [validation-earlier-N1-N3.txt](validation-earlier-N1-N3.txt)

| Variant | Net | PF | Orders | Max DD | Positive windows |
| --- | --- | --- | --- | --- | --- |
| Coordinated reference | −47.48 | 0.714 | 4470 | 16.88 | 0/3 |
| Staged, no per-relation floors | −7.68 | 0.602 | 400 | 4.36 | 0/3 |
| Staged, tuned floors (defaults) | −7.16 | 0.618 | 396 | 4.28 | 0/3 |

The tuned floors improve net slightly on both validation sets (+0.16 and +0.52), and the sign agrees. The gains are small against a loss of about 7. No validation window is net positive.

## Other tests

- **Daily reselection** (`--reselect-hours 24` on the staged profile). Net −43.21 against +1.73 at window level, PF 0.84, and 6,043 orders against 1,468. Each block restarts with a 72-hour prehistory and a fresh gate, which causes churn. It stays off by default.
- **Floors reach the lanes.** Forcing `short4` to 2.0 changes the base-stage validated set from 8,409 cells to 7,570, so the floors are applied. At the defaults the chosen cells don't change, which is why the tuned and untuned holdouts can match exactly.

## Result

- The staged profile loses far less than the coordinated engine on every validation set. It places 8 to 11 times fewer orders and has a quarter to a sixth of the drawdown.
- It does not reach net positive. Across the research and validation windows, 3 of 7 research windows and 0 of 6 validation windows are net positive.
- The PF targets are not met either: staged PF is 0.60 to 0.70 on the validation sets.
- Base-stage medians of PF 4.00 mean validated cells with no losses in their windows. PF is capped at 4 in the reports.

## Files

- `tuned-floors.json`, `search-research-R1-R7.json`: the floors and the search trace.
- `validation-fresh-V1-V3.txt`, `validation-earlier-N1-N3.txt`: the validation outputs.
- `staged-fresh-window.html`, `staged-fresh-window.md`: the staged profile with the defaults on the fresh window, generated by the CLI.
