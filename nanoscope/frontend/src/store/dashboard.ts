import { create } from "zustand";

export interface Metrics {
  status: "online" | "warning" | "offline";
  uptime_seconds: number | null;
  total_messages: number;
  active_sessions: number;
  collected_at: string;
}

export interface Agent {
  id: string;
  name: string;
  agent_provider: string | null;
  status: "running" | "idle" | "inactive";
  session_count: number;
  active_sessions: number;
  last_active: string | null;
  messages_in: number;
  messages_out: number;
}

interface DashboardState {
  metrics: Metrics | null;
  agents: Agent[];
  wsConnected: boolean;
  activeAgent: string | null;
  setMetrics: (m: Metrics) => void;
  setAgents: (a: Agent[]) => void;
  setWsConnected: (v: boolean) => void;
  setActiveAgent: (id: string | null) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  metrics: null,
  agents: [],
  wsConnected: false,
  activeAgent: null,
  setMetrics: (metrics) => set({ metrics }),
  setAgents: (agents) => set({ agents }),
  setWsConnected: (wsConnected) => set({ wsConnected }),
  setActiveAgent: (activeAgent) => set({ activeAgent }),
}));
