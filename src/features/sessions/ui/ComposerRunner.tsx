import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";
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
  STAR_COUNT,
  STAR_EDGE_PATH,
  STAR_FACE_PATH,
  STAR_SIZE,
  ZZZ_GLYPHS,
  ZZZ_Y,
  coinCollected,
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
  rectWithin,
  scaleTrackX,
  sleepAlong,
  stepAlong,
  stepHome,
  runnerTrack,
  stunDone,
  stunShake,
  stunStars,
  zzzLeft,
  QUIET_RUNNER_SIGNAL,
  type Coin,
  type Obstacle,
  type Rect,
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
};

type LiveCoin = Coin & {
  el: HTMLDivElement;
  collectedAt: number | null;
};

const COIN_SVG = `<svg viewBox="0 0 8 8" width="${COIN_SIZE}" height="${COIN_SIZE}" shape-rendering="crispEdges" fill="#e8b923" aria-hidden="true"><path class="composer-coin-face" d="${COIN_FACE_PATH}"/><path class="composer-coin-edge" d="${COIN_EDGE_PATH}"/></svg>`;
const STAR_SVG = `<svg viewBox="0 0 8 8" width="${STAR_SIZE}" height="${STAR_SIZE}" shape-rendering="crispEdges" fill="#f4e27a" aria-hidden="true"><path class="composer-coin-face" d="${STAR_FACE_PATH}"/><path class="composer-coin-edge" d="${STAR_EDGE_PATH}"/></svg>`;
const GEOMETRY_SAMPLE_MS = 100;

/**
 * Project pixel mascot on the composer's top ledge. Between turns it sleeps in
 * a corner on CSS animation alone; the frame loop runs only while it is awake.
 * It is drawn inside the composer and placed from its own layer's corner, so
 * whatever moves the composer without resizing it (a panel slide, the dock
 * motion, a scroll) carries the mascot along.
 */
export function ComposerRunner({
  boxRef,
  cwd,
  busy,
  signal = QUIET_RUNNER_SIGNAL,
}: Props) {
  const layerRef = useRef<HTMLDivElement>(null);
  const spriteRef = useRef<HTMLDivElement>(null);
  const coinsRef = useRef<HTMLDivElement>(null);
  const starsRef = useRef<HTMLDivElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const zzzRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(busy);
  const signalRef = useRef(signal);
  const wakeRef = useRef(() => {});
  busyRef.current = busy;
  signalRef.current = signal;

  const project = projectName(cwd);
  const key = projectKey(cwd);
  // Mascot and color picks fire no change event; re-read them as each turn
  // starts and ends, since the sleeping mascot outlives a single turn.
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
  }, [key, project, busy]);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    const sprite = spriteRef.current;
    const coinLayer = coinsRef.current;
    const starLayer = starsRef.current;
    const alert = alertRef.current;
    const zzz = zzzRef.current;
    if (!layer || !sprite || !coinLayer || !starLayer || !alert || !zzz) {
      return;
    }

    let along = 0;
    let facing: 1 | -1 = 1;
    let prevWidth = 0;
    let last = performance.now();
    let raf = 0;
    let coinId = 0;
    let nextCoinAt = 0;
    let phase: RunnerPhase = "asleep";
    let phaseAt = last;
    let grounded = true;
    let atHome = true;
    let stunning = false;
    let stunAt = 0;
    let hitAlong = 0;
    let hitFacing: 1 | -1 = 1;
    let geometryAt = -Infinity;
    let geometryBox: HTMLElement | null = null;
    let cachedTrack: RunnerTrack | null = null;
    let cachedObstacle: Obstacle | null = null;
    let cachedAction: Rect | null = null;
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
      el.style.display = "none";
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
    };

    // Hidden stars leave the layout entirely so their blinking frames stop
    // animating while the mascot sleeps.
    const hideStars = () => {
      for (const el of starEls) el.style.display = "none";
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
          el.style.display = "none";
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
        el.style.display = "";
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

    const measure = (now: number, force: boolean): RunnerTrack | null => {
      const box = boxRef.current;
      if (!box) {
        showLayer(false);
        return null;
      }

      // Reading layout every animation frame forces WebKit to flush changes
      // when a new transcript block arrives. The runner can animate from the
      // last measured track while geometry is refreshed at a lower rate.
      if (
        force ||
        box !== geometryBox ||
        now - geometryAt >= GEOMETRY_SAMPLE_MS
      ) {
        const shell = box.closest("[data-composer]");
        const review = shell?.querySelector("[data-session-review]");
        const queue = shell?.querySelector("[data-message-queue-card]");
        const ledge = review ?? queue;
        const origin = layer.getBoundingClientRect();
        const within = (el: Element | null | undefined) =>
          el ? rectWithin(el.getBoundingClientRect(), origin) : null;
        cachedTrack = runnerTrack(
          rectWithin(box.getBoundingClientRect(), origin),
          within(ledge),
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
          within(button),
        );
        cachedAction = within(box.querySelector("[data-composer-action]"));
        geometryBox = box;
        geometryAt = now;
      }
      const track = cachedTrack;
      if (!track || track.width <= 0) {
        showLayer(false);
        return null;
      }
      showLayer(true);

      if (prevWidth > 0 && prevWidth !== track.width) {
        const prevInset = Math.max(0, prevWidth - RUNNER_INSET * 2);
        const insetTrack = Math.max(0, track.width - RUNNER_INSET * 2);
        along = scaleTrackX(along, prevInset, insetTrack);
        hitAlong = scaleTrackX(hitAlong, prevInset, insetTrack);
        for (const coin of coins) {
          coin.x = scaleTrackX(coin.x, prevWidth, track.width);
        }
      }
      prevWidth = track.width;
      return track;
    };

    const placeAsleep = (track: RunnerTrack) => {
      along = sleepAlong(track, cachedObstacle, cachedAction);
      const x = poseAt(along, facing, track.width, null).x;
      placeSprite(track.left, track.top, x, 0, facing);
      zzz.style.setProperty(
        "--zzz-x",
        `${Math.round(track.left + zzzLeft(x, track.width))}px`,
      );
      zzz.style.setProperty(
        "--zzz-y",
        `${Math.round(track.top - RUNNER_SIZE + 1 + ZZZ_Y)}px`,
      );
    };

    const fallAsleep = (track: RunnerTrack | null) => {
      clearCoins();
      endStun();
      hideAlert();
      sprite.classList.add("mascot-asleep");
      zzz.style.display = "";
      if (track) placeAsleep(track);
    };

    const enter = (next: RunnerPhase, now: number) => {
      const live =
        phase === "waking" || phase === "running" || phase === "waiting";
      if (phase === "dizzy") endStun();
      if (phase === "asleep") {
        sprite.classList.remove("mascot-asleep");
        zzz.style.display = "none";
      }
      if (next === "waking" || (next === "running" && !live)) {
        // A new turn: bonk the chevron afresh and give the first coin a beat.
        learned = reduced;
        nextCoinAt = now + nextCoinDelay(true);
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

    /** One frame. Returns false once the mascot is asleep and the loop can stop. */
    const apply = (now: number): boolean => {
      const dt = Math.min(now - last, 48);
      last = now;

      if (document.hidden) {
        showLayer(false);
        return true;
      }
      const track = measure(now, false);
      if (!track) return true;
      const insetTrack = Math.max(0, track.width - RUNNER_INSET * 2);
      const obstacle = cachedObstacle;

      const signal = signalRef.current;
      const elapsed = now - phaseAt;
      const next = nextRunnerPhase(phase, {
        busy: busyRef.current,
        needsInput: signal.needsInput,
        outcome: signal.outcome,
        settled:
          phase === "running"
            ? grounded && !stunning
            : phase === "waking" || phase === "cheering"
              ? reduced || hopDone(elapsed)
              : phase === "dizzy"
                ? reduced || stunDone(elapsed)
                : phase === "returning"
                  ? atHome
                  : true,
      });
      if (next !== phase) enter(next, now);
      if (phase === "asleep") {
        fallAsleep(track);
        return false;
      }

      if (phase !== "waiting") hideAlert();
      const at = now - phaseAt;
      if (phase === "returning") {
        fadeCoins(now);
        const home = sleepAlong(track, obstacle, cachedAction);
        const stepped = reduced
          ? { along: home, facing, home: true }
          : stepHome(along, facing, home, dt, insetTrack);
        along = stepped.along;
        facing = stepped.facing;
        atHome = stepped.home;
        // Hop the chevron on the way home rather than bonking it again.
        const pose = poseAt(along, facing, track.width, obstacle);
        placeSprite(track.left, track.top, pose.x, pose.y, pose.facing);
        return true;
      }
      if (phase === "waking" || phase === "cheering" || phase === "dizzy") {
        fadeCoins(now);
        const x = poseAt(along, facing, track.width, null).x;
        if (phase === "dizzy") {
          const shake = reduced ? { x: 0, y: 0 } : stunShake(at);
          placeSprite(track.left, track.top, x, 0, facing, shake.x, shake.y);
          if (!reduced) {
            placeStars(track.left, track.top, x, 0, at, shake.x, shake.y);
          }
          return true;
        }
        placeSprite(track.left, track.top, x, reduced ? 0 : hopY(at), facing);
        return true;
      }

      if (phase === "running" && !reduced && !stunning) {
        const stepped = stepAlong(along, facing, dt, insetTrack);
        along = stepped.along;
        facing = stepped.facing;
      }

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
      return true;
    };

    fallAsleep(measure(last, false));

    // While asleep there is no frame loop, so layout changes that move the
    // ledge (typing a new line, a split pane resizing) re-place the mascot.
    const observer = new ResizeObserver(() => {
      if (phase !== "asleep") return;
      const track = measure(performance.now(), true);
      if (track) placeAsleep(track);
    });
    const box = boxRef.current;
    for (const el of [
      box,
      box?.closest("[data-composer]"),
      box?.closest("[data-session-drop]"),
    ]) {
      if (el) observer.observe(el);
    }

    const tick = (now: number) => {
      raf = apply(now) ? requestAnimationFrame(tick) : 0;
    };
    wakeRef.current = () => {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    return () => {
      wakeRef.current = () => {};
      observer.disconnect();
      cancelAnimationFrame(raf);
      clearCoins();
      for (const el of starEls) el.remove();
      showLayer(false);
    };
  }, [boxRef]);

  useLayoutEffect(() => {
    if (busy) wakeRef.current();
  }, [busy]);

  return (
    <div
      ref={layerRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-40 overflow-visible"
      style={{ visibility: "hidden" }}
    >
      <div ref={coinsRef} className="absolute inset-0" />
      <div
        ref={zzzRef}
        className="composer-zzz absolute top-0 left-0 text-content/50"
        style={{
          display: "none",
          transform: "translate3d(var(--zzz-x, -64px), var(--zzz-y, -64px), 0)",
        }}
      >
        {ZZZ_GLYPHS.map((glyph, index) => (
          <svg
            key={index}
            viewBox={`0 0 ${glyph.size} ${glyph.size}`}
            width={glyph.size}
            height={glyph.size}
            shapeRendering="crispEdges"
            fill="currentColor"
            aria-hidden
          >
            <path d={glyph.path} />
          </svg>
        ))}
      </div>
      <div
        ref={spriteRef}
        className="absolute top-0 left-0 origin-bottom drop-shadow-[0_1px_0_rgba(0,0,0,0.45)] will-change-transform"
        style={{
          width: RUNNER_SIZE,
          height: RUNNER_SIZE,
          transform:
            "translate3d(var(--runner-x, -64px), var(--runner-y, -64px), 0) scaleX(var(--runner-facing, 1))",
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
    </div>
  );
}
