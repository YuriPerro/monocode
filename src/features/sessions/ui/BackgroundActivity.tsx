import { useRef, useState, type ReactNode } from "react";
import type {
  BackgroundAgent,
  BackgroundTask,
  BackgroundTaskKind,
} from "../model/session";
import { formatElapsed, useElapsedFrom } from "../hooks/useElapsedFrom";
import { formatTokens } from "../model/contextUsage";
import { Popover, type PopoverDismissReason } from "../../../shared/ui/Popover";
import {
  Bot,
  Eye,
  Terminal,
  Zap,
  type IconComponent,
} from "../../../shared/ui/icons";
import { TerminalSpinner } from "./TerminalSpinner";

const MENU_WIDTH = 288;

const TASK_ICON: Record<BackgroundTaskKind, IconComponent> = {
  shell: Terminal,
  monitor: Eye,
  other: Zap,
};

const TASK_LABEL: Record<BackgroundTaskKind, string> = {
  shell: "Shell",
  monitor: "Monitor",
  other: "Task",
};

const TRIGGER = {
  header:
    "flex h-5 shrink-0 items-center gap-1 rounded px-1 text-[11px] tabular-nums",
  floating:
    "pointer-events-auto flex h-6 items-center gap-1 rounded-md border border-content/15 px-1.5 text-[11px] tabular-nums text-content shadow-md backdrop-blur-md",
} as const;

const TRIGGER_STATE = {
  header: {
    open: "bg-content/10 text-content",
    closed: "text-content/50 hover:bg-content/10 hover:text-content",
  },
  floating: {
    open: "bg-content/5",
    closed: "bg-content/10 hover:bg-content/5",
  },
} as const;

/**
 * What a session has running in the background: subagents it sent off and
 * processes it left going. Render it only while there is at least one.
 * `header` sits in a split pane's header; `floating` overlays a lone pane.
 */
export function BackgroundActivity({
  agents = [],
  tasks = [],
  variant,
}: {
  agents?: BackgroundAgent[];
  tasks?: BackgroundTask[];
  variant: "header" | "floating";
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const count = agents.length + tasks.length;
  const label =
    count === 1
      ? "1 item running in the background"
      : `${count} items running in the background`;

  const dismiss = (reason: PopoverDismissReason) => {
    setOpen(false);
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (reason === "escape" || !active || active === document.body) {
        trigger.current?.focus();
      }
    });
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        title="Running in background"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-no-drag
        data-background-activity
        onClick={() => setOpen((value) => !value)}
        className={`${TRIGGER[variant]} ${
          TRIGGER_STATE[variant][open ? "open" : "closed"]
        }`}
      >
        <TerminalSpinner className="inline-block w-3 select-none text-center text-[11px] leading-none text-accent" />
        <span>{count}</span>
      </button>
      {open ? (
        <Popover
          anchor={trigger}
          side="bottom"
          align="end"
          width={MENU_WIDTH}
          autoFocus
          onDismiss={dismiss}
          role="dialog"
          aria-label="Running in background"
          tabIndex={-1}
          data-background-activity-panel
          className="p-1.5"
        >
          {agents.length > 0 ? (
            <Section title="Subagents">
              {agents.map((agent) => (
                <AgentRow key={agent.id} agent={agent} />
              ))}
            </Section>
          ) : null}
          {tasks.length > 0 ? (
            <Section title="Processes">
              {tasks.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </Section>
          ) : null}
        </Popover>
      ) : null}
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <p className="px-2 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-wide text-content/40">
        {title}
      </p>
      <ul>{children}</ul>
    </section>
  );
}

function Row({
  icon: Icon,
  description,
  meta,
  metaLead,
  activity,
}: {
  icon: IconComponent;
  description: string;
  meta: string;
  metaLead?: string;
  activity?: string;
}) {
  return (
    <li className="flex gap-2 rounded-lg px-2 py-2">
      <Icon
        className="mt-0.5 size-3.5 shrink-0 text-content/45"
        strokeWidth={1.75}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span
          className="block truncate text-[13px] text-content"
          title={description}
        >
          {description}
        </span>
        <span
          className="flex min-w-0 text-[11px] leading-4 tabular-nums text-content/45"
          title={metaLead ? `${metaLead} · ${meta}` : meta}
        >
          {metaLead ? <span className="truncate">{metaLead}</span> : null}
          <span className="shrink-0 whitespace-pre">
            {metaLead ? ` · ${meta}` : meta}
          </span>
        </span>
        {activity ? (
          <span
            className="block truncate text-[11px] leading-4 text-content/45"
            title={activity}
          >
            {activity}
          </span>
        ) : null}
      </span>
    </li>
  );
}

function AgentRow({ agent }: { agent: BackgroundAgent }) {
  const elapsed = formatElapsed(useElapsedFrom(agent.startedAt, false));
  const usage = [
    elapsed,
    agent.tokens !== undefined ? `${formatTokens(agent.tokens)} tokens` : null,
    agent.toolUses !== undefined
      ? `${agent.toolUses} tool ${agent.toolUses === 1 ? "call" : "calls"}`
      : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
  return (
    <Row
      icon={Bot}
      description={agent.description}
      metaLead={agent.model ?? agent.subagentType}
      meta={usage}
      activity={agent.activity}
    />
  );
}

function TaskRow({ task }: { task: BackgroundTask }) {
  const elapsed = formatElapsed(useElapsedFrom(task.startedAt, false)) ?? "";
  return (
    <Row
      icon={TASK_ICON[task.kind]}
      description={task.description}
      metaLead={TASK_LABEL[task.kind]}
      meta={elapsed}
    />
  );
}
