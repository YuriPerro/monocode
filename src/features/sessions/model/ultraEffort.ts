import { isEffortSettingId } from "./models";
import type { HarnessId } from "./session";

/** Claude's two effort levels above Max, which dress the effort chip. */
export type UltraEffort = "ultracode" | "ultrathink";

/** The ultra level a Claude effort value rests in, if any. */
export function ultraEffortTone(
  harness: HarnessId,
  settingId: string,
  value: string | undefined,
): UltraEffort | undefined {
  if (harness !== "claude" || !isEffortSettingId(settingId)) return undefined;
  return value === "ultracode" || value === "ultrathink" ? value : undefined;
}

/**
 * The charm a pick from the effort picker plays: only a change into an ultra
 * level. Re-picking the current value stays quiet, and only the picker asks,
 * so mounts, session switches, and restored or remote settings never play it.
 */
export function ultraEffortCharm(
  harness: HarnessId,
  settingId: string,
  previous: string,
  next: string,
): UltraEffort | undefined {
  if (previous === next) return undefined;
  return ultraEffortTone(harness, settingId, next);
}
