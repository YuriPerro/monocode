import { useRef, useState } from "react";
import { Check, ChevronDown, UserCircle } from "../../../shared/ui/icons";
import { Popover } from "../../../shared/ui/Popover";
import type { ProviderAccount } from "../../providers/model/providerAccounts";

const MENU_WIDTH = 240;

/** Pin a profile to one provider account, or let it follow the project. */
export function ProfileAccountPicker({
  accounts,
  value,
  onChange,
}: {
  accounts: ProviderAccount[];
  value?: string;
  onChange: (accountId: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const selected = accounts.find((account) => account.id === value);
  const options: { id?: string; label: string; hint?: string }[] = [
    {
      label: "Project account",
      hint: "Follows the account picked for the project",
    },
    ...accounts.map((account) => ({ id: account.id, label: account.label })),
  ];

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        title={
          selected
            ? `Always uses ${selected.label}`
            : "Uses the project's account"
        }
        aria-label={`Account: ${selected?.label ?? "Project account"}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((next) => !next)}
        className="flex h-6.5 max-w-44 items-center gap-1 rounded-md bg-selection px-1.5 text-content hover:bg-selection-hover"
      >
        <UserCircle
          className="size-3.5 shrink-0 text-content/70"
          strokeWidth={1.75}
        />
        <span className="min-w-0 truncate text-[11px]">
          {selected?.label ?? "Project account"}
        </span>
        <ChevronDown
          strokeWidth={1.75}
          className={`size-3 shrink-0 text-content/50 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <Popover
          anchor={root}
          side="top"
          width={MENU_WIDTH}
          autoFocus
          onDismiss={() => setOpen(false)}
          role="listbox"
          aria-label="Account"
          tabIndex={-1}
          className="p-1"
        >
          {options.map((option) => {
            const active = option.id === value;
            return (
              <button
                key={option.id ?? "project"}
                type="button"
                role="option"
                aria-selected={active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left ${
                  active
                    ? "bg-selection text-content"
                    : "text-content hover:bg-content/5"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] leading-5">
                    {option.label}
                  </span>
                  {option.hint ? (
                    <span className="block truncate text-[11px] leading-4 text-content/50">
                      {option.hint}
                    </span>
                  ) : null}
                </span>
                {active ? (
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
