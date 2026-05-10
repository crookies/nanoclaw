import { cn } from "@/lib/utils";

type Status = "running" | "idle" | "inactive" | "online" | "warning" | "offline" | string;

const STATUS_CONFIG: Record<string, { dot: string; label: string }> = {
  running: { dot: "bg-secondary", label: "Actif" },
  online: { dot: "bg-secondary", label: "En ligne" },
  idle: { dot: "bg-yellow-400", label: "Idle" },
  warning: { dot: "bg-yellow-400", label: "Avertissement" },
  inactive: { dot: "bg-muted-foreground/40", label: "Inactif" },
  offline: { dot: "bg-destructive", label: "Hors ligne" },
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const cfg = STATUS_CONFIG[status] ?? { dot: "bg-muted-foreground/40", label: status };
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <span className={cn("h-2 w-2 rounded-full", cfg.dot)} />
      {cfg.label}
    </span>
  );
}
