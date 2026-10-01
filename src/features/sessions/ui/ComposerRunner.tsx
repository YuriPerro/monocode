import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  ALERT_GAP,
  ALERT_PATH,
  ALERT_SIZE,
  COIN_EDGE_PATH,
  COIN_FACE_PATH,
  COIN_HOVER,
  COIN_SIZE,
  COLLECT_POP_MS,
  COLLECT_POP_PX,
  EXIT_MS,
  EXIT_SINK,
  STAR_COUNT,
  STAR_EDGE_PATH,
  STAR_FACE_PATH,
  STAR_SIZE,
  coinCollected,
  exitJumpY,
  hitsChevron,
  hopDone,
  hopY,
  jumpHeight,
  nextCoinDelay,
  nextRunnerPhase,
  obstacleFromRects,
  pickCoinX,
  RUNNER_INSET,
  RUNNER_SIZE,
  poseAt,
  recoilAlong,
  scaleTrackX,
  stepAlong,
  runnerTrack,
  spriteClipBottom,
  stunDone,
  stunShake,
  stunStars,
  QUIET_RUNNER_SIGNAL,
  type Coin,
  type Obstacle,
  type RunnerPhase,
  type RunnerSignal,
  type RunnerTrack,
} from "../model/composerRunner";
import { projectKey, projectName } from "../../../shared/lib/paths";
import {
  loadTabGroupColors,
  loadTabGroupCustomColors,
  loadTabGroupMascots,
  resolveTabGroupColor,
  resolveTabGroupMascot,
} from "../../workspace/model/tabGroups";
import { ProjectMascot } from "../../projects/ui/ProjectMascot";

type Props = {
  boxRef: RefObject<HTMLElement | null>;
  cwd: string;
  busy: boolean;
  /** Session cues; omit for no input pause and no turn-end reaction. */
  signal?: RunnerSignal;
  enabled?: boolean;
  onExited: () => void;
};

type LiveCoin = Coin & {
  el: HTMLDivElement;
  collectedAt: number | null;
};

const COIN_SVG = `<svg viewBox="0 0 8 8" width="${COIN_SIZE}" height="${COIN_SIZE}" shape-rendering="crispEdges" fill="#e8b923" aria-hidden="true"><path class="composer-coin-face" d="${COIN_FACE_PATH}"/><path class="composer-coin-edge" d="${COIN_EDGE_PATH}"/></svg>`;
const STAR_SVG = `<svg viewBox="0 0 8 8" width="${STAR_SIZE}" height="${STAR_SIZE}" shape-rendering="crispEdges" fill="#f4e27a" aria-hidden="true"><path class="composer-coin-face" d="${STAR_FACE_PATH}"/><path class="composer-coin-edge" d="${STAR_EDGE_PATH}"/></svg>`;
const GEOMETRY_SAMPLE_MS = 100;

/** Project pixel mascot running the composer's top ledge while a turn is live. */
export function ComposerRunner({
  boxRef,
  cwd,
  busy,
  signal = QUIET_RUNNER_SIGNAL,
  enabled = true,
  onExited,
}: Props) {
  const layerRef = useRef<HTMLDivElement>(null);
  const spriteRef = useRef<HTMLDivElement>(null);
  const coinsRef = useRef<HTMLDivElement>(null);
  const starsRef = useRef<HTMLDivElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(busy);
  const signalRef = useRef(signal);
  const enabledRef = useRef(enabled);
  const onExitedRef = useRef(onExited);
  busyRef.current = busy;
  signalRef.current = signal;
  enabledRef.current = enabled;
  onExitedRef.current = onExited;

  const project = projectName(cwd);
  const key = projectKey(cwd);
  const appearance = useMemo(() => {
    return {
      name: resolveTabGroupMascot(key, loadTabGroupMascots()),
      color: resolveTabGroupColor(
        key,
        loadTabGroupColors(),
        loadTabGroupCustomColors(),
        project,
      ),
    };
  }, [key, project]);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    const sprite = spriteRef.current;
    const coinLayer = coinsRef.current;
    const starLayer = starsRef.current;
    const alert = alertRef.current;
    if (!layer || !sprite || !coinLayer || !starLayer || !alert) return;

    let along = 0;
    let facing: 1 | -1 = 1;
    let prevWidth = 0;
    let last = performance.now();
    let raf = 0;
    let coinId = 0;
    let nextCoinAt = last + nextCoinDelay(true);
    let phase: RunnerPhase = "running";
    let phaseAt = last;
    let grounded = true;
    let finished = false;
    let stunning = false;
    let stunAt = 0;
    let hitAlong = 0;
    let hitFacing: 1 | -1 = 1;
    let geometryAt = -Infinity;
    let geometryBox: HTMLElement | null = null;
    let cachedTrack: RunnerTrack | null = null;
    let cachedObstacle: Obstacle | null = null;
    const coins: LiveCoin[] = [];
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let learned = reduced;
    const starEls = Array.from({ length: STAR_COUNT }, () => {
      const el = document.createElement("div");
      el.className = "absolute top-0 left-0";
      el.style.width = `${STAR_SIZE}px`;
      el.style.height = `${STAR_SIZE}px`;
      el.style.opacity = "0";
      el.style.filter = "drop-shadow(0 1px 0 rgba(0,0,0,0.45))";
      el.style.transform =
        "translate3d(var(--star-x, -64px), var(--star-y, -64px), 0)";
      el.innerHTML = STAR_SVG;
      starLayer.append(el);
      return el;
    });

    const showLayer = (shown: boolean) => {
      layer.style.visibility = shown ? "visible" : "hidden";
    };
    showLayer(false);

    const placeSprite = (
      boxLeft: number,
      boxTop: number,
      x: number,
      y: number,
      facing: 1 | -1,
      shakeX = 0,
      shakeY = 0,
    ) => {
      sprite.style.setProperty(
        "--runner-x",
        `${Math.round(boxLeft + x - RUNNER_SIZE / 2 + shakeX)}px`,
      );
      sprite.style.setProperty(
        "--runner-y",
        `${Math.round(boxTop - RUNNER_SIZE - y + 1 + shakeY)}px`,
      );
      sprite.style.setProperty("--runner-facing", String(facing));
      sprite.style.setProperty("--runner-clip", `${spriteClipBottom(y)}px`);
    };

    const hideStars = () => {
      for (const el of starEls) el.style.opacity = "0";
    };

    const placeStars = (
      boxLeft: number,
      boxTop: number,
      x: number,
      y: number,
      elapsed: number,
      shakeX = 0,
      shakeY = 0,
    ) => {
      const spriteLeft = boxLeft + x - RUNNER_SIZE / 2 + shakeX;
      const spriteTop = boxTop - RUNNER_SIZE - y + 1 + shakeY;
      const poses = stunStars(elapsed);
      for (let i = 0; i < starEls.length; i++) {
        const el = starEls[i];
        const star = poses[i];
        if (!star) {
          el.style.opacity = "0";
          continue;
        }
        el.style.setProperty(
          "--star-x",
          `${Math.round(spriteLeft + star.dx)}px`,
        );
        el.style.setProperty(
          "--star-y",
          `${Math.round(spriteTop + star.dy)}px`,
        );
        el.style.opacity = String(star.opacity);
      }
    };

    const endStun = () => {
      stunning = false;
      sprite.classList.remove("mascot-stunned");
      hideStars();
    };

    const showAlert = (
      boxLeft: number,
      boxTop: number,
      x: number,
      y: number,
    ) => {
      alert.style.setProperty(
        "--alert-x",
        `${Math.round(boxLeft + x - ALERT_SIZE / 2)}px`,
      );
      alert.style.setProperty(
        "--alert-y",
        `${Math.round(boxTop - RUNNER_SIZE - y + 1 - ALERT_GAP - ALERT_SIZE)}px`,
      );
      alert.style.display = "";
    };

    const hideAlert = () => {
      alert.style.display = "none";
    };

    const clearCoins = () => {
      for (const coin of coins) coin.el.remove();
      coins.length = 0;
    };

    const fadeCoins = (now: number) => {
      for (const coin of [...coins]) {
        const pop = Math.min(
          1,
          (now - (coin.collectedAt ?? now)) / COLLECT_POP_MS,
        );
        coin.el.style.opacity = String(1 - pop);
        if (pop >= 1) {
          coin.el.remove();
          coins.splice(coins.indexOf(coin), 1);
        }
      }
    };

    const enter = (next: RunnerPhase, now: number) => {
      const live = phase === "running" || phase === "waiting";
      if (phase === "dizzy") endStun();
      if (next === "running" && !live) {
        // A new turn cut the reaction short: bonk the chevron afresh.
        learned = reduced;
        finished = false;
      }
      if (live && next !== "running" && next !== "waiting") {
        for (const coin of coins) {
          if (coin.collectedAt == null) coin.collectedAt = now;
        }
      }
      if (next === "dizzy") sprite.classList.add("mascot-stunned");
      phase = next;
      phaseAt = now;
    };

    const apply = (now: number) => {
      const dt = Math.min(now - last, 48);
      last = now;

      const box = boxRef.current;
      if (!enabledRef.current) {
        showLayer(false);
        endStun();
        hideAlert();
        if (!busyRef.current && !finished) {
          finished = true;
          clearCoins();
          onExitedRef.current();
        }
        return;
      }
      if (!box || document.hidden) {
        showLayer(false);
        return;
      }

      // Reading layout every animation frame forces WebKit to flush changes
      // when a new transcript block arrives. The runner can animate from the
      // last measured track while geometry is refreshed at a lower rate.
      if (box !== geometryBox || now - geometryAt >= GEOMETRY_SAMPLE_MS) {
        const shell = box.closest("[data-composer]");
        const review = shell?.querySelector("[data-session-review]");
        const queue = shell?.querySelector("[data-message-queue-card]");
        const ledge = review ?? queue;
        cachedTrack = runnerTrack(
          box.getBoundingClientRect(),
          ledge?.getBoundingClientRect() ?? null,
        );
        const pane = box.closest("[data-session-drop]");
        const button = pane?.querySelector("[data-jump-to-bottom]");
        cachedObstacle = obstacleFromRects(
          {
            left: cachedTrack.left,
            right: cachedTrack.left + cachedTrack.width,
            top: cachedTrack.top,
            bottom: cachedTrack.top + 8,
            width: cachedTrack.width,
          },
          button?.getBoundingClientRect() ?? null,
        );
        geometryBox = box;
        geometryAt = now;
      }
      const track = cachedTrack;
      if (!track) return;
      if (track.width <= 0) {
        showLayer(false);
        return;
      }
      showLayer(true);

      const insetTrack = Math.max(0, track.width - RUNNER_INSET * 2);
      if (prevWidth > 0 && prevWidth !== track.width) {
        const prevInset = Math.max(0, prevWidth - RUNNER_INSET * 2);
        along = scaleTrackX(along, prevInset, insetTrack);
        hitAlong = scaleTrackX(hitAlong, prevInset, insetTrack);
        for (const coin of coins) {
          coin.x = scaleTrackX(coin.x, prevWidth, track.width);
        }
      }
      prevWidth = track.width;

      const signal = signalRef.current;
      const elapsed = now - phaseAt;
      const next = nextRunnerPhase(phase, {
        busy: busyRef.current,
        needsInput: signal.needsInput,
        outcome: signal.outcome,
        settled:
          phase === "running"
            ? grounded && !stunning
            : phase === "cheering"
              ? reduced || hopDone(elapsed)
              : phase === "dizzy"
                ? reduced || stunDone(elapsed)
                : true,
      });
      if (next !== phase) enter(next, now);

      if (phase !== "waiting") hideAlert();
      if (phase === "cheering" || phase === "dizzy" || phase === "exiting") {
        fadeCoins(now);
        const at = now - phaseAt;
        const x = poseAt(along, facing, track.width, null).x;
        if (phase === "cheering") {
          placeSprite(track.left, track.top, x, reduced ? 0 : hopY(at), facing);
          return;
        }
        if (phase === "dizzy") {
          const shake = reduced ? { x: 0, y: 0 } : stunShake(at);
          placeSprite(track.left, track.top, x, 0, facing, shake.x, shake.y);
          if (!reduced) {
            placeStars(track.left, track.top, x, 0, at, shake.x, shake.y);
          }
          return;
        }
        const t = reduced ? 1 : Math.min(1, at / EXIT_MS);
        const y = reduced ? -EXIT_SINK : exitJumpY(t);
        placeSprite(track.left, track.top, x, y, facing);
        if (t >= 1 && !finished) {
          finished = true;
          clearCoins();
          onExitedRef.current();
        }
        return;
      }

      if (phase === "running" && !reduced && !stunning) {
        const stepped = stepAlong(along, facing, dt, insetTrack);
        along = stepped.along;
        facing = stepped.facing;
      }

      const obstacle = cachedObstacle;
      if (stunning) {
        along = recoilAlong(hitAlong, hitFacing, now - stunAt, insetTrack);
        facing = hitFacing;
        if (stunDone(now - stunAt)) {
          learned = true;
          endStun();
        }
      }

      for (const coin of coins) {
        if (
          coin.collectedAt == null &&
          (coin.x < RUNNER_INSET || coin.x > track.width - RUNNER_INSET)
        ) {
          coin.collectedAt = now;
        }
      }
      // Keep grabbed coins in the pose so the hop finishes instead of snapping
      // back to the rim the frame they are collected. Skip the chevron hop
      // until the mascot has bonked it once this turn.
      const pose = poseAt(
        along,
        facing,
        track.width,
        learned ? obstacle : null,
        stunning ? [] : coins,
      );
      if (
        !stunning &&
        hitsChevron(pose.x, pose.y, pose.facing, obstacle, learned)
      ) {
        stunning = true;
        stunAt = now;
        hitAlong = along;
        hitFacing = facing;
        sprite.classList.add("mascot-stunned");
      }
      const shake = stunning ? stunShake(now - stunAt) : { x: 0, y: 0 };
      if (stunning) {
        placeStars(
          track.left,
          track.top,
          pose.x,
          pose.y,
          now - stunAt,
          shake.x,
          shake.y,
        );
      } else {
        hideStars();
      }
      const hasLive = coins.some((coin) => coin.collectedAt == null);
      const spawning = phase === "running" && busyRef.current;

      if (spawning && !reduced && !stunning && !hasLive && now >= nextCoinAt) {
        const x = pickCoinX(track.width, pose.x, obstacle);
        if (x != null) {
          const el = document.createElement("div");
          el.className = "absolute top-0 left-0";
          el.style.width = `${COIN_SIZE}px`;
          el.style.height = `${COIN_SIZE}px`;
          el.style.transform =
            "translate3d(var(--coin-x, -64px), var(--coin-y, -64px), 0)";
          el.style.filter = "drop-shadow(0 1px 0 rgba(0,0,0,0.45))";
          el.innerHTML = COIN_SVG;
          coinLayer.append(el);
          coins.push({
            id: ++coinId,
            x,
            height: COIN_HOVER,
            el,
            collectedAt: null,
          });
        } else {
          nextCoinAt = now + 2000;
        }
      }

      for (const coin of [...coins]) {
        if (
          !stunning &&
          coin.collectedAt == null &&
          coinCollected(pose, coin)
        ) {
          coin.collectedAt = now;
          nextCoinAt = now + nextCoinDelay(false);
        }

        const bob =
          coin.collectedAt == null ? Math.sin(now / 180) * 2 : 0;
        const pop =
          coin.collectedAt == null
            ? 0
            : Math.min(1, (now - coin.collectedAt) / COLLECT_POP_MS);
        coin.el.style.setProperty(
          "--coin-x",
          `${Math.round(track.left + coin.x - COIN_SIZE / 2)}px`,
        );
        coin.el.style.setProperty(
          "--coin-y",
          `${Math.round(track.top - coin.height - COIN_SIZE / 2 - bob - COLLECT_POP_PX * pop)}px`,
        );
        coin.el.style.opacity = String(1 - pop);
        if (pop >= 1) coin.el.remove();
        if (pop >= 1 && jumpHeight(pose.x, null, [coin]) <= 0.5) {
          coins.splice(coins.indexOf(coin), 1);
        }
      }

      placeSprite(
        track.left,
        track.top,
        pose.x,
        pose.y,
        pose.facing,
        shake.x,
        shake.y,
      );
      if (phase === "waiting") showAlert(track.left, track.top, pose.x, pose.y);
      grounded = !pose.airborne;
    };

    apply(last);
    const tick = (now: number) => {
      apply(now);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      clearCoins();
      showLayer(false);
    };
  }, [boxRef]);

  return createPortal(
    <div
      ref={layerRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-40 overflow-visible"
      style={{ visibility: "hidden" }}
    >
      <div ref={coinsRef} className="absolute inset-0" />
      <div
        ref={spriteRef}
        className="absolute top-0 left-0 origin-bottom drop-shadow-[0_1px_0_rgba(0,0,0,0.45)] will-change-transform"
        style={{
          width: RUNNER_SIZE,
          height: RUNNER_SIZE,
          transform:
            "translate3d(var(--runner-x, -64px), var(--runner-y, -64px), 0) scaleX(var(--runner-facing, 1))",
          clipPath: "inset(0 0 var(--runner-clip, 0px) 0)",
        }}
      >
        <ProjectMascot
          project={project}
          name={appearance.name}
          color={appearance.color}
          className="size-4"
          active
        />
      </div>
      <div ref={starsRef} className="absolute inset-0" />
      <div
        ref={alertRef}
        className="absolute top-0 left-0 text-amber-400 drop-shadow-[0_1px_0_rgba(0,0,0,0.45)]"
        style={{
          display: "none",
          width: ALERT_SIZE,
          height: ALERT_SIZE,
          transform:
            "translate3d(var(--alert-x, -64px), var(--alert-y, -64px), 0)",
        }}
      >
        <svg
          viewBox="0 0 8 8"
          width={ALERT_SIZE}
          height={ALERT_SIZE}
          shapeRendering="crispEdges"
          fill="currentColor"
          aria-hidden
        >
          <path d={ALERT_PATH} />
        </svg>
      </div>
    </div>,
    document.body,
  );
}
