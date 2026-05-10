import { Sheet } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/StatusBadge";
import type { Message } from "@/hooks/useApi";

interface Props {
  message: Message | null;
  onClose: () => void;
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === "") return null;
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className="mt-0.5 text-sm text-foreground break-all">{String(value)}</p>
    </div>
  );
}

export function MessageDetailSheet({ message, onClose }: Props) {
  return (
    <Sheet open={!!message} onClose={onClose} title="Détail du message">
      {message && (
        <div className="space-y-6 p-6">
          <div className="flex items-center gap-3">
            <span
              className={
                message.direction === "in"
                  ? "text-xs font-medium text-secondary"
                  : "text-xs font-medium text-accent"
              }
            >
              {message.direction === "in" ? "← Entrant" : "→ Sortant"}
            </span>
            {message.status && <StatusBadge status={message.status} />}
          </div>

          <div className="grid gap-3">
            <Field label="ID" value={message.id} />
            <Field label="Agent" value={message.agent_name} />
            <Field label="Session" value={message.session_id} />
            <Field label="Type" value={message.kind} />
            <Field label="Canal" value={message.channel_type} />
            <Field label="Platform ID" value={message.platform_id} />
            <Field label="Thread ID" value={message.thread_id} />
            <Field label="Horodatage" value={message.timestamp} />
            <Field label="Tentatives" value={message.tries} />
            <Field label="Série" value={message.series_id} />
            <Field label="Réponse à" value={message.in_reply_to} />
          </div>

          <div>
            <span className="text-xs text-muted-foreground">Contenu</span>
            <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-muted/20 p-3 text-xs text-foreground whitespace-pre-wrap break-all">
              {JSON.stringify(message.content, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </Sheet>
  );
}
