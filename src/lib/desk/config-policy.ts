import { CALIBRATION_END, CALIBRATED_EXCLUSIONS } from "./calibration.ts";
import { comboId } from "./math.ts";
import type { ConnectionId } from "./connections.ts";
import type { Coordination } from "./management.ts";
import type { Indication } from "./constants.ts";

export type ReplayProfile = "baseline" | "filtered" | "coordinated";
export type CalibratedConnection = "bingx-x01" | "bingx-x02";

export function configurationKey(
  indication: Indication,
  tpAtr: number,
  slOfTp: number,
  coordination: Coordination = "fixed",
) {
  const bracket = `${indication}|${comboId(tpAtr, slOfTp)}`;
  return coordination === "fixed" ? bracket : `${bracket}|${coordination}`;
}

const empty: ReadonlySet<string> = new Set();
const policy: Record<CalibratedConnection, ReadonlySet<string>> = {
  "bingx-x01": new Set(CALIBRATED_EXCLUSIONS["bingx-x01"]),
  "bingx-x02": new Set(CALIBRATED_EXCLUSIONS["bingx-x02"]),
};

export function excludedConfigurations(connection: ConnectionId | undefined, asOf: number) {
  if (!connection || asOf < CALIBRATION_END) return empty;
  return policy[connection === "bingx-x02" ? "bingx-x02" : "bingx-x01"];
}
