import { useLayoutEffect, useRef, useState } from "react";

export type WidthRevealPhase = "hidden" | "opening" | "open" | "closing";

export type WidthReveal = {
  phase: WidthRevealPhase;
  shown: boolean;
  slide: boolean;
};

const OPEN_SLIDE: KeyframeAnimationOptions = {
  duration: 200,
  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
};

const CLOSE_SLIDE: KeyframeAnimationOptions = {
  duration: 160,
  easing: "cubic-bezier(0.4, 0, 1, 1)",
  fill: "forwards",
};

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

/**
 * Slides a panel open and shut by animating the width of a frame around it,
 * so the workspace is pushed along. The panel stays mounted, inert, until it
 * has slid away. Keep `slide` true only while the panel owns its slot: when a
 * view or another panel takes it over, the panel appears or drops at once.
 * The first render never slides.
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
  const animation = useRef<Animation | null>(null);

  // The target is the panel's own width, measured, so a resized panel slides
  // to its size. A reversal mid-slide starts from wherever the width is.
  useLayoutEffect(() => {
    const running = animation.current;
    if (phase !== "opening" && phase !== "closing") {
      // A finished close holds its zero width until it is cancelled.
      running?.cancel();
      animation.current = null;
      return;
    }
    const settle = () =>
      setStored((current) => settleWidthReveal(current, phase));
    const frame = ref.current;
    if (!frame) {
      settle();
      return;
    }
    const closing = phase === "closing";
    const full =
      frame.firstElementChild instanceof HTMLElement
        ? frame.firstElementChild.offsetWidth
        : 0;
    const from = running
      ? frame.getBoundingClientRect().width
      : closing
        ? full
        : 0;
    running?.cancel();
    animation.current = null;
    const reduceMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (typeof frame.animate !== "function" || reduceMotion) {
      settle();
      return;
    }
    const next = frame.animate(
      [{ width: `${from}px` }, { width: `${closing ? 0 : full}px` }],
      closing ? CLOSE_SLIDE : OPEN_SLIDE,
    );
    animation.current = next;
    next.onfinish = () => {
      if (animation.current === next) settle();
    };
  }, [phase]);

  const closing = phase === "closing";
  // While sliding, the panel is pinned to the right edge and clipped, so it
  // slides in as the width grows. At rest nothing clips its resize handle.
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
          : `flex shrink-0${sliding ? " justify-end overflow-hidden" : ""}${
              closing ? " pointer-events-none" : ""
            }`,
    },
  };
}
