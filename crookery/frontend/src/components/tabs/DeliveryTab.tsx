import { useState } from "react";
import { CheckCircle, Clock, XCircle, ChevronDown, ChevronRight } from "lucide-react";
import type { DeliveryResult, DeliveryMessage } from "@/hooks/useApi";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/time";

function StatusIcon({ status }: { status: string }) {
  if (status === "delivered") return <CheckCircle className="h-3.5 w-3.5 text-green-400" />;
  if (status === "failed") return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
}

function DeliveryRow({ msg }: { msg: DeliveryMessage }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr
        onClick={() => setOpen((o) => !o)}
        className="cursor-pointer hover:bg-accent/5 transition-colors border-t border-border"
      >
        <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">
          {msg.timestamp ? formatDateTime(msg.timestamp) : "—"}
        </td>
        <td className="px-4 py-2.5 text-xs text-foreground">{msg.kind}</td>
        <td className="px-4 py-2.5 text-xs text-muted-foreground truncate max-w-sm">
          {msg.content_preview ?? "—"}
        </td>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <StatusIcon status={msg.delivery_status} />
            <span
              className={cn(
                "text-xs",
                msg.delivery_status === "delivered" ? "text-green-400" :
                msg.delivery_status === "failed" ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {msg.delivery_status}
            </span>
          </div>
        </td>
        <td className="px-4 py-2.5">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </span>
        </td>
      </tr>
      {open && (
        <tr className="border-t border-border">
          <td colSpan={5} className="px-4 py-3 bg-muted/10">
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs mb-2">
              {msg.platform_message_id && (
                <div><span className="text-muted-foreground">Platform message ID: </span><code className="text-foreground">{msg.platform_message_id}</code></div>
              )}
              {msg.delivered_at && (
                <div><span className="text-muted-foreground">Delivered at: </span>{formatDateTime(msg.delivered_at)}</div>
              )}
              {msg.platform_id && (
                <div><span className="text-muted-foreground">Platform: </span>{msg.platform_id}</div>
              )}
              {msg.in_reply_to && (
                <div><span className="text-muted-foreground">In reply to: </span><code className="text-foreground text-xs">{msg.in_reply_to}</code></div>
              )}
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

export function DeliveryTab({ data }: { data: DeliveryResult | undefined }) {
  if (!data) return <p className="text-sm text-muted-foreground">Chargement…</p>;

  const { summary, messages } = data;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex gap-6 text-sm">
        <span><span className="font-medium text-green-400">{summary.delivered}</span> <span className="text-muted-foreground">delivered</span></span>
        <span><span className="font-medium text-destructive">{summary.failed}</span> <span className="text-muted-foreground">failed</span></span>
        <span><span className="font-medium text-muted-foreground">{summary.pending}</span> <span className="text-muted-foreground">pending</span></span>
      </div>

      {messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun message sortant.</p>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Heure</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Kind</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Preview</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Statut</th>
                <th className="px-4 py-2.5 w-8" />
              </tr>
            </thead>
            <tbody>
              {messages.map((msg) => (
                <DeliveryRow key={msg.id} msg={msg} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
