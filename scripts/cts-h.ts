import type { ReplayProfile } from "../src/lib/desk/config-policy.ts";
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
import { INDICATIONS, REPLAY_SYMBOLS, type Indication } from "../src/lib/desk/constants.ts";
import {
  account,
  approve,
  clearFlatControls,
  ownedPortfolio,
  planClose,
  protect,
  propose,
  reconcile,
  send,
  sendBatch,
  signOff,
  type Limits,
} from "../src/lib/desk/execution.server.ts";
import { Journal } from "../src/lib/desk/journal.server.ts";
import { loadDepth, loadFunding, loadQuote, quoteIsFresh } from "../src/lib/desk/market.server.ts";
import { CANDLE_INTERVALS, HOUR_MS, isCandleInterval } from "../src/lib/desk/intervals.ts";
import { REPLAY_WARMUP_BARS } from "../src/lib/desk/process.ts";
import {
  STRATEGY_TYPES,
  defaultForInterval,
  normalizeStrategies,
  type StrategySettings,
} from "../src/lib/desk/strategies.ts";
import { captureReplay, renderMarkdown, renderReplay, runReplay, type Capture } from "./cts-h-replay.ts";
import type { LanePolicy } from "../src/lib/desk/lanes.ts";

const HELP = `CTS-H BingX Trading Desk
  brief [--connection bingx-x02] [--symbol ETH-USDT]
  replay [--connection bingx-x01|bingx-x02|both] [--hours 48] [--pre-hours 48] [--interval 1m|5m|15m|30m|1h|4h]
         [--symbols BTC-USDT,ETH-USDT] [--end ISO] [--history-hours 132] [--input candles.json] [--capture candles.json]
         [--profile coordinated|filtered|baseline|both|all] [--indication NAME|all] [--range short|wide]
         [--strategies none|axis,block,dca,relate] [--min-pf 1.0] [--auto-pf on|off]
         [--strategy-settings config.json] [--volume-factor 1.0] [--independent-indications] [--reselect-hours 24]
         [--period-hours 4] [--html report.html] [--markdown report.md]
         [--profile staged --per-symbol 1 --thins 2 --min-closes 6 --min-pf 1.05 --auto-penalty 0.15 --require-net on|off]
  doctor
  account --connection bingx-x02
  propose --connection bingx-x02 --symbol ETH-USDT --side long --qty N --stop N --target N --why TEXT
  close-plan TICKET --why TEXT [--qty N]
  risk TICKET
  approve TICKET --confirm TICKET
  send TICKET --confirm TICKET [--test]
  send-batch TICKET,TICKET --confirm TICKET,TICKET
  reconcile TICKET
  reconcile-batch TICKET,TICKET
  portfolio --connection bingx-x02
  protect TICKET --stop N|--target N --confirm TICKET [--control-mode quantity|overall] [--qty N] [--test]
  clear-controls TICKET --confirm TICKET
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
      "pre-hours": { type: "string" },
      interval: { type: "string" },
      indication: { type: "string" },
      range: { type: "string" },
      strategies: { type: "string" },
      "strategy-settings": { type: "string" },
      "volume-factor": { type: "string" },
      "selected-only": { type: "boolean" },
      "period-hours": { type: "string" },
      "per-symbol": { type: "string" },
      thins: { type: "string" },
      "min-closes": { type: "string" },
      "auto-penalty": { type: "string" },
      "require-net": { type: "string" },
      markdown: { type: "string" },
      "independent-indications": { type: "boolean" },
      "reselect-hours": { type: "string" },
      "min-pf": { type: "string" },
      "lane-settings": { type: "string" },
      "auto-pf": { type: "string" },
      "control-mode": { type: "string" },
      "history-hours": { type: "string" },
      profile: { type: "string" },
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
  if (values.test && !["send", "protect"].includes(command))
    throw new Error("The test flag is available for send and protect.");
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
    const hours = number(values.hours ?? "48", "replay hours", [1, 336]);
    const preHours = number(values["pre-hours"] ?? String(hours), "prehistory hours", [1, 336]);
    if (!Number.isInteger(hours) || !Number.isInteger(preHours))
      throw new Error("Use whole hours for the prehistory and holdout.");
    const interval = values.interval ?? "1h";
    if (!isCandleInterval(interval)) throw new Error("Choose a supported candle interval.");
    const step = CANDLE_INTERVALS[interval];
    const minHistory = preHours + hours + Math.ceil((REPLAY_WARMUP_BARS * step) / HOUR_MS);
    const alignedHistory = (Math.ceil((minHistory * HOUR_MS) / step) * step) / HOUR_MS;
    const history = number(
      values["history-hours"] ??
        String(interval === "1h" ? Math.max(132, alignedHistory) : alignedHistory),
      "history hours",
      [minHistory, 1440],
    );
    if (!Number.isInteger((history * HOUR_MS) / step))
      throw new Error("History must span a whole number of candles.");
    const profile = values.profile ?? "coordinated";
    if (!["baseline", "filtered", "coordinated", "staged", "both", "all"].includes(profile))
      throw new Error("Choose coordinated, staged, filtered, baseline, both or all.");
    const profiles: ReplayProfile[] =
      profile === "both"
        ? ["baseline", "filtered"]
        : profile === "all"
          ? ["baseline", "filtered", "coordinated"]
          : [profile as ReplayProfile];
    const indication = values.indication === "all" ? undefined : values.indication;
    const range = values.range === "short" || values.range === "wide" ? values.range : undefined;
    if (indication && !INDICATIONS.includes(indication as Indication))
      throw new Error(`Choose an indication from ${INDICATIONS.join(", ")}.`);
    if (values.range && !range) throw new Error("Choose short or wide.");
    const configured = values["strategy-settings"]
      ? (JSON.parse(
          await readFile(values["strategy-settings"], "utf8"),
        ) as Partial<StrategySettings>)
      : {};
    const chosen =
      values.strategies && values.strategies !== "none"
        ? values.strategies.split(",").map((key) => key.trim())
        : [];
    if (chosen.some((key) => !STRATEGY_TYPES.some((type) => type === key)))
      throw new Error("Choose Axis, Block, DCA, Relate or none using lowercase names.");
    const activated =
      values.strategies === undefined
        ? {}
        : Object.fromEntries(STRATEGY_TYPES.map((key) => [key, chosen.includes(key)]));
    const volume = values["volume-factor"];
    const minimumPf = values["min-pf"];
    const autoPf = values["auto-pf"];
    const reselectHours = values["reselect-hours"] === undefined ? undefined :
      number(values["reselect-hours"], "reselection hours", [0, 336]);
    if (reselectHours !== undefined && !Number.isInteger(reselectHours))
      throw new Error("Reselection hours must be a whole number.");
    if (autoPf && autoPf !== "on" && autoPf !== "off")
      throw new Error("Choose on or off for Auto PF.");
    const overrides = {
      ...configured,
      ...activated,
      ...(volume === undefined ? {} : { volumeFactor: number(volume, "volume factor", [0.1, 10]) }),
      ...(minimumPf === undefined ? {} : { minimumPf: number(minimumPf, "minimum PF", [1, 4]) }),
      ...(autoPf === undefined ? {} : { autoPf: autoPf === "on" }),
      ...(profile === "staged" ? { extendedTargets: true, enabledIndications: INDICATIONS } : {}),
      ...(values.indication === "all" ? { enabledIndications: INDICATIONS } : {}),
    };
    const slip = number(values["slip-bps"] ?? "1", "slippage basis points", [0, 200]);
    const source = values.connection ?? "bingx-x01";
    const connections = source === "both" ? ["bingx-x01", "bingx-x02"] : [source];
    const symbols = [...new Set((values.symbols?.split(",") ?? REPLAY_SYMBOLS).map(requireSymbol))];
    if (!symbols.length || symbols.length > 60) throw new Error("Supply 1 to 60 unique symbols.");
    const end = values.end ? Date.parse(values.end) : undefined;
    if (
      end !== undefined &&
      (!values.end!.endsWith("Z") || !Number.isSafeInteger(end) || end <= 0)
    ) {
      throw new Error("Use a UTC replay cutoff ending in Z.");
    }
    const input = values.input
      ? (JSON.parse(await readFile(values.input, "utf8")) as Capture[])
      : null;
    const captures =
      input ??
      (await Promise.all(
        connections.map((c) =>
          captureReplay(requireConnection(c).id, symbols, end, history, interval),
        ),
      ));
    if (!Array.isArray(captures) || !captures.length)
      throw new Error("Expected a capture array from CTS-H.");
    if (input && end !== undefined && captures.some((capture) => end > capture.end)) {
      throw new Error("Choose a replay end at or before the latest captured closed hour.");
    }
    const replayInput = captures.map((capture) => {
      const candleSize = capture.interval ?? "1h";
      if (!isCandleInterval(candleSize) || (input && values.interval && candleSize !== interval))
        throw new Error("The requested interval must match the saved capture.");
      const step = CANDLE_INTERVALS[candleSize];
      const cutoff = end ?? capture.end;
      if (cutoff % step !== 0 || (hours * HOUR_MS) % step || (preHours * HOUR_MS) % step)
        throw new Error("Replay windows and cutoff must align to the captured interval.");
      const books = values.symbols
        ? capture.books.filter((book) => symbols.includes(book.symbol))
        : capture.books;
      if (!books.length) throw new Error("No requested markets exist in the capture.");
      return { ...capture, end: cutoff, books };
    });
    const periodHours = number(values["period-hours"] ?? "4", "period hours", [1, 336]);
    if (!Number.isInteger(periodHours)) throw new Error("Period hours must be a whole number.");
    // Lane settings: per-relation PF floors, cost multiple, auto PF and net requirement.
    const laneFile = values["lane-settings"]
      ? (JSON.parse(await readFile(values["lane-settings"], "utf8")) as Partial<LanePolicy>)
      : {};
    const laneSettings: Partial<LanePolicy> = {
      ...laneFile,
      ...(values["auto-penalty"] === undefined ? {} : { autoPenalty: number(values["auto-penalty"], "auto PF penalty", [0, 1]) }),
      ...(values["require-net"] === undefined ? {} : { requireNet: values["require-net"] !== "off" }),
    };
    const runs = replayInput.flatMap((capture) => {
      const strategies = normalizeStrategies({
        ...defaultForInterval(capture.interval ?? "1h"),
        ...overrides,
      });
      return profiles.map((selection) =>
        runReplay(capture, hours, slip, selection, strategies, {
          preHours,
          indication: indication as Indication | undefined,
          range,
          // Portfolio outcomes match the full candidate replay; only selected cells are replayed.
          selectedOnly: true,
          independentIndications: values["independent-indications"],
          reselectHours,
          staged: {
            perSymbol: number(values["per-symbol"] ?? "1", "cells per market", [1, 10]),
            minPf: values["min-pf"] === undefined ? undefined : number(values["min-pf"], "minimum PF", [0.1, 4]),
            policy: laneSettings,
            thins: number(values.thins ?? "2", "thin stages", [0, 4]),
            minCloses: number(values["min-closes"] ?? "6", "minimum closes", [1, 200]),
          },
        }),
      );
    });
    if (values.capture) await writeFile(values.capture, JSON.stringify(captures), { flag: "wx" });
    if (values.html) await writeFile(values.html, renderReplay(runs, "", periodHours), { flag: "wx" });
    if (values.markdown) await writeFile(values.markdown, renderMarkdown(runs, periodHours), { flag: "wx" });
    print(
      runs.map(({ report, ...run }) => ({
        ...run,
        symbols: report.symbols,
        unavailable: report.unavailable,
        qualifying: report.proven,
        evaluatedConfigs: report.evaluatedConfigs,
        disabledConfigs: report.disabledConfigs,
        rejectedPf: report.rejectedPf,
        strategyActions: report.strategyActions,
        indicationSummaries: report.indicationSummaries,
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
    ![
      "propose",
      "close-plan",
      "risk",
      "approve",
      "send",
      "send-batch",
      "reconcile",
      "reconcile-batch",
      "portfolio",
      "protect",
      "clear-controls",
      "review",
      "show",
    ].includes(command)
  ) {
    throw new Error("Unknown command. Run npm run desk -- help.");
  }
  const dir =
    process.env.CTS_H_STATE_DIR ??
    join(process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"), "cts-h");
  const journal = new Journal(dir);
  try {
    if (command === "portfolio") {
      const connection = signedConnection(connectionText);
      print(
        await ownedPortfolio(
          journal,
          new Bingx(connection, await credentials(connection)),
          connection.id,
        ),
      );
      return;
    }
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
    const requested = positionals[0];
    if (!requested) throw new Error("Supply the ticket ID.");
    const batch = command === "send-batch" || command === "reconcile-batch";
    const ids = batch ? requested.split(",") : [requested];
    if (ids.length > 5 || new Set(ids).size !== ids.length || ids.some((id) => !id))
      throw new Error("Supply one to five unique ticket IDs.");
    const id = ids[0]!;
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
      const quantity =
        values.qty === undefined ? undefined : number(values.qty, "partial close quantity");
      print(planClose(journal, id, values.why ?? "", quantity));
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
    if (command === "send-batch")
      print(await sendBatch(journal, client, ids, values.confirm ?? "", limits, armed));
    if (command === "reconcile") print(await reconcile(journal, client, id));
    if (command === "reconcile-batch") {
      if (ids.some((id) => journal.get(id).connection !== connection.id))
        throw new Error("Reconcile a batch on a single connection.");
      if (new Set(ids.map((id) => journal.get(id).symbol)).size !== ids.length)
        throw new Error("Reconcile tickets on distinct markets in a batch.");
      const results = await Promise.allSettled(ids.map((id) => reconcile(journal, client, id)));
      print(
        results.map((result, i) =>
          result.status === "fulfilled"
            ? result.value
            : {
                id: ids[i],
                error: result.reason instanceof Error ? result.reason.message : "Reconcile failed",
              },
        ),
      );
      if (results.some((result) => result.status === "rejected")) process.exitCode = 2;
    }
    if (command === "protect") {
      if ((values.stop === undefined) === (values.target === undefined))
        throw new Error("Supply exactly one stop or target price.");
      const mode = values["control-mode"] ?? "quantity";
      if (mode !== "quantity" && mode !== "overall")
        throw new Error("Choose quantity or overall control mode.");
      const kind = values.stop === undefined ? "target" : "stop";
      const trigger = number(values[kind]!, "trigger price");
      const quantity =
        values.qty === undefined ? undefined : number(values.qty, "control quantity");
      print(
        await protect(
          journal,
          client,
          id,
          values.confirm ?? "",
          kind,
          trigger,
          mode === "overall",
          armed,
          values.test,
          quantity,
        ),
      );
    }
    if (command === "clear-controls")
      print(await clearFlatControls(journal, client, id, values.confirm ?? "", armed));
  } finally {
    journal.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "CTS-H command failed.");
  process.exitCode = 1;
});
