import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { LAYER } from "../../../shared/lib/layers";
import type { UltraEffort } from "../model/ultraEffort";
import type { BurstRect } from "./BtwQuestionBurst";
import "./UltraEffortCharm.css";

// Colors live in UltraEffortCharm.css as theme tokens; these are the motion.
const ULTRATHINK_SETTLE_MS = 3000;
const ULTRATHINK_FLOW_PERIOD_MS = 1500;
const BURST_CLEANUP_SLACK_MS = 80;
/** Spectrum stops, `--ultrathink-0` through `--ultrathink-6` in the CSS. */
const RAINBOW_STOPS = 7;

const ULTRACODE = {
  sweepMs: 440,
  sweepEase: [0.4, 0, 0.3, 1],
  sweepOvershoot: 0.15,
  glowAtSweepFraction: 0.75,
  glowMs: 520,
  glyphs: ["{", "}", "<", "/", ">", ";"],
  glyphCount: 8,
  glyphPixelPx: 2,
  glyphStartYPx: -4,
  glyphRiseSteps: [5, 9],
  glyphMs: [520, 660],
  hotGlyphEvery: 4,
  pixelCount: 10,
  pixelSizesPx: [2, 2, 2, 1],
  pixelStartYPx: [0, 6],
  pixelRiseSteps: [6, 12],
  pixelMs: [360, 540],
  hotPixelChance: 0.3,
  stepPx: 2,
  emitPadPx: 6,
  breathMs: 2000,
  breathCycles: 2,
  breathDelayMs: 900,
} as const;

const ULTRATHINK = {
  ringCount: 1,
  ringSpreadPx: 11,
  ringWidthPx: 1.5,
  ringMs: 720,
  ringStaggerMs: 130,
  sparkleCount: 14,
  sparkleDelayMs: [40, 260],
  sparkleMs: [620, 800],
  starSizePx: [6, 11],
  dotSizePx: [2, 3.5],
  dotEvery: 3,
  emitPadPx: 4,
  liftPx: [24, 48],
  driftPx: 14,
  orbitRadiusPx: [6, 15],
  orbitSpinDeg: [160, 320],
} as const;

type Glyph = (typeof ULTRACODE.glyphs)[number];

const GLYPH_ROWS: Record<Glyph, readonly string[]> = {
  "{": [".##", ".#.", "#..", ".#.", ".##"],
  "}": ["##.", ".#.", "..#", ".#.", "##."],
  "<": ["..#", ".#.", "#..", ".#.", "..#"],
  ">": ["#..", ".#.", "..#", ".#.", "#.."],
  "/": ["..#", "..#", ".#.", "#..", "#.."],
  ";": ["...", ".#.", "...", ".#.", "#.."],
};

const STAR_PATH =
  "M12 0C12.9 6.6 17.4 11.1 24 12C17.4 12.9 12.9 17.4 12 24C11.1 17.4 6.6 12.9 0 12C6.6 11.1 11.1 6.6 12 0Z";

const ULTRATHINK_FLOW_CYCLES = Math.max(
  1,
  Math.round(ULTRATHINK_SETTLE_MS / ULTRATHINK_FLOW_PERIOD_MS),
);

/** How long the chip keeps its pick animation: the breaths, or the flow. */
const CHARM_MS: Record<UltraEffort, number> = {
  ultracode:
    ULTRACODE.breathDelayMs + ULTRACODE.breathMs * ULTRACODE.breathCycles,
  ultrathink: ULTRATHINK_FLOW_CYCLES * ULTRATHINK_FLOW_PERIOD_MS,
};

const CHARM_STYLE: Record<UltraEffort, CSSProperties> = {
  ultracode: {
    "--ultracode-breath-ms": `${ULTRACODE.breathMs}ms`,
    "--ultracode-breath-delay": `${ULTRACODE.breathDelayMs}ms`,
    "--ultracode-breath-cycles": String(ULTRACODE.breathCycles),
  } as CSSProperties,
  ultrathink: {
    "--ultrathink-flow-ms": `${CHARM_MS.ultrathink}ms`,
    "--ultrathink-flow-end": `${-ULTRATHINK_FLOW_CYCLES * 100}%`,
  } as CSSProperties,
};

/** Runs of filled cells as unit rects, so each glyph is one crisp path. */
function pixelPath(rows: readonly string[]): string {
  let path = "";
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== "#") {
        x += 1;
        continue;
      }
      let run = 1;
      while (row[x + run] === "#") run += 1;
      path += `M${x} ${y}h${run}v1h-${run}z`;
      x += run;
    }
  });
  return path;
}

const GLYPHS = Object.fromEntries(
  Object.entries(GLYPH_ROWS).map(([glyph, rows]) => [
    glyph,
    {
      columns: rows[0].length,
      rows: rows.length,
      width: rows[0].length * ULTRACODE.glyphPixelPx,
      height: rows.length * ULTRACODE.glyphPixelPx,
      path: pixelPath(rows),
    },
  ]),
) as Record<
  Glyph,
  { columns: number; rows: number; width: number; height: number; path: string }
>;

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));
const pick = <T,>(list: readonly T[]): T =>
  list[Math.floor(Math.random() * list.length)];
const ms = (value: number) => `${Math.round(value)}ms`;
const px = (value: number) => `${Number(value.toFixed(2))}px`;

/** Inverts a CSS cubic-bezier: the time fraction where eased progress lands. */
function cubicBezierTiming(x1: number, y1: number, x2: number, y2: number) {
  const sample = (a1: number, a2: number, t: number) => {
    const u = 1 - t;
    return 3 * u * u * t * a1 + 3 * u * t * t * a2 + t * t * t;
  };
  return (progress: number) => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i += 1) {
      const mid = (lo + hi) / 2;
      if (sample(y1, y2, mid) < progress) lo = mid;
      else hi = mid;
    }
    return sample(x1, x2, (lo + hi) / 2);
  };
}

/** Evenly spaced slots across the chip, jittered so they never read as a grid. */
function spread(count: number, width: number, pad: number): number[] {
  const span = Math.max(1, width - pad * 2);
  return Array.from(
    { length: count },
    (_, i) => pad + ((i + Math.random()) / count) * span,
  );
}

type Mote = {
  x: number;
  y: number;
  dx: number;
  dy: number;
  steps: number;
  durationMs: number;
  delayMs: number;
  hot: boolean;
};

type UltracodeScene = {
  kind: "ultracode";
  rect: BurstRect;
  glowDelayMs: number;
  glyphs: Array<Mote & { glyph: Glyph }>;
  pixels: Array<Mote & { size: number }>;
  endMs: number;
};

type Ring = {
  spreadPx: number;
  delayMs: number;
  scaleX: number;
  scaleY: number;
};

type Sparkle = {
  x: number;
  y: number;
  drift: number;
  lift: number;
  radius: number;
  startDeg: number;
  endDeg: number;
  size: number;
  color: number;
  dot: boolean;
  durationMs: number;
  delayMs: number;
};

type UltrathinkScene = {
  kind: "ultrathink";
  rect: BurstRect;
  rings: Ring[];
  sparkles: Sparkle[];
  endMs: number;
};

type BurstScene = UltracodeScene | UltrathinkScene;

/** Glyphs and pixels leave the chip at the moment the scanline crosses them. */
function ultracodeScene(rect: BurstRect): UltracodeScene {
  const cfg = ULTRACODE;
  const width = Math.max(1, rect.width);
  const timeForProgress = cubicBezierTiming(...cfg.sweepEase);
  const lineAt = (x: number) =>
    cfg.sweepMs *
    timeForProgress(Math.min(1, x / width / (1 + cfg.sweepOvershoot)));
  const glowDelayMs = lineAt(width * cfg.glowAtSweepFraction);
  let endMs = Math.max(cfg.sweepMs, glowDelayMs + cfg.glowMs);

  const glyphs = spread(cfg.glyphCount, width, cfg.emitPadPx).map((x, i) => {
    const glyph = pick(cfg.glyphs);
    const steps = randInt(...cfg.glyphRiseSteps);
    const direction = pick([-1, 0, 0, 1]);
    const durationMs = rand(...cfg.glyphMs);
    const delayMs = lineAt(x);
    endMs = Math.max(endMs, delayMs + durationMs);
    return {
      glyph,
      x: Math.round(x - GLYPHS[glyph].width / 2),
      y: cfg.glyphStartYPx - GLYPHS[glyph].height / 2,
      dx: direction * steps,
      dy: -steps * cfg.stepPx,
      steps,
      durationMs,
      delayMs,
      hot: i % cfg.hotGlyphEvery === cfg.hotGlyphEvery - 1,
    };
  });

  const pixels = spread(cfg.pixelCount, width, cfg.emitPadPx).map((x) => {
    const steps = randInt(...cfg.pixelRiseSteps);
    const dxPerStep = pick([-2, -1, 0, 1, 2]);
    const durationMs = rand(...cfg.pixelMs);
    const delayMs = lineAt(x);
    endMs = Math.max(endMs, delayMs + durationMs);
    return {
      size: pick(cfg.pixelSizesPx),
      x: Math.round(x),
      y: randInt(...cfg.pixelStartYPx),
      dx: dxPerStep * steps,
      dy: -steps * cfg.stepPx,
      steps,
      durationMs,
      delayMs,
      hot: Math.random() < cfg.hotPixelChance,
    };
  });

  return { kind: "ultracode", rect, glowDelayMs, glyphs, pixels, endMs };
}

/** A ring ripples off the chip while sparkles spiral up in spectrum order. */
function ultrathinkScene(rect: BurstRect): UltrathinkScene {
  const cfg = ULTRATHINK;
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  let endMs = 0;

  const rings = Array.from({ length: cfg.ringCount }, (_, i) => {
    const spreadPx = cfg.ringSpreadPx * (1 + i * 0.5);
    const delayMs = i * cfg.ringStaggerMs;
    endMs = Math.max(endMs, delayMs + cfg.ringMs);
    return {
      spreadPx,
      delayMs,
      scaleX: width / (width + spreadPx * 2),
      scaleY: height / (height + spreadPx * 2),
    };
  });

  const sparkles = spread(cfg.sparkleCount, width, cfg.emitPadPx).map(
    (x, i) => {
      const dot = i % cfg.dotEvery === cfg.dotEvery - 1;
      const delayMs = rand(...cfg.sparkleDelayMs);
      const durationMs = rand(...cfg.sparkleMs);
      const startDeg = rand(0, 360);
      const spinDeg =
        (Math.random() < 0.5 ? -1 : 1) * rand(...cfg.orbitSpinDeg);
      endMs = Math.max(endMs, delayMs + durationMs);
      return {
        x,
        y: rand(2, height / 2),
        drift: rand(-cfg.driftPx, cfg.driftPx),
        lift: -rand(...cfg.liftPx),
        radius: rand(...cfg.orbitRadiusPx),
        startDeg,
        endDeg: startDeg + spinDeg,
        size: dot ? rand(...cfg.dotSizePx) : rand(...cfg.starSizePx),
        color: Math.min(
          RAINBOW_STOPS - 1,
          Math.floor((x / width) * RAINBOW_STOPS),
        ),
        dot,
        durationMs,
        delayMs,
      };
    },
  );

  return { kind: "ultrathink", rect, rings, sparkles, endMs };
}

type Charm = { kind: UltraEffort; key: number; burst: boolean };

/**
 * The effort chip's ultra state. `tone` is the level the chip rests in; `fire`
 * takes the result of `ultraEffortCharm` at pick time. The charm plays once
 * the chip shows that level, and drops as soon as the chip leaves it, so a
 * later return through restored or remote settings never replays it.
 */
export function useUltraEffortCharm(tone: UltraEffort | undefined) {
  const [charm, setCharm] = useState<Charm | null>(null);
  const serial = useRef(0);
  const key = charm?.key;
  const kind = charm?.kind;

  useEffect(() => {
    setCharm((current) => (current && current.kind !== tone ? null : current));
  }, [tone]);

  useEffect(() => {
    if (!kind) return;
    const timer = setTimeout(
      () => setCharm(null),
      CHARM_MS[kind] + BURST_CLEANUP_SLACK_MS,
    );
    return () => clearTimeout(timer);
  }, [key, kind]);

  const fire = useCallback((next: UltraEffort | undefined) => {
    if (!next) return;
    serial.current += 1;
    setCharm({ kind: next, key: serial.current, burst: true });
  }, []);

  const endBurst = useCallback(() => {
    setCharm((current) => current && { ...current, burst: false });
  }, []);

  const playing = charm && charm.kind === tone ? charm : null;
  return {
    playing: playing?.kind,
    burst: playing?.burst ? { kind: playing.kind, key: playing.key } : null,
    fire,
    endBurst,
    chipProps: {
      "data-ultra-effort": tone,
      "data-ultra-charm": playing ? "" : undefined,
      style: playing ? CHARM_STYLE[playing.kind] : undefined,
    },
  };
}

/** The spectrum as an SVG paint for the Ultrathink gauge icon's stroke. */
export function UltraEffortGradient({ id }: { id: string }) {
  return (
    <svg aria-hidden width="0" height="0" className="ultra-effort-gradient">
      <defs>
        <linearGradient
          id={id}
          gradientUnits="userSpaceOnUse"
          x1="2"
          y1="12"
          x2="22"
          y2="12"
        >
          {Array.from({ length: RAINBOW_STOPS }, (_, index) => (
            <stop
              key={index}
              offset={(index / (RAINBOW_STOPS - 1)).toFixed(3)}
              style={{ stopColor: `var(--ultrathink-${index})` }}
            />
          ))}
        </linearGradient>
      </defs>
    </svg>
  );
}

/**
 * The one-shot pick burst, portaled over the chip so particles can leave the
 * toolbar without shifting it, and removed once the last one has faded.
 */
export function UltraEffortBurst({
  kind,
  anchor,
  onDone,
}: {
  kind: UltraEffort;
  anchor: RefObject<HTMLElement | null>;
  onDone: () => void;
}) {
  const [scene, setScene] = useState<BurstScene | null>(null);

  // Measured after the chip shows the new label, so the burst fits its width.
  // One burst per mount; a new pick remounts with a new key.
  useLayoutEffect(() => {
    const box = anchor.current?.getBoundingClientRect();
    if (!box) {
      onDone();
      return;
    }
    const rect = {
      left: Math.round(box.left),
      top: Math.round(box.top),
      width: Math.round(box.width),
      height: Math.round(box.height),
    };
    setScene(
      kind === "ultracode" ? ultracodeScene(rect) : ultrathinkScene(rect),
    );
  }, []);

  useEffect(() => {
    if (!scene) return;
    const timer = setTimeout(onDone, scene.endMs + BURST_CLEANUP_SLACK_MS);
    return () => clearTimeout(timer);
  }, [scene]);

  if (!scene) return null;
  return createPortal(
    <div
      aria-hidden
      className="ultra-burst"
      style={{ ...scene.rect, zIndex: LAYER.popover }}
    >
      {scene.kind === "ultracode" ? (
        <UltracodeBurst scene={scene} />
      ) : (
        <UltrathinkBurst scene={scene} />
      )}
    </div>,
    document.body,
  );
}

function moteStyle(mote: Mote): CSSProperties {
  return {
    "--x": px(mote.x),
    "--y": px(mote.y),
    "--dx": px(mote.dx),
    "--dy": px(mote.dy),
    "--duration": ms(mote.durationMs),
    "--delay": ms(mote.delayMs),
    "--ease": `steps(${mote.steps}, end)`,
  } as CSSProperties;
}

function UltracodeBurst({ scene }: { scene: UltracodeScene }) {
  return (
    <>
      <span className="ultracode-clip">
        <span
          className="ultracode-sweep"
          style={
            {
              "--duration": ms(ULTRACODE.sweepMs),
              "--ease": `cubic-bezier(${ULTRACODE.sweepEase.join(",")})`,
              "--end": `${ULTRACODE.sweepOvershoot * 100}%`,
            } as CSSProperties
          }
        />
      </span>
      <span
        className="ultracode-glow"
        style={
          {
            "--duration": ms(ULTRACODE.glowMs),
            "--delay": ms(scene.glowDelayMs),
          } as CSSProperties
        }
      />
      {scene.glyphs.map((mote, index) => {
        const glyph = GLYPHS[mote.glyph];
        return (
          <span
            key={`glyph-${index}`}
            className="ultracode-mote"
            style={moteStyle(mote)}
          >
            <span className={`ultracode-glyph${mote.hot ? " is-hot" : ""}`}>
              <svg
                viewBox={`0 0 ${glyph.columns} ${glyph.rows}`}
                width={glyph.width}
                height={glyph.height}
                shapeRendering="crispEdges"
              >
                <path d={glyph.path} />
              </svg>
            </span>
          </span>
        );
      })}
      {scene.pixels.map((mote, index) => (
        <span
          key={`pixel-${index}`}
          className="ultracode-mote"
          style={moteStyle(mote)}
        >
          <span
            className={`ultracode-pixel${mote.hot ? " is-hot" : ""}`}
            style={{ "--size": px(mote.size) } as CSSProperties}
          />
        </span>
      ))}
    </>
  );
}

function UltrathinkBurst({ scene }: { scene: UltrathinkScene }) {
  const { width, height } = scene.rect;
  return (
    <>
      {scene.rings.map((ring, index) => (
        <span
          key={`ring-${index}`}
          className="ultrathink-ring"
          style={
            {
              left: -ring.spreadPx,
              top: -ring.spreadPx,
              width: width + ring.spreadPx * 2,
              height: height + ring.spreadPx * 2,
              borderRadius: `calc(var(--radius-md, 0.375rem) + ${px(ring.spreadPx)})`,
              padding: ULTRATHINK.ringWidthPx,
              "--scale-x": ring.scaleX.toFixed(4),
              "--scale-y": ring.scaleY.toFixed(4),
              "--duration": ms(ULTRATHINK.ringMs),
              "--delay": ms(ring.delayMs),
            } as CSSProperties
          }
        />
      ))}
      {scene.sparkles.map((sparkle, index) => (
        <span
          key={`sparkle-${index}`}
          className="ultrathink-sparkle"
          style={
            {
              "--x": px(sparkle.x),
              "--y": px(sparkle.y),
              "--drift": px(sparkle.drift),
              "--lift": px(sparkle.lift),
              "--duration": ms(sparkle.durationMs),
              "--delay": ms(sparkle.delayMs),
            } as CSSProperties
          }
        >
          <span
            className="ultrathink-orbit"
            style={
              {
                "--spin-from": `${sparkle.startDeg.toFixed(1)}deg`,
                "--spin-to": `${sparkle.endDeg.toFixed(1)}deg`,
              } as CSSProperties
            }
          >
            <span
              className="ultrathink-arm"
              style={{ "--reach": px(sparkle.radius) } as CSSProperties}
            >
              <span
                className={`ultrathink-glyph${sparkle.dot ? " is-dot" : ""}`}
                style={
                  {
                    "--size": px(sparkle.size),
                    "--color": `var(--ultrathink-${sparkle.color})`,
                  } as CSSProperties
                }
              >
                {sparkle.dot ? null : (
                  <svg viewBox="0 0 24 24">
                    <path d={STAR_PATH} />
                  </svg>
                )}
              </span>
            </span>
          </span>
        </span>
      ))}
    </>
  );
}
