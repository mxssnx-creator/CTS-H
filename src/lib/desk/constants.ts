export const POSITION_COST_PCT = 0.0012;
export const POSITION_RT_COST_PCT = 0.0012;
export const PF_NO_LOSS = 4;
export const AXIS_PARTIAL_RATIO = 3;
export const BLOCK_ADD = 0.2;
export const BLOCK_SHARED = 1.5;
export const BLOCK_OVERALL = 1.5;
export const MAX_MUL = 2.5;
export const ENGINE_VF = 1;
export const TRAIL_PCT = 1.5;
export const LIVE_BLOCK_COUNTS = [1, 3, 4, 5, 6] as const;
export const LASTN = { eval: 50, valid: 15, disable: 12, minSamples: 4 };
export const PF = {
  overall: 1.35,
  base: 1,
  axis: 1.15,
  block: 1.2,
  short: 0.95,
  shortBase: 0.7,
  shortAxis: 0.9,
  shortBlock: 1.15,
};
export const LIVE_SHORT = { minTp: 0.48, minSlOfTp: 0.75, maxTp: 0.6 };
export const SHORT_TP = [
  0.3, 0.32, 0.34, 0.36, 0.38, 0.4, 0.42, 0.45, 0.48, 0.5, 0.52, 0.55, 0.58, 0.6,
];
export const SHORT_SL = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5];
export const TAG = "CTSH_";
export const BOOK = 10_000;
export const MAX_HOLD = 24;
export const MODEL_STOP_RISK = 0.008;
export const WIDE_TP_ATR = [0.8, 1, 1.2, 1.4, 1.6, 1.8, 2];
export const WIDE_SL_OF_TP = [0.5, 0.75, 1, 1.25, 1.5];
export const MAX_LIVE_LEGS = 12;

export const ACTIONS = [
  "intern_arm",
  "intern_all_pre",
  "promote_real",
  "live_paper_execute",
  "block_volume",
  "axis_volume",
  "protect_grid",
  "trail_1_5",
  "flatten_own",
  "flatten_losers",
  "change_floors",
  "enable_dca",
  "enable_relate",
  "enable_normal_live",
  "connect_exchange",
] as const;

export type ActionId = (typeof ACTIONS)[number];

export const ACTION_COPY: Record<ActionId, string> = {
  intern_arm: "Arm scoring for eligible short-grid configurations",
  intern_all_pre: "Walk closed 1h bars through the enabled paper configurations",
  promote_real: "Promote last-N valid cells onto the performing set",
  live_paper_execute: "Open gated paper legs tagged CTS-H on the live tape",
  block_volume: "Allow funded Block additions before the target",
  axis_volume: "Allow Axis sizing when the lane qualifies",
  protect_grid: "Keep one SL and one TP on each owned leg",
  trail_1_5: "Allow managed trailing stops",
  flatten_own: "Flatten positions whose system, connection, and type match the active scope",
  flatten_losers: "Flatten in-scope positions that are underwater",
  change_floors: "Edit PF floors used by the gate",
  enable_dca: "Allow risk-bounded DCA additions",
  enable_relate: "Allow Relate sizing for qualifying close histories",
  enable_normal_live: "Let the unadjusted direction lane print live",
  connect_exchange:
    "Select the exchange connection. Only the active system, connection, and type are affected",
};

export const PREFERRED_SYMBOLS = [
  "BTC-USDT",
  "ETH-USDT",
  "SOL-USDT",
  "XRP-USDT",
  "DOGE-USDT",
  "AVAX-USDT",
  "LINK-USDT",
  "BNB-USDT",
  "ARB-USDT",
  "SUI-USDT",
  "BCH-USDT",
  "LTC-USDT",
  "ADA-USDT",
  "HBAR-USDT",
  "DOT-USDT",
  "NEAR-USDT",
];

// Liquid USDT perpetuals listed on both CTS-H BingX routes.
export const REPLAY_SYMBOLS = [
  ...PREFERRED_SYMBOLS,
  "AAVE-USDT",
  "UNI-USDT",
  "ATOM-USDT",
  "FIL-USDT",
  "INJ-USDT",
  "OP-USDT",
  "ETC-USDT",
  "APT-USDT",
  "SEI-USDT",
  "WLD-USDT",
  "ALGO-USDT",
  "XLM-USDT",
  "TRX-USDT",
  "FET-USDT",
  "GRT-USDT",
  "STX-USDT",
  "RUNE-USDT",
  "TIA-USDT",
  "JUP-USDT",
  "ONDO-USDT",
  "VET-USDT",
  "IMX-USDT",
  "ENS-USDT",
  "LDO-USDT",
  "SAND-USDT",
  "MANA-USDT",
  "DYDX-USDT",
  "CRV-USDT",
  "ZEC-USDT",
  "DASH-USDT",
  "PENDLE-USDT",
  "COMP-USDT",
  "ZRX-USDT",
  "NEO-USDT",
];

export const LEGACY_INDICATIONS = [
  "direction",
  "move",
  "break",
  "rsi",
  "macd",
  "bollinger",
  "ema",
  "active",
] as const;
export const NEW_INDICATIONS = ["pullback", "rangeFade"] as const;
export const INDICATIONS = [...LEGACY_INDICATIONS, ...NEW_INDICATIONS] as const;
export type Indication = (typeof INDICATIONS)[number];
export const INDICATION_LABELS: Record<Indication, string> = {
  direction: "Trend direction",
  move: "Price impulse",
  break: "Range breakout",
  rsi: "RSI",
  macd: "MACD",
  bollinger: "Bollinger",
  ema: "EMA cross",
  active: "Volume activity",
  pullback: "EMA pullback",
  rangeFade: "Range fade",
};

export type Floors = {
  overall: number;
  short: number;
  base: number;
  axis: number;
  block: number;
};

export const DEFAULT_FLOORS: Floors = {
  overall: PF.overall,
  short: PF.short,
  base: PF.base,
  axis: PF.axis,
  block: PF.block,
};
