import { describe, expect, it } from "vitest";
import { ultraEffortCharm, ultraEffortTone } from "./ultraEffort";

describe("ultra effort", () => {
  it("rests in an ultra level only for Claude's effort setting", () => {
    expect(ultraEffortTone("claude", "effort", "ultracode")).toBe("ultracode");
    expect(ultraEffortTone("claude", "effort", "ultrathink")).toBe(
      "ultrathink",
    );
    expect(ultraEffortTone("claude", "effort", "max")).toBeUndefined();
    expect(ultraEffortTone("claude", "effort", undefined)).toBeUndefined();
    expect(ultraEffortTone("claude", "fast", "ultrathink")).toBeUndefined();
    expect(ultraEffortTone("codex", "effort", "ultrathink")).toBeUndefined();
    expect(
      ultraEffortTone("codex", "reasoningEffort", "ultracode"),
    ).toBeUndefined();
  });

  it("plays a charm when a pick moves into an ultra level", () => {
    expect(ultraEffortCharm("claude", "effort", "xhigh", "ultracode")).toBe(
      "ultracode",
    );
    expect(ultraEffortCharm("claude", "effort", "high", "ultrathink")).toBe(
      "ultrathink",
    );
    expect(
      ultraEffortCharm("claude", "effort", "ultracode", "ultrathink"),
    ).toBe("ultrathink");
    expect(
      ultraEffortCharm("claude", "effort", "ultrathink", "ultracode"),
    ).toBe("ultracode");
  });

  it("stays quiet on a re-pick, a pick out of ultra, and other providers", () => {
    expect(
      ultraEffortCharm("claude", "effort", "ultracode", "ultracode"),
    ).toBeUndefined();
    expect(
      ultraEffortCharm("claude", "effort", "ultrathink", "ultrathink"),
    ).toBeUndefined();
    expect(
      ultraEffortCharm("claude", "effort", "ultrathink", "max"),
    ).toBeUndefined();
    expect(
      ultraEffortCharm("claude", "fast", "false", "ultrathink"),
    ).toBeUndefined();
    expect(
      ultraEffortCharm("codex", "effort", "high", "ultrathink"),
    ).toBeUndefined();
  });
});
