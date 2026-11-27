import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs, promisify } from "node:util";
import { Bingx, type Credentials } from "../src/lib/desk/bingx.server.ts";
import {
  CONNECTIONS,
  requireConnection,
  requireSymbol,
  type PrivateConnection,
} from "../src/lib/desk/connections.ts";
import { PREFERRED_SYMBOLS } from "../src/lib/desk/constants.ts";
import {
  account,
  approve,
  propose,
  reconcile,
  send,
  signOff,
  type Limits,
} from "../src/lib/desk/execution.server.ts";
import { Journal } from "../src/lib/desk/journal.server.ts";
import { loadDepth, loadFunding, loadQuote, quoteIsFresh } from "../src/lib/desk/market.server.ts";
import { captureReplay, renderReplay, runReplay, type Capture } from "./cts-h-replay.ts";

const HELP = `CTS-H BingX Trading Desk
  brief [--connection bingx-x02] [--symbol ETH-USDT]
  replay [--connection bingx-x01|bingx-x02|both] [--hours 12|24|48] [--symbols BTC-USDT,ETH-USDT] [--end ISO] [--html report.html] [--capture candles.json]
  replay --input candles.json [--hours 48] [--html report.html]
  doctor
  account --connection bingx-x02
  propose --connection bingx-x02 --symbol ETH-USDT --side long --qty N --stop N --target N --why TEXT
  close-plan TICKET --why TEXT
  risk TICKET
  approve TICKET --confirm TICKET
  send TICKET --confirm TICKET [--test]
  reconcile TICKET
  review TICKET --why TEXT
  show TICKET`;

function envCredentials(connection: PrivateConnection): Credentials | null {
  const prefix = `BINGX_${connection.slot}`;
  const key = process.env[`${prefix}_API_KEY`]?.trim();
  const secret = (process.env[`${prefix}_API_SECRET`] ?? process.env[`${prefix}_SECRET`])?.trim();
  if (Boolean(key) !== Boolean(secret))
    throw new Error(`Both ${prefix} key and secret are required.`);
  return key && secret ? { key, secret } : null;
}

async function credentials(connection: PrivateConnection): Promise<Credentials> {
  const configured = envCredentials(connection);
  if (configured) return configured;
  if (process.env.CTS_H_REDIS === "1") {
    const run = promisify(execFile);
    for (const redisKey of [
      `connection:${connection.id}`,
      `connection:${connection.slot.toLowerCase()}`,
    ]) {
      const { stdout } = await run(
        "redis-cli",
        ["--json", "HMGET", redisKey, "api_key", "api_secret"],
        { timeout: 2000 },
      );
      const [key, secret] = JSON.parse(stdout) as [string | null, string | null];
      if (key && secret) return { key, secret };
      if (key || secret) throw new Error(`Incomplete credentials for ${connection.id}.`);
    }
  }
  throw new Error(`Configure ${connection.id} in the operator environment.`);
}

function signedConnection(id: string): PrivateConnection {
  const connection = requireConnection(id);
  if (!connection.slot) throw new Error("Choose bingx-x01 or bingx-x02 for a signed operation.");
  return connection;
}

function number(
  input: string | undefined,
  name: string,
  range: [number, number] = [Number.MIN_VALUE, Infinity],
) {
  const n = input?.trim() ? Number(input) : NaN;
  if (!Number.isFinite(n) || n < range[0] || n > range[1]) throw new Error(`Invalid ${name}.`);
  return n;
}

function print(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "--help" || command === "help") {
    console.log(HELP);
    return;
  }
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      connection: { type: "string" },
      symbol: { type: "string" },
      symbols: { type: "string" },
      hours: { type: "string" },
      end: { type: "string" },
      html: { type: "string" },
      input: { type: "string" },
      capture: { type: "string" },
      "slip-bps": { type: "string" },
      side: { type: "string" },
      qty: { type: "string" },
      stop: { type: "string" },
      target: { type: "string" },
      why: { type: "string" },
      confirm: { type: "string" },
      test: { type: "boolean" },
    },
  });
  if (positionals.length > 1) throw new Error("Supply a single ticket ID.");
  const armed = (process.env.CTS_H_ENABLE_ORDERS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const connectionText = values.connection ?? "bingx-x02";
  if (command === "doctor") {
    print({
      app: "CTS-H",
      node: process.version,
      connections: CONNECTIONS.map((c) => ({
        id: c.id,
        origin: c.origin,
        credentialsInEnv: c.slot ? Boolean(envCredentials(c)) : false,
        armed: armed.includes(c.id),
      })),
      redis: process.env.CTS_H_REDIS === "1",
    });
    return;
  }
  if (command === "brief") {
    const client = new Bingx(requireConnection(values.connection ?? "bingx-public"));
    const symbol = requireSymbol(values.symbol ?? "ETH-USDT");
    const [quote, depth, funding] = await Promise.allSettled([
      loadQuote(client, symbol),
      loadDepth(client, symbol),
      loadFunding(client, symbol),
    ]);
    if (quote.status === "rejected") throw quote.reason;
    const now = client.now();
    print({
      connection: client.connection.id,
      source: client.connection.origin,
      asOf: new Date(now).toISOString(),
      fresh: quoteIsFresh(quote.value, now),
      quote: quote.value,
      funding: funding.status === "fulfilled" ? funding.value : null,
      depth: depth.status === "fulfilled" ? depth.value : null,
    });
    return;
  }
  if (command === "replay") {
    const hours = Number(values.hours ?? 48);
    if (hours !== 12 && hours !== 24 && hours !== 48)
      throw new Error("Replay hours must be 12, 24 or 48.");
    const slip = number(values["slip-bps"] ?? "1", "slippage basis points", [0, 200]);
    const source = values.connection ?? "bingx-x01";
    const connections = source === "both" ? ["bingx-x01", "bingx-x02"] : [source];
    const symbols = [
      ...new Set((values.symbols?.split(",") ?? PREFERRED_SYMBOLS).map(requireSymbol)),
    ];
    if (!symbols.length || symbols.length > 50) throw new Error("Supply 1 to 50 unique symbols.");
    const end = values.end ? Date.parse(values.end) : undefined;
    if (values.end && !/Z$/.test(values.end)) throw new Error("Use a UTC replay end ending in Z.");
    const input = values.input
      ? (JSON.parse(await readFile(values.input, "utf8")) as Capture[])
      : null;
    const captures =
      input ??
      (await Promise.all(
        connections.map((c) => captureReplay(requireConnection(c).id, symbols, end)),
      ));
    if (!Array.isArray(captures) || !captures.length)
      throw new Error("Expected a capture array from CTS-H.");
    const runs = captures.map((capture) => runReplay(capture, hours, slip));
    if (values.capture) await writeFile(values.capture, JSON.stringify(captures), { flag: "wx" });
    if (values.html) await writeFile(values.html, renderReplay(runs), { flag: "wx" });
    print(
      runs.map(({ report, ...run }) => ({
        ...run,
        symbols: report.symbols,
        unavailable: report.unavailable,
        qualifying: report.proven,
        chosen: report.bookNames,
      })),
    );
    if (runs.some((run) => !run.report.ready || run.report.unavailable.length))
      process.exitCode = 2;
    return;
  }
  if (command === "account") {
    const connection = signedConnection(connectionText);
    print({
      connection: connection.id,
      ...(await account(new Bingx(connection, await credentials(connection)))),
    });
    return;
  }
  if (
    !["propose", "close-plan", "risk", "approve", "send", "reconcile", "review", "show"].includes(
      command,
    )
  ) {
    throw new Error("Unknown command. Run npm run desk -- help.");
  }
  const dir =
    process.env.CTS_H_STATE_DIR ??
    join(process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"), "cts-h");
  const journal = new Journal(dir);
  try {
    if (command === "propose") {
      const side = values.side;
      if (side !== "long" && side !== "short") throw new Error("Choose long or short.");
      print(
        propose(
          journal,
          signedConnection(connectionText).id,
          values.symbol ?? "",
          {
            side,
            quantity: number(values.qty, "quantity"),
            stop: number(values.stop, "stop"),
            target: number(values.target, "target"),
          },
          values.why ?? "",
        ),
      );
      return;
    }
    const id = positionals[0];
    if (!id) throw new Error("Supply the ticket ID.");
    const ticket = journal.get(id);
    if (command === "show") {
      print(journal.history(id));
      return;
    }
    if (command === "approve") {
      print(approve(journal, id, values.confirm ?? ""));
      return;
    }
    if (command === "review") {
      if (!values.why?.trim()) throw new Error("Supply review notes with --why.");
      print(journal.review(id, values.why.trim().slice(0, 2000)));
      return;
    }
    if (command === "close-plan") {
      if (ticket.parent || ticket.phase !== "open")
        throw new Error("Choose a reconciled open parent ticket.");
      print(
        propose(
          journal,
          ticket.connection,
          ticket.symbol,
          {
            ...ticket.bracket,
            quantity: journal.remaining(ticket),
          },
          values.why ?? "",
          ticket.id,
        ),
      );
      return;
    }
    const connection = signedConnection(ticket.connection);
    const limits: Limits = {
      maxNotional: number(process.env.CTS_H_MAX_NOTIONAL ?? "150", "max notional"),
      riskFraction: number(
        process.env.CTS_H_RISK_FRACTION ?? "0.005",
        "risk fraction",
        [0.00001, 0.05],
      ),
      entryBps: number(process.env.CTS_H_ENTRY_BPS ?? "10", "entry basis points", [1, 200]),
      exitBps: number(process.env.CTS_H_EXIT_BPS ?? "20", "exit basis points", [0, 1000]),
    };
    const client = new Bingx(connection, await credentials(connection));
    if (command === "risk") print(await signOff(journal, client, id, limits));
    if (command === "send")
      print(await send(journal, client, id, values.confirm ?? "", limits, armed, values.test));
    if (command === "reconcile") print(await reconcile(journal, client, id));
  } finally {
    journal.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "CTS-H command failed.");
  process.exitCode = 1;
});
