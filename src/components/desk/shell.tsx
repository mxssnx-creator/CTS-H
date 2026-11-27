import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  CandlestickChart,
  ChevronDown,
  FlaskConical,
  LayoutDashboard,
  Layers3,
  Radio,
  SlidersHorizontal,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";
import { CONNECTIONS, type ConnectionId } from "@/lib/desk/connections";
import { useDesk } from "@/lib/desk/store";
import { DeskFeed } from "./feed";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/lanes", label: "Research", icon: Activity },
  { to: "/positions", label: "Portfolio", icon: Wallet },
  { to: "/replay", label: "Trade replay", icon: FlaskConical },
  { to: "/settings", label: "Settings", icon: SlidersHorizontal },
  { to: "/connections", label: "Connections", icon: Radio },
] as const;

export function DeskShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const status = useDesk((s) => s.status);
  const connection = useDesk((s) => s.connection);
  const setConnection = useDesk((s) => s.setConnection);
  const connect = useDesk((s) => s.allow.connect_exchange);
  const phase = useDesk((s) => s.phase);
  const page = NAV.find((item) => item.to === path)?.label ?? "Trading desk";
  const signal = !connect
    ? "Feed paused"
    : status === "live"
      ? "Feed online"
      : status === "loading"
        ? "Connecting"
        : "Feed delayed";
  return (
    <div className="desk-frame">
      <DeskFeed />
      <aside className="desk-sidebar">
        <Link to="/" className="desk-brand" aria-label="CTS-H home">
          <span className="desk-mark">
            <CandlestickChart size={21} strokeWidth={2.3} />
          </span>
          <span>
            <strong>CTS-H</strong>
            <small>Trading desk</small>
          </span>
        </Link>
        <nav aria-label="Desk navigation" className="desk-nav">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              aria-current={path === to ? "page" : undefined}
              className={path === to ? "nav-current" : ""}
            >
              <Icon size={17} strokeWidth={1.7} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="desk-sidebar-foot">
          <Layers3 size={18} />
          <span>
            Paper execution
            <small>{phase === "halted" ? "Entries paused" : "BingX perpetuals"}</small>
          </span>
        </div>
      </aside>
      <div className="desk-workspace">
        <div className="desk-topbar">
          <div className="desk-breadcrumb">
            Workspace <span>/</span> <strong>{page}</strong>
          </div>
          <div className="desk-top-controls">
            <span className={`feed-badge ${status === "live" && connect ? "feed-ready" : ""}`}>
              <i />
              {signal}
            </span>
            <label className="connection-select">
              <span className="sr-only">Active connection</span>
              <select
                value={connection}
                disabled={!connect}
                onChange={(e) => setConnection(e.currentTarget.value as ConnectionId)}
              >
                {CONNECTIONS.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.slot
                      ? `${item.slot} · ${item.network === "vst" ? "VST demo" : "Mainnet"}`
                      : "Public feed"}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} aria-hidden />
            </label>
          </div>
        </div>
        <main className="desk-main" id="desk-main">
          {children}
        </main>
      </div>
    </div>
  );
}

export function Panel({
  title,
  children,
  aside,
  className = "",
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`desk-panel ${className}`}>
      <div className="panel-heading">
        <h2>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="desk-stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${tone ?? ""}`}>{value}</div>
      {detail && <div className="stat-detail">{detail}</div>}
    </div>
  );
}
