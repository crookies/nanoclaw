import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Copy,
  RefreshCw,
  MessageSquare,
  ListOrdered,
  Calendar,
  Send,
  FileText,
  Info,
} from "lucide-react";
import { useDashboardStore } from "@/store/dashboard";
import {
  useSessionDetail,
  useSessionQueue,
  useSessionDelivery,
  useSessionConversation,
  useSessionLogs,
} from "@/hooks/useApi";
import type { LogFilters } from "@/hooks/useApi";
import { StatusBadge } from "@/components/StatusBadge";
import { LiveStatusStrip } from "@/components/LiveStatusStrip";
import { ConversationTab } from "@/components/tabs/ConversationTab";
import { QueueTab } from "@/components/tabs/QueueTab";
import { TasksTab } from "@/components/tabs/TasksTab";
import { DeliveryTab } from "@/components/tabs/DeliveryTab";
import { LogsTab } from "@/components/tabs/LogsTab";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDateTime, formatRelative } from "@/lib/time";

function containerStatusToStatus(cs: string): string {
  if (cs === "running") return "running";
  if (cs === "idle") return "idle";
  return "inactive";
}

type TabId = "conversation" | "queue" | "tasks" | "delivery" | "logs";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "conversation", label: "Conversation", icon: MessageSquare },
  { id: "queue", label: "Queue", icon: ListOrdered },
  { id: "tasks", label: "Tasks", icon: Calendar },
  { id: "delivery", label: "Delivery", icon: Send },
  { id: "logs", label: "Logs", icon: FileText },
];

function CopyableId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button
      onClick={copy}
      title="Copier l'ID"
      className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      {id}
      <Copy className="h-3 w-3" />
      {copied && <span className="text-green-400">✓</span>}
    </button>
  );
}

export function SessionDetail() {
  const { agentId = "", sessionId = "" } = useParams<{ agentId: string; sessionId: string }>();
  const [activeTab, setActiveTab] = useState<TabId>("conversation");
  const [logFilters, setLogFilters] = useState<LogFilters>({ level: "all", search: "", limit: 200 });

  const agents = useDashboardStore((s) => s.agents);
  const agent = agents.find((a) => a.id === agentId);

  const { data: detail, refetch: refetchDetail } = useSessionDetail(agentId, sessionId);

  const isActive = detail
    ? detail.container_status === "running" || detail.container_status === "idle"
    : false;

  const { data: queueData } = useSessionQueue(agentId, sessionId, isActive);
  const { data: deliveryData } = useSessionDelivery(agentId, sessionId, isActive);
  const { data: convData } = useSessionConversation(agentId, sessionId, isActive);
  const { data: logsData } = useSessionLogs(agentId, sessionId, logFilters, isActive);

  if (!detail) {
    return (
      <div className="space-y-6">
        <Link
          to={`/agents/${agentId}`}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Sessions
        </Link>
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">

      {/* ── Header fixe (ne scrolle pas) ── */}
      <div className="shrink-0 space-y-3 pt-2 pb-3">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">Dashboard</Link>
          <span className="text-muted-foreground/50">/</span>
          <Link to={`/agents/${agentId}`} className="text-muted-foreground hover:text-foreground transition-colors">
            {agent?.name ?? agentId}
          </Link>
          <span className="text-muted-foreground/50">/</span>
          <span className="text-foreground font-medium">Session</span>
        </div>

        {/* Inactive banner */}
        {!isActive && (
          <div className="rounded-lg border border-border bg-muted/20 px-4 py-2 text-xs text-muted-foreground flex items-center gap-2">
            <Info className="h-3.5 w-3.5 shrink-0" />
            Cette session est inactive. Un nouveau container démarrera à l'arrivée du prochain message.
          </div>
        )}

        {/* Header */}
        <div className="rounded-xl border border-border p-4 bg-card">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={containerStatusToStatus(detail.container_status)} />
                <span className="text-base font-semibold text-foreground">
                  {detail.agent_name}
                </span>
                {detail.channel_label && (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-foreground">{detail.channel_label}</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                <CopyableId id={detail.id} />
                {detail.session_mode && <span>· {detail.session_mode}</span>}
                <span>· créée {formatDateTime(detail.created_at)}</span>
                {detail.last_active && (
                  <span>· active {formatRelative(detail.last_active)}</span>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchDetail()}
              className="shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Live status strip */}
        <LiveStatusStrip detail={detail} />
      </div>

      {/* ── Barre d'onglets (fixe, plus besoin de sticky) ── */}
      <div className="shrink-0 border-b border-border -mx-8 px-8">
        <div className="flex gap-0">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 transition-colors",
                activeTab === id
                  ? "border-secondary text-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Contenu scrollable (scroll interne uniquement) ── */}
      <div className="flex-1 overflow-y-auto min-h-0 py-4">
        {activeTab === "conversation" && (
          <ConversationTab data={convData} isActive={isActive} />
        )}
        {activeTab === "queue" && <QueueTab data={queueData} />}
        {activeTab === "tasks" && <TasksTab data={queueData} />}
        {activeTab === "delivery" && <DeliveryTab data={deliveryData} />}
        {activeTab === "logs" && (
          <LogsTab data={logsData} filters={logFilters} onFiltersChange={setLogFilters} />
        )}
      </div>

    </div>
  );
}
