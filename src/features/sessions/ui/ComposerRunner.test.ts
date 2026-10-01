// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ComposerRunner } from "./ComposerRunner";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps animating through transcript changes without measuring layout each frame", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.spyOn(performance, "now").mockReturnValue(1000);
  let frame: FrameRequestCallback | null = null;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});

  const box = document.createElement("div");
  box.dataset.composer = "";
  const measure = vi.spyOn(box, "getBoundingClientRect").mockReturnValue({
    left: 20,
    right: 320,
    top: 400,
    bottom: 480,
    width: 300,
    height: 80,
  } as DOMRect);
  document.body.append(box);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    act(() =>
      root.render(
        createElement(ComposerRunner, {
          boxRef: { current: box },
          cwd: "/work/project",
          busy: true,
        }),
      ),
    );
    const startedAt = 1000;
    for (let i = 1; i <= 5; i++) {
      box.append(document.createElement("span"));
      act(() => frame?.(startedAt + i * 16));
    }
    expect(measure).toHaveBeenCalledOnce();

    act(() => frame?.(startedAt + 120));
    expect(measure).toHaveBeenCalledTimes(2);
  } finally {
    act(() => root.unmount());
    host.remove();
    box.remove();
  }
});

it("sleeps without a frame loop until a turn starts, and stops it once home", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  let clock = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  let frame: FrameRequestCallback | null = null;
  const requestFrame = vi.fn((callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  });
  vi.stubGlobal("requestAnimationFrame", requestFrame);
  vi.stubGlobal("cancelAnimationFrame", () => {});

  const box = document.createElement("div");
  box.dataset.composer = "";
  vi.spyOn(box, "getBoundingClientRect").mockReturnValue({
    left: 20,
    right: 320,
    top: 400,
    bottom: 480,
    width: 300,
    height: 80,
  } as DOMRect);
  document.body.append(box);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (busy: boolean) =>
    act(() =>
      root.render(
        createElement(ComposerRunner, {
          boxRef: { current: box },
          cwd: "/work/project",
          busy,
        }),
      ),
    );
  const runFrames = (count: number) => {
    for (let i = 0; i < count && frame; i++) {
      const next = frame;
      frame = null;
      clock += 16;
      act(() => next(clock));
    }
  };
  try {
    render(false);
    expect(requestFrame).not.toHaveBeenCalled();

    render(true);
    expect(requestFrame).toHaveBeenCalledOnce();
    runFrames(120);
    expect(frame).not.toBeNull();

    render(false);
    runFrames(600);
    expect(frame).toBeNull();
    const asleepAt = requestFrame.mock.calls.length;

    render(false);
    expect(requestFrame).toHaveBeenCalledTimes(asleepAt);
  } finally {
    act(() => root.unmount());
    host.remove();
    box.remove();
  }
});
