import { useSyncExternalStore } from "react";
import {
  AGENT_PROFILES_KEY,
  agentProfiles,
  subscribeAgentProfiles,
  type AgentProfile,
} from "../model/profiles";

let cache: { raw: string | null; profiles: AgentProfile[] } | null = null;

function snapshot(): AgentProfile[] {
  const raw = localStorage.getItem(AGENT_PROFILES_KEY);
  if (cache?.raw !== raw) cache = { raw, profiles: agentProfiles() };
  return cache.profiles;
}

/** Saved profiles, kept current across windows. */
export function useAgentProfiles(): AgentProfile[] {
  return useSyncExternalStore(subscribeAgentProfiles, snapshot, snapshot);
}
