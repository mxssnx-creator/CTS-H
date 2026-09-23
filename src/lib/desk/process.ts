import { INDICATIONS, LASTN, MAX_HOLD, MAX_MUL, PF, TAG, TRAIL_PCT, type Floors, type Indication } from "./constants";
import { saneBars } from "./heal";
import { allShortCombos, axisQty, blockQty, capTotalQty, closePnl, comboId, liveShortOk, pfFromPnls, positionNotional } from "./math";

export type Bar = { t: number; o: number; h: number; l: number; c: number; v: number };

export type Side = 1 | -1;

export type Cell = {
  id: string;
  symbol: string;
  indication: Indication;
  tpAtr: number;
  slOfTp: number;
  liveFloor: boolean;
  n: number;
  wins: number;
  gw: number;
  gl: number;
  net: number;
  pf: number;
  validExec: boolean;
  disabled: boolean;
  lastN: number[];
  cursorT: number;
  side: Side | 0;
  leg: OpenLeg | null;
};

type OpenLeg = {
  side: Side;
  entry: number;
  sl: number;
  tp: number;
  qty: number;
  hold: number;
};

export type LivePos = {
  id: string;
  symbol: string;
  side: Side;
  qty: number;
  qtyBase: number;
  entry: number;
  mark: number;
  peak: number;
  sl: number;
  tp: number;
  combo: string;
  indication: string;
  hold: number;
  dca: number;
  openedAt: number;
  system: string;
  connection: string;
  type: "position";
};

export type TapeFill = {
  id: string;
  tape: "intern" | "live";
  symbol: string;
  combo: string;
  pnl: number;
  px: number;
  ts: number;
  side: Side;
  indication?: string;
};

export type Series = {
  atr: number[];
  ema9: number[];
  ema12: number[];
  ema21: number[];
  ema26: number[];
  rsi: number[];
  mid: number[];
  sd: number[];
  vol: number[];
};

const PF_NO_LOSS_NEAR = 3.999;

export function atrSeries(bars: Bar[], n = 14): number[] {
  const out = new Array<number>(bars.length).fill(0);
  let prev = bars[0]?.c ?? 0;
  let atr = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]!;
    const tr = Math.max(b.h - b.l, Math.abs(b.h - prev), Math.abs(b.l - prev));
    atr = i === 0 ? tr : (atr * (n - 1) + tr) / n;
    out[i] = atr;
    prev = b.c;
  }
  return out;
}

function emaSeries(bars: Bar[], n: number): number[] {
  const out = new Array<number>(bars.length).fill(0);
  if (!bars.length) return out;
  const k = 2 / (n + 1);
  let e = bars[0]!.c;
  out[0] = e;
  for (let i = 1; i < bars.length; i++) {
    e = bars[i]!.c * k + e * (1 - k);
    out[i] = e;
  }
  return out;
}

function rsiSeries(bars: Bar[], n = 14): number[] {
  const out = new Array<number>(bars.length).fill(50);
  if (bars.length < n + 1) return out;
  let g = 0;
  let l = 0;
  for (let i = 1; i <= n; i++) {
    const d = bars[i]!.c - bars[i - 1]!.c;
    if (d >= 0) g += d;
    else l -= d;
  }
  const pack = (i: number, gain: number, loss: number) => {
    if (loss <= 0) out[i] = 100;
    else {
      const rs = gain / loss;
      out[i] = 100 - 100 / (1 + rs);
    }
  };
  pack(n, g, l);
  for (let i = n + 1; i < bars.length; i++) {
    const d = bars[i]!.c - bars[i - 1]!.c;
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    g = (g * (n - 1) + gain) / n;
    l = (l * (n - 1) + loss) / n;
    pack(i, g, l);
  }
  return out;
}

function bbSeries(bars: Bar[], n = 20): { mid: number[]; sd: number[] } {
  const mid = new Array<number>(bars.length).fill(0);
  const sd = new Array<number>(bars.length).fill(0);
  let sum = 0;
  let sum2 = 0;
  for (let i = 0; i < bars.length; i++) {
    const c = bars[i]!.c;
    sum += c;
    sum2 += c * c;
    if (i >= n) {
      const old = bars[i - n]!.c;
      sum -= old;
      sum2 -= old * old;
    }
    const len = Math.min(i + 1, n);
    const m = sum / len;
    const v = Math.max(0, sum2 / len - m * m);
    mid[i] = m;
    sd[i] = Math.sqrt(v);
  }
  return { mid, sd };
}

export function buildSeries(bars: Bar[]): Series {
  const { mid, sd } = bbSeries(bars);
  return {
    atr: atrSeries(bars),
    ema9: emaSeries(bars, 9),
    ema12: emaSeries(bars, 12),
    ema21: emaSeries(bars, 21),
    ema26: emaSeries(bars, 26),
    rsi: rsiSeries(bars),
    mid,
    sd,
    vol: emaSeries(
      bars.map((b) => ({ ...b, c: b.v })),
      20,
    ),
  };
}

export function rsiLast(bars: Bar[], n = 14): number {
  return rsiSeries(bars, n).at(-1) ?? 50;
}

export function emaLast(bars: Bar[], n: number): number {
  return emaSeries(bars, n).at(-1) ?? 0;
}

export function signalAt(ind: Indication, bars: Bar[], s: Series, i: number): Side | 0 {
  if (i < 21 || i >= bars.length) return 0;
  const b = bars[i]!;
  const a = Math.max(s.atr[i] ?? 0, b.c * 0.0004);
  const impulse = (b.c - b.o) / a;
  switch (ind) {
    case "direction": {
      const prev = (s.ema9[i - 1] ?? 0) - (s.ema21[i - 1] ?? 0);
      const now = (s.ema9[i] ?? 0) - (s.ema21[i] ?? 0);
      if (prev <= 0 && now > 0) return 1;
      if (prev >= 0 && now < 0) return -1;
      return 0;
    }
    case "move":
      if (impulse > 0.35) return 1;
      if (impulse < -0.35) return -1;
      return 0;
    case "break": {
      let hi = -Infinity;
      let lo = Infinity;
      for (let k = Math.max(0, i - 8); k < i; k++) {
        hi = Math.max(hi, bars[k]!.h);
        lo = Math.min(lo, bars[k]!.l);
      }
      if (b.c > hi) return 1;
      if (b.c < lo) return -1;
      return 0;
    }
    case "rsi": {
      const r = s.rsi[i] ?? 50;
      const p = s.rsi[i - 1] ?? 50;
      if (p < 35 && r >= 35) return 1;
      if (p > 65 && r <= 65) return -1;
      return 0;
    }
    case "macd": {
      const m0 = (s.ema12[i - 1] ?? 0) - (s.ema26[i - 1] ?? 0);
      const m1 = (s.ema12[i] ?? 0) - (s.ema26[i] ?? 0);
      if (m0 <= 0 && m1 > 0) return 1;
      if (m0 >= 0 && m1 < 0) return -1;
      return 0;
    }
    case "bollinger": {
      const mid = s.mid[i] ?? b.c;
      const sd = s.sd[i] ?? 0;
      if (!(sd > 0)) return 0;
      if (b.c < mid - 2 * sd) return 1;
      if (b.c > mid + 2 * sd) return -1;
      return 0;
    }
    case "ema":
      if (b.c > (s.ema21[i] ?? b.c) && bars[i - 1]!.c <= (s.ema21[i - 1] ?? b.c)) return 1;
      if (b.c < (s.ema21[i] ?? b.c) && bars[i - 1]!.c >= (s.ema21[i - 1] ?? b.c)) return -1;
      return 0;
    case "active": {
      const vol = s.vol[i] || b.v || 1;
      if (b.v < vol) return 0;
      if (impulse > 0.25) return 1;
      if (impulse < -0.25) return -1;
      return 0;
    }
    default:
      return 0;
  }
}

export type IndicationRow = {
  name: Indication;
  side: Side | 0;
  detail: string;
};

export function indicationBoard(bars: Bar[]): IndicationRow[] {
  const closed = closedBars(bars);
  if (closed.length < 24) {
    return INDICATIONS.map((name) => ({ name, side: 0 as const, detail: "waiting for closed bars" }));
  }
  const series = buildSeries(closed);
  const i = closed.length - 1;
  const b = closed[i]!;
  const a = Math.max(series.atr[i] ?? 0, b.c * 0.0004);
  const impulse = (b.c - b.o) / a;
  const z = (series.sd[i] ?? 0) > 0 ? (b.c - (series.mid[i] ?? b.c)) / (series.sd[i] ?? 1) : 0;
  return INDICATIONS.map((name) => {
    const side = signalAt(name, closed, series, i);
    const detail =
      name === "direction"
        ? `ema9 ${series.ema9[i]!.toFixed(4)} · ema21 ${series.ema21[i]!.toFixed(4)}`
        : name === "move"
          ? `impulse ${impulse.toFixed(2)} ATR`
          : name === "break"
            ? `close ${b.c} vs prior 8-bar range`
            : name === "rsi"
              ? `RSI ${series.rsi[i]!.toFixed(1)}`
              : name === "macd"
                ? `macd ${((series.ema12[i] ?? 0) - (series.ema26[i] ?? 0)).toFixed(4)}`
                : name === "bollinger"
                  ? `z ${z.toFixed(2)}`
                  : name === "ema"
                    ? `close vs ema21 ${((b.c / (series.ema21[i] || b.c) - 1) * 100).toFixed(3)}%`
                    : `vol ${b.v.toFixed(2)} vs ema ${series.vol[i]!.toFixed(2)}`;
    return { name, side, detail };
  });
}

function closedBars(bars: Bar[]): Bar[] {
  return bars.length > 1 ? bars.slice(0, -1) : bars;
}

function indexAfter(bars: Bar[], t: number): number {
  let lo = 0;
  let hi = bars.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid]!.t <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function pushPnl(cell: Cell, pnl: number) {
  if (!Number.isFinite(pnl)) return;
  cell.n += 1;
  cell.net += pnl;
  cell.lastN.push(pnl);
  if (cell.lastN.length > LASTN.eval) cell.lastN.shift();
  if (pnl >= 0) {
    cell.wins += 1;
    cell.gw += pnl;
  } else cell.gl += Math.abs(pnl);
  cell.pf = cell.gl < 1e-12 ? (cell.gw > 1e-12 ? 4 : 0) : cell.gw / cell.gl;
}

export function gateCell(cell: Cell, floors: Floors) {
  const slice = cell.lastN.slice(-LASTN.valid);
  const net = slice.reduce((a, b) => a + b, 0);
  const pf = pfFromPnls(slice.map((p) => ({ pnl: p })));
  const undersampled = slice.length < LASTN.minSamples;
  const pass = !undersampled && pf >= floors.short && net >= 0;
  const proven = cell.n >= 6 && cell.pf >= floors.short && cell.net > 0 && !(cell.pf >= PF_NO_LOSS_NEAR && cell.net <= 1e-6);
  cell.validExec = cell.liveFloor && cell.n >= LASTN.minSamples && (cell.n < 6 ? pass : proven && pass);
  const dis = cell.lastN.slice(-LASTN.disable);
  const disNet = dis.reduce((a, b) => a + b, 0);
  const validStill = cell.validExec;
  cell.disabled = !validStill && dis.length >= LASTN.minSamples && disNet < 0;
}

function blankCell(symbol: string, indication: Indication, tpAtr: number, slOfTp: number): Cell {
  return {
    id: `${symbol}|${indication}|${comboId(tpAtr, slOfTp)}`,
    symbol,
    indication,
    tpAtr,
    slOfTp,
    liveFloor: liveShortOk(tpAtr, slOfTp),
    n: 0,
    wins: 0,
    gw: 0,
    gl: 0,
    net: 0,
    pf: 0,
    validExec: false,
    disabled: false,
    lastN: [],
    cursorT: 0,
    side: 0,
    leg: null,
  };
}

export function exitOnBar(
  side: Side,
  tp: number,
  sl: number,
  bar: Bar,
  hold: number,
): { exit: number; reason: "tp" | "sl" | "time" } | null {
  const hitTp = side > 0 ? bar.h >= tp : bar.l <= tp;
  const hitSl = side > 0 ? bar.l <= sl : bar.h >= sl;
  if (!(hitTp || hitSl || hold >= MAX_HOLD)) return null;
  if (hitTp && hitSl) {
    const bull = bar.c >= bar.o;
    const slFirst = side > 0 ? bull : !bull;
    return slFirst ? { exit: sl, reason: "sl" } : { exit: tp, reason: "tp" };
  }
  if (hitSl) return { exit: sl, reason: "sl" };
  if (hitTp) return { exit: tp, reason: "tp" };
  return { exit: bar.c, reason: "time" };
}

function advance(
  cell: Cell,
  bars: Bar[],
  sides: Array<Side | 0>,
  atr: number[],
  notional: number,
  from: number,
  push: (fill: TapeFill) => void,
) {
  const start = Math.max(from, 22);
  for (let i = start; i < bars.length; i++) {
    const b = bars[i]!;
    const a = Math.max(atr[i] ?? 0, b.c * 0.0004);
    if (!cell.leg) {
      const side = sides[i] ?? 0;
      cell.cursorT = b.t;
      if (!side) continue;
      const tpDist = cell.tpAtr * a;
      const slDist = cell.slOfTp * tpDist;
      cell.side = side;
      cell.leg = {
        side,
        entry: b.c,
        tp: b.c + side * tpDist,
        sl: b.c - side * slDist,
        qty: notional / b.c,
        hold: 0,
      };
      continue;
    }
    const leg = cell.leg;
    leg.hold += 1;
    const hit = exitOnBar(leg.side, leg.tp, leg.sl, b, leg.hold);
    cell.cursorT = b.t;
    if (!hit) continue;
    const pnl = closePnl(leg.side, leg.entry, hit.exit, leg.qty);
    pushPnl(cell, pnl);
    push({
      id: `i:${cell.id}:${b.t}`,
      tape: "intern",
      symbol: cell.symbol,
      combo: comboId(cell.tpAtr, cell.slOfTp),
      pnl,
      px: hit.exit,
      ts: b.t,
      side: leg.side,
      indication: cell.indication,
    });
    cell.leg = null;
  }
  const last = bars.at(-1);
  if (last) cell.cursorT = last.t;
  if (!cell.leg) cell.side = sides[bars.length - 1] ?? 0;
}

export function syncBooks(
  prev: Cell[],
  books: { symbol: string; bars: Bar[] }[],
  equity: number,
  floors: Floors,
): { cells: Cell[]; internFills: TapeFill[]; closes: number; valid: number; symbols: number } {
  const byId = new Map(prev.map((c) => [c.id, c]));
  const notional = positionNotional(equity);
  const combos = allShortCombos();
  const cells: Cell[] = [];
  const cap = 240;
  const ring: TapeFill[] = [];
  let seq = 0;
  const push = (fill: TapeFill) => {
    if (seq < cap) ring.push(fill);
    else ring[seq % cap] = fill;
    seq += 1;
  };
  let closes = 0;
  let symbols = 0;
  for (const book of books) {
    const bars = closedBars(saneBars(book.bars));
    if (bars.length < 24) continue;
    symbols += 1;
    const series = buildSeries(bars);
    const sides = {} as Record<Indication, Array<Side | 0>>;
    for (const indication of INDICATIONS) {
      const row: Array<Side | 0> = new Array(bars.length).fill(0);
      for (let i = 22; i < bars.length; i++) row[i] = signalAt(indication, bars, series, i);
      sides[indication] = row;
    }
    for (const combo of combos) {
      for (const indication of INDICATIONS) {
        const id = `${book.symbol}|${indication}|${comboId(combo.tpAtr, combo.slOfTp)}`;
        const lastT = bars.at(-1)?.t ?? 0;
        const prior = byId.get(id);
        const stale = !!prior && prior.cursorT > lastT;
        const cell = prior && !stale
          ? { ...prior, lastN: prior.lastN.slice(), leg: prior.leg ? { ...prior.leg } : null }
          : blankCell(book.symbol, indication, combo.tpAtr, combo.slOfTp);
        const from = cell.cursorT ? indexAfter(bars, cell.cursorT) : 22;
        const before = cell.n;
        advance(cell, bars, sides[indication]!, series.atr, notional, from, push);
        closes += cell.n - before;
        gateCell(cell, floors);
        cells.push(cell);
      }
    }
  }
  let valid = 0;
  for (const c of cells) if (c.validExec && !c.disabled) valid += 1;
  const internFills = seq <= cap ? ring : ring.slice(seq % cap).concat(ring.slice(0, seq % cap));
  return { cells, internFills, closes, valid, symbols };
}

export function applyFloors(cells: Cell[], floors: Floors): Cell[] {
  return cells.map((c) => {
    const next = { ...c, lastN: c.lastN, leg: c.leg };
    gateCell(next, floors);
    return next;
  });
}

export type SizeOpts = { block: boolean; axis: boolean; normalLive: boolean; hedge: boolean };

export function sizedNotional(base: number, opts: { block: boolean; axis: boolean }): number {
  if (!(base > 0)) return 0;
  if (opts.axis && opts.block) {
    const ax = axisQty(base);
    const bl = blockQty(base);
    return capTotalQty(base, ax - base + (bl - base));
  }
  if (opts.axis) return axisQty(base);
  if (opts.block) return blockQty(base);
  return base;
}

export function openFromPerforming(
  cells: Cell[],
  marks: Record<string, { price: number; atr: number }>,
  equity: number,
  opts: SizeOpts,
  scope: { system: string; connection: string },
): LivePos[] {
  const ranked = cells
    .filter((c) => c.validExec && !c.disabled && c.liveFloor && c.net > 0 && (c.side === 1 || c.side === -1))
    .filter((c) => opts.normalLive || c.indication !== "direction")
    .sort((a, b) => b.pf - a.pf || b.net - a.net);
  const seen = new Set<string>();
  const symbols = new Set<string>();
  const out: LivePos[] = [];
  const base = positionNotional(equity);
  for (const c of ranked) {
    if (out.length >= 12) break;
    const key = `${c.symbol}:${c.indication}`;
    if (seen.has(key)) continue;
    if (!opts.hedge && symbols.has(c.symbol)) continue;
    const m = marks[c.symbol];
    if (!m || !(m.price > 0) || !(m.atr > 0)) continue;
    seen.add(key);
    symbols.add(c.symbol);
    const side = c.side as Side;
    const a = Math.max(m.atr, m.price * 0.0008);
    const notional = sizedNotional(base, opts);
    const qty = notional / m.price;
    const tpDist = c.tpAtr * a;
    const slDist = c.slOfTp * tpDist;
    out.push({
      id: `x:${TAG}${c.symbol.replace("-", "")}${c.indication.slice(0, 3)}${out.length}`,
      symbol: c.symbol,
      side,
      qty,
      qtyBase: base / m.price,
      entry: m.price,
      mark: m.price,
      peak: m.price,
      tp: m.price + side * tpDist,
      sl: m.price - side * slDist,
      combo: comboId(c.tpAtr, c.slOfTp),
      indication: c.indication,
      hold: 0,
      dca: 0,
      openedAt: Date.now(),
      system: scope.system,
      connection: scope.connection,
      type: "position",
    });
  }
  return out;
}

export function mergeFills(prev: TapeFill[], next: TapeFill[], cap = 240): TapeFill[] {
  if (!next.length) return prev;
  const seen = new Set(prev.map((f) => f.id));
  const add = next.filter((f) => !seen.has(f.id));
  if (!add.length) return prev;
  return [...add].reverse().concat(prev).slice(0, cap);
}

export function markPositions(
  positions: LivePos[],
  prices: Record<string, number>,
  opts: { trail: boolean; dca: boolean; equity: number; asOf?: number },
): { open: LivePos[]; closed: { pos: LivePos; pnl: number; px: number; reason: string }[]; dca: LivePos[] } {
  const open: LivePos[] = [];
  const closed: { pos: LivePos; pnl: number; px: number; reason: string }[] = [];
  const dca: LivePos[] = [];
  const base = positionNotional(opts.equity);
  for (const p of positions) {
    const px = prices[p.symbol];
    if (!(px > 0)) {
      open.push(p);
      continue;
    }
    const asOf = opts.asOf ?? 0;
    const elapsed = asOf > 0 ? Math.floor(asOf / 3_600_000) - Math.floor(p.openedAt / 3_600_000) : p.hold;
    const next: LivePos = { ...p, mark: px, hold: Math.max(p.hold, elapsed) };
    if (next.side > 0) next.peak = Math.max(next.peak, px);
    else next.peak = Math.min(next.peak, px);
    if (opts.trail) {
      const dist = next.peak * (TRAIL_PCT / 100);
      if (next.side > 0) next.sl = Math.min(next.tp, Math.max(next.sl, next.peak - dist));
      else next.sl = Math.max(next.tp, Math.min(next.sl, next.peak + dist));
    }
    if (opts.dca && next.dca < 2) {
      const adverse = next.side > 0 ? next.entry - px : px - next.entry;
      const room = next.qtyBase * MAX_MUL - next.qty;
      if (adverse > Math.abs(next.entry - next.sl) * 0.45 && room > 0) {
        const add = Math.min(room, base / px);
        if (add > 0) {
          next.entry = (next.entry * next.qty + px * add) / (next.qty + add);
          next.qty += add;
          next.dca += 1;
          dca.push(next);
        }
      }
    }
    next.qty = Math.min(next.qty, next.qtyBase * MAX_MUL);
    const hitTp = next.side > 0 ? px >= next.tp : px <= next.tp;
    const hitSl = next.side > 0 ? px <= next.sl : px >= next.sl;
    if (hitSl) {
      closed.push({ pos: next, pnl: closePnl(next.side, next.entry, next.sl, next.qty), px: next.sl, reason: "sl" });
    } else if (hitTp) {
      closed.push({ pos: next, pnl: closePnl(next.side, next.entry, next.tp, next.qty), px: next.tp, reason: "tp" });
    } else if (next.hold >= MAX_HOLD) {
      closed.push({ pos: next, pnl: closePnl(next.side, next.entry, px, next.qty), px, reason: "hold" });
    } else open.push(next);
  }
  return { open, closed, dca };
}

export function headline(livePnls: { symbol: string; combo: string; pnl: number }[], minPf = PF.short) {
  const map = new Map<string, { n: number; net: number; pnls: number[] }>();
  for (const r of livePnls) {
    const k = `${r.symbol}|${r.combo}`;
    const g = map.get(k) ?? { n: 0, net: 0, pnls: [] };
    g.n += 1;
    g.net += r.pnl;
    g.pnls.push(r.pnl);
    map.set(k, g);
  }
  return [...map.entries()]
    .map(([id, g]) => ({ id, n: g.n, net: g.net, pf: pfFromPnls(g.pnls.map((pnl) => ({ pnl }))) }))
    .filter((r) => r.n >= 4 && r.net > 0 && r.pf >= minPf)
    .sort((a, b) => b.pf - a.pf);
}

export function greenHour(fills: TapeFill[], now: number) {
  const start = now - (now % 3_600_000);
  let n = 0;
  let net = 0;
  for (const f of fills) {
    if (f.tape === "live" && f.ts >= start) {
      n += 1;
      net += f.pnl;
    }
  }
  if (!(n > 0)) return { green: false, code: "G0" as const, n, net };
  return { green: net >= 0, code: (net >= 0 ? "G1" : "R1") as "G1" | "R1", n, net };
}

export function systemNet(closed: number, positions: LivePos[]): number {
  let open = 0;
  for (const p of positions) open += closePnl(p.side, p.entry, p.mark, p.qty);
  return closed + open;
}

export function cellRollup(cells: Cell[]) {
  let valid = 0;
  let disabled = 0;
  let net = 0;
  let samples = 0;
  for (const c of cells) {
    if (c.validExec && !c.disabled) valid += 1;
    if (c.disabled) disabled += 1;
    net += c.net;
    samples += c.n;
  }
  return { valid, disabled, net, samples, n: cells.length };
}

export function barSignature(books: { symbol: string; bars: Bar[] }[]): string {
  let sig = "";
  for (const b of books) {
    const closed = closedBars(b.bars);
    const last = closed.at(-1);
    sig += `${b.symbol}:${last?.t ?? 0}:${closed.length}|`;
  }
  return sig;
}

export type HourPoint = {
  t: number;
  trades: number;
  wins: number;
  losses: number;
  realized: number;
  mtm: number;
  net: number;
  pf: number;
  openLegs: number;
};

export type SessionReport = {
  ready: boolean;
  note: string;
  pre: HourPoint[];
  live: HourPoint[];
  promoted: HourPoint[];
  proven: number;
  symbols: number;
  preNet: number;
  liveNet: number;
  promotedNet: number;
  greenPre: number;
  greenLive: number;
  greenPromoted: number;
  prePf: number;
  livePf: number;
  promotedPf: number;
  samplesPre: number;
  samplesLive: number;
  samplesPromoted: number;
  bookPre: HourPoint[];
  bookLive: HourPoint[];
  bookNetPre: number;
  bookNetLive: number;
  greenBookPre: number;
  greenBookLive: number;
  bookNames: string[];
};

type HourAcc = {
  t: number;
  trades: number;
  wins: number;
  losses: number;
  realized: number;
  mtm: number;
  gw: number;
  gl: number;
  openLegs: number;
};

function emptySession(note: string): SessionReport {
  return {
    ready: false,
    note,
    pre: [],
    live: [],
    promoted: [],
    proven: 0,
    symbols: 0,
    preNet: 0,
    liveNet: 0,
    promotedNet: 0,
    greenPre: 0,
    greenLive: 0,
    greenPromoted: 0,
    prePf: 0,
    livePf: 0,
    promotedPf: 0,
    samplesPre: 0,
    samplesLive: 0,
    samplesPromoted: 0,
    bookPre: [],
    bookLive: [],
    bookNetPre: 0,
    bookNetLive: 0,
    greenBookPre: 0,
    greenBookLive: 0,
    bookNames: [],
  };
}

function hourAcc(t: number): HourAcc {
  return { t, trades: 0, wins: 0, losses: 0, realized: 0, mtm: 0, gw: 0, gl: 0, openLegs: 0 };
}

function pricePnl(side: Side, entry: number, exit: number, qty: number): number {
  if (!(entry > 0) || !(exit > 0) || !(qty > 0)) return 0;
  return (exit - entry) * qty * (side < 0 ? -1 : 1);
}

function seal(rows: HourAcc[]): HourPoint[] {
  return rows.map((r) => ({
    t: r.t,
    trades: r.trades,
    wins: r.wins,
    losses: r.losses,
    realized: r.realized,
    mtm: r.mtm,
    net: r.realized + r.mtm,
    pf: r.gl < 1e-12 ? (r.gw > 1e-12 ? 4 : 0) : r.gw / r.gl,
    openLegs: r.openLegs,
  }));
}

function totals(rows: HourPoint[]) {
  let net = 0;
  let gw = 0;
  let gl = 0;
  let samples = 0;
  let green = 0;
  for (const r of rows) {
    net += r.net;
    samples += r.trades;
    if (r.net > 0) green += 1;
    if (r.realized > 0) gw += r.realized;
    else if (r.realized < 0) gl -= r.realized;
  }
  return { net, samples, green, pf: gl < 1e-12 ? (gw > 1e-12 ? 4 : 0) : gw / gl };
}

export type ReplaySize = "base" | "block" | "axis" | "both";

export type ReplayOpts = {
  hours?: 12 | 24 | 48;
  size?: ReplaySize;
};

export function simulateSessions(
  books: { symbol: string; bars: Bar[] }[],
  equity: number,
  floors: Floors,
  opts?: ReplayOpts,
): SessionReport {
  const hours = opts?.hours ?? 24;
  const size = opts?.size ?? "both";
  const span = hours * 2;
  const closed = books
    .map((b) => ({ symbol: b.symbol, bars: closedBars(saneBars(b.bars)) }))
    .filter((b) => b.bars.length >= span + 22);
  if (closed.length < 1) return emptySession(`Need at least ${span + 22} closed 1h bars for a ${hours}h replay.`);
  const timeSet = closed.map((b) => new Set(b.bars.map((bar) => bar.t)));
  const times = [...timeSet[0]!].filter((t) => timeSet.every((s) => s.has(t))).sort((a, b) => a - b);
  if (times.length < span + 22) return emptySession(`Books do not share ${span + 22} closed hours.`);
  const aligned = closed.map((b) => {
    const by = new Map(b.bars.map((bar) => [bar.t, bar]));
    return { symbol: b.symbol, bars: times.map((t) => by.get(t)!) };
  });
  const n = times.length;
  const liveFrom = n - hours;
  const preFrom = n - span;
  const notional = positionNotional(equity);
  const combos = allShortCombos();
  const preAcc = times.slice(preFrom, liveFrom).map((t) => hourAcc(t));
  const liveAcc = times.slice(liveFrom).map((t) => hourAcc(t));
  const promAcc = times.slice(liveFrom).map((t) => hourAcc(t));
  const accAt = (i: number): HourAcc | null => {
    if (i >= liveFrom) return liveAcc[i - liveFrom] ?? null;
    if (i >= preFrom) return preAcc[i - preFrom] ?? null;
    return null;
  };
  const promAt = (i: number): HourAcc | null => (i >= liveFrom ? (promAcc[i - liveFrom] ?? null) : null);

  let provenN = 0;
  const picked: { symbol: string; name: string; preNet: number; hourNet: number[]; hourTrades: number[] }[] = [];

  for (const book of aligned) {
    const series = buildSeries(book.bars);
    const sideRows = {} as Record<Indication, Array<Side | 0>>;
    for (const indication of INDICATIONS) {
      const row: Array<Side | 0> = new Array(n).fill(0);
      for (let i = 22; i < n; i++) row[i] = signalAt(indication, book.bars, series, i);
      sideRows[indication] = row;
    }
    for (const combo of combos) {
      for (const indication of INDICATIONS) {
        const cell = blankCell(book.symbol, indication, combo.tpAtr, combo.slOfTp);
        const sides = sideRows[indication]!;
        let prevU = 0;
        let prevPromU = 0;
        let armed = false;
        let preN = 0;
        let preGw = 0;
        let preGl = 0;
        const hourNet = new Array<number>(span).fill(0);
        const hourTrades = new Array<number>(span).fill(0);
        for (let i = 22; i < n; i++) {
          const b = book.bars[i]!;
          const a = Math.max(series.atr[i] ?? 0, b.c * 0.0004);
          if (!cell.leg) {
            const side = sides[i] ?? 0;
            if (side) {
              const tpDist = cell.tpAtr * a;
              cell.side = side;
              cell.leg = {
                side,
                entry: b.c,
                tp: b.c + side * tpDist,
                sl: b.c - side * cell.slOfTp * tpDist,
                qty: notional / b.c,
                hold: 0,
              };
            }
          } else {
            const leg = cell.leg;
            leg.hold += 1;
            const hit = exitOnBar(leg.side, leg.tp, leg.sl, b, leg.hold);
            if (hit) {
              const pnl = closePnl(leg.side, leg.entry, hit.exit, leg.qty);
              pushPnl(cell, pnl);
              const slot = accAt(i);
              const wi = i - preFrom;
              if (wi >= 0 && wi < span) {
                hourNet[wi] += pnl;
                hourTrades[wi] += 1;
                if (wi < hours) {
                  preN += 1;
                  if (pnl >= 0) preGw += pnl;
                  else preGl += -pnl;
                }
              }
              if (slot) {
                slot.trades += 1;
                slot.realized += pnl;
                if (pnl >= 0) {
                  slot.wins += 1;
                  slot.gw += pnl;
                } else {
                  slot.losses += 1;
                  slot.gl += -pnl;
                }
              }
              if (armed) {
                const ps = promAt(i);
                if (ps) {
                  ps.trades += 1;
                  ps.realized += pnl;
                  if (pnl >= 0) {
                    ps.wins += 1;
                    ps.gw += pnl;
                  } else {
                    ps.losses += 1;
                    ps.gl += -pnl;
                  }
                }
              }
              cell.leg = null;
            }
          }
          if (i === liveFrom - 1) {
            gateCell(cell, floors);
            armed = cell.validExec && !cell.disabled && cell.net > 0;
            if (armed) provenN += 1;
          }
          const u = cell.leg ? pricePnl(cell.leg.side, cell.leg.entry, b.c, cell.leg.qty) : 0;
          const delta = u - prevU;
          const slot = accAt(i);
          if (slot) {
            slot.mtm += delta;
            if (cell.leg) slot.openLegs += 1;
          }
          prevU = u;
          const wi = i - preFrom;
          if (wi >= 0 && wi < span) hourNet[wi] += delta;
          if (armed) {
            const ps = promAt(i);
            if (ps) {
              ps.mtm += u - prevPromU;
              if (cell.leg) ps.openLegs += 1;
            }
            prevPromU = u;
          } else if (i === liveFrom - 1) {
            prevPromU = u;
          }
        }
        const preNetCell = hourNet.slice(0, hours).reduce((a, b) => a + b, 0);
        const prePfCell = preGl < 1e-12 ? (preGw > 1e-12 ? 4 : 0) : preGw / preGl;
        let upHours = 0;
        let downHours = 0;
        for (let k = 0; k < hours; k++) {
          const v = hourNet[k] ?? 0;
          if (v > 0) upHours += 1;
          else if (v < 0) downHours += 1;
        }
        if (cell.liveFloor && preN >= 4 && preNetCell > 0 && prePfCell >= floors.short && upHours > downHours) {
          picked.push({ symbol: book.symbol, name: `${book.symbol} ${indication} ${comboId(combo.tpAtr, combo.slOfTp)}`, preNet: preNetCell, hourNet, hourTrades });
        }
      }
    }
  }

  const pre = seal(preAcc);
  const live = seal(liveAcc);
  const promoted = seal(promAcc);
  const preT = totals(pre);
  const liveT = totals(live);
  const promT = totals(promoted);
  const sized =
    size === "base" ? notional : size === "block" ? blockQty(notional) : size === "axis" ? axisQty(notional) : sizedNotional(notional, { block: true, axis: true });
  const scale = notional > 0 ? sized / notional : 1;
  const best = new Map<string, (typeof picked)[number]>();
  for (const row of picked) {
    const cur = best.get(row.symbol);
    if (!cur || row.preNet > cur.preNet) best.set(row.symbol, row);
  }
  const fold = (offset: number, src: HourAcc[]): HourPoint[] =>
    src.map((slot, k) => {
      let net = 0;
      let trades = 0;
      for (const row of best.values()) {
        net += (row.hourNet[offset + k] ?? 0) * scale;
        trades += row.hourTrades[offset + k] ?? 0;
      }
      return {
        t: slot.t,
        trades,
        wins: net > 0 ? 1 : 0,
        losses: net < 0 ? 1 : 0,
        realized: net,
        mtm: 0,
        net,
        pf: net > 0 ? 4 : 0,
        openLegs: best.size,
      };
    });
  const bookPre = fold(0, preAcc);
  const bookLive = fold(hours, liveAcc);
  const bookPreT = totals(bookPre);
  const bookLiveT = totals(bookLive);
  return {
    ready: true,
    note: `Pre ${hours}h scores every short-GRID cell on closed BingX hours. The book keeps one live-floor cell per symbol: best pre-window net, at least 4 closes, PF at the short floor. The next ${hours}h replays that frozen book at ${size} size. No lookahead into the replay window.`,
    pre,
    live,
    promoted,
    proven: provenN,
    symbols: aligned.length,
    preNet: preT.net,
    liveNet: liveT.net,
    promotedNet: promT.net,
    greenPre: preT.green,
    greenLive: liveT.green,
    greenPromoted: promT.green,
    prePf: preT.pf,
    livePf: liveT.pf,
    promotedPf: promT.pf,
    samplesPre: preT.samples,
    samplesLive: liveT.samples,
    samplesPromoted: promT.samples,
    bookPre,
    bookLive,
    bookNetPre: bookPreT.net,
    bookNetLive: bookLiveT.net,
    greenBookPre: bookPreT.green,
    greenBookLive: bookLiveT.green,
    bookNames: [...best.values()].map((row) => row.name),
  };
}
