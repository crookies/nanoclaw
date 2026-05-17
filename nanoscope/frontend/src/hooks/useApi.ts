import { useQuery } from "@tanstack/react-query";
import { useDashboardStore } from "@/store/dashboard";

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export function useMetrics() {
  const setMetrics = useDashboardStore((s) => s.setMetrics);
  return useQuery({
    queryKey: ["metrics"],
    queryFn: async () => {
      const data = await apiFetch<import("@/store/dashboard").Metrics>("/api/metrics");
      setMetrics(data);
      return data;
    },
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  });
}

export function useAgents() {
  const setAgents = useDashboardStore((s) => s.setAgents);
  return useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const data = await apiFetch<import("@/store/dashboard").Agent[]>("/api/agents");
      setAgents(data);
      return data;
    },
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  });
}

export interface Message {
  id: string;
  seq: number;
  direction: "in" | "out";
  agent_group_id: string;
  agent_name: string;
  session_id: string;
  kind: string;
  timestamp: string | null;
  status: string | null;
  platform_id: string | null;
  channel_type: string | null;
  thread_id: string | null;
  tries: number | null;
  series_id: string | null;
  in_reply_to: string | null;
  content_preview: string | null;
  content: unknown;
}

export interface MessagesResult {
  total: number;
  page: number;
  limit: number;
  pages: number;
  items: Message[];
}

export interface MessageFilters {
  agent?: string;
  direction?: "all" | "in" | "out";
  search?: string;
  page?: number;
  limit?: number;
}

export function useMessages(filters: MessageFilters = {}) {
  const params = new URLSearchParams();
  if (filters.agent) params.set("agent", filters.agent);
  if (filters.direction && filters.direction !== "all") params.set("direction", filters.direction);
  if (filters.search) params.set("search", filters.search);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));

  return useQuery({
    queryKey: ["messages", filters],
    queryFn: () => apiFetch<MessagesResult>(`/api/messages?${params}`),
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  });
}

export function useMessage(id: string | null) {
  return useQuery({
    queryKey: ["message", id],
    queryFn: () => apiFetch<Message>(`/api/messages/${id}`),
    enabled: !!id,
  });
}

// ── Session types ────────────────────────────────────────────────────────────

export interface SessionQueue {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

export interface SessionBlockages {
  approvals_pending: number;
  questions_pending: number;
}

export interface Session {
  id: string;
  status: string;
  container_status: string;
  last_active: string | null;
  created_at: string;
  channel_type: string | null;
  platform_id: string | null;
  channel_label: string;
  session_mode: string | null;
  queue: SessionQueue;
  blockages: { approvals_pending: number; questions_pending: number };
}

export interface ContainerState {
  current_tool: string | null;
  tool_declared_timeout_ms: number | null;
  tool_started_at: string | null;
  elapsed_s: number | null;
}

export interface ProcessingClaims {
  count: number;
  oldest_age_s: number | null;
}

export interface SessionDetail extends Session {
  agent_name: string;
  agent_folder: string;
  heartbeat_mtime: string | null;
  heartbeat_age_s: number | null;
  container_state: ContainerState | null;
  processing_claims: ProcessingClaims | null;
}

export interface QueueMessage {
  id: string;
  seq: number;
  kind: string;
  timestamp: string | null;
  status: string;
  process_after: string | null;
  recurrence: string | null;
  series_id: string | null;
  tries: number;
  trigger: number;
  platform_id: string | null;
  channel_type: string | null;
  thread_id: string | null;
  content_preview: string | null;
  content: unknown;
}

export interface PendingApproval {
  approval_id: string;
  title: string;
  created_at: string;
  expires_at: string | null;
  status: string;
  action: string;
}

export interface PendingQuestion {
  question_id: string;
  title: string;
  created_at: string;
  options_json: string;
}

export interface QueueResult {
  summary: SessionQueue;
  messages: QueueMessage[];
  blockages: { approvals: PendingApproval[]; questions: PendingQuestion[] };
}

export interface DeliveryMessage {
  id: string;
  seq: number;
  in_reply_to: string | null;
  timestamp: string | null;
  deliver_after: string | null;
  kind: string;
  platform_id: string | null;
  channel_type: string | null;
  thread_id: string | null;
  content_preview: string | null;
  content: unknown;
  delivery_status: string;
  platform_message_id: string | null;
  delivered_at: string | null;
}

export interface DeliveryResult {
  summary: { delivered: number; failed: number; pending: number };
  messages: DeliveryMessage[];
}

export interface ToolUse {
  id: string | null;
  name: string;
  input: Record<string, unknown>;
  result: { content: string; is_error: boolean } | null;
}

export interface ConversationEntry {
  type: "user" | "assistant" | "tool_result";
  uuid?: string | null;
  text?: string;
  timestamp?: string | null;
  tool_uses?: ToolUse[];
}

export interface ConversationResult {
  sdk_session_id: string | null;
  current_jsonl: string | null;
  entries: ConversationEntry[];
  archived_jsonl: string[];
  archived_conversations: string[];
}

export interface LogEntry {
  timestamp: string | null;
  level: string;
  message: string;
  is_container: boolean;
}

export interface LogsResult {
  session_id: string;
  total_matched: number;
  entries: LogEntry[];
}

// ── Session hooks ────────────────────────────────────────────────────────────

export function useSessions(agentId: string) {
  return useQuery({
    queryKey: ["sessions", agentId],
    queryFn: () => apiFetch<Session[]>(`/api/agents/${agentId}/sessions`),
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
    enabled: !!agentId,
  });
}

export function useSessionDetail(agentId: string, sessionId: string, isActive = true) {
  return useQuery({
    queryKey: ["session-detail", agentId, sessionId],
    queryFn: () => apiFetch<SessionDetail>(`/api/agents/${agentId}/sessions/${sessionId}`),
    refetchInterval: isActive ? 30000 : false,
    refetchIntervalInBackground: false,
    enabled: !!agentId && !!sessionId,
  });
}

export function useSessionQueue(agentId: string, sessionId: string, isActive = true) {
  return useQuery({
    queryKey: ["session-queue", agentId, sessionId],
    queryFn: () => apiFetch<QueueResult>(`/api/agents/${agentId}/sessions/${sessionId}/queue`),
    refetchInterval: isActive ? 30000 : false,
    refetchIntervalInBackground: false,
    enabled: !!agentId && !!sessionId,
  });
}

export function useSessionDelivery(agentId: string, sessionId: string, isActive = true) {
  return useQuery({
    queryKey: ["session-delivery", agentId, sessionId],
    queryFn: () => apiFetch<DeliveryResult>(`/api/agents/${agentId}/sessions/${sessionId}/delivery`),
    refetchInterval: isActive ? 30000 : false,
    refetchIntervalInBackground: false,
    enabled: !!agentId && !!sessionId,
  });
}

export function useSessionConversation(agentId: string, sessionId: string, isActive = true) {
  return useQuery({
    queryKey: ["session-conversation", agentId, sessionId],
    queryFn: () => apiFetch<ConversationResult>(`/api/agents/${agentId}/sessions/${sessionId}/conversation`),
    refetchInterval: isActive ? 30000 : false,
    refetchIntervalInBackground: false,
    enabled: !!agentId && !!sessionId,
  });
}

export interface LogFilters {
  level?: string;
  search?: string;
  limit?: number;
}

export function useSessionLogs(agentId: string, sessionId: string, filters: LogFilters = {}, isActive = true) {
  const params = new URLSearchParams();
  if (filters.level) params.set("level", filters.level);
  if (filters.search) params.set("search", filters.search);
  if (filters.limit) params.set("limit", String(filters.limit));

  return useQuery({
    queryKey: ["session-logs", agentId, sessionId, filters],
    queryFn: () => apiFetch<LogsResult>(`/api/agents/${agentId}/sessions/${sessionId}/logs?${params}`),
    refetchInterval: isActive ? 30000 : false,
    refetchIntervalInBackground: false,
    enabled: !!agentId && !!sessionId,
  });
}
