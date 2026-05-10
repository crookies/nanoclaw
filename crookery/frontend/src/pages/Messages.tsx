import { useState } from "react";
import { useMessages } from "@/hooks/useApi";
import type { Message, MessageFilters } from "@/hooks/useApi";
import { useDashboardStore } from "@/store/dashboard";
import { MessageTable } from "@/components/MessageTable";
import { MessageDetailSheet } from "@/components/MessageDetailSheet";

export function Messages() {
  const activeAgent = useDashboardStore((s) => s.activeAgent);
  const [filters, setFilters] = useState<MessageFilters>({
    agent: activeAgent ?? undefined,
    direction: "all",
    limit: 50,
    page: 1,
  });
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useMessages({ ...filters, page });

  function handleFiltersChange(f: Partial<MessageFilters>) {
    setFilters((prev) => ({ ...prev, ...f }));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Communications</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Flux de messages entre agents et canaux
        </p>
      </div>

      {isError && (
        <p className="text-sm text-destructive">Erreur lors du chargement des messages.</p>
      )}

      {isLoading && (
        <p className="text-sm text-muted-foreground">Chargement...</p>
      )}

      {data && (
        <MessageTable
          messages={data.items}
          total={data.total}
          page={page}
          pages={data.pages}
          onPageChange={setPage}
          onFiltersChange={handleFiltersChange}
          initialAgentId={activeAgent}
          onSelectMessage={setSelectedMessage}
        />
      )}

      <MessageDetailSheet
        message={selectedMessage}
        onClose={() => setSelectedMessage(null)}
      />
    </div>
  );
}
