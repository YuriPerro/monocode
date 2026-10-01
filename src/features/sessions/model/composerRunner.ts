/**
 * Pixel mascot on the composer's top edge: it patrols while a turn is in
 * flight and sleeps in a corner between turns.
 */

import { mascotPath } from "../../projects/model/projectMascots";
import { sessionNeedsInput, type Session } from "./session";

export const RUNNER_SIZE = 16;
export const RUNNER_SPEED_PX = 160;
export const RUNNER_INSET = 10;
/** Start the jump this far before the obstacle, land the same distance after. */
export const JUMP_LEAD = 18;
const JUMP_CLEARANCE = 10;
const JUMP_MIN = 28;

export const COIN_SIZE = 12;
/** Coin center above the rim — high enough that the mascot jumps into it. */
export const COIN_HOVER = 42;
export const COIN_WIDTH = 8;
/** Longer than the chevron hop so the takeoff reads instead of twitching. */
export const COIN_JUMP_LEAD = 34;
export const COIN_GAP_MIN_MS = 7000;
export const COIN_GAP_MAX_MS = 18000;
export const COIN_FIRST_MIN_MS = 3500;
export const COIN_FIRST_MAX_MS = 9000;
export const COLLECT_X = 10;
export const COLLECT_POP_MS = 280;
export const COLLECT_POP_PX = 16;

/** One short hop in place: waking up, or cheering a turn that ended well. */
export const HOP_MS = 360;
export const HOP_PEAK = 12;

/** Pixel "!" over the mascot's head while the turn waits on the user. */
export const ALERT_SIZE = 8;
export const ALERT_GAP = 3;

/** Where the sleep Zs start, from the sprite's top-left: just above its head. */
export const ZZZ_X = 9;
export const ZZZ_Y = -1;

/** First chevron hit this turn: knock-back, stars, then the mascot learns the hop. */
export const CRASH_RECOIL_PX = 18;
export const CRASH_RECOIL_MS = 140;
export const CRASH_STUN_MS = 560;
export const CRASH_SHAKE_MS = 480;
export const STAR_SIZE = 8;
export const STAR_COUNT = 3;
export const STAR_ORBIT = 11;
/** One full star orbit. Longer than the old 280ms spin so it reads as a daze, not a blur. */
export const STAR_SPIN_MS = 520;

export const COIN_FACE_PATH = mascotPath([
  "........",
  "..####..",
  ".######.",
  "########",
  "########",
  ".######.",
  "..####..",
  "........",
]);

export const COIN_EDGE_PATH = mascotPath([
  "........",
  "...##...",
  "...##...",
  "...##...",
  "...##...",
  "...##...",
  "...##...",
  "........",
]);

export const STAR_FACE_PATH = mascotPath([
  "...##...",
  "...##...",
  "..####..",
  "########",
  "########",
  "..####..",
  "...##...",
  "...##...",
]);

export const STAR_EDGE_PATH = mascotPath([
  "........",
  "...##...",
  "...##...",
  "..####..",
  "..####..",
  "...##...",
  "...##...",
  "........",
]);

export const ALERT_PATH = mascotPath([
  "...##...",
  "...##...",
  "...##...",
  "...##...",
  "...##...",
  "........",
  "...##...",
  "...##...",
]);

function zzzGlyph(rows: readonly string[]): { size: number; path: string } {
  return { size: rows.length, path: mascotPath(rows) };
}

const SMALL_Z = zzzGlyph([
  "#####",
  "...#.",
  "..#..",
  ".#...",
  "#####",
]);

/** Sleep glyphs in the order they rise: z, Z, z. */
export const ZZZ_GLYPHS = [
  SMALL_Z,
  zzzGlyph([
    "#######",
    ".....#.",
    "....#..",
    "...#...",
    "..#....",
    ".#.....",
    "#######",
  ]),
  SMALL_Z,
] as const;

type Rect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width?: number;
};

export type Obstacle = {
  /** Left edge of the hurdle, in box coordinates. */
  left: number;
  right: number;
  /** Peak of the jump arc, in px above the top border. */
  height: number;
};

export type Coin = {
  id: number;
  /** Center X in box coordinates. */
  x: number;
  /** How high the mascot must jump to grab it. */
  height: number;
};

export type RunnerPose = {
  /** Sprite center X, in box coordinates. */
  x: number;
  /** Feet height above the top border. */
  y: number;
  facing: 1 | -1;
  airborne: boolean;
};

/** How the latest turn ended. `none` covers a user stop and anything unclear. */
export type TurnOutcome = "done" | "failed" | "none";

/** The session cues the runner reacts to. */
export type RunnerSignal = {
  /** The live turn waits on an approval or an answer. */
  needsInput: boolean;
  outcome: TurnOutcome;
};

/** No input pause and no turn-end reaction, for composers without a session. */
export const QUIET_RUNNER_SIGNAL: RunnerSignal = {
  needsInput: false,
  outcome: "none",
};

/**
 * Read the runner's cues from a session. A turn failed when an error notice
 * follows its user block; a turn the user stopped has no outcome.
 */
export function runnerSignal(session: Session): RunnerSignal {
  const needsInput = sessionNeedsInput(session);
  let failed = false;
  for (let i = session.blocks.length - 1; i >= 0; i--) {
    const block = session.blocks[i];
    if (block.role === "system" && block.notice === "error") failed = true;
    if (block.role !== "user" || block.draft) continue;
    const outcome = block.stopped ? "none" : failed ? "failed" : "done";
    return { needsInput, outcome };
  }
  return { needsInput, outcome: "none" };
}

/**
 * `asleep` sits in the corner with no frame loop, and `waking` is its hop when
 * a turn starts. Then it is `running` the ledge, or `waiting` in place while
 * the turn needs input. When the turn ends it is `cheering` or `dizzy` about
 * the outcome, then `returning` to the corner to sleep.
 */
export type RunnerPhase =
  | "asleep"
  | "waking"
  | "running"
  | "waiting"
  | "cheering"
  | "dizzy"
  | "returning";

export type RunnerCue = {
  busy: boolean;
  needsInput: boolean;
  outcome: TurnOutcome;
  /**
   * The phase's own move is over: landed and not stunned, hop or daze done,
   * or back in the corner.
   */
  settled: boolean;
};

function turnEndPhase(outcome: TurnOutcome): RunnerPhase {
  if (outcome === "failed") return "dizzy";
  if (outcome === "done") return "cheering";
  return "returning";
}

/** Next phase for one frame. A running mascot lands before it stops or reacts. */
export function nextRunnerPhase(
  phase: RunnerPhase,
  cue: RunnerCue,
): RunnerPhase {
  if (cue.busy) {
    switch (phase) {
      case "asleep":
        return "waking";
      case "waking":
        return cue.settled ? "running" : "waking";
      case "running":
        return cue.needsInput && cue.settled ? "waiting" : "running";
      case "waiting":
        return cue.needsInput ? "waiting" : "running";
      default:
        return "running";
    }
  }
  switch (phase) {
    case "asleep":
      return "asleep";
    case "waking":
    case "running":
      return cue.settled ? turnEndPhase(cue.outcome) : phase;
    case "waiting":
      return turnEndPhase(cue.outcome);
    case "cheering":
    case "dizzy":
      return cue.settled ? "returning" : phase;
    case "returning":
      return cue.settled ? "asleep" : "returning";
  }
}

/**
 * Where the mascot sleeps, as a distance along the inset track: the end away
 * from the chevron, or the left end when the chevron sits near the middle.
 */
export function sleepAlong(
  trackWidth: number,
  obstacle: Obstacle | null,
): number {
  if (!obstacle) return 0;
  const center = (obstacle.left + obstacle.right) / 2;
  const margin = obstacle.right - obstacle.left;
  return center < trackWidth / 2 - margin
    ? Math.max(0, trackWidth - RUNNER_INSET * 2)
    : 0;
}

/** Run toward the sleep spot. It is an end of the track, so the step lands on it. */
export function stepHome(
  along: number,
  facing: 1 | -1,
  home: number,
  dtMs: number,
  trackWidth: number,
): { along: number; facing: 1 | -1; home: boolean } {
  if (along === home) return { along, facing, home: true };
  const toward: 1 | -1 = home < along ? -1 : 1;
  const stepped = stepAlong(along, toward, dtMs, trackWidth);
  return {
    along: stepped.along,
    facing: toward,
    home: stepped.along === home,
  };
}

export function pingPong(
  distance: number,
  length: number,
): { t: number; facing: 1 | -1 } {
  if (length <= 0) return { t: 0, facing: 1 };
  const cycle = length * 2;
  const d = ((distance % cycle) + cycle) % cycle;
  if (d <= length) return { t: d, facing: 1 };
  return { t: cycle - d, facing: -1 };
}

function arc(
  x: number,
  left: number,
  right: number,
  height: number,
  lead = JUMP_LEAD,
): number {
  const start = left - lead;
  const end = right + lead;
  if (end <= start || x <= start || x >= end) return 0;
  const t = (x - start) / (end - start);
  return 4 * t * (1 - t) * height;
}

/** Feet height through the hop in place: 0 at both ends, `HOP_PEAK` halfway. */
export function hopY(elapsedMs: number): number {
  return arc(elapsedMs, 0, HOP_MS, HOP_PEAK, 0);
}

export function hopDone(elapsedMs: number): boolean {
  return elapsedMs >= HOP_MS;
}

/** Feet peak so the sprite's body meets the coin instead of its shoes. */
export function coinJumpPeak(coin: Coin): number {
  return Math.max(0, coin.height - RUNNER_SIZE / 2);
}

/** Mario parabola: 0 at the ends, `height` at the midpoint. */
export function jumpHeight(
  x: number,
  obstacle: Obstacle | null,
  coins: readonly Coin[] = [],
): number {
  let height = obstacle
    ? arc(x, obstacle.left, obstacle.right, obstacle.height)
    : 0;
  for (const coin of coins) {
    height = Math.max(
      height,
      arc(
        x,
        coin.x - COIN_WIDTH / 2,
        coin.x + COIN_WIDTH / 2,
        coinJumpPeak(coin),
        COIN_JUMP_LEAD,
      ),
    );
  }
  return height;
}

export function runnerPose(
  distance: number,
  boxWidth: number,
  obstacle: Obstacle | null,
  coins: readonly Coin[] = [],
  inset = RUNNER_INSET,
): RunnerPose {
  const trackWidth = Math.max(0, boxWidth - inset * 2);
  const { t, facing } = pingPong(distance, trackWidth);
  const x = inset + t;
  const y = jumpHeight(x, obstacle, coins);
  return { x, y, facing, airborne: y > 0.5 };
}

/** Keep a position in the same relative spot when the composer width changes. */
export function scaleTrackX(x: number, fromWidth: number, toWidth: number): number {
  if (fromWidth <= 0) return 0;
  return x * (toWidth / fromWidth);
}

export function stepAlong(
  along: number,
  facing: 1 | -1,
  dtMs: number,
  trackWidth: number,
  speed = RUNNER_SPEED_PX,
): { along: number; facing: 1 | -1 } {
  if (trackWidth <= 0) return { along: 0, facing: 1 };
  let next = along + facing * speed * (dtMs / 1000);
  let dir: 1 | -1 = facing;
  if (next >= trackWidth) {
    next = trackWidth;
    dir = -1;
  } else if (next <= 0) {
    next = 0;
    dir = 1;
  }
  return { along: next, facing: dir };
}

export function poseAt(
  along: number,
  facing: 1 | -1,
  boxWidth: number,
  obstacle: Obstacle | null,
  coins: readonly Coin[] = [],
  inset = RUNNER_INSET,
): RunnerPose {
  const trackWidth = Math.max(0, boxWidth - inset * 2);
  const x = inset + Math.min(trackWidth, Math.max(0, along));
  const y = jumpHeight(x, obstacle, coins);
  return { x, y, facing, airborne: y > 0.5 };
}

/** First contact with the chevron this turn — skip if they already learned, or are hopping a coin. */
export function hitsChevron(
  x: number,
  y: number,
  facing: 1 | -1,
  obstacle: Obstacle | null,
  learned: boolean,
): boolean {
  if (learned || !obstacle || y > 0.5) return false;
  const half = RUNNER_SIZE / 2;
  if (facing === 1) {
    return x + half >= obstacle.left && x - half < obstacle.right;
  }
  return x - half <= obstacle.right && x + half > obstacle.left;
}

/** Knocked back from the hurdle, easing out, clamped to the track. */
export function recoilAlong(
  hitAlong: number,
  facing: 1 | -1,
  elapsedMs: number,
  trackWidth: number,
): number {
  const t = Math.min(1, Math.max(0, elapsedMs / CRASH_RECOIL_MS));
  const eased = 1 - (1 - t) * (1 - t);
  const next = hitAlong - facing * CRASH_RECOIL_PX * eased;
  return Math.min(trackWidth, Math.max(0, next));
}

export function stunShake(elapsedMs: number): { x: number; y: number } {
  if (elapsedMs <= 0 || elapsedMs >= CRASH_SHAKE_MS) return { x: 0, y: 0 };
  const decay = 1 - elapsedMs / CRASH_SHAKE_MS;
  return {
    x: Math.round(Math.sin(elapsedMs / 32) * 3 * decay),
    y: Math.round(Math.cos(elapsedMs / 26) * 2 * decay),
  };
}

export function stunDone(elapsedMs: number): boolean {
  return elapsedMs >= CRASH_STUN_MS;
}

/** Pixel stars orbiting the sprite while it is stunned. Offsets are from the sprite top-left. */
export function stunStars(
  elapsedMs: number,
): { dx: number; dy: number; opacity: number }[] {
  if (elapsedMs < 0 || elapsedMs >= CRASH_STUN_MS) return [];
  const fadeAt = CRASH_STUN_MS - 140;
  const opacity =
    elapsedMs < fadeAt ? 1 : Math.max(0, 1 - (elapsedMs - fadeAt) / 140);
  const originX = (RUNNER_SIZE - STAR_SIZE) / 2;
  const originY = (RUNNER_SIZE - STAR_SIZE) / 2 - 5;
  const angle = (elapsedMs / STAR_SPIN_MS) * Math.PI * 2;
  const stars: { dx: number; dy: number; opacity: number }[] = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    const a = angle + (i * (Math.PI * 2)) / STAR_COUNT;
    stars.push({
      dx: Math.round(originX + Math.cos(a) * STAR_ORBIT),
      dy: Math.round(originY + Math.sin(a) * STAR_ORBIT),
      opacity,
    });
  }
  return stars;
}

export function coinCollected(pose: RunnerPose, coin: Coin): boolean {
  if (Math.abs(pose.x - coin.x) > COLLECT_X) return false;
  const mascotTop = pose.y + RUNNER_SIZE;
  const mascotBottom = pose.y;
  const coinTop = coin.height + COIN_SIZE / 2;
  const coinBottom = coin.height - COIN_SIZE / 2;
  return mascotTop >= coinBottom && mascotBottom <= coinTop;
}

export function nextCoinDelay(first: boolean, random = Math.random): number {
  const min = first ? COIN_FIRST_MIN_MS : COIN_GAP_MIN_MS;
  const max = first ? COIN_FIRST_MAX_MS : COIN_GAP_MAX_MS;
  return min + random() * (max - min);
}

/** Place a coin on the track, away from the runner and the chevron when we can. */
export function pickCoinX(
  boxWidth: number,
  runnerX: number,
  obstacle: Obstacle | null,
  random = Math.random,
): number | null {
  const min = RUNNER_INSET + COIN_JUMP_LEAD + 8;
  const max = boxWidth - RUNNER_INSET - COIN_JUMP_LEAD - 8;
  if (max <= min) return null;

  for (let i = 0; i < 8; i++) {
    const x = min + random() * (max - min);
    if (Math.abs(x - runnerX) < 40) continue;
    if (obstacle && x >= obstacle.left - 6 && x <= obstacle.right + 6) continue;
    return x;
  }
  return min + random() * (max - min);
}

/**
 * Treat a control as a hurdle when it sits on (or just above) the composer's
 * top border and overlaps it horizontally — the jump-to-latest chevron.
 */
export function obstacleFromRects(
  box: Rect,
  button: Rect | null,
): Obstacle | null {
  if (!button) return null;
  if (button.right <= box.left || button.left >= box.right) return null;
  if (button.bottom < box.top - 48 || button.top > box.top + 12) return null;

  return {
    left: button.left - box.left,
    right: button.right - box.left,
    height: Math.max(JUMP_MIN, box.top - button.top + JUMP_CLEARANCE),
  };
}

export type RunnerTrack = {
  left: number;
  top: number;
  width: number;
};

/** Prefer the top edge of a control stacked on the composer. */
export function runnerTrack(box: Rect, ledge: Rect | null): RunnerTrack {
  const ledgeWidth = ledge
    ? (ledge.width ?? ledge.right - ledge.left)
    : 0;
  if (!ledge || ledgeWidth <= 0) {
    return {
      left: box.left,
      top: box.top,
      width: box.width ?? box.right - box.left,
    };
  }
  return {
    left: ledge.left,
    top: ledge.top,
    width: ledgeWidth,
  };
}
