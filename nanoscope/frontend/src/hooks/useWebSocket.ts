import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDashboardStore } from "@/store/dashboard";

export function useWebSocket() {
  const setMetrics = useDashboardStore((s) => s.setMetrics);
  const setWsConnected = useDashboardStore((s) => s.setWsConnected);
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelayRef = useRef(1000);
  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;

    function connect() {
      if (unmountedRef.current) return;
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        retryDelayRef.current = 1000;
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === "metrics") {
            setMetrics(msg.data);
          } else if (msg.type === "invalidate-conversation") {
            queryClient.invalidateQueries({ queryKey: ["session-conversation", msg.agentId as string] });
          } else if (msg.type === "invalidate") {
            const { agentId, sessionId } = msg as { agentId: string; sessionId: string };
            queryClient.invalidateQueries({ queryKey: ["agents"] });
            queryClient.invalidateQueries({ queryKey: ["messages"] });
            queryClient.invalidateQueries({ queryKey: ["sessions", agentId] });
            queryClient.invalidateQueries({ queryKey: ["session-detail", agentId, sessionId] });
            queryClient.invalidateQueries({ queryKey: ["session-queue", agentId, sessionId] });
            queryClient.invalidateQueries({ queryKey: ["session-delivery", agentId, sessionId] });
            queryClient.invalidateQueries({ queryKey: ["session-conversation", agentId, sessionId] });
            queryClient.invalidateQueries({ queryKey: ["session-logs", agentId, sessionId] });
          }
        } catch {}
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (!unmountedRef.current) {
          retryRef.current = setTimeout(() => {
            retryDelayRef.current = Math.min(retryDelayRef.current * 2, 30000);
            connect();
          }, retryDelayRef.current);
        }
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      unmountedRef.current = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [setMetrics, setWsConnected, queryClient]);
}
