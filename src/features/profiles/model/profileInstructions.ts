import type { Session } from "../../sessions/model/session";

type ProfileSource = Pick<Session, "profile" | "profileInstructions">;

/** Instructions for harnesses that put them in the provider's system prompt. */
export function nativeProfileInstructions(
  session: ProfileSource,
  native: boolean,
): { instructions?: string } {
  return native && session.profile && session.profileInstructions
    ? { instructions: session.profileInstructions }
    : {};
}

/**
 * Harnesses without a system prompt hook receive the profile as a preamble on
 * the first turn of each provider conversation, which then stays in history.
 */
export function withProfilePreamble(
  text: string,
  session: ProfileSource,
  options: { native: boolean; freshConversation: boolean },
): string {
  if (
    options.native ||
    !options.freshConversation ||
    !session.profile ||
    !session.profileInstructions
  )
    return text;
  return `<monocode_profile name="${session.profile.name.replace(/"/g, "'")}">\n${session.profileInstructions}\n</monocode_profile>\n\n${text}`;
}

/** True before the session's first submitted user turn. */
export function beforeFirstUserTurn(session: Pick<Session, "blocks">): boolean {
  return !session.blocks.some(
    (block) => block.role === "user" && !block.draft && !block.internal,
  );
}
