import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, AlertTriangle, Layers } from "lucide-react";
import { useDashboardStore } from "@/store/dashboard";
import { useSessions } from "@/hooks/useApi";
import type { Session } from "@/hooks/useApi";
import { StatusBadge } from "@/components/StatusBadge";
import { formatRelative, formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";

function containerStatusToStatus(cs: string): string {
  if (cs === "running") return "running";
  if (cs === "idle") return "idle";
  return "inactive";
}

function QueueCell({ queue }: { queue: Session["queue"] }) {
  const total = queue.pending + queue.processing + queue.failed;
  if (total === 0) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <span className="text-xs tabular-nums space-x-1">
      {queue.pending > 0 && (
        <span className="text-foreground">{queue.pending} pending</span>
      )}
      {queue.processing > 0 && (
        <span className="text-secondary">{queue.processing} processing</span>
      )}
      {queue.failed > 0 && (
        <span className="text-destructive">{queue.failed} failed</span>
      )}
    </span>
  );
}

function BlockageCell({ blockages }: { blockages: Session["blockages"] }) {
  const total = blockages.approvals_pending + blockages.questions_pending;
  if (total === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-yellow-400">
      <AlertTriangle className="h-3 w-3" />
      {total} blocked
    </span>
  );
}

function ChannelIcon({ channelType }: { channelType: string | null }) {
  const icons: Record<string, string> = {
    telegram: "✈",
    discord: "🎮",
    slack: "💬",
    teams: "🟦",
    whatsapp: "📱",
    github: "🐙",
    linear: "🟣",
    email: "✉",
  };
  return <span className="mr-1">{icons[channelType ?? ""] ?? "💬"}</span>;
}

export function AgentSessions() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const agents = useDashboardStore((s) => s.agents);
  const agent = agents.find((a) => a.id === agentId);
  const { data: sessions, isLoading } = useSessions(agentId ?? "");

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link
          to="/"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
        <span className="text-muted-foreground/50">/</span>
        <span className="text-sm font-medium text-foreground flex items-center gap-1.5">
          <Layers className="h-4 w-4 text-secondary" />
          {agent?.name ?? agentId}
        </span>
      </div>

      <h1 className="text-xl font-semibold text-foreground">Sessions</h1>

      {isLoading && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      {!isLoading && (!sessions || sessions.length === 0) && (
        <p className="text-sm text-muted-foreground">No sessions found.</p>
      )}

      {sessions && sessions.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Channel</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Mode</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Last active</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Queue</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Blocked</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Created</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session, i) => (
                <tr
                  key={session.id}
                  onClick={() => navigate(`/agents/${agentId}/sessions/${session.id}`)}
                  className={cn(
                    "cursor-pointer transition-colors hover:bg-accent/5",
                    i > 0 && "border-t border-border",
                  )}
                >
                  <td className="px-4 py-3">
                    <StatusBadge status={containerStatusToStatus(session.container_status)} />
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    <ChannelIcon channelType={session.channel_type} />
                    {session.channel_label}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {session.session_mode ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">
                    {formatRelative(session.last_active)}
                  </td>
                  <td className="px-4 py-3">
                    <QueueCell queue={session.queue} />
                  </td>
                  <td className="px-4 py-3">
                    <BlockageCell blockages={session.blockages} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(session.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
