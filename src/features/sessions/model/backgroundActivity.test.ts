import { describe, expect, it } from "vitest";
import {
  backgroundActivityCount,
  backgroundWaitDescriptions,
} from "./backgroundActivity";
import type { BackgroundAgent, BackgroundTask } from "./session";

const build: BackgroundTask = {
  id: "bash_1",
  kind: "shell",
  description: "npm run build",
  startedAt: 1_000,
};
const explore: BackgroundAgent = {
  id: "agent_1",
  description: "Explore the auth module",
  startedAt: 2_000,
};

describe("backgroundActivityCount", () => {
  it("is zero with nothing running, so the pane shows no toggle", () => {
    expect(backgroundActivityCount({})).toBe(0);
    expect(
      backgroundActivityCount({ backgroundTasks: [], backgroundAgents: [] }),
    ).toBe(0);
  });

  it("counts processes and subagents together", () => {
    expect(backgroundActivityCount({ backgroundTasks: [build] })).toBe(1);
    expect(backgroundActivityCount({ backgroundAgents: [explore] })).toBe(1);
    expect(
      backgroundActivityCount({
        backgroundTasks: [build],
        backgroundAgents: [explore],
      }),
    ).toBe(2);
  });

  it("does not count waiting on its own", () => {
    expect(backgroundActivityCount({ waitingOnBackground: true })).toBe(0);
  });
});

describe("backgroundWaitDescriptions", () => {
  it("is undefined until the agent yields", () => {
    expect(
      backgroundWaitDescriptions({
        backgroundTasks: [build],
        backgroundAgents: [explore],
      }),
    ).toBeUndefined();
  });

  it("lists processes then subagents once the turn waits on them", () => {
    expect(
      backgroundWaitDescriptions({
        backgroundTasks: [build],
        backgroundAgents: [explore],
        waitingOnBackground: true,
      }),
    ).toEqual(["npm run build", "Explore the auth module"]);
  });

  it("is undefined when the wait has nothing to name", () => {
    expect(
      backgroundWaitDescriptions({ waitingOnBackground: true }),
    ).toBeUndefined();
  });
});
