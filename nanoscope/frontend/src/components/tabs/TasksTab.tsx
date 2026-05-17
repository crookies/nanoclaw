import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { QueueResult, QueueMessage } from "@/hooks/useApi";
import { formatDateTime, formatRelative } from "@/lib/time";

function TaskRow({ msg }: { msg: QueueMessage }) {
  const [open, setOpen] = useState(false);
  const recurrenceLabel = msg.recurrence ? `every ${msg.recurrence}` : "one-shot";
  const dueLabel = msg.process_after ? formatDateTime(msg.process_after) : msg.timestamp ? formatDateTime(msg.timestamp) : "—";

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-accent/5 transition-colors"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        <span className="text-sm text-foreground flex-1 truncate">{msg.content_preview ?? msg.kind}</span>
        <span className="text-xs text-muted-foreground">{recurrenceLabel}</span>
        <span className="text-xs text-muted-foreground ml-4">{dueLabel}</span>
        {msg.tries > 0 && (
          <span className="text-xs text-muted-foreground ml-2">{msg.tries} tries</span>
        )}
      </button>
      {open && (
        <div className="px-4 py-3 border-t border-border bg-muted/10">
          <pre className="text-xs font-mono whitespace-pre-wrap break-all text-foreground">
            {JSON.stringify(msg.content, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export function TasksTab({ data }: { data: QueueResult | undefined }) {
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const tasks = data.messages.filter((m) => m.kind === "task");
  const now = Date.now();

  const upcoming = tasks.filter(
    (m) => m.status === "pending" && m.process_after && new Date(m.process_after).getTime() > now,
  );
  const active = tasks.filter(
    (m) =>
      m.status === "processing" ||
      (m.status === "pending" && (!m.process_after || new Date(m.process_after).getTime() <= now)),
  );
  const failed = tasks.filter((m) => m.status === "failed");

  if (tasks.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No scheduled tasks.</p>;
  }

  return (
    <div className="space-y-6">
      {upcoming.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Upcoming</h3>
          <div className="space-y-2">{upcoming.map((m) => <TaskRow key={m.id} msg={m} />)}</div>
        </section>
      )}
      {active.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-secondary uppercase tracking-wide mb-2">Active / Processing</h3>
          <div className="space-y-2">{active.map((m) => <TaskRow key={m.id} msg={m} />)}</div>
        </section>
      )}
      {failed.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-destructive uppercase tracking-wide mb-2">Failed</h3>
          <div className="space-y-2">{failed.map((m) => <TaskRow key={m.id} msg={m} />)}</div>
        </section>
      )}
    </div>
  );
}
