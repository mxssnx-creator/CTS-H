import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { DeskFeed } from "./feed";
import { BOOK } from "@/lib/desk/constants";
import { greenHour } from "@/lib/desk/process";
import { focusBook, liveHeadline, useDesk, useNet } from "@/lib/desk/store";

const NAV = [
  ["/", "Overview"],
  ["/allow", "Allow"],
  ["/strategies", "Strategies"],
  ["/tactics", "Tactics"],
  ["/lanes", "Indications"],
  ["/combinations", "Combinations"],
  ["/heatmap", "Heatmap"],
  ["/positions", "Positions"],
  ["/orders", "Orders"],
  ["/performance", "Performance"],
  ["/results", "Results"],
  ["/statistics", "Statistics"],
  ["/engine", "Engine"],
  ["/replay", "Replay"],
  ["/system", "System"],
  ["/settings", "Settings"],
  ["/connections", "Connections"],
] as const;

function money(n: number) {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

export function DeskShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const status = useDesk((s) => s.status);
  const phase = useDesk((s) => s.phase);
  const net = useNet();
  const books = useDesk((s) => s.books);
  const liveFills = useDesk((s) => s.liveFills);
  const lastTs = useDesk((s) => s.lastTs);
  const peak = useDesk((s) => s.peak);
  const head = liveHeadline(liveFills);
  const focus = useDesk((s) => focusBook(s));
  const hour = greenHour(liveFills, lastTs || Date.now());
  const equity = BOOK + net;
  const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;

  return (
    <div className="grid min-h-screen grid-rows-[auto_auto_1fr_auto] bg-bg text-fg md:grid-cols-[220px_1fr] md:grid-rows-[auto_1fr_auto]">
      <DeskFeed />
      <header className="flex flex-wrap items-center gap-4 border-b border-line bg-surface px-4 py-3 md:col-span-2">
        <div className="font-mono text-sm tracking-widest">
          HELIX <span className="text-accent">× CTS-A</span>
        </div>
        <span className="rounded-full border border-line px-2 py-1 font-mono text-xs text-warn">
          {status === "live" ? "LIVE TAPE · BINGX" : status === "error" ? "FEED ERROR" : "CONNECTING"}
        </span>
        <div className="font-mono text-xs text-muted">
          <div className="text-dim">System net</div>
          <div className={net >= 0 ? "text-bid" : "text-ask"}>{money(net)}</div>
        </div>
        <div className="font-mono text-xs text-muted">
          <div className="text-dim">Book</div>
          <div>{money(equity)}</div>
        </div>
        <div className="font-mono text-xs text-muted">
          <div className="text-dim">Hour</div>
          <div className={hour.code === "R1" ? "text-ask" : hour.code === "G1" ? "text-bid" : ""}>{hour.code}</div>
        </div>
        <div className="font-mono text-xs text-muted">
          <div className="text-dim">Drawdown</div>
          <div>{dd.toFixed(2)}%</div>
        </div>
        <div className="font-mono text-xs text-muted">
          <div className="text-dim">Phase</div>
          <div>{phase}</div>
        </div>
        <div className="font-mono text-xs text-muted">
          <div className="text-dim">Headline</div>
          <div>{head.length}</div>
        </div>
        {focus ? (
          <div className="ml-auto font-mono text-sm">
            {focus.symbol} <span className={focus.quote.changePct >= 0 ? "text-bid" : "text-ask"}>{focus.quote.last}</span>
          </div>
        ) : null}
      </header>
      <nav className="flex gap-1 overflow-x-auto border-b border-line bg-bg p-2 md:flex-col md:overflow-visible md:border-r md:border-b-0">
        {NAV.map(([to, label]) => {
          const on = path === to;
          return (
            <Link
              key={to}
              to={to}
              className={`rounded-md px-3 py-2 text-left text-sm whitespace-nowrap ${on ? "bg-surface-2 text-fg" : "text-muted"}`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      <main className="min-w-0 p-4">{children}</main>
      <footer className="border-t border-line px-4 py-2 font-mono text-xs text-dim md:col-span-2">
        Live BingX quotes. CTS-A paper stage on that tape. No signed exchange orders. Every desk action starts allowed.
        {books.length ? ` · ${books.length} books` : ""}
      </footer>
    </div>
  );
}

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-line bg-surface p-4">
      <h2 className="mb-3 font-mono text-xs tracking-widest text-muted uppercase">{title}</h2>
      {children}
    </section>
  );
}

export function Stat({ k, v, tone }: { k: string; v: string; tone?: "bid" | "ask" }) {
  return (
    <div className="rounded-md border border-line bg-bg p-3">
      <div className="font-mono text-xs text-dim uppercase">{k}</div>
      <div className={`font-mono text-lg ${tone === "bid" ? "text-bid" : tone === "ask" ? "text-ask" : ""}`}>{v}</div>
    </div>
  );
}
