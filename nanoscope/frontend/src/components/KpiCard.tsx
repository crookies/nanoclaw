import type { ReactNode } from "react";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  title: string;
  value: ReactNode;
  sub?: string;
  className?: string;
  accent?: boolean;
}

export function KpiCard({ title, value, sub, className, accent }: KpiCardProps) {
  return (
    <Card className={cn("flex flex-col gap-2 p-6", className)}>
      <CardTitle>{title}</CardTitle>
      <CardContent className="p-0">
        <p className={cn("text-3xl font-bold tabular-nums", accent ? "text-secondary" : "text-foreground")}>
          {value ?? "—"}
        </p>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
