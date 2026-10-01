import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  Check,
  ChevronDown,
  SlidersHorizontal,
  X,
} from "../../../shared/ui/icons";
import { Popover } from "../../../shared/ui/Popover";
import { HarnessIcon } from "../../sessions/ui/HarnessIcon";
import { resolveModel } from "../../sessions/model/models";
import type { SessionProfile } from "../../sessions/model/session";
import type { AgentProfile } from "../model/profiles";
import { profileColorStyle, ProfileGlyph } from "./ProfileGlyph";

const MENU_WIDTH = 300;

type Row =
  | { kind: "profile"; profile: AgentProfile }
  | { kind: "none" }
  | { kind: "manage" };

/**
 * Choose the role a new session starts as. Once the first turn is sent the
 * role is part of the conversation, so the chip stays as a read-only label.
 */
export function ProfilePicker({
  value,
  profiles,
  locked,
  onChange,
  onManage,
  onClose,
}: {
  value?: SessionProfile;
  profiles: AgentProfile[];
  locked: boolean;
  onChange: (profileId: string | null) => void;
  onManage: () => void;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rows: Row[] = [
    ...profiles.map((profile) => ({ kind: "profile" as const, profile })),
    ...(value ? [{ kind: "none" as const }] : []),
    { kind: "manage" },
  ];
  const selectedIndex = Math.max(
    0,
    rows.findIndex(
      (row) => row.kind === "profile" && row.profile.id === value?.id,
    ),
  );
  const [active, setActive] = useState(selectedIndex);
  const root = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (open) setActive(selectedIndex);
  }, [open, selectedIndex]);

  if (locked)
    return value ? (
      <span
        title={`Started as ${value.name}`}
        style={profileColorStyle(value)}
        className="profile-chip flex h-6.5 max-w-40 items-center gap-1 rounded-md px-1.5 font-medium"
      >
        <ProfileGlyph profile={value} tinted={false} />
        <span className="min-w-0 truncate text-[11px]">{value.name}</span>
      </span>
    ) : null;
  if (!value && profiles.length === 0) return null;

  const dismiss = (restore: boolean) => {
    setOpen(false);
    if (restore) onCloseRef.current?.();
  };

  const pick = (row: Row) => {
    if (row.kind === "manage") {
      dismiss(false);
      onManage();
      return;
    }
    onChange(row.kind === "profile" ? row.profile.id : null);
    dismiss(true);
  };

  const onMenuKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(rows.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const row = rows[active];
      if (row) pick(row);
    }
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        data-profile-picker-trigger
        title={value ? `Starts as ${value.name}` : "Start as a profile"}
        aria-label={value ? `Profile: ${value.name}` : "Profile"}
        aria-expanded={open}
        aria-haspopup="listbox"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => (open ? dismiss(true) : setOpen(true))}
        style={value ? profileColorStyle(value) : undefined}
        className={`flex h-6.5 max-w-40 items-center gap-1 rounded-md px-1.5 ${
          value
            ? "profile-chip font-medium"
            : open
              ? "bg-selection text-content"
              : "text-content/55 hover:bg-selection hover:text-content"
        }`}
      >
        <ProfileGlyph
          profile={value ?? { icon: "bot", color: "" }}
          tinted={!value}
        />
        <span className="min-w-0 truncate text-[11px]">
          {value ? value.name : "Profile"}
        </span>
        <ChevronDown
          strokeWidth={1.75}
          className={`size-3 shrink-0 ${value ? "opacity-60" : "text-content/40"} ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <Popover
          anchor={root}
          side="top"
          width={MENU_WIDTH}
          autoFocus
          onDismiss={(reason) => dismiss(reason === "escape")}
          role="listbox"
          aria-label="Profile"
          data-profile-picker
          tabIndex={-1}
          onKeyDown={onMenuKey}
          className="p-1"
        >
          {profiles.length ? (
            <div className="px-2 pt-1.5 pb-1 text-[10px] font-medium uppercase tracking-wide text-content/40">
              Start as
            </div>
          ) : null}
          {rows.map((row, index) => {
            const highlighted = index === active;
            if (row.kind !== "profile")
              return (
                <div key={row.kind}>
                  {row.kind === "none" || index === profiles.length ? (
                    <div className="my-1 h-px bg-content/7" />
                  ) : null}
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => pick(row)}
                    className={`flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] ${
                      highlighted
                        ? "bg-selection text-content"
                        : "text-content/70 hover:bg-content/5"
                    }`}
                  >
                    {row.kind === "none" ? (
                      <X className="size-3.5 shrink-0" strokeWidth={1.75} />
                    ) : (
                      <SlidersHorizontal
                        className="size-3.5 shrink-0"
                        strokeWidth={1.75}
                      />
                    )}
                    {row.kind === "none" ? "No profile" : "Manage profiles…"}
                  </button>
                </div>
              );
            const { profile } = row;
            const selected = profile.id === value?.id;
            return (
              <button
                key={profile.id}
                type="button"
                role="option"
                aria-selected={selected}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(row)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left ${
                  highlighted || selected
                    ? "bg-selection text-content"
                    : "text-content hover:bg-content/5"
                }`}
              >
                <ProfileGlyph profile={profile} className="size-4" />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-[13px] leading-5">
                      {profile.name}
                    </span>
                    <HarnessIcon
                      harness={profile.harness}
                      className="size-3 shrink-0 opacity-70"
                    />
                    <span className="truncate text-[11px] text-content/40">
                      {resolveModel(profile.harness, profile.model).name}
                    </span>
                  </span>
                  {profile.description ? (
                    <span className="block truncate text-[11px] leading-4 text-content/50">
                      {profile.description}
                    </span>
                  ) : null}
                </span>
                {selected ? (
                  <Check
                    className="size-3.5 shrink-0 text-content/50"
                    strokeWidth={1.75}
                  />
                ) : null}
              </button>
            );
          })}
        </Popover>
      ) : null}
    </div>
  );
}
