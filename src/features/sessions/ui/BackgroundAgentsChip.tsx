import { useRef, useState } from "react";
import type { BackgroundAgent } from "../model/session";
import { formatElapsed, useElapsedFrom } from "../hooks/useElapsedFrom";
import { formatTokens } from "../model/contextUsage";
import { Popover } from "../../../shared/ui/Popover";
import { TerminalSpinner } from "./TerminalSpinner";

const MENU_WIDTH = 288;

/**
 * How many subagents are running in the background, beside the composer's
 * mode picker. Opens to what each one is doing, how long it has run and what
 * it has used so far.
 */
export function BackgroundAgentsChip({
  agents,
}: {
  agents: BackgroundAgent[];
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const label = agents.length === 1 ? "1 agent" : `${agents.length} agents`;

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        title="Subagents running in the background"
        aria-label={`${label} running in the background`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((value) => !value)}
        className={`flex h-6.5 items-center gap-1 rounded-md px-1.5 ${
          open
            ? "bg-selection text-content"
            : "text-content/70 hover:bg-selection-hover hover:text-content"
        }`}
      >
        <TerminalSpinner className="inline-block w-3 select-none text-center text-[11px] leading-none text-accent" />
        <span className="whitespace-nowrap text-[11px]">{label}</span>
      </button>
      {open ? (
        <Popover
          anchor={root}
          side="top"
          align="start"
          width={MENU_WIDTH}
          onDismiss={() => setOpen(false)}
          aria-label="Background agents"
          data-background-agents
          className="p-1.5"
        >
          <p className="px-2 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-wide text-content/40">
            Running in background
          </p>
          <ul>
            {agents.map((agent) => (
              <BackgroundAgentRow key={agent.id} agent={agent} />
            ))}
          </ul>
        </Popover>
      ) : null}
    </div>
  );
}

function BackgroundAgentRow({ agent }: { agent: BackgroundAgent }) {
  const elapsed = formatElapsed(useElapsedFrom(agent.startedAt, false));
  const kind = agent.model ?? agent.subagentType;
  const usage = [
    elapsed,
    agent.tokens !== undefined ? `${formatTokens(agent.tokens)} tokens` : null,
    agent.toolUses !== undefined
      ? `${agent.toolUses} tool ${agent.toolUses === 1 ? "call" : "calls"}`
      : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
  const meta = kind ? `${kind} · ${usage}` : usage;
  return (
    <li className="rounded-lg px-2 py-2">
      <span
        className="block truncate text-[13px] text-content"
        title={agent.description}
      >
        {agent.description}
      </span>
      <span
        className="flex min-w-0 text-[11px] leading-4 tabular-nums text-content/45"
        title={meta}
      >
        {kind ? <span className="truncate">{kind}</span> : null}
        <span className="shrink-0 whitespace-pre">
          {kind ? ` · ${usage}` : usage}
        </span>
      </span>
      {agent.activity ? (
        <span
          className="block truncate text-[11px] leading-4 text-content/45"
          title={agent.activity}
        >
          {agent.activity}
        </span>
      ) : null}
    </li>
  );
}
