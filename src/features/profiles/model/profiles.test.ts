// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { newSession } from "../../sessions/model/session";
import {
  agentProfiles,
  applyAgentProfile,
  clearAgentProfile,
  findAgentProfile,
  moveAgentProfile,
  newAgentProfile,
  removeAgentProfile,
  saveAgentProfile,
  type AgentProfile,
} from "./profiles";
import {
  beforeFirstUserTurn,
  nativeProfileInstructions,
  withProfilePreamble,
} from "./profileInstructions";
import { cleanSessionProfile } from "./sessionProfile";

function profile(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    ...newAgentProfile(newSession("codex", "/tmp/project", "codex:test")),
    name: "Architecture",
    icon: "layers",
    color: "#6366F1",
    instructions: "Weigh alternatives before broad changes.",
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("agent profiles", () => {
  it("saves, normalizes and finds profiles by id or name", () => {
    const saved = saveAgentProfile(profile({ name: "  Architecture   lead " }));
    expect(saved).toMatchObject({
      name: "Architecture lead",
      color: "#6366f1",
    });
    expect(agentProfiles()).toEqual([saved]);
    expect(findAgentProfile(saved.id)).toEqual(saved);
    expect(findAgentProfile("architecture LEAD")).toEqual(saved);
    expect(findAgentProfile("Designer")).toBeUndefined();
  });

  it("rejects nameless and duplicate profiles", () => {
    expect(() => saveAgentProfile(profile({ name: "  " }))).toThrow("name");
    saveAgentProfile(profile());
    expect(() =>
      saveAgentProfile(profile({ id: "profile-2", name: "architecture" })),
    ).toThrow("already exists");
  });

  it("drops corrupt stored entries instead of failing", () => {
    localStorage.setItem(
      "monocode.agentProfiles.v1",
      JSON.stringify([
        { id: "bad id", name: "X" },
        { ...profile(), harness: "unknown" },
        profile({ id: "profile-ok", icon: "Not A Slug", color: "red" }),
      ]),
    );
    expect(agentProfiles()).toEqual([
      expect.objectContaining({ id: "profile-ok", icon: "", color: "" }),
    ]);
  });

  it("reorders and removes profiles", () => {
    const first = saveAgentProfile(profile({ id: "profile-a", name: "A" }));
    const second = saveAgentProfile(profile({ id: "profile-b", name: "B" }));
    moveAgentProfile(second.id, 0);
    expect(agentProfiles().map((entry) => entry.id)).toEqual([
      second.id,
      first.id,
    ]);
    expect(removeAgentProfile(first.id)).toBe(true);
    expect(removeAgentProfile(first.id)).toBe(false);
    expect(agentProfiles().map((entry) => entry.id)).toEqual([second.id]);
  });

  it("applies launch settings and copies the instructions into the session", () => {
    const architecture = profile({ runtimeMode: "full-access" });
    const session = applyAgentProfile(
      newSession("claude", "/tmp/project"),
      architecture,
    );
    expect(session).toMatchObject({
      harness: "codex",
      runtimeMode: "full-access",
      profile: {
        id: architecture.id,
        name: "Architecture",
        icon: "layers",
        color: "#6366F1",
      },
      profileInstructions: "Weigh alternatives before broad changes.",
    });
    expect(clearAgentProfile(session)).toMatchObject({
      harness: "codex",
      profile: undefined,
      profileInstructions: undefined,
    });
  });

  it("restores only a valid session profile snapshot", () => {
    expect(
      cleanSessionProfile({ id: "p1", name: " Designer ", icon: "palette" }),
    ).toEqual({ id: "p1", name: "Designer", icon: "palette", color: "" });
    expect(cleanSessionProfile({ id: "p1" })).toBeUndefined();
    expect(cleanSessionProfile("Designer")).toBeUndefined();
  });
});

describe("profile instructions", () => {
  const session = {
    profile: { id: "p1", name: 'The "Advisor"', icon: "", color: "" },
    profileInstructions: "Look for risks.",
  };

  it("sends instructions only to harnesses with a system prompt hook", () => {
    expect(nativeProfileInstructions(session, true)).toEqual({
      instructions: "Look for risks.",
    });
    expect(nativeProfileInstructions(session, false)).toEqual({});
    expect(nativeProfileInstructions({}, true)).toEqual({});
  });

  it("prefixes the first turn of other harnesses with a profile block", () => {
    expect(
      withProfilePreamble("Review the plan", session, {
        native: false,
        freshConversation: true,
      }),
    ).toBe(
      `<monocode_profile name="The 'Advisor'">\nLook for risks.\n</monocode_profile>\n\nReview the plan`,
    );
    for (const options of [
      { native: true, freshConversation: true },
      { native: false, freshConversation: false },
    ])
      expect(withProfilePreamble("Review the plan", session, options)).toBe(
        "Review the plan",
      );
  });

  it("detects the first submitted user turn", () => {
    const fresh = newSession("cursor", "/tmp/project");
    expect(beforeFirstUserTurn(fresh)).toBe(true);
    expect(
      beforeFirstUserTurn({
        blocks: [{ id: "d", role: "user", text: "later", draft: true }],
      }),
    ).toBe(true);
    expect(
      beforeFirstUserTurn({
        blocks: [{ id: "u", role: "user", text: "hello" }],
      }),
    ).toBe(false);
  });
});
