import { useLayoutEffect, useRef, useState } from "react";

export type WidthRevealPhase = "hidden" | "opening" | "open" | "closing";

export type WidthReveal = {
  phase: WidthRevealPhase;
  shown: boolean;
  slide: boolean;
};

export const OPEN_SLIDE: KeyframeAnimationOptions = {
  duration: 200,
  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
};

export const CLOSE_SLIDE: KeyframeAnimationOptions = {
  duration: 160,
  easing: "cubic-bezier(0.4, 0, 1, 1)",
};

/** Marks the row whose content after a sliding panel moves along with it. */
const SLIDE_ROW = "[data-slide-row]";

/**
 * The phase after `shown` or `slide` changes. A change of `shown` slides only
 * when `slide` held both before and after it; otherwise the panel appears or
 * drops at once, which also cuts a running slide short.
 */
export function nextWidthReveal(
  reveal: WidthReveal,
  shown: boolean,
  slide: boolean,
): WidthReveal {
  const { phase } = reveal;
  if (!slide || !reveal.slide) {
    return { phase: shown ? "open" : "hidden", shown, slide };
  }
  if (shown) {
    return {
      phase: phase === "hidden" || phase === "closing" ? "opening" : phase,
      shown,
      slide,
    };
  }
  return {
    phase: phase === "open" || phase === "opening" ? "closing" : phase,
    shown,
    slide,
  };
}

/** Lands a slide that finished, unless the panel already moved on from it. */
export function settleWidthReveal(
  reveal: WidthReveal,
  slid: WidthRevealPhase,
): WidthReveal {
  if (reveal.phase !== slid) return reveal;
  if (slid === "opening") return { ...reveal, phase: "open" };
  if (slid === "closing") return { ...reveal, phase: "hidden" };
  return reveal;
}

/** The x translation of a computed `transform`, such as `matrix(1, 0, 0, 1, 12, 0)`. */
export function translateXOf(transform: string): number {
  const matrix = /^matrix(3d)?\(([^)]*)\)$/.exec(transform.trim());
  if (!matrix) return 0;
  const x = Number(matrix[2].split(",")[matrix[1] ? 12 : 4]);
  return Number.isFinite(x) ? x : 0;
}

/**
 * Keyframes for a panel `width` wide whose shown part goes from `from` to `to`
 * pixels: the panel comes out from behind its frame's left edge, and whatever
 * follows it moves by the shown part.
 */
export function slideKeyframes(from: number, to: number, width: number) {
  return {
    panel: [
      { transform: `translateX(${from - width}px)` },
      { transform: `translateX(${to - width}px)` },
    ],
    followers: [
      { transform: `translateX(${from}px)` },
      { transform: `translateX(${to}px)` },
    ],
  };
}

/**
 * What a change in `el`'s width pushes along: every element after it, at each
 * level up to `row`. Nothing outside `row` moves.
 */
export function followersOf(el: Element, row: Element | null): Element[] {
  if (!row || row === el || !row.contains(el)) return [];
  const followers: Element[] = [];
  for (
    let node: Element | null = el;
    node && node !== row;
    node = node.parentElement
  ) {
    for (
      let next = node.nextElementSibling;
      next;
      next = next.nextElementSibling
    ) {
      followers.push(next);
    }
  }
  return followers;
}

/** Whether `el` can be animated and the user has not asked for less motion. */
export function canSlide(el: Element) {
  return (
    typeof el.animate === "function" &&
    !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Slides a panel open and shut, pushing the workspace along, without laying
 * the workspace out on every frame. While it slides, the panel's frame takes
 * no room in its row, so what follows keeps the wider of its two layouts;
 * the panel and everything after it in the `data-slide-row` row move by
 * transform alone. The row lays out once per slide: at the end of an opening
 * slide, at the start of a closing one.
 *
 * The panel stays mounted, inert, until it has slid away. Keep `slide` true
 * only while the panel owns its slot: when a view or another panel takes it
 * over, the panel appears or drops at once. The first render never slides.
 */
export function useWidthReveal({
  shown,
  slide,
}: {
  shown: boolean;
  slide: boolean;
}) {
  const [stored, setStored] = useState<WidthReveal>(() => ({
    phase: shown ? "open" : "hidden",
    shown,
    slide,
  }));
  // Derived while rendering, so a panel that starts closing never commits a
  // frame without its inert, sliding wrapper.
  let reveal = stored;
  if (stored.shown !== shown || stored.slide !== slide) {
    reveal = nextWidthReveal(stored, shown, slide);
    setStored(reveal);
  }
  const { phase } = reveal;
  const ref = useRef<HTMLDivElement>(null);
  const slides = useRef<Animation[]>([]);

  // The target is the panel's own width, measured, so a resized panel slides
  // to its size. A reversal mid-slide starts from wherever the panel is.
  useLayoutEffect(() => {
    const frame = ref.current;
    const panel = frame?.firstElementChild;
    const full = panel instanceof HTMLElement ? panel.offsetWidth : 0;
    const closing = phase === "closing";
    const from =
      slides.current.length > 0 && panel
        ? full + translateXOf(getComputedStyle(panel).transform)
        : closing
          ? full
          : 0;
    // Slides hold their last frame until the phase they landed commits.
    for (const running of slides.current) running.cancel();
    slides.current = [];
    if (frame) frame.style.marginRight = "";
    if (phase !== "opening" && !closing) return;
    const settle = () =>
      setStored((current) => settleWidthReveal(current, phase));
    if (!frame || !(panel instanceof HTMLElement) || !canSlide(frame)) {
      settle();
      return;
    }
    const keyframes = slideKeyframes(from, closing ? 0 : full, full);
    const timing: KeyframeAnimationOptions = {
      ...(closing ? CLOSE_SLIDE : OPEN_SLIDE),
      fill: "forwards",
    };
    frame.style.marginRight = `${-full}px`;
    const moved = followersOf(frame, frame.closest(SLIDE_ROW)).map((follower) =>
      follower.animate(keyframes.followers, timing),
    );
    const next = panel.animate(keyframes.panel, timing);
    slides.current = [...moved, next];
    next.onfinish = () => {
      if (slides.current.includes(next)) settle();
    };
  }, [phase]);

  useLayoutEffect(
    () => () => {
      for (const running of slides.current) running.cancel();
      slides.current = [];
    },
    [],
  );

  const closing = phase === "closing";
  // While sliding, the frame clips the panel to the room it has come out into.
  // At rest nothing clips its resize handle.
  const sliding = phase === "opening" || closing;
  return {
    rendered: phase !== "hidden",
    closing,
    frame: {
      ref,
      inert: closing || undefined,
      className:
        phase === "hidden"
          ? "hidden"
          : `flex shrink-0${sliding ? " overflow-hidden" : ""}${
              closing ? " pointer-events-none" : ""
            }`,
    },
  };
}
