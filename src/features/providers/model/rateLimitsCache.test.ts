import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RATE_LIMIT_MIN_REFETCH_MS,
  type ProviderRateLimits,
  type RateLimitProvider,
} from "./rateLimits";

const fetches = vi.hoisted(() => ({
  claude: vi.fn<(accountId: string) => Promise<ProviderRateLimits>>(),
  codex: vi.fn<(accountId: string) => Promise<ProviderRateLimits>>(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("./rateLimitsFetch", () => ({
  fetchClaudeRateLimits: fetches.claude,
  fetchCodexRateLimits: fetches.codex,
}));

import {
  clearCachedRateLimits,
  getCachedRateLimits,
  isRateLimitSnapshotStale,
  noteLiveRateLimits,
  refreshRateLimitsAfterTurn,
  refreshStaleRateLimits,
  setCachedRateLimits,
} from "./rateLimitsCache";

const MINUTE = 60_000;
const now = Date.parse("2026-10-01T12:00:00Z");

function limits(
  provider: RateLimitProvider,
  usedPercent: number,
  overrides: Partial<ProviderRateLimits> = {},
): ProviderRateLimits {
  return {
    provider,
    session: { usedPercent, windowMinutes: 300, resetsAt: now + 60 * MINUTE },
    weekly: {
      usedPercent: usedPercent / 2,
      windowMinutes: 10_080,
      resetsAt: now + 3 * 86_400_000,
    },
    monthly: null,
    resetCredits: null,
    updatedAt: now,
    error: null,
    status: "ok",
    ...overrides,
  };
}

function seed(
  provider: RateLimitProvider,
  ageMs: number,
  accountId = "default",
): void {
  setCachedRateLimits(
    provider,
    accountId,
    limits(provider, 40, { updatedAt: now - ageMs }),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  });
  clearCachedRateLimits();
  fetches.claude.mockReset();
  fetches.codex.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("isRateLimitSnapshotStale", () => {
  it("throttles refetches to RATE_LIMIT_MIN_REFETCH_MS", () => {
    expect(isRateLimitSnapshotStale(undefined, now)).toBe(true);
    expect(
      isRateLimitSnapshotStale(limits("claude", 1, { status: "idle" }), now),
    ).toBe(true);
    expect(
      isRateLimitSnapshotStale(
        limits("claude", 1, { updatedAt: now - 2 * MINUTE }),
        now,
      ),
    ).toBe(false);
    expect(
      isRateLimitSnapshotStale(
        limits("claude", 1, { updatedAt: now - RATE_LIMIT_MIN_REFETCH_MS }),
        now,
      ),
    ).toBe(true);
  });

  it("leaves a disconnected provider for an explicit refresh", () => {
    expect(
      isRateLimitSnapshotStale(
        limits("codex", 0, { status: "unavailable", updatedAt: 0 }),
        now,
      ),
    ).toBe(false);
  });
});

describe("refreshStaleRateLimits", () => {
  it("refetches a snapshot older than the throttle once", async () => {
    seed("claude", 6 * MINUTE);
    fetches.claude.mockResolvedValue(limits("claude", 70));

    await refreshStaleRateLimits("claude");

    expect(fetches.claude).toHaveBeenCalledTimes(1);
    expect(getCachedRateLimits("claude").session?.usedPercent).toBe(70);
  });

  it("serves a recent snapshot without a request", async () => {
    seed("claude", 2 * MINUTE);

    const value = await refreshStaleRateLimits("claude");

    expect(fetches.claude).not.toHaveBeenCalled();
    expect(value.session?.usedPercent).toBe(40);
  });

  it("reuses an in-flight request", async () => {
    seed("claude", 6 * MINUTE);
    let complete: ((value: ProviderRateLimits) => void) | undefined;
    fetches.claude.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );

    const first = refreshStaleRateLimits("claude");
    const second = refreshStaleRateLimits("claude");
    refreshRateLimitsAfterTurn("claude");
    expect(second).toBe(first);
    expect(fetches.claude).toHaveBeenCalledTimes(1);

    complete?.(limits("claude", 55));
    await first;
    expect(fetches.claude).toHaveBeenCalledTimes(1);
  });

  it("keeps the last windows when the refetch fails", async () => {
    seed("claude", 6 * MINUTE);
    fetches.claude.mockResolvedValue({
      ...limits("claude", 0),
      session: null,
      weekly: null,
      status: "error",
      error: "Claude usage request failed (429)",
    });

    await refreshStaleRateLimits("claude");

    const cached = getCachedRateLimits("claude");
    expect(cached.status).toBe("error");
    expect(cached.error).toBe("Claude usage request failed (429)");
    expect(cached.session?.usedPercent).toBe(40);
    expect(cached.weekly?.usedPercent).toBe(20);
  });

  it("keeps the last windows when the fetch throws", async () => {
    seed("codex", 6 * MINUTE);
    fetches.codex.mockRejectedValue(new Error("Codex usage probe timed out"));

    await refreshStaleRateLimits("codex");

    const cached = getCachedRateLimits("codex");
    expect(cached.status).toBe("error");
    expect(cached.session?.usedPercent).toBe(40);
  });
});

describe("refreshRateLimitsAfterTurn", () => {
  it("respects the throttle after a normal turn", async () => {
    seed("claude", 2 * MINUTE);
    seed("codex", 6 * MINUTE);
    fetches.codex.mockResolvedValue(limits("codex", 80));

    refreshRateLimitsAfterTurn("claude");
    refreshRateLimitsAfterTurn("codex");
    await vi.runAllTimersAsync();

    expect(fetches.claude).not.toHaveBeenCalled();
    expect(fetches.codex).toHaveBeenCalledWith("default");
  });

  it("forces a refetch when the turn hit its usage limit", async () => {
    seed("claude", 0);
    fetches.claude.mockResolvedValue(limits("claude", 100));

    refreshRateLimitsAfterTurn("claude", "default", true);
    await vi.runAllTimersAsync();

    expect(fetches.claude).toHaveBeenCalledTimes(1);
    expect(getCachedRateLimits("claude").session?.usedPercent).toBe(100);
  });

  it("skips removed accounts and harnesses without account usage", async () => {
    refreshRateLimitsAfterTurn("claude", "account-gone", true);
    refreshRateLimitsAfterTurn("cursor");
    await vi.runAllTimersAsync();

    expect(fetches.claude).not.toHaveBeenCalled();
    expect(fetches.codex).not.toHaveBeenCalled();
  });
});

describe("noteLiveRateLimits", () => {
  const update = {
    limitId: "codex",
    primary: { usedPercent: 63, windowDurationMins: 300, resetsAt: 1_900 },
    secondary: null,
  };

  it("merges a sparse Codex update into the last read", () => {
    seed("codex", 30 * MINUTE);

    noteLiveRateLimits("codex", "default", update);

    const cached = getCachedRateLimits("codex");
    expect(cached.session?.usedPercent).toBe(63);
    expect(cached.weekly?.usedPercent).toBe(20);
    expect(cached.updatedAt).toBe(now);
    expect(isRateLimitSnapshotStale(cached, now)).toBe(false);
    expect(fetches.codex).not.toHaveBeenCalled();
  });

  it("ignores other buckets, unread accounts, and other harnesses", () => {
    noteLiveRateLimits("codex", "default", update);
    expect(getCachedRateLimits("codex").status).toBe("idle");

    seed("codex", 30 * MINUTE);
    noteLiveRateLimits("codex", "default", { ...update, limitId: "other" });
    noteLiveRateLimits("claude", "default", update);
    noteLiveRateLimits("codex", "account-gone", update);
    expect(getCachedRateLimits("codex").session?.usedPercent).toBe(40);
    expect(getCachedRateLimits("codex", "account-gone").status).toBe("idle");
  });
});
