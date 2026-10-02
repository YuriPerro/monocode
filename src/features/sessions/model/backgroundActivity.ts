import type { Session } from "./session";

type BackgroundState = Pick<
  Session,
  "backgroundTasks" | "backgroundAgents" | "waitingOnBackground"
>;

/** How many background processes and subagents a session has running. */
export function backgroundActivityCount(session: BackgroundState): number {
  return (
    (session.backgroundTasks?.length ?? 0) +
    (session.backgroundAgents?.length ?? 0)
  );
}

/**
 * What a yielded turn is waiting on, for its status line. Undefined while the
 * agent is still at work.
 */
export function backgroundWaitDescriptions(
  session: BackgroundState,
): string[] | undefined {
  if (!session.waitingOnBackground) return undefined;
  const descriptions = [
    ...(session.backgroundTasks ?? []),
    ...(session.backgroundAgents ?? []),
  ].map((item) => item.description);
  return descriptions.length > 0 ? descriptions : undefined;
}
