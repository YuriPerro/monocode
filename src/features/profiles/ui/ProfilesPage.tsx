import { ask } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ColorPickerPopover,
  ColorSwatchRow,
} from "../../../shared/ui/ColorPickerPopover";
import { Plus, Search, Trash2 } from "../../../shared/ui/icons";
import { normalizeHex } from "../../../shared/lib/colorUtils";
import { TAB_GROUP_COLORS } from "../../workspace/model/tabGroups";
import { AccessPicker } from "../../sessions/ui/AccessPicker";
import { HarnessIcon } from "../../sessions/ui/HarnessIcon";
import { ModelPicker } from "../../sessions/ui/ModelPicker";
import {
  defaultSessionChoice,
  mergeModelSettings,
  resolveModel,
} from "../../sessions/model/models";
import { DEFAULT_RUNTIME_MODE } from "../../sessions/model/session";
import {
  newAgentProfile,
  removeAgentProfile,
  saveAgentProfile,
  type AgentProfile,
} from "../model/profiles";
import { PROFILE_INSTRUCTIONS_MAX } from "../model/sessionProfile";
import { PROFILE_ICONS, profileColorStyle, ProfileGlyph } from "./ProfileGlyph";
import { useAgentProfiles } from "./useAgentProfiles";

const ACTION =
  "inline-flex items-center gap-1.5 rounded-md px-3 text-[12px] disabled:cursor-default disabled:opacity-40";
const ACTION_FILLED = `${ACTION} h-6.5 bg-content font-medium text-background-base hover:bg-content/80`;
const ACTION_OUTLINE = `${ACTION} h-6.5 border border-content/15 text-content/80 hover:border-content/30 hover:bg-content/10 hover:text-content`;

const PALETTE_HEX = TAB_GROUP_COLORS.map((color) => normalizeHex(color));

function blankProfile(cwd: string | undefined): AgentProfile {
  const choice = defaultSessionChoice(cwd);
  const model = resolveModel(choice.harness, choice.model);
  return newAgentProfile({
    harness: model.harness,
    model: model.id,
    modelSettings: mergeModelSettings(model),
    runtimeMode: DEFAULT_RUNTIME_MODE,
  });
}

export function ProfilesPage({ cwd }: { cwd?: string }) {
  const profiles = useAgentProfiles();
  const [selectedId, setSelectedId] = useState<string | null>(
    () => profiles[0]?.id ?? null,
  );
  const [draft, setDraft] = useState<AgentProfile | null>(null);
  const [query, setQuery] = useState("");
  const saved = profiles.find((profile) => profile.id === selectedId) ?? null;
  const editing = draft ?? saved;
  const isNew = !!draft && !profiles.some((profile) => profile.id === draft.id);

  useEffect(() => {
    if (!selectedId && !draft && profiles[0]) setSelectedId(profiles[0].id);
  }, [draft, profiles, selectedId]);

  const needle = query.trim().toLowerCase();
  const listed = useMemo(
    () =>
      profiles.filter(
        (profile) =>
          !needle ||
          profile.name.toLowerCase().includes(needle) ||
          profile.description.toLowerCase().includes(needle),
      ),
    [needle, profiles],
  );

  const select = (id: string) => {
    setDraft(null);
    setSelectedId(id);
  };

  const create = () => {
    const next = blankProfile(cwd);
    setDraft(next);
    setSelectedId(next.id);
  };

  if (!editing && profiles.length === 0)
    return (
      <div className="flex flex-col items-center rounded-xl border border-content/10 bg-content/3 px-6 py-12 text-center">
        <ProfileGlyph
          profile={{ icon: "bot", color: "" }}
          tinted={false}
          className="size-5 text-content/35"
        />
        <p className="mt-3 text-[13px] font-medium text-content">
          No profiles yet
        </p>
        <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-content/50">
          Give a role a name, a model and standing instructions, then start
          sessions as that role from the composer.
        </p>
        <button
          type="button"
          onClick={create}
          className={`mt-4 ${ACTION_OUTLINE}`}
        >
          <Plus className="size-3.5" strokeWidth={1.75} />
          New profile
        </button>
      </div>
    );

  return (
    <div className="flex min-w-0 gap-6">
      <nav aria-label="Profiles" className="w-52 shrink-0">
        <label className="mb-2 flex h-7 items-center gap-1.5 rounded-md border border-content/10 px-2 text-content/40 focus-within:border-content/20">
          <Search className="size-3.5 shrink-0" strokeWidth={1.75} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search profiles"
            aria-label="Search profiles"
            className="min-w-0 flex-1 bg-transparent text-[12px] text-content outline-none placeholder:text-content/40"
          />
        </label>
        {listed.map((profile) => (
          <button
            key={profile.id}
            type="button"
            aria-current={profile.id === selectedId ? "true" : undefined}
            onClick={() => select(profile.id)}
            className={`flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] ${
              profile.id === selectedId
                ? "bg-selection text-content"
                : "text-content/70 hover:bg-content/5 hover:text-content"
            }`}
          >
            <ProfileGlyph profile={profile} />
            <span className="min-w-0 flex-1 truncate">{profile.name}</span>
            <HarnessIcon
              harness={profile.harness}
              className="size-3 shrink-0 opacity-50"
            />
          </button>
        ))}
        {needle && listed.length === 0 ? (
          <p className="px-2 py-1.5 text-[12px] text-content/45">
            No matching profiles
          </p>
        ) : null}
        <button
          type="button"
          onClick={create}
          className={`mt-1 flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] ${
            isNew
              ? "bg-selection text-content"
              : "text-content/50 hover:bg-content/5 hover:text-content"
          }`}
        >
          <Plus className="size-3.5 shrink-0" strokeWidth={1.75} />
          New profile
        </button>
      </nav>
      {editing ? (
        <ProfileEditor
          key={editing.id}
          profile={editing}
          isNew={isNew}
          dirty={!!draft}
          cwd={cwd}
          onChange={setDraft}
          onReset={() => {
            setDraft(null);
            if (isNew) setSelectedId(profiles[0]?.id ?? null);
          }}
          onSaved={(profile) => {
            setDraft(null);
            setSelectedId(profile.id);
          }}
          onDeleted={() => {
            setDraft(null);
            setSelectedId(
              profiles.find((profile) => profile.id !== editing.id)?.id ?? null,
            );
          }}
        />
      ) : null}
    </div>
  );
}

function ProfileEditor({
  profile,
  isNew,
  dirty,
  cwd,
  onChange,
  onReset,
  onSaved,
  onDeleted,
}: {
  profile: AgentProfile;
  isNew: boolean;
  dirty: boolean;
  cwd?: string;
  onChange: (profile: AgentProfile) => void;
  onReset: () => void;
  onSaved: (profile: AgentProfile) => void;
  onDeleted: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const update = <K extends keyof AgentProfile>(
    key: K,
    value: AgentProfile[K],
  ) => {
    setError(null);
    onChange({ ...profile, [key]: value });
  };
  const paletteIndex = profile.color ? PALETTE_HEX.indexOf(profile.color) : 0;
  const customColor = paletteIndex < 0 ? profile.color : null;

  useEffect(() => {
    if (isNew) nameInput.current?.focus();
  }, [isNew]);

  const save = () => {
    try {
      onSaved(saveAgentProfile(profile));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const remove = async () => {
    const confirmed = await ask(
      `Delete “${profile.name}”? Sessions that already started as this profile keep its name and instructions.`,
      {
        title: "Delete profile",
        kind: "warning",
        okLabel: "Delete profile",
        cancelLabel: "Cancel",
      },
    );
    if (!confirmed) return;
    removeAgentProfile(profile.id);
    onDeleted();
  };

  return (
    <form
      className="flex min-w-0 flex-1 flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (dirty) save();
      }}
    >
      <header className="flex items-center gap-3">
        <span
          style={profileColorStyle(profile)}
          className="profile-chip grid size-10 shrink-0 place-items-center rounded-xl"
        >
          <ProfileGlyph profile={profile} tinted={false} className="size-5" />
        </span>
        <input
          ref={nameInput}
          aria-label="Profile name"
          value={profile.name}
          maxLength={40}
          onChange={(event) => update("name", event.target.value)}
          placeholder="Untitled"
          className="min-w-0 flex-1 bg-transparent text-[20px] font-semibold leading-tight text-content outline-none placeholder:text-content/35"
        />
        <div className="flex shrink-0 items-center gap-2">
          {dirty ? (
            <button type="button" onClick={onReset} className={ACTION_OUTLINE}>
              {isNew ? "Cancel" : "Reset"}
            </button>
          ) : null}
          {!isNew ? (
            <button
              type="button"
              title="Delete profile"
              aria-label="Delete profile"
              onClick={() => void remove()}
              className="grid size-7 place-items-center rounded-md text-content/50 hover:bg-red-400/10 hover:text-red-400"
            >
              <Trash2 className="size-3.5" strokeWidth={1.75} />
            </button>
          ) : null}
          <button
            type="submit"
            disabled={!dirty || !profile.name.trim()}
            className={ACTION_FILLED}
          >
            {isNew ? "Create" : "Save"}
          </button>
        </div>
      </header>
      {error ? (
        <p role="alert" className="-mt-3 text-[12px] text-red-400">
          {error}
        </p>
      ) : null}

      <Field label="Icon and color">
        <div
          role="radiogroup"
          aria-label="Icon"
          className="flex flex-wrap gap-1"
        >
          {Object.keys(PROFILE_ICONS).map((icon) => {
            const selected = (profile.icon || "bot") === icon;
            return (
              <button
                key={icon}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={icon}
                title={icon}
                onClick={() => update("icon", icon)}
                className={`grid size-6 place-items-center rounded-md ${
                  selected
                    ? "bg-selection-hover ring-1 ring-content/50"
                    : "hover:bg-content/10"
                }`}
              >
                <ProfileGlyph
                  profile={{ icon, color: selected ? profile.color : "" }}
                />
              </button>
            );
          })}
        </div>
        <div className="mt-3 w-64">
          <ColorSwatchRow
            colors={TAB_GROUP_COLORS}
            colorIndex={paletteIndex < 0 ? null : paletteIndex}
            customColor={customColor}
            customPickerOpen={customOpen}
            onPickIndex={(index) => {
              setCustomOpen(false);
              update("color", index === 0 ? "" : PALETTE_HEX[index]);
            }}
            onToggleCustom={() => setCustomOpen((open) => !open)}
          />
          {customOpen ? (
            <div className="mt-2">
              <ColorPickerPopover
                value={profile.color || PALETTE_HEX[0]}
                onChange={(hex) => update("color", hex)}
              />
            </div>
          ) : null}
        </div>
      </Field>

      <Field
        label="When to use"
        hint="Shown in the profile picker and to agents that start sessions for you."
      >
        <input
          value={profile.description}
          maxLength={240}
          onChange={(event) => update("description", event.target.value)}
          placeholder="Reviews diffs for risks and missing tests"
          className="h-9 w-full rounded-md border border-content/10 bg-content/3 px-3 text-[13px] text-content outline-none placeholder:text-content/35 focus:border-content/20"
        />
      </Field>

      <Field
        label="Instructions"
        hint="Sent as the agent's system prompt when a session starts as this profile. Running sessions keep the instructions they started with."
      >
        <div className="rounded-md border border-content/10 bg-content/3 has-focus:border-content/20">
          <textarea
            value={profile.instructions}
            maxLength={PROFILE_INSTRUCTIONS_MAX}
            onChange={(event) => update("instructions", event.target.value)}
            placeholder="You are the team's reviewer. Look for risks, fragile assumptions and missing tests. Do not edit files unless asked."
            rows={7}
            className="block w-full resize-y bg-transparent px-3 pt-3 pb-2 text-[13px] leading-relaxed text-content outline-none placeholder:text-content/35"
          />
          <div className="flex items-center gap-1 px-2 pb-2">
            <ModelPicker
              harness={profile.harness}
              model={profile.model}
              values={profile.modelSettings}
              project={cwd}
              onChange={(harness, model) => {
                const resolved = resolveModel(harness, model);
                onChange({
                  ...profile,
                  harness: resolved.harness,
                  model: resolved.id,
                  modelSettings: mergeModelSettings(
                    resolved,
                    profile.modelSettings,
                  ),
                });
              }}
              onSettingsChange={(modelSettings) =>
                update("modelSettings", modelSettings)
              }
            />
            {profile.harness !== "fx" ? (
              <AccessPicker
                value={profile.runtimeMode}
                onChange={(runtimeMode) => update("runtimeMode", runtimeMode)}
              />
            ) : null}
          </div>
        </div>
      </Field>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="px-1 text-[12px] font-medium text-content/50">{label}</h2>
      <div className="mt-2.5">{children}</div>
      {hint ? (
        <p className="mt-2 px-1 text-[11px] text-content/35">{hint}</p>
      ) : null}
    </section>
  );
}
