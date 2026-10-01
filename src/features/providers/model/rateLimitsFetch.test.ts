import { beforeEach, describe, expect, it, vi } from "vitest";

const child = vi.hoisted(() => ({
  live: 0,
  maxLive: 0,
  spawned: [] as string[],
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../../platform/tauri/fs", () => ({
  homeDir: async () => "/home/test",
}));
vi.mock("../../../integrations/harness/core/child", () => ({
  resolveCodexBinary: async () => ({ path: "/bin/codex" }),
  spawnChild: async (
    _id: string,
    _path: string,
    _args: string[],
    _cwd: string,
    account: { id: string },
  ) => {
    child.live += 1;
    child.maxLive = Math.max(child.maxLive, child.live);
    child.spawned.push(account.id);
  },
  watchChild: () => undefined,
  unwatchChild: () => {
    child.live = Math.max(0, child.live - 1);
  },
  killChild: async () => undefined,
}));
vi.mock("../../../integrations/harness/core/jsonRpc", () => ({
  JsonRpcClient: class {
    close() {}
    pushLine() {}
    respond() {
      return Promise.resolve();
    }
    notify() {
      return Promise.resolve();
    }
    async request(method: string) {
      if (method !== "account/rateLimits/read") return {};
      await new Promise((resolve) => setTimeout(resolve, 5));
      return {
        rateLimits: {
          primary: { usedPercent: 10, windowDurationMins: 300 },
        },
      };
    }
  },
}));

import { invoke } from "@tauri-apps/api/core";
import { errorRateLimits, signInRequired } from "./rateLimits";
import { fetchClaudeRateLimits, fetchCodexRateLimits } from "./rateLimitsFetch";

describe("fetchClaudeRateLimits sign-in state", () => {
  it("asks for sign-in when the account has no or an expired sign-in", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      status: "unavailable",
      error: "Claude not signed in",
    });
    expect(await fetchClaudeRateLimits("work")).toMatchObject({
      status: "unavailable",
      signInRequired: true,
    });
    vi.mocked(invoke).mockResolvedValueOnce({
      status: "error",
      httpStatus: 401,
      error: "Claude sign-in expired",
    });
    expect(await fetchClaudeRateLimits("work")).toMatchObject({
      status: "error",
      error: "Claude sign-in expired",
      signInRequired: true,
    });
  });

  it("does not ask for sign-in on other usage failures", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      status: "error",
      httpStatus: 429,
      error: "Claude usage request failed (429)",
    });
    expect(
      (await fetchClaudeRateLimits("work")).signInRequired,
    ).toBeUndefined();
  });

  it("drops a stale sign-in flag when a later failure keeps old windows", () => {
    const previous = signInRequired({
      ...errorRateLimits("claude", "Claude sign-in expired"),
      session: { usedPercent: 10, windowMinutes: 300, resetsAt: null },
    });
    expect(
      errorRateLimits("claude", "Timed out", previous).signInRequired,
    ).toBeUndefined();
  });
});

describe("fetchCodexRateLimits", () => {
  beforeEach(() => {
    child.live = 0;
    child.maxLive = 0;
    child.spawned = [];
  });

  it("runs usage probes for different accounts one at a time", async () => {
    const results = await Promise.all([
      fetchCodexRateLimits("default"),
      fetchCodexRateLimits("account-work"),
      fetchCodexRateLimits("account-personal"),
    ]);

    expect(child.maxLive).toBe(1);
    expect(child.spawned).toEqual([
      "default",
      "account-work",
      "account-personal",
    ]);
    expect(results.map((result) => result.session?.usedPercent)).toEqual([
      10, 10, 10,
    ]);
  });
});
