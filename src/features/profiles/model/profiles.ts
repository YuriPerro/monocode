import { mergeModelSettings, resolveModel } from "../../sessions/model/models";
import {
  cleanColor,
  cleanIcon,
  cleanName,
  isRecord,
  PROFILE_INSTRUCTIONS_MAX,
  validId,
} from "./sessionProfile";
import {
  HARNESSES,
  RUNTIME_MODES,
  type HarnessId,
  type RuntimeMode,
  type Session,
  type SessionProfile,
} from "../../sessions/model/session";

export const AGENT_PROFILES_KEY = "monocode.agentProfiles.v1";
const CHANGE_EVENT = "monocode-agent-profiles-changed";

/** Launch configuration plus standing instructions for a named agent role. */
export type AgentProfile = {
  id: string;
  name: string;
  icon: string;
  color: string;
  /** When to use this profile; shown in pickers and to orchestrating agents. */
  description: string;
  harness: HarnessId;
  model: string;
  modelSettings: Record<string, string>;
  runtimeMode: RuntimeMode;
  instructions: string;
};

export function agentProfiles(): AgentProfile[] {
  const seen = new Set<string>();
  return readStored().flatMap((entry) => {
    const profile = cleanProfile(entry);
    if (!profile || seen.has(profile.id)) return [];
    seen.add(profile.id);
    return [profile];
  });
}

export function agentProfile(id: string | undefined): AgentProfile | undefined {
  return id ? agentProfiles().find((profile) => profile.id === id) : undefined;
}

/** Resolve a profile by ID or, case-insensitively, by name. */
export function findAgentProfile(query: string): AgentProfile | undefined {
  const profiles = agentProfiles();
  const name = cleanName(query).toLowerCase();
  return (
    profiles.find((profile) => profile.id === query) ??
    profiles.find((profile) => profile.name.toLowerCase() === name)
  );
}

export function newAgentProfile(
  source: Pick<Session, "harness" | "model" | "modelSettings" | "runtimeMode">,
): AgentProfile {
  return {
    id: `profile-${crypto.randomUUID()}`,
    name: "",
    icon: "",
    color: "",
    description: "",
    harness: source.harness,
    model: source.model,
    modelSettings: { ...source.modelSettings },
    runtimeMode: source.runtimeMode,
    instructions: "",
  };
}

/** Insert or replace a profile; rejects one that would not survive a reload. */
export function saveAgentProfile(profile: AgentProfile): AgentProfile {
  const clean = cleanProfile(profile);
  if (!clean) throw new Error("Profile needs a name");
  const others = agentProfiles().filter((entry) => entry.id !== clean.id);
  if (
    others.some(
      (entry) => entry.name.toLowerCase() === clean.name.toLowerCase(),
    )
  )
    throw new Error(`A profile named ${clean.name} already exists`);
  const current = agentProfiles();
  const index = current.findIndex((entry) => entry.id === clean.id);
  const next =
    index < 0
      ? [...current, clean]
      : current.map((entry) => (entry.id === clean.id ? clean : entry));
  write(next);
  return clean;
}

export function removeAgentProfile(id: string): boolean {
  const current = agentProfiles();
  const next = current.filter((profile) => profile.id !== id);
  if (next.length === current.length) return false;
  write(next);
  return true;
}

export function moveAgentProfile(id: string, toIndex: number): void {
  const current = agentProfiles();
  const from = current.findIndex((profile) => profile.id === id);
  if (from < 0) return;
  const next = [...current];
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, moved);
  write(next);
}

export function subscribeAgentProfiles(listener: () => void): () => void {
  const local = () => listener();
  const storage = (event: StorageEvent) => {
    if (event.key === AGENT_PROFILES_KEY) listener();
  };
  window.addEventListener(CHANGE_EVENT, local);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, local);
    window.removeEventListener("storage", storage);
  };
}

export function sessionProfile(profile: AgentProfile): SessionProfile {
  return {
    id: profile.id,
    name: profile.name,
    icon: profile.icon,
    color: profile.color,
  };
}

/** The part of a profile a session keeps once it starts. */
export function profileLaunch(profile: AgentProfile): {
  profile: SessionProfile;
  profileInstructions?: string;
} {
  const instructions = profile.instructions.trim();
  return {
    profile: sessionProfile(profile),
    ...(instructions ? { profileInstructions: instructions } : {}),
  };
}

/**
 * Start a session as the profile. The instructions are copied so later edits
 * to the profile never change a conversation that already began.
 */
export function applyAgentProfile<T extends Session>(
  session: T,
  profile: AgentProfile,
): T {
  const model = resolveModel(profile.harness, profile.model);
  return {
    ...session,
    harness: profile.harness,
    model: model.id,
    modelSettings: mergeModelSettings(model, profile.modelSettings),
    runtimeMode: profile.runtimeMode,
    profileInstructions: undefined,
    ...profileLaunch(profile),
  };
}

/** Drop a profile before the first turn, keeping the chosen model. */
export function clearAgentProfile<T extends Session>(session: T): T {
  return { ...session, profile: undefined, profileInstructions: undefined };
}

function cleanProfile(value: unknown): AgentProfile | undefined {
  if (!isRecord(value)) return undefined;
  const id = validId(value.id) ? value.id : "";
  const name = cleanName(value.name);
  const harness = HARNESSES.find((entry) => entry === value.harness);
  const runtimeMode = RUNTIME_MODES.find(
    (entry) => entry === value.runtimeMode,
  );
  if (!id || !name || !harness || !runtimeMode) return undefined;
  if (typeof value.model !== "string" || !value.model.trim()) return undefined;
  return {
    id,
    name,
    icon: cleanIcon(value.icon),
    color: cleanColor(value.color),
    description:
      typeof value.description === "string"
        ? value.description.replace(/\s+/g, " ").trim().slice(0, 240)
        : "",
    harness,
    model: value.model.trim(),
    modelSettings: cleanSettings(value.modelSettings),
    runtimeMode,
    instructions:
      typeof value.instructions === "string"
        ? value.instructions.slice(0, PROFILE_INSTRUCTIONS_MAX)
        : "",
  };
}

function cleanSettings(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" && entry[0].length <= 64,
    ),
  );
}

function readStored(): unknown[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(AGENT_PROFILES_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(profiles: AgentProfile[]): void {
  localStorage.setItem(AGENT_PROFILES_KEY, JSON.stringify(profiles));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
