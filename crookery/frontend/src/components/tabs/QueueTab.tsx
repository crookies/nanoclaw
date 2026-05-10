import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import type { QueueResult, QueueMessage } from "@/hooks/useApi";
import { cn } from "@/lib/utils";
import { formatDateTime, formatRelative } from "@/lib/time";

const STATUS_COLOR: Record<string, string> = {
  processing: "text-secondary",
  pending: "text-muted-foreground",
  completed: "text-green-400",
  failed: "text-destructive",
};

function MessageRow({ msg }: { msg: QueueMessage }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr
        onClick={() => setOpen((o) => !o)}
        className="cursor-pointer hover:bg-accent/5 transition-colors border-t border-border"
      >
        <td className="px-4 py-2.5">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {msg.seq}
          </span>
        </td>
        <td className="px-4 py-2.5 text-xs text-foreground">{msg.kind}</td>
        <td className="px-4 py-2.5">
          <span className={cn("text-xs font-medium", STATUS_COLOR[msg.status] ?? "text-muted-foreground")}>
            {msg.status}
          </span>
        </td>
        <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">
          {msg.timestamp ? formatDateTime(msg.timestamp) : msg.process_after ? `after ${formatDateTime(msg.process_after)}` : "—"}
        </td>
        <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">{msg.tries}</td>
        <td className="px-4 py-2.5 text-xs text-muted-foreground truncate max-w-xs">
          {msg.content_preview ?? "—"}
        </td>
      </tr>
      {open && (
        <tr className="border-t border-border">
          <td colSpan={6} className="px-4 py-3 bg-muted/10">
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs mb-2">
              {msg.platform_id && <div><span className="text-muted-foreground">Platform: </span>{msg.platform_id}</div>}
              {msg.channel_type && <div><span className="text-muted-foreground">Channel: </span>{msg.channel_type}</div>}
              {msg.thread_id && <div><span className="text-muted-foreground">Thread: </span>{msg.thread_id}</div>}
              {msg.process_after && <div><span className="text-muted-foreground">Process after: </span>{formatDateTime(msg.process_after)}</div>}
              {msg.recurrence && <div><span className="text-muted-foreground">Recurrence: </span>{msg.recurrence}</div>}
            </div>
            <pre className="text-xs font-mono whitespace-pre-wrap break-all text-foreground bg-background/50 rounded p-2 border border-border">
              {JSON.stringify(msg.content, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}

export function QueueTab({ data }: { data: QueueResult | undefined }) {
  if (!data) return <p className="text-sm text-muted-foreground">Chargement…</p>;

  const { summary, messages, blockages } = data;
  const totalBlockages = blockages.approvals.length + blockages.questions.length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex gap-6 text-sm">
        <span><span className="font-medium text-green-400">{summary.completed}</span> <span className="text-muted-foreground">completed</span></span>
        <span><span className="font-medium text-muted-foreground">{summary.pending}</span> <span className="text-muted-foreground">pending</span></span>
        <span><span className="font-medium text-secondary">{summary.processing}</span> <span className="text-muted-foreground">processing</span></span>
        <span><span className="font-medium text-destructive">{summary.failed}</span> <span className="text-muted-foreground">failed</span></span>
      </div>

      {/* Blockages */}
      {totalBlockages > 0 && (
        <div className="rounded-lg border border-yellow-400/30 bg-yellow-400/5 px-4 py-3 space-y-1">
          {blockages.approvals.map((a) => (
            <div key={a.approval_id} className="flex items-center gap-2 text-xs text-yellow-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>Approval pending: {a.title}</span>
              <span className="text-muted-foreground">· {formatRelative(a.created_at)}</span>
            </div>
          ))}
          {blockages.questions.map((q) => (
            <div key={q.question_id} className="flex items-center gap-2 text-xs text-yellow-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>Question pending: {q.title}</span>
              <span className="text-muted-foreground">· {formatRelative(q.created_at)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun message.</p>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">#</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Kind</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Timestamp</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Tries</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Preview</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((msg) => (
                <MessageRow key={msg.id} msg={msg} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
