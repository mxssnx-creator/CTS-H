import { mkdirSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { PrivateConnection } from "./connections.ts";

export type SignedConnection = PrivateConnection["id"];
export type Direction = "long" | "short";
export type Bracket = { side: Direction; quantity: number; stop: number; target: number };

export type Risk = {
  checkedAt: number;
  expiresAt: number;
  limit: number;
  notional: number;
  modeledLoss: number;
  hedge: boolean;
  positionId?: string;
};

export type Venue = {
  orderId: string;
  status: string;
  filled: number;
  average: number | null;
  positionId: string | null;
  remaining: number;
  stopId: string | null;
  targetId: string | null;
};

export type Phase =
  | "idea"
  | "risk-pass"
  | "approved"
  | "sending"
  | "reconcile"
  | "uncertain"
  | "no-fill"
  | "open"
  | "closed"
  | "incident";

export type Ticket = {
  id: string;
  cid: string;
  connection: SignedConnection;
  symbol: string;
  why: string;
  createdAt: number;
  bracket: Bracket;
  parent?: string;
  phase: Phase;
  risk?: Risk;
  venue?: Venue;
};

const BUSY = new Set<Phase>(["sending", "reconcile", "uncertain", "incident"]);
const FINISHED = new Set<Phase>(["closed", "no-fill"]);

export class Journal {
  private readonly db: DatabaseSync;

  constructor(directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = join(directory, "tickets.sqlite");
    this.db = new DatabaseSync(file);
    chmodSync(file, 0o600);
    this.db.exec(`
      PRAGMA busy_timeout = 5000;
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY, connection TEXT NOT NULL, symbol TEXT NOT NULL, payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS symbol_tickets ON tickets(connection, symbol);
      CREATE TABLE IF NOT EXISTS events (
        seq INTEGER PRIMARY KEY, ticket TEXT NOT NULL, at INTEGER NOT NULL, phase TEXT NOT NULL, detail TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS ticket_events ON events(ticket, seq);
    `);
  }

  close() {
    this.db.close();
  }

  get(id: string): Ticket {
    const row = this.db.prepare("SELECT payload FROM tickets WHERE id = ?").get(id);
    if (!row) throw new Error("Unknown CTS-H ticket.");
    return JSON.parse(String(row.payload));
  }

  private neighbors(ticket: Ticket): Ticket[] {
    return this.db
      .prepare("SELECT payload FROM tickets WHERE connection = ? AND symbol = ?")
      .all(ticket.connection, ticket.symbol)
      .map((row) => JSON.parse(String(row.payload)) as Ticket)
      .filter((row) => row.id !== ticket.id);
  }

  private transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private event(ticket: Ticket, detail: string) {
    this.db
      .prepare("INSERT INTO events(ticket, at, phase, detail) VALUES (?, ?, ?, ?)")
      .run(ticket.id, Date.now(), ticket.phase, detail);
  }

  create(ticket: Ticket): Ticket {
    return this.transaction(() => {
      this.db
        .prepare("INSERT INTO tickets(id, connection, symbol, payload) VALUES (?, ?, ?, ?)")
        .run(ticket.id, ticket.connection, ticket.symbol, JSON.stringify(ticket));
      this.event(ticket, "Proposal recorded");
      return ticket;
    });
  }

  change(id: string, from: Phase[], detail: string, update: (ticket: Ticket) => Ticket): Ticket {
    return this.transaction(() => {
      const before = this.get(id);
      if (!from.includes(before.phase)) throw new Error(`Ticket ${id} is at ${before.phase}.`);
      const next = update(before);
      this.db.prepare("UPDATE tickets SET payload=? WHERE id=?").run(JSON.stringify(next), id);
      this.event(next, detail);
      return next;
    });
  }

  claim(id: string, now: number): Ticket {
    return this.change(id, ["approved"], "One send claimed and persisted", (ticket) => {
      if (!ticket.risk || ticket.risk.expiresAt <= now)
        throw new Error("Risk sign-off expired. Refresh risk and approve the new limit.");
      const neighbors = this.neighbors(ticket);
      if (neighbors.some((row) => BUSY.has(row.phase) && row.id !== ticket.parent)) {
        throw new Error("Resolve the outstanding ticket on this connection and symbol.");
      }
      const open = neighbors.filter((row) => !row.parent && row.phase === "open");
      if (ticket.parent ? open.length !== 1 || open[0]?.id !== ticket.parent : open.length > 0) {
        throw new Error(
          "This symbol is already assigned to another ticket or the parent is no longer open.",
        );
      }
      return { ...ticket, phase: "sending" };
    });
  }

  remaining(parent: Ticket, omit?: string): number {
    const children = this.neighbors(parent).filter(
      (row) => row.parent === parent.id && row.id !== omit,
    );
    return Math.max(
      0,
      (parent.venue?.filled ?? 0) -
        children.reduce((sum, row) => sum + (row.venue?.filled ?? 0), 0),
    );
  }

  review(id: string, detail: string) {
    return this.transaction(() => {
      const ticket = this.get(id);
      if (!FINISHED.has(ticket.phase) && ticket.phase !== "open" && ticket.phase !== "incident") {
        throw new Error("Reconcile the ticket before reviewing it.");
      }
      this.event(ticket, detail);
      return this.history(id);
    });
  }

  history(id: string) {
    return {
      ticket: this.get(id),
      events: this.db
        .prepare("SELECT at, phase, detail FROM events WHERE ticket=? ORDER BY seq")
        .all(id),
    };
  }
}
