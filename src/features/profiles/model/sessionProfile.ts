import type { SessionProfile } from "../../sessions/model/session";

export const PROFILE_NAME_MAX = 40;
export const PROFILE_INSTRUCTIONS_MAX = 8_000;

export function cleanSessionProfile(
  value: unknown,
): SessionProfile | undefined {
  if (!isRecord(value)) return undefined;
  const id = validId(value.id) ? value.id : "";
  const name = cleanName(value.name);
  if (!id || !name) return undefined;
  return {
    id,
    name,
    icon: cleanIcon(value.icon),
    color: cleanColor(value.color),
  };
}

export function cleanProfileInstructions(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim().slice(0, PROFILE_INSTRUCTIONS_MAX);
  return text || undefined;
}

export function cleanName(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, PROFILE_NAME_MAX)
    : "";
}
export function cleanIcon(value: unknown): string {
  return typeof value === "string" && /^[a-z0-9-]{1,40}$/.test(value)
    ? value
    : "";
}
export function cleanColor(value: unknown): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : "";
}
export function validId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 80 &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
