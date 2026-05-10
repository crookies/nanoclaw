import { useState, useMemo } from "react";
import { useAgents } from "@/hooks/useApi";
import type { Message } from "@/hooks/useApi";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, ChevronsUpDown, Search, X } from "lucide-react";

type SortKey = "timestamp" | "agent_name" | "kind" | "direction" | "status";
type SortDir = "asc" | "desc";

interface Props {
  messages: Message[];
  total: number;
  page: number;
  pages: number;
  onPageChange: (p: number) => void;
  onFiltersChange: (f: { agent?: string; direction?: "all" | "in" | "out"; search?: string }) => void;
  initialAgentId?: string | null;
  onSelectMessage: (m: Message) => void;
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />;
  return dir === "asc"
    ? <ArrowUp className="h-3.5 w-3.5 text-secondary" />
    : <ArrowDown className="h-3.5 w-3.5 text-secondary" />;
}

export function MessageTable({
  messages,
  total,
  page,
  pages,
  onPageChange,
  onFiltersChange,
  initialAgentId,
  onSelectMessage,
}: Props) {
  const { data: agents = [] } = useAgents();
  const [search, setSearch] = useState("");
  const [agentFilter, setAgentFilter] = useState(initialAgentId ?? "");
  const [dirFilter, setDirFilter] = useState<"all" | "in" | "out">("all");
  const [sortKey, setSortKey] = useState<SortKey>("timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function applyFilters(overrides: Partial<{ agent: string; direction: "all" | "in" | "out"; search: string }>) {
    const merged = {
      agent: agentFilter,
      direction: dirFilter,
      search,
      ...overrides,
    };
    onFiltersChange({
      agent: merged.agent || undefined,
      direction: merged.direction !== "all" ? merged.direction : undefined,
      search: merged.search || undefined,
    });
    onPageChange(1);
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function handleReset() {
    setSearch("");
    setAgentFilter("");
    setDirFilter("all");
    applyFilters({ agent: "", direction: "all", search: "" });
  }

  const sorted = useMemo(() => {
    return [...messages].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      const ta = sortKey === "timestamp" ? String(av).replace(" ", "T") : String(av);
      const tb = sortKey === "timestamp" ? String(bv).replace(" ", "T") : String(bv);
      const cmp = ta < tb ? -1 : ta > tb ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [messages, sortKey, sortDir]);

  const colHeader = (key: SortKey, label: string) => (
    <th
      className="px-4 py-3 text-left text-xs font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
      onClick={() => handleSort(key)}
    >
      <span className="flex items-center gap-1">
        {label}
        <SortIcon active={sortKey === key} dir={sortDir} />
      </span>
    </th>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Rechercher..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyFilters({ search })}
          />
        </div>
        <Select
          value={agentFilter}
          onChange={(e) => {
            setAgentFilter(e.target.value);
            applyFilters({ agent: e.target.value });
          }}
        >
          <option value="">Tous les agents</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </Select>
        <Select
          value={dirFilter}
          onChange={(e) => {
            const v = e.target.value as "all" | "in" | "out";
            setDirFilter(v);
            applyFilters({ direction: v });
          }}
        >
          <option value="all">Entrant + Sortant</option>
          <option value="in">← Entrant</option>
          <option value="out">→ Sortant</option>
        </Select>
        {(search || agentFilter || dirFilter !== "all") && (
          <Button variant="ghost" size="sm" onClick={handleReset}>
            <X className="h-3.5 w-3.5 mr-1" /> Réinitialiser
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/10">
            <tr>
              {colHeader("timestamp", "Horodatage")}
              {colHeader("agent_name", "Agent")}
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Canal</th>
              {colHeader("direction", "Direction")}
              {colHeader("kind", "Type")}
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Aperçu</th>
              {colHeader("status", "Statut")}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Aucun message trouvé
                </td>
              </tr>
            )}
            {sorted.map((msg) => (
              <tr
                key={`${msg.direction}-${msg.id}`}
                onClick={() => onSelectMessage(msg)}
                className="border-b border-border/50 cursor-pointer hover:bg-muted/10 transition-colors"
              >
                <td className="px-4 py-3 text-xs text-foreground tabular-nums whitespace-nowrap">
                  {msg.timestamp ? msg.timestamp.replace("T", " ").slice(0, 19) : "—"}
                </td>
                <td className="px-4 py-3 text-xs font-medium text-foreground">{msg.agent_name}</td>
                <td className="px-4 py-3 text-xs text-foreground">
                  {msg.channel_type ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "text-xs font-medium",
                      msg.direction === "in" ? "text-secondary" : "text-accent",
                    )}
                  >
                    {msg.direction === "in" ? "← Entrant" : "→ Sortant"}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-foreground">{msg.kind}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate">
                  {msg.content_preview ?? "—"}
                </td>
                <td className="px-4 py-3">
                  {msg.status ? <StatusBadge status={msg.status} /> : <span className="text-xs text-foreground">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{total} message{total !== 1 ? "s" : ""} au total</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            ‹
          </Button>
          <span className="px-2 tabular-nums">
            {page} / {pages}
          </span>
          <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
            ›
          </Button>
        </div>
      </div>
    </div>
  );
}
