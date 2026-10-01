import { describe, expect, it } from "vitest";
import {
  COIN_FIRST_MAX_MS,
  COIN_FIRST_MIN_MS,
  COIN_GAP_MAX_MS,
  COIN_GAP_MIN_MS,
  COIN_HOVER,
  CRASH_RECOIL_MS,
  CRASH_RECOIL_PX,
  CRASH_SHAKE_MS,
  CRASH_STUN_MS,
  HOP_MS,
  HOP_PEAK,
  JUMP_LEAD,
  RUNNER_INSET,
  RUNNER_SIZE,
  STAR_COUNT,
  coinCollected,
  hitsChevron,
  hopDone,
  hopY,
  jumpHeight,
  nextCoinDelay,
  nextRunnerPhase,
  obstacleFromRects,
  pickCoinX,
  pingPong,
  poseAt,
  recoilAlong,
  rectWithin,
  runnerPose,
  runnerTrack,
  scaleTrackX,
  sleepAlong,
  stepAlong,
  stepHome,
  zzzLeft,
  ZZZ_X,
  stunDone,
  stunShake,
  stunStars,
  runnerSignal,
  type RunnerCue,
} from "./composerRunner";
import {
  markTurnStopped,
  newSession,
  type Block,
  type Session,
} from "./session";

const BOX = { left: 100, right: 500, top: 200, bottom: 320, width: 400 };

function chat(blocks: Block[], patch: Partial<Session> = {}): Session {
  return { ...newSession("cursor", "/tmp/a"), ...patch, blocks };
}

const user = (id: string): Block => ({ id, role: "user", text: "go" });
const reply: Block = { id: "a1", role: "assistant", text: "done" };
const failure: Block = {
  id: "e1",
  role: "system",
  text: "boom",
  notice: "error",
};

const cue = (patch: Partial<RunnerCue> = {}): RunnerCue => ({
  busy: true,
  needsInput: false,
  outcome: "none",
  settled: true,
  ...patch,
});

describe("composerRunner", () => {
  it("runs right, then flips and runs back", () => {
    expect(pingPong(0, 100)).toEqual({ t: 0, facing: 1 });
    expect(pingPong(40, 100)).toEqual({ t: 40, facing: 1 });
    expect(pingPong(100, 100)).toEqual({ t: 100, facing: 1 });
    expect(pingPong(140, 100)).toEqual({ t: 60, facing: -1 });
    expect(pingPong(199.9, 100).facing).toBe(-1);
    expect(pingPong(199.9, 100).t).toBeCloseTo(0.1);
    expect(pingPong(200, 100)).toEqual({ t: 0, facing: 1 });
    expect(pingPong(240, 100)).toEqual({ t: 40, facing: 1 });
  });

  it("wraps negative distance so a restart still faces forward", () => {
    expect(pingPong(-10, 100)).toEqual({ t: 10, facing: -1 });
  });

  it("parks at the left inset when the track is too short", () => {
    expect(runnerPose(80, 8, null)).toEqual({
      x: RUNNER_INSET,
      y: 0,
      facing: 1,
      airborne: false,
    });
  });

  it("places x in box coordinates, inset from each end", () => {
    const right = runnerPose(0, 200, null);
    expect(right.x).toBe(RUNNER_INSET);
    expect(right.facing).toBe(1);
    expect(right.y).toBe(0);

    const far = runnerPose(200 - RUNNER_INSET * 2, 200, null);
    expect(far.x).toBe(200 - RUNNER_INSET);
    expect(far.facing).toBe(1);
  });

  it("jumps a parabola over the hurdle and lands after it", () => {
    const obstacle = { left: 80, right: 104, height: 40 };
    const mid = (obstacle.left + obstacle.right) / 2;

    expect(jumpHeight(obstacle.left - JUMP_LEAD, obstacle)).toBe(0);
    expect(jumpHeight(obstacle.right + JUMP_LEAD, obstacle)).toBe(0);
    expect(jumpHeight(mid, obstacle)).toBeCloseTo(40);
    expect(jumpHeight(mid, obstacle)).toBeGreaterThan(
      jumpHeight(obstacle.left, obstacle),
    );

    const peak = runnerPose(mid - RUNNER_INSET, 400, obstacle);
    expect(peak.airborne).toBe(true);
    expect(peak.y).toBeCloseTo(40);

    const before = runnerPose(0, 400, obstacle);
    expect(before.airborne).toBe(false);
    expect(before.y).toBe(0);
  });

  it("keeps the landing arc after the coin is grabbed", () => {
    const coins = [{ id: 1, x: 120, height: COIN_HOVER }];
    const atCoin = runnerPose(120 - RUNNER_INSET, 400, null, coins);
    const past = runnerPose(120 - RUNNER_INSET + 20, 400, null, coins);
    expect(atCoin.y).toBeGreaterThan(past.y);
    expect(past.y).toBeGreaterThan(0);
    expect(runnerPose(120 - RUNNER_INSET + 20, 400, null, []).y).toBe(0);
  });

  it("collects only when the sprite overlaps the coin", () => {
    const coins = [{ id: 1, x: 120, height: COIN_HOVER }];
    const peak = runnerPose(120 - RUNNER_INSET, 400, null, coins);
    expect(coinCollected(peak, coins[0])).toBe(true);
    expect(
      coinCollected({ x: 120, y: 8, facing: 1, airborne: true }, coins[0]),
    ).toBe(false);
    expect(
      coinCollected({ x: 40, y: peak.y, facing: 1, airborne: true }, coins[0]),
    ).toBe(false);
  });

  it("spaces coins across the track and away from the runner", () => {
    const values = [0.5, 0.1];
    let i = 0;
    const x = pickCoinX(400, 200, null, () => values[Math.min(i++, 1)] ?? 0);
    expect(x).toBeGreaterThan(50);
    expect(x).toBeLessThan(100);
    expect(pickCoinX(40, 10, null)).toBeNull();
  });

  it("waits several seconds between coins", () => {
    expect(nextCoinDelay(true, () => 0)).toBe(COIN_FIRST_MIN_MS);
    expect(nextCoinDelay(true, () => 1)).toBe(COIN_FIRST_MAX_MS);
    expect(nextCoinDelay(false, () => 0)).toBe(COIN_GAP_MIN_MS);
    expect(nextCoinDelay(false, () => 1)).toBe(COIN_GAP_MAX_MS);
    expect(COIN_GAP_MIN_MS).toBeGreaterThanOrEqual(6000);
  });

  it("hops once in place to wake or cheer", () => {
    expect(hopY(0)).toBe(0);
    expect(hopY(HOP_MS / 2)).toBeCloseTo(HOP_PEAK);
    expect(hopY(HOP_MS)).toBe(0);
    expect(hopDone(HOP_MS - 1)).toBe(false);
    expect(hopDone(HOP_MS)).toBe(true);
  });

  it("reads a pending approval or question as the turn needing input", () => {
    expect(runnerSignal(chat([user("u1")], { busy: true })).needsInput).toBe(
      false,
    );
    const approval: Block = {
      id: "p1",
      role: "approval",
      text: "run rm",
      approval: { requestId: 1 },
    };
    expect(runnerSignal(chat([user("u1"), approval])).needsInput).toBe(true);
    expect(
      runnerSignal(
        chat([user("u1")], {
          pendingQuestion: { requestId: 2, questions: [] },
        }),
      ).needsInput,
    ).toBe(true);
  });

  it("calls a turn failed only when an error notice follows its user block", () => {
    expect(runnerSignal(chat([user("u1"), reply])).outcome).toBe("done");
    expect(runnerSignal(chat([user("u1"), reply, failure])).outcome).toBe(
      "failed",
    );
    expect(
      runnerSignal(chat([user("u1"), failure, user("u2"), reply])).outcome,
    ).toBe("done");
    expect(
      runnerSignal(
        chat([user("u1"), failure, { ...user("d1"), draft: true }]),
      ).outcome,
    ).toBe("failed");
    expect(runnerSignal(chat([])).outcome).toBe("none");
  });

  it("gives a turn the user stopped no outcome", () => {
    const stopped = markTurnStopped(
      chat([user("u1"), reply, user("u2"), reply]),
    );
    expect(stopped.blocks[2].stopped).toBe(true);
    expect(stopped.blocks[0].stopped).toBeUndefined();
    expect(runnerSignal(stopped).outcome).toBe("none");
    expect(markTurnStopped(stopped)).toBe(stopped);
    expect(
      runnerSignal(chat([...stopped.blocks, user("u3"), reply])).outcome,
    ).toBe("done");
  });

  it("stands still while the turn needs input, after landing", () => {
    expect(nextRunnerPhase("running", cue())).toBe("running");
    expect(nextRunnerPhase("running", cue({ needsInput: true }))).toBe(
      "waiting",
    );
    expect(
      nextRunnerPhase("running", cue({ needsInput: true, settled: false })),
    ).toBe("running");
    expect(nextRunnerPhase("waiting", cue({ needsInput: true }))).toBe(
      "waiting",
    );
    expect(nextRunnerPhase("waiting", cue())).toBe("running");
  });

  it("wakes with a hop when a turn starts, then runs", () => {
    expect(nextRunnerPhase("asleep", cue({ settled: false }))).toBe("waking");
    expect(nextRunnerPhase("waking", cue({ settled: false }))).toBe("waking");
    expect(nextRunnerPhase("waking", cue())).toBe("running");
    expect(nextRunnerPhase("asleep", cue({ busy: false }))).toBe("asleep");
  });

  it("reacts to how the turn ended, then heads home to sleep", () => {
    const ended = (outcome: RunnerCue["outcome"], settled = true) =>
      cue({ busy: false, outcome, settled });
    expect(nextRunnerPhase("running", ended("done"))).toBe("cheering");
    expect(nextRunnerPhase("running", ended("failed"))).toBe("dizzy");
    expect(nextRunnerPhase("running", ended("none"))).toBe("returning");
    expect(nextRunnerPhase("running", ended("done", false))).toBe("running");
    expect(nextRunnerPhase("waiting", ended("failed", false))).toBe("dizzy");
    expect(nextRunnerPhase("waking", ended("done", false))).toBe("waking");
    expect(nextRunnerPhase("waking", ended("done"))).toBe("cheering");

    expect(nextRunnerPhase("cheering", ended("done", false))).toBe("cheering");
    expect(nextRunnerPhase("cheering", ended("done"))).toBe("returning");
    expect(nextRunnerPhase("dizzy", ended("failed", false))).toBe("dizzy");
    expect(nextRunnerPhase("dizzy", ended("failed"))).toBe("returning");
    expect(nextRunnerPhase("returning", ended("done", false))).toBe(
      "returning",
    );
    expect(nextRunnerPhase("returning", ended("done"))).toBe("asleep");
  });

  it("runs again when a new turn starts before the mascot is asleep", () => {
    for (const phase of ["cheering", "dizzy", "returning"] as const) {
      expect(nextRunnerPhase(phase, cue({ settled: false }))).toBe("running");
    }
  });

  it("sleeps centered on the send button's column", () => {
    const track = { left: 100, top: 200, width: 400 };
    const send = { left: 462, right: 488, top: 290, bottom: 316 };
    expect(RUNNER_INSET + sleepAlong(track, null, send)).toBe(375);
    expect(RUNNER_INSET + sleepAlong({ ...track, left: 90 }, null, send)).toBe(
      385,
    );
  });

  it("sleeps at the right end of the track without a send button", () => {
    expect(sleepAlong({ left: 100, top: 200, width: 400 }, null, null)).toBe(
      400 - RUNNER_INSET * 2,
    );
    expect(sleepAlong({ left: 100, top: 200, width: 8 }, null, null)).toBe(0);
  });

  it("keeps the send column inside the track", () => {
    const track = { left: 100, top: 200, width: 400 };
    const past = { left: 520, right: 546, top: 290, bottom: 316 };
    expect(sleepAlong(track, null, past)).toBe(400 - RUNNER_INSET * 2);
  });

  it("keeps the send column when the chevron sits clear of it", () => {
    const track = { left: 100, top: 200, width: 400 };
    const send = { left: 462, right: 488, top: 290, bottom: 316 };
    const chevron = { left: 188, right: 212, height: 42 };
    expect(RUNNER_INSET + sleepAlong(track, chevron, send)).toBe(375);
  });

  it("sleeps just left of a chevron that covers the send column", () => {
    const track = { left: 100, top: 200, width: 400 };
    const send = { left: 462, right: 488, top: 290, bottom: 316 };
    const chevron = { left: 370, right: 394, height: 42 };
    const x = RUNNER_INSET + sleepAlong(track, chevron, send);
    expect(x + RUNNER_SIZE / 2).toBeLessThanOrEqual(chevron.left);
    expect(x).toBe(360);
  });

  it("sleeps right of the chevron when there is no room left of it", () => {
    const track = { left: 100, top: 200, width: 100 };
    const send = { left: 107, right: 133, top: 290, bottom: 316 };
    const chevron = { left: 12, right: 36, height: 42 };
    const x = RUNNER_INSET + sleepAlong(track, chevron, send);
    expect(x - RUNNER_SIZE / 2).toBeGreaterThanOrEqual(chevron.right);
    expect(x).toBe(46);
  });

  it("runs home facing the sleep spot and stops exactly on it", () => {
    expect(stepHome(200, 1, 0, 500, 380)).toEqual({
      along: 120,
      facing: -1,
      home: false,
    });
    expect(stepHome(40, -1, 0, 500, 380)).toEqual({
      along: 0,
      facing: -1,
      home: true,
    });
    expect(stepHome(300, -1, 355, 500, 380)).toEqual({
      along: 355,
      facing: 1,
      home: true,
    });
    expect(stepHome(100, 1, 355, 500, 380)).toEqual({
      along: 180,
      facing: 1,
      home: false,
    });
    expect(stepHome(355, -1, 355, 16, 380)).toEqual({
      along: 355,
      facing: -1,
      home: true,
    });
  });

  it("shifts the sleep Zs left so they stay inside the track", () => {
    expect(zzzLeft(375, 400)).toBe(375 - RUNNER_SIZE / 2 + ZZZ_X);
    expect(zzzLeft(390, 400)).toBe(384);
    expect(zzzLeft(4, 10)).toBe(0);
  });

  it("ignores a control that is not sitting on the top border", () => {
    expect(
      obstacleFromRects(BOX, {
        left: 250,
        right: 274,
        top: 40,
        bottom: 64,
      }),
    ).toBeNull();
    expect(
      obstacleFromRects(BOX, {
        left: 10,
        right: 34,
        top: 188,
        bottom: 212,
      }),
    ).toBeNull();
  });

  it("reads the jump-to-latest chevron as a hurdle in box space", () => {
    const hurdle = obstacleFromRects(BOX, {
      left: 288,
      right: 312,
      top: 168,
      bottom: 192,
    });
    expect(hurdle).toEqual({
      left: 188,
      right: 212,
      height: 42,
    });
  });

  it("crashes into the chevron only on the first approach", () => {
    const hurdle = { left: 80, right: 104, height: 40 };
    const half = RUNNER_SIZE / 2;

    expect(hitsChevron(80 - half - 2, 0, 1, hurdle, false)).toBe(false);
    expect(hitsChevron(80 - half, 0, 1, hurdle, false)).toBe(true);
    expect(hitsChevron(120, 0, 1, hurdle, false)).toBe(false);
    expect(hitsChevron(104 + half, 0, -1, hurdle, false)).toBe(true);
    expect(hitsChevron(50, 0, -1, hurdle, false)).toBe(false);
    expect(hitsChevron(80 - half, 8, 1, hurdle, false)).toBe(false);
    expect(hitsChevron(80 - half, 0, 1, hurdle, true)).toBe(false);
    expect(hitsChevron(80 - half, 0, 1, null, false)).toBe(false);
  });

  it("knocks the mascot back, shakes, then finishes the stun", () => {
    expect(recoilAlong(70, 1, 0, 200)).toBe(70);
    expect(recoilAlong(70, 1, CRASH_RECOIL_MS, 200)).toBe(70 - CRASH_RECOIL_PX);
    expect(recoilAlong(70, -1, CRASH_RECOIL_MS, 200)).toBe(70 + CRASH_RECOIL_PX);
    expect(recoilAlong(4, 1, CRASH_RECOIL_MS, 200)).toBe(0);
    expect(recoilAlong(190, -1, CRASH_RECOIL_MS, 200)).toBe(200);

    expect(stunShake(0)).toEqual({ x: 0, y: 0 });
    const wobble = [40, 80, 120, 160].map(stunShake);
    expect(wobble.some((shake) => Math.abs(shake.x) >= 2)).toBe(true);
    expect(wobble.some((shake) => Math.abs(shake.y) >= 1)).toBe(true);
    expect(stunShake(CRASH_SHAKE_MS)).toEqual({ x: 0, y: 0 });
    expect(stunDone(CRASH_STUN_MS - 1)).toBe(false);
    expect(stunDone(CRASH_STUN_MS)).toBe(true);
  });

  it("orbits pixel stars around the sprite for the stun, then clears them", () => {
    const start = stunStars(0);
    expect(start).toHaveLength(STAR_COUNT);
    expect(start[0].opacity).toBe(1);
    expect(new Set(start.map((star) => `${star.dx},${star.dy}`)).size).toBe(
      STAR_COUNT,
    );

    const spun = stunStars(140);
    expect(spun[0].dx).not.toBe(start[0].dx);
    expect(stunStars(CRASH_STUN_MS - 1)[0].opacity).toBeLessThan(1);
    expect(stunStars(CRASH_STUN_MS)).toEqual([]);
  });

  it("runs on the review bar when it is sitting on the composer", () => {
    expect(runnerTrack(BOX, null)).toEqual({
      left: 100,
      top: 200,
      width: 400,
    });
    expect(
      runnerTrack(BOX, {
        left: 108,
        right: 492,
        top: 168,
        bottom: 200,
        width: 384,
      }),
    ).toEqual({ left: 108, top: 168, width: 384 });
  });

  it("measures the track from the mascot's layer, so moving both keeps it in place", () => {
    const layer = { left: 80, top: 150 };
    const track = runnerTrack(rectWithin(BOX, layer), null);
    expect(track).toEqual({ left: 20, top: 50, width: 400 });

    const slid = { ...BOX, left: BOX.left + 240, right: BOX.right + 240 };
    expect(
      runnerTrack(rectWithin(slid, { ...layer, left: layer.left + 240 }), null),
    ).toEqual(track);

    const unsized = { left: 100, right: 500, top: 200, bottom: 320 };
    expect(rectWithin(unsized, layer)).toEqual(rectWithin(BOX, layer));
  });

  it("keeps relative position when the track width changes", () => {
    expect(scaleTrackX(200, 400, 200)).toBe(100);
    expect(scaleTrackX(0, 400, 800)).toBe(0);
    expect(scaleTrackX(50, 0, 400)).toBe(0);

    const stepped = stepAlong(0, 1, 1000, 100, 40);
    expect(stepped.along).toBe(40);
    expect(stepped.facing).toBe(1);

    const turned = stepAlong(100, 1, 1000, 100, 40);
    expect(turned.along).toBe(100);
    expect(turned.facing).toBe(-1);

    const pose = poseAt(50, 1, 200, null);
    expect(pose.x).toBe(RUNNER_INSET + 50);
    expect(pose.facing).toBe(1);
    expect(pose.y).toBe(0);
  });
});
