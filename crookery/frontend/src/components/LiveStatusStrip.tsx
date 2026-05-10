import { cn } from "@/lib/utils";
import type { SessionDetail } from "@/hooks/useApi";

function HeartbeatField({ detail }: { detail: SessionDetail }) {
  const age = detail.heartbeat_age_s;
  if (age == null) return <span className="text-muted-foreground">Heartbeat —</span>;
  const label = age < 60 ? `${Math.round(age)}s ago` : `${Math.round(age / 60)} min ago`;
  return (
    <span className={cn(age > 900 ? "text-destructive" : age > 300 ? "text-yellow-400" : "text-foreground")}>
      Heartbeat {label}
    </span>
  );
}

function ToolField({ detail }: { detail: SessionDetail }) {
  const cs = detail.container_state;
  if (!cs?.current_tool) return <span className="text-muted-foreground">Tool —</span>;
  const timeoutSec = cs.tool_declared_timeout_ms != null ? Math.round(cs.tool_declared_timeout_ms / 1000) : null;
  const elapsed = cs.elapsed_s != null ? Math.round(cs.elapsed_s) : null;
  return (
    <span className="text-foreground">
      <span className="text-secondary">{cs.current_tool}</span>
      {timeoutSec != null && <span className="text-muted-foreground"> (timeout {timeoutSec}s</span>}
      {elapsed != null && <span className="text-muted-foreground"> · {elapsed}s elapsed</span>}
      {timeoutSec != null && <span className="text-muted-foreground">)</span>}
    </span>
  );
}

function ClaimsField({ detail }: { detail: SessionDetail }) {
  const pc = detail.processing_claims;
  if (!pc || pc.count === 0) return <span className="text-muted-foreground">Claims 0</span>;
  const age = pc.oldest_age_s;
  return (
    <span className={cn(age != null && age > 30 ? "text-yellow-400" : "text-foreground")}>
      Claims {pc.count} processing
      {age != null && age > 30 && <span> · {Math.round(age)}s old</span>}
    </span>
  );
}

export function LiveStatusStrip({ detail }: { detail: SessionDetail }) {
  const isStopped = detail.container_status === "stopped";

  if (isStopped) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-muted/20 text-xs text-muted-foreground">
        Container stopped · no liveness data
        {detail.heartbeat_mtime && (
          <span>· last heartbeat {new Date(detail.heartbeat_mtime).toLocaleString("fr")}</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0 px-4 py-2 rounded-lg border border-border bg-muted/20 text-xs divide-x divide-border">
      <span className="pr-4">
        <HeartbeatField detail={detail} />
      </span>
      <span className="px-4">
        <ToolField detail={detail} />
      </span>
      <span className="pl-4">
        <ClaimsField detail={detail} />
      </span>
    </div>
  );
}
