import { useEffect, useRef } from "react";
import type { Bar, HourPoint } from "@/lib/desk/process";

const HOUR = 3_600_000;
const shortDate = new Intl.DateTimeFormat("en", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});
const priceFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 6 });

function useChart(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const drawChart = () => {
      const { width, height } = node.getBoundingClientRect();
      if (!width || !height) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      node.width = Math.round(width * ratio);
      node.height = Math.round(height * ratio);
      const ctx = node.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw(ctx, width, height);
    };
    const observer = new ResizeObserver(drawChart);
    observer.observe(node);
    drawChart();
    return () => observer.disconnect();
  }, [draw]);
  return ref;
}

export function CandleChart({ bars, symbol }: { bars: Bar[]; symbol: string }) {
  const ref = useChart((ctx, w, h) => {
    if (!bars.length) return;
    const top = 14;
    const bottom = h - 34;
    const right = w - 67;
    const extent = Math.max(...bars.map((b) => b.h)) - Math.min(...bars.map((b) => b.l));
    const high = Math.max(...bars.map((b) => b.h)) + extent * 0.09;
    const low = Math.min(...bars.map((b) => b.l)) - extent * 0.09;
    const y = (p: number) => top + ((high - p) / Math.max(1e-12, high - low)) * (bottom - top);
    const gap = Math.max(1, (right - 12) / bars.length);
    const maxVolume = Math.max(1, ...bars.map((b) => b.v));
    ctx.font = "11px IBM Plex Mono, monospace";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const at = top + ((bottom - top) * i) / 4;
      ctx.strokeStyle = "#242c3b";
      ctx.beginPath();
      ctx.moveTo(12, at);
      ctx.lineTo(right, at);
      ctx.stroke();
      ctx.fillStyle = "#939cad";
      ctx.fillText(priceFormat.format(high - ((high - low) * i) / 4), right + 8, at + 4, 59);
    }
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i]!;
      const x = 12 + (i + 0.5) * gap;
      const ink = b.c >= b.o ? "#42dfb7" : "#fc758d";
      const body = Math.max(1.5, Math.min(gap * 0.64, 11));
      ctx.fillStyle = ink;
      ctx.globalAlpha = 0.12;
      ctx.fillRect(x - body / 2, bottom - (b.v / maxVolume) * 35, body, (b.v / maxVolume) * 35);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = ink;
      ctx.beginPath();
      ctx.moveTo(x, y(b.h));
      ctx.lineTo(x, y(b.l));
      ctx.stroke();
      ctx.fillRect(
        x - body / 2,
        Math.min(y(b.o), y(b.c)),
        body,
        Math.max(1.2, Math.abs(y(b.o) - y(b.c))),
      );
    }
    for (let j = 0; j < 5; j++) {
      const i = Math.min(bars.length - 1, Math.floor((j * bars.length) / 5));
      const bar = bars[i]!;
      ctx.fillStyle = "#939cad";
      ctx.fillText(shortDate.format(bar.t), 12 + i * gap, h - 10, 48);
    }
    ctx.fillText("UTC", right + 8, h - 10);
  });
  return (
    <canvas
      className="candle-canvas"
      ref={ref}
      role="img"
      aria-label={`${symbol} chart, ${bars.length} hourly candles`}
    />
  );
}

export function EquityChart({ hours }: { hours: HourPoint[] }) {
  const ref = useChart((ctx, w, h) => {
    const eq = [0];
    for (const row of hours) eq.push(eq.at(-1)! + row.net);
    const high = Math.max(...eq, 0.05);
    const low = Math.min(...eq, -0.05);
    const y = (amount: number) => 20 + ((high - amount) / (high - low)) * (h - 50);
    const x = (i: number) => 12 + ((w - 24) * i) / Math.max(1, eq.length - 1);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#2c384a";
    ctx.beginPath();
    ctx.moveTo(12, y(0));
    ctx.lineTo(w - 12, y(0));
    ctx.stroke();
    ctx.beginPath();
    eq.forEach((amount, i) => (i ? ctx.lineTo(x(i), y(amount)) : ctx.moveTo(x(i), y(amount))));
    ctx.lineWidth = 2;
    ctx.strokeStyle = eq.at(-1)! >= 0 ? "#42dfb7" : "#fc758d";
    ctx.stroke();
    ctx.font = "11px IBM Plex Mono, monospace";
    ctx.fillStyle = "#939cad";
    if (hours.length) {
      ctx.fillText(shortDate.format(hours[0]!.t), 12, h - 8);
      ctx.fillText(shortDate.format(hours.at(-1)!.t + HOUR), w - 69, h - 8);
    }
  });
  return (
    <canvas
      className="equity-canvas"
      ref={ref}
      role="img"
      aria-label="Holdout cumulative hourly equity"
    />
  );
}
