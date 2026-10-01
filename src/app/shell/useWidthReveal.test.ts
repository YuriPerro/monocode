// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  followersOf,
  nextWidthReveal,
  settleWidthReveal,
  slideKeyframes,
  translateXOf,
  type WidthReveal,
  type WidthRevealPhase,
} from "./useWidthReveal";

function reveal(
  phase: WidthRevealPhase,
  slide = true,
  shown = phase === "opening" || phase === "open",
): WidthReveal {
  return { phase, shown, slide };
}

describe("nextWidthReveal", () => {
  it("slides open and shut on a toggle while the panel owns its slot", () => {
    const opening = nextWidthReveal(reveal("hidden"), true, true);
    expect(opening.phase).toBe("opening");
    const open = settleWidthReveal(opening, "opening");
    expect(open.phase).toBe("open");
    const closing = nextWidthReveal(open, false, true);
    expect(closing.phase).toBe("closing");
    expect(settleWidthReveal(closing, "closing").phase).toBe("hidden");
  });

  it("reverses a slide that is still running", () => {
    expect(nextWidthReveal(reveal("opening"), false, true).phase).toBe(
      "closing",
    );
    expect(nextWidthReveal(reveal("closing"), true, true).phase).toBe(
      "opening",
    );
  });

  // Whatever takes or hands back the slot (a view, the drawer, settings, a
  // drag) flips `slide` in the same render as `shown`, so nothing slides.
  it.each([
    ["appears", reveal("hidden", false), true, true, "open"],
    ["appears", reveal("hidden", true), true, false, "open"],
    ["drops", reveal("open", false), false, true, "hidden"],
    ["drops", reveal("open", true), false, false, "hidden"],
  ] as const)(
    "%s at once when the slot changes hands with the toggle",
    (_, from, shown, slide, phase) => {
      expect(nextWidthReveal(from, shown, slide).phase).toBe(phase);
    },
  );

  it("drops a panel that is sliding shut once something takes its slot", () => {
    expect(nextWidthReveal(reveal("closing"), false, false).phase).toBe(
      "hidden",
    );
  });

  it("finishes an opening slide at once when sliding stops, as for a drag", () => {
    expect(nextWidthReveal(reveal("opening"), true, false).phase).toBe("open");
  });

  it.each(["hidden", "open"] as const)(
    "leaves a %s panel alone when only the slot changes",
    (phase) => {
      const still = reveal(phase, true);
      const lost = nextWidthReveal(still, still.shown, false);
      expect(lost.phase).toBe(phase);
      expect(nextWidthReveal(lost, still.shown, true).phase).toBe(phase);
    },
  );
});

describe("settleWidthReveal", () => {
  it("ignores a finished slide the panel has already reversed", () => {
    const reversed = reveal("opening");
    expect(settleWidthReveal(reversed, "closing")).toBe(reversed);
    const dropped = reveal("hidden");
    expect(settleWidthReveal(dropped, "closing")).toBe(dropped);
  });
});

describe("slideKeyframes", () => {
  it("brings the panel out from behind its frame as the workspace moves aside", () => {
    expect(slideKeyframes(0, 240, 240)).toEqual({
      panel: [
        { transform: "translateX(-240px)" },
        { transform: "translateX(0px)" },
      ],
      followers: [
        { transform: "translateX(0px)" },
        { transform: "translateX(240px)" },
      ],
    });
  });

  it("starts a reversed slide from the part already shown", () => {
    expect(slideKeyframes(90, 0, 240)).toEqual({
      panel: [
        { transform: "translateX(-150px)" },
        { transform: "translateX(-240px)" },
      ],
      followers: [
        { transform: "translateX(90px)" },
        { transform: "translateX(0px)" },
      ],
    });
  });
});

describe("translateXOf", () => {
  it.each([
    ["matrix(1, 0, 0, 1, -42.5, 0)", -42.5],
    ["matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 18, 0, 0, 1)", 18],
    ["none", 0],
    ["", 0],
  ])("reads %j as %d", (transform, x) => {
    expect(translateXOf(transform)).toBe(x);
  });
});

describe("followersOf", () => {
  function row() {
    const root = document.createElement("div");
    root.innerHTML =
      "<div id=sidebar><div id=rail></div><div id=sessions></div></div><div id=workspace></div>";
    const byId = (id: string) => root.querySelector(`#${id}`)!;
    return { root, byId };
  }

  it("moves everything after the panel up to the row", () => {
    const { root, byId } = row();
    expect(followersOf(byId("rail"), root)).toEqual([
      byId("sessions"),
      byId("workspace"),
    ]);
    expect(followersOf(byId("sessions"), root)).toEqual([byId("workspace")]);
  });

  it("moves nothing outside a row", () => {
    const { byId } = row();
    expect(followersOf(byId("rail"), null)).toEqual([]);
    expect(followersOf(byId("rail"), document.createElement("div"))).toEqual(
      [],
    );
  });
});
