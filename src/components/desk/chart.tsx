import { useEffect, useRef } from "react";
import type { Bar } from "@/lib/desk/process";

export function CandleChart({ bars, symbol }: { bars: Bar[]; symbol: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || bars.length < 2) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.parentElement?.getBoundingClientRect();
    const w = Math.max(320, rect?.width ?? 640);
    const h = Math.max(220, rect?.height ?? 320);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const pad = 16;
    const lo = Math.min(...bars.map((b) => b.l));
    const hi = Math.max(...bars.map((b) => b.h));
    const span = hi - lo || 1;
    const y = (v: number) => pad + (1 - (v - lo) / span) * (h - pad * 2);
    const x = (i: number) => pad + (i / (bars.length - 1)) * (w - pad * 2);
    ctx.strokeStyle = "#232a38";
    for (let i = 0; i < 4; i++) {
      const yy = pad + (i * (h - pad * 2)) / 3;
      ctx.beginPath();
      ctx.moveTo(pad, yy);
      ctx.lineTo(w - pad, yy);
      ctx.stroke();
    }
    const cw = Math.max(2, ((w - pad * 2) / bars.length) * 0.66);
    bars.forEach((b, i) => {
      const up = b.c >= b.o;
      ctx.strokeStyle = ctx.fillStyle = up ? "#3ee0a5" : "#ff5c7a";
      ctx.beginPath();
      ctx.moveTo(x(i), y(b.h));
      ctx.lineTo(x(i), y(b.l));
      ctx.stroke();
      const top = y(Math.max(b.o, b.c));
      const bot = y(Math.min(b.o, b.c));
      ctx.fillRect(x(i) - cw / 2, top, cw, Math.max(1, bot - top));
    });
    ctx.fillStyle = "#e7edf6";
    ctx.font = "12px IBM Plex Mono, monospace";
    const last = bars.at(-1)!;
    ctx.fillText(`${symbol}  ${last.c}`, pad, 14);
  }, [bars, symbol]);

  return (
    <div className="h-80 w-full overflow-hidden rounded-md border border-line bg-bg">
      <canvas ref={ref} className="h-full w-full" />
    </div>
  );
}
