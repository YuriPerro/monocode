// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backgroundActivityCount } from "../model/backgroundActivity";
import type {
  BackgroundAgent,
  BackgroundTask,
  Session,
} from "../model/session";
import { BackgroundActivity } from "./BackgroundActivity";

const now = Date.parse("2026-10-01T12:00:00Z");

const build: BackgroundTask = {
  id: "bash_1",
  kind: "shell",
  description: "npm run build",
  startedAt: now - 5_000,
};
const explore: BackgroundAgent = {
  id: "agent_1",
  description: "Explore the auth module",
  startedAt: now - 65_000,
  model: "haiku",
  tokens: 12_300,
  toolUses: 4,
  activity: "Grep",
};

type Background = Pick<Session, "backgroundTasks" | "backgroundAgents">;

function Pane({ id, session }: { id: string; session: Background }) {
  return createElement(
    "div",
    { "data-pane": id },
    backgroundActivityCount(session) > 0
      ? createElement(BackgroundActivity, {
          variant: "header",
          agents: session.backgroundAgents,
          tasks: session.backgroundTasks,
        })
      : null,
  );
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers({ now });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function render(panes: Record<string, Background>) {
  act(() =>
    root.render(
      createElement(
        "div",
        null,
        Object.entries(panes).map(([id, session]) =>
          createElement(Pane, { key: id, id, session }),
        ),
      ),
    ),
  );
}

function trigger(pane = "a"): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>(
    `[data-pane="${pane}"] [data-background-activity]`,
  );
}

function panel(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    "[data-background-activity-panel]",
  );
}

describe("BackgroundActivity", () => {
  it("shows no toggle while nothing runs in the background", () => {
    render({ a: {} });
    expect(trigger()).toBeNull();
  });

  it("counts what runs and lists subagents and processes with a ticking clock", () => {
    render({ a: { backgroundTasks: [build], backgroundAgents: [explore] } });
    const button = trigger()!;
    expect(button.lastElementChild?.textContent).toBe("2");
    expect(button.getAttribute("aria-label")).toBe(
      "2 items running in the background",
    );
    expect(button.getAttribute("aria-expanded")).toBe("false");

    act(() => button.click());
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const sections = [...panel()!.querySelectorAll("section")].map((section) =>
      section.getAttribute("aria-label"),
    );
    expect(sections).toEqual(["Subagents", "Processes"]);

    const agentRow = panel()!.querySelector('[aria-label="Subagents"] li')!;
    expect(agentRow.textContent).toContain("Explore the auth module");
    expect(agentRow.textContent).toContain(
      "haiku · 1m 5s · 12K tokens · 4 tool calls",
    );
    expect(agentRow.textContent).toContain("Grep");

    const processRow = panel()!.querySelector('[aria-label="Processes"] li')!;
    expect(processRow.querySelector('[title="npm run build"]')).not.toBeNull();
    expect(processRow.textContent).toContain("Shell · 5s");
    act(() => vi.advanceTimersByTime(3_000));
    expect(processRow.textContent).toContain("Shell · 8s");
  });

  it("drops a finished row, and the toggle and its open popover once nothing is left", () => {
    render({ a: { backgroundTasks: [build], backgroundAgents: [explore] } });
    act(() => trigger()!.click());
    render({ a: { backgroundAgents: [explore] } });
    expect(panel()!.querySelector('[aria-label="Processes"]')).toBeNull();
    expect(trigger()!.lastElementChild?.textContent).toBe("1");

    render({ a: {} });
    expect(trigger()).toBeNull();
    expect(panel()).toBeNull();
  });

  it("shows only its own session's items in each pane", () => {
    render({
      a: { backgroundTasks: [build] },
      b: {
        backgroundAgents: [explore],
        backgroundTasks: [
          { ...build, id: "bash_2", description: "npm run dev" },
        ],
      },
    });
    expect(trigger("a")!.getAttribute("aria-label")).toBe(
      "1 item running in the background",
    );
    expect(trigger("b")!.getAttribute("aria-label")).toBe(
      "2 items running in the background",
    );
    act(() => trigger("b")!.click());
    expect(panel()!.textContent).toContain("npm run dev");
    expect(panel()!.textContent).not.toContain("npm run build");
  });

  it("closes on Escape and hands focus back to the toggle", () => {
    render({ a: { backgroundTasks: [build] } });
    const button = trigger()!;
    act(() => button.click());
    expect(document.activeElement).toBe(panel());

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    act(() => vi.advanceTimersByTime(50));
    expect(panel()).toBeNull();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);
  });

  it("closes on an outside click and hands focus back when nothing else took it", () => {
    render({ a: { backgroundTasks: [build] } });
    const button = trigger()!;
    act(() => button.click());
    act(() => {
      (document.activeElement as HTMLElement | null)?.blur();
      document.body.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true }),
      );
    });
    act(() => vi.advanceTimersByTime(50));
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});
