import { useEffect, useRef } from "react";
import { useDashboardStore } from "@/store/dashboard";

export function useWebSocket() {
  const setMetrics = useDashboardStore((s) => s.setMetrics);
  const setWsConnected = useDashboardStore((s) => s.setWsConnected);
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
          if (msg.type === "metrics") setMetrics(msg.data);
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
  }, [setMetrics, setWsConnected]);
}
