import {
  BookOpen,
  Bot,
  Brain,
  Bug,
  Code,
  Compass,
  Database,
  Eye,
  Layers,
  Palette,
  PenLine,
  Rocket,
  Search,
  Server,
  Shield,
  Sparkles,
  Target,
  TestTube,
} from "../../../shared/ui/icons";
import type { CSSProperties } from "react";
import type { SessionProfile } from "../../sessions/model/session";
import { TAB_GROUP_COLORS } from "../../workspace/model/tabGroups";

export const PROFILE_ICONS = {
  bot: Bot,
  palette: Palette,
  compass: Compass,
  layers: Layers,
  eye: Eye,
  code: Code,
  server: Server,
  database: Database,
  bug: Bug,
  "test-tube": TestTube,
  book: BookOpen,
  rocket: Rocket,
  brain: Brain,
  shield: Shield,
  target: Target,
  sparkles: Sparkles,
  pen: PenLine,
  search: Search,
} as const;

export type ProfileIconId = keyof typeof PROFILE_ICONS;

export function profileIcon(id: string) {
  return PROFILE_ICONS[id as ProfileIconId] ?? Bot;
}

/** A profile without a chosen color uses the palette's neutral entry. */
export function profileColor(profile: Pick<SessionProfile, "color">): string {
  return profile.color || TAB_GROUP_COLORS[0];
}

export function profileColorStyle(
  profile: Pick<SessionProfile, "color">,
): CSSProperties {
  return { "--profile-color": profileColor(profile) } as CSSProperties;
}

export function ProfileGlyph({
  profile,
  className = "size-3.5",
  tinted = true,
}: {
  profile: Pick<SessionProfile, "icon" | "color">;
  className?: string;
  /** Off when the surrounding chip already sets the ink. */
  tinted?: boolean;
}) {
  const Icon = profileIcon(profile.icon);
  const colored = tinted && !!profile.color;
  return (
    <Icon
      aria-hidden
      strokeWidth={1.75}
      className={`shrink-0 ${tinted && !colored ? "text-content/60" : ""} ${className}`}
      style={colored ? { color: profile.color } : undefined}
    />
  );
}
