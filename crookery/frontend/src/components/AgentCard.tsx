import { useNavigate } from "react-router-dom";
import type { Agent } from "@/store/dashboard";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { cn } from "@/lib/utils";
import { MessageSquare } from "lucide-react";

export function AgentCard({ agent }: { agent: Agent }) {
  const navigate = useNavigate();

  function handleClick() {
    navigate(`/agents/${agent.id}`);
  }

  return (
    <Card
      onClick={handleClick}
      className={cn(
        "cursor-pointer p-5 transition-all hover:border-secondary/50 hover:shadow-md",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground truncate">{agent.name}</h3>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={agent.status} />
          {agent.active_sessions > 0 && (
            <span className="text-xs font-bold text-secondary">({agent.active_sessions})</span>
          )}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <MessageSquare className="h-3.5 w-3.5" />
        <span>
          <span className="tabular-nums text-foreground font-medium">
            {agent.messages_in + agent.messages_out}
          </span>{" "}
          messages
        </span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {agent.session_count} session{agent.session_count !== 1 ? "s" : ""}
        {agent.last_active && (
          <span className="ml-2">· {new Date(agent.last_active).toLocaleDateString("fr")}</span>
        )}
      </div>
    </Card>
  );
}
