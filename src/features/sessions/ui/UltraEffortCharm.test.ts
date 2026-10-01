// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { UltraEffort } from "../model/ultraEffort";
import { useUltraEffortCharm } from "./UltraEffortCharm";

type Charm = ReturnType<typeof useUltraEffortCharm>;

describe("useUltraEffortCharm", () => {
  let container: HTMLDivElement;
  let root: Root;
  let charm: Charm;

  function Probe({ tone }: { tone: UltraEffort | undefined }) {
    charm = useUltraEffortCharm(tone);
    return null;
  }

  const show = (tone: UltraEffort | undefined) =>
    root.render(createElement(Probe, { tone }));

  beforeEach(() => {
    vi.useFakeTimers();
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

  it("rests without playing when the chip mounts or settings arrive in ultra", () => {
    act(() => show("ultracode"));
    expect(charm.playing).toBeUndefined();
    expect(charm.burst).toBeNull();

    act(() => show("ultrathink"));
    expect(charm.playing).toBeUndefined();
    expect(charm.burst).toBeNull();
  });

  it("plays a pick once the chip shows the level, then settles", () => {
    act(() => show(undefined));
    act(() => {
      charm.fire("ultracode");
      show("ultracode");
    });
    expect(charm.playing).toBe("ultracode");
    expect(charm.burst?.kind).toBe("ultracode");

    act(() => charm.endBurst());
    expect(charm.burst).toBeNull();
    expect(charm.playing).toBe("ultracode");

    act(() => vi.advanceTimersByTime(6000));
    expect(charm.playing).toBeUndefined();
  });

  it("waits for a value that lands after the pick", () => {
    act(() => show(undefined));
    act(() => charm.fire("ultrathink"));
    expect(charm.playing).toBeUndefined();

    act(() => show("ultrathink"));
    expect(charm.playing).toBe("ultrathink");
  });

  it("drops the charm when the chip leaves the level, so a return does not replay", () => {
    act(() => show(undefined));
    act(() => {
      charm.fire("ultrathink");
      show("ultrathink");
    });
    expect(charm.playing).toBe("ultrathink");

    act(() => show(undefined));
    act(() => show("ultrathink"));
    expect(charm.playing).toBeUndefined();
    expect(charm.burst).toBeNull();
  });

  it("ignores a pick that does not move into an ultra level", () => {
    act(() => show("ultracode"));
    act(() => {
      charm.fire(undefined);
      show("ultracode");
    });
    expect(charm.playing).toBeUndefined();
  });
});
