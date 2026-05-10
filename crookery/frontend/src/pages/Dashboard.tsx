import { useMetrics, useAgents } from "@/hooks/useApi";
import { useDashboardStore } from "@/store/dashboard";
import { KpiCard } from "@/components/KpiCard";
import { AgentCard } from "@/components/AgentCard";
import { StatusBadge } from "@/components/StatusBadge";

function formatUptime(seconds: number | null): string {
  if (seconds == null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `${d}j ${h % 24}h`;
  }
  return `${h}h ${m}m`;
}

export function Dashboard() {
  useMetrics();
  useAgents();
  const metrics = useDashboardStore((s) => s.metrics);
  const agents = useDashboardStore((s) => s.agents);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Vue d'ensemble du système NanoClaw</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Statut"
          value={
            metrics ? (
              <StatusBadge status={metrics.status} className="text-base" />
            ) : "—"
          }
        />
        <KpiCard
          title="Uptime"
          value={formatUptime(metrics?.uptime_seconds ?? null)}
          accent
        />
        <KpiCard
          title="Messages totaux"
          value={metrics?.total_messages?.toLocaleString("fr") ?? "—"}
        />
        <KpiCard
          title="Sessions actives"
          value={metrics?.active_sessions ?? "—"}
        />
      </div>

      {/* Agents */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-4">
          Agents NanoClaw
        </h2>
        {agents.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun agent configuré.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
