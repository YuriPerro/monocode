import { useSyncExternalStore } from "react";
import type { HarnessId } from "../../sessions/model/session";
import {
  errorRateLimits,
  fetchingRateLimits,
  idleRateLimits,
  mergeCodexRateLimitsUpdate,
  RATE_LIMIT_MIN_REFETCH_MS,
  type ProviderRateLimits,
  type RateLimitProvider,
} from "./rateLimits";
import {
  fetchClaudeRateLimits,
  fetchCodexRateLimits,
  fetchOpencodeGoRateLimits,
} from "./rateLimitsFetch";
import {
  providerAccountExists,
  supportsProviderAccounts,
} from "./providerAccounts";

const snapshots = new Map<string, ProviderRateLimits>();
const pending = new Map<string, Promise<ProviderRateLimits>>();
const queuedRefreshes = new Map<string, Promise<ProviderRateLimits>>();
const listeners = new Set<() => void>();
let allSnapshots: Record<string, ProviderRateLimits> = {};

function keyFor(provider: RateLimitProvider, accountId: string): string {
  return `${provider}:${accountId}`;
}

function publish(key: string, value: ProviderRateLimits): void {
  snapshots.set(key, value);
  allSnapshots = { ...allSnapshots, [key]: value };
  for (const listener of listeners) listener();
}

export function subscribeRateLimits(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAllRateLimits(): Record<string, ProviderRateLimits> {
  return allSnapshots;
}

export function getCachedRateLimits(
  provider: RateLimitProvider,
  accountId = "default",
): ProviderRateLimits {
  return snapshots.get(keyFor(provider, accountId)) ?? idle[provider];
}

const idle: Record<RateLimitProvider, ProviderRateLimits> = {
  claude: idleRateLimits("claude"),
  codex: idleRateLimits("codex"),
  opencode: idleRateLimits("opencode"),
};

export function useCachedRateLimits(
  provider: RateLimitProvider,
  accountId = "default",
): ProviderRateLimits {
  return useSyncExternalStore(
    subscribeRateLimits,
    () => getCachedRateLimits(provider, accountId),
    () => getCachedRateLimits(provider, accountId),
  );
}

export function setCachedRateLimits(
  provider: RateLimitProvider,
  accountId: string,
  value: ProviderRateLimits,
): void {
  publish(keyFor(provider, accountId), value);
}

/** Fetch an account once, or again when `force` is set. */
export function loadRateLimits(
  provider: RateLimitProvider,
  accountId = "default",
  force = false,
): Promise<ProviderRateLimits> {
  const key = keyFor(provider, accountId);
  const running = pending.get(key);
  if (running) {
    if (!force) return running;
    const queued = queuedRefreshes.get(key);
    if (queued) return queued;
    const next = running.then(() => loadRateLimits(provider, accountId, true));
    queuedRefreshes.set(key, next);
    void next.finally(() => {
      if (queuedRefreshes.get(key) === next) queuedRefreshes.delete(key);
    });
    return next;
  }
  const cached = snapshots.get(key);
  if (cached && !force) return Promise.resolve(cached);

  publish(key, fetchingRateLimits(provider, cached));
  const run = (async () => {
    let result: ProviderRateLimits;
    try {
      result =
        provider === "claude"
          ? await fetchClaudeRateLimits(accountId)
          : provider === "codex"
            ? await fetchCodexRateLimits(accountId)
            : await fetchOpencodeGoRateLimits();
    } catch (error) {
      result = errorRateLimits(
        provider,
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      pending.delete(key);
    }
    if (
      result.status === "error" &&
      !result.session &&
      !result.weekly &&
      !result.monthly
    ) {
      result = errorRateLimits(
        provider,
        result.error ?? "Usage unavailable",
        getCachedRateLimits(provider, accountId),
      );
    }
    publish(key, result);
    return result;
  })();
  pending.set(key, run);
  return run;
}

/**
 * Focus and turn-end refetches wait out RATE_LIMIT_MIN_REFETCH_MS. A provider
 * that reported "unavailable" waits for an explicit refresh or re-login.
 */
export function isRateLimitSnapshotStale(
  limits: ProviderRateLimits | undefined,
  now = Date.now(),
): boolean {
  if (!limits || limits.status === "idle") return true;
  if (limits.status === "unavailable") return false;
  return now - limits.updatedAt >= RATE_LIMIT_MIN_REFETCH_MS;
}

/** Refetch a stale snapshot; a fresh one or an in-flight request is reused. */
export function refreshStaleRateLimits(
  provider: RateLimitProvider,
  accountId = "default",
  now = Date.now(),
): Promise<ProviderRateLimits> {
  const key = keyFor(provider, accountId);
  const stale =
    !pending.has(key) && isRateLimitSnapshotStale(snapshots.get(key), now);
  return loadRateLimits(provider, accountId, stale);
}

/** A turn that stopped on its usage limit refetches past the throttle. */
export function refreshRateLimitsAfterTurn(
  harness: HarnessId,
  accountId = "default",
  usageLimited = false,
): void {
  if (!supportsProviderAccounts(harness)) return;
  if (!providerAccountExists(harness, accountId)) return;
  void (usageLimited
    ? loadRateLimits(harness, accountId, true)
    : refreshStaleRateLimits(harness, accountId));
}

/** Publish a live Codex `account/rateLimits/updated` snapshot without a request. */
export function noteLiveRateLimits(
  harness: HarnessId,
  accountId: string,
  update: Record<string, unknown>,
): void {
  if (harness !== "codex") return;
  if (!providerAccountExists(harness, accountId)) return;
  const key = keyFor(harness, accountId);
  const merged = mergeCodexRateLimitsUpdate(snapshots.get(key), update);
  if (merged) publish(key, merged);
}

/** Also used when an account is removed and by tests that need a clean cache. */
export function clearCachedRateLimits(
  provider?: RateLimitProvider,
  accountId?: string,
): void {
  if (provider && accountId) {
    const key = keyFor(provider, accountId);
    snapshots.delete(key);
    const { [key]: _removed, ...rest } = allSnapshots;
    allSnapshots = rest;
  } else {
    snapshots.clear();
    allSnapshots = {};
  }
  for (const listener of listeners) listener();
}
