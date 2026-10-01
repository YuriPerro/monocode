import type { SessionProfile } from "../../sessions/model/session";
import { profileColorStyle, ProfileGlyph } from "./ProfileGlyph";

/** The role a session started as, tinted with the profile's color. */
export function ProfileChip({
  profile,
  size = "sm",
  className = "",
}: {
  profile: SessionProfile;
  size?: "sm" | "xs";
  className?: string;
}) {
  return (
    <span
      title={`Started as ${profile.name}`}
      style={profileColorStyle(profile)}
      className={`profile-chip inline-flex min-w-0 shrink-0 items-center gap-1 rounded-md font-medium ${
        size === "sm" ? "h-5 px-1.5 text-[11px]" : "h-4 px-1 text-[10px]"
      } ${className}`}
    >
      <ProfileGlyph
        profile={profile}
        tinted={false}
        className={size === "sm" ? "size-3" : "size-2.5"}
      />
      <span className="min-w-0 truncate">{profile.name}</span>
    </span>
  );
}
