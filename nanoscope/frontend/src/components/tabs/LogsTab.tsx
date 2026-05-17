import { useEffect, useRef, useState } from "react";
import type { LogsResult, LogFilters } from "@/hooks/useApi";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

const LEVEL_COLOR: Record<string, string> = {
  DEBUG: "text-muted-foreground",
  INFO: "text-secondary",
  WARN: "text-yellow-400",
  WARNING: "text-yellow-400",
  ERROR: "text-destructive",
};

export function LogsTab({
  data,
  filters,
  onFiltersChange,
}: {
  data: LogsResult | undefined;
  filters: LogFilters;
  onFiltersChange: (f: LogFilters) => void;
}) {
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  useEffect(() => {
    const count = data?.entries.length ?? 0;
    if (autoScroll && count !== prevCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      prevCountRef.current = count;
    }
  }, [data?.entries.length, autoScroll]);

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <Select
          value={filters.level ?? "all"}
          onChange={(e) => onFiltersChange({ ...filters, level: e.target.value })}
          className="w-36"
        >
          <option value="all">All levels</option>
          <option value="INFO">INFO+</option>
          <option value="WARN">WARN+</option>
          <option value="ERROR">ERROR only</option>
        </Select>
        <Input
          placeholder="Search…"
          value={filters.search ?? ""}
          onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
          className="flex-1"
        />
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="rounded"
          />
          Auto-scroll
        </label>
      </div>

      {!data && <p className="text-sm text-muted-foreground">Loading…</p>}

      {data && data.entries.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No log entries for this session.
        </p>
      )}

      {data && data.entries.length > 0 && (
        <div className="rounded-xl border border-border bg-background/50 overflow-auto max-h-[60vh]">
          <div className="p-3 font-mono text-xs space-y-0.5">
            {data.entries.map((entry, i) => (
              <div key={i} className="flex gap-2 items-start">
                <span className="text-muted-foreground/60 shrink-0 w-20 tabular-nums">
                  {entry.timestamp ?? ""}
                </span>
                <span className={cn("shrink-0 w-12 font-medium", LEVEL_COLOR[entry.level] ?? "text-foreground")}>
                  {entry.level}
                </span>
                {entry.is_container && (
                  <span className="shrink-0 rounded px-1 bg-accent/20 text-accent text-xs">
                    container
                  </span>
                )}
                <span className="text-foreground break-all">{entry.message}</span>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>
      )}

      {data && (
        <p className="text-xs text-muted-foreground">
          {data.entries.length} entries shown of {data.total_matched} matches
        </p>
      )}
    </div>
  );
}
