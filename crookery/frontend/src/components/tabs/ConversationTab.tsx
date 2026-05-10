import { useEffect, useRef, useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import type { ConversationResult, ConversationEntry, ToolUse } from "@/hooks/useApi";
import { cn } from "@/lib/utils";

// ── Channel icons (heuristic + from-channel attribute) ───────────────────────

const CHANNEL_ICONS: Record<string, string> = {
  telegram: "✈",
  discord: "#",
  slack: "◈",
  whatsapp: "⬡",
  teams: "⬡",
  gmail: "✉",
  email: "✉",
  matrix: "⬡",
  signal: "⬡",
  resend: "✉",
  imessage: "✉",
  gchat: "◈",
  webex: "⬡",
  linear: "◈",
  github: "◈",
};

function getChannelIcon(fromChannel?: string, fromValue?: string): string | null {
  const key = (fromChannel ?? fromValue ?? "").toLowerCase();
  return CHANNEL_ICONS[key] ?? null;
}

// ── Timezone short name ───────────────────────────────────────────────────────

function shortTz(tz: string): string {
  // "Europe/Brussels" → "Brussels", "America/New_York" → "New_York"
  return tz.split("/").pop() ?? tz;
}

// ── XML message parsing ───────────────────────────────────────────────────────

interface XmlMsg {
  id?: string;
  from?: string;
  fromChannel?: string;
  fromType?: string;
  sender?: string;
  time?: string;
  content: string;
}

interface ParsedXml {
  timezone?: string;
  messages: XmlMsg[];
}

function parseXmlMessages(text: string): ParsedXml | null {
  if (!text.trim().startsWith("<")) return null;
  const timezone = text.match(/<context\s+timezone="([^"]+)"/)?.[1];
  const msgRegex = /<message\s+([^>]*)>([\s\S]*?)<\/message>/g;
  const messages: XmlMsg[] = [];
  let m: RegExpExecArray | null;
  while ((m = msgRegex.exec(text)) !== null) {
    const attrs = m[1];
    messages.push({
      id:          attrs.match(/id="([^"]+)"/)?.[1],
      from:        attrs.match(/from="([^"]+)"/)?.[1],
      fromChannel: attrs.match(/from-channel="([^"]+)"/)?.[1],
      fromType:    attrs.match(/from-type="([^"]+)"/)?.[1],
      sender:      attrs.match(/sender="([^"]+)"/)?.[1],
      time:        attrs.match(/time="([^"]+)"/)?.[1],
      content:     m[2].trim(),
    });
  }
  if (messages.length === 0 && !timezone) return null;
  return { timezone, messages };
}

// ── Entry type label ──────────────────────────────────────────────────────────

function getEntryTypeLabel(entry: ConversationEntry, isXml: boolean): string {
  if (entry.type === "user") return isXml ? "Msg" : "User";
  if (entry.type === "assistant") {
    return entry.tool_uses && entry.tool_uses.length > 0 && !entry.text ? "Tool" : "Reply";
  }
  return entry.type;
}

// ── Tool call block ───────────────────────────────────────────────────────────

function ToolCallBlock({ tu }: { tu: ToolUse }) {
  const [open, setOpen] = useState(false);
  const inputStr = JSON.stringify(tu.input, null, 2);
  const durationLabel = tu.result ? (tu.result.is_error ? "error" : "ok") : "pending";

  return (
    <div className="rounded-md border border-border overflow-hidden text-xs">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/20 transition-colors bg-muted/10"
      >
        {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        <span className="font-medium text-secondary">[{tu.name}]</span>
        <span className={cn(
          "shrink-0 text-[10px] font-bold",
          tu.result
            ? tu.result.is_error ? "text-destructive" : "text-green-400"
            : "text-muted-foreground/40",
        )}>
          {tu.result ? (tu.result.is_error ? "✗" : "✓") : "…"}
        </span>
        <span className={cn("ml-auto text-[10px] text-muted-foreground/50")}>
          {durationLabel}
        </span>
      </button>
      {open && (
        <div className="px-3 py-2 border-t border-border space-y-2 bg-background/50">
          <div>
            <p className="text-muted-foreground font-medium mb-1">Input</p>
            <pre className="whitespace-pre-wrap break-all text-foreground font-mono text-xs">{inputStr}</pre>
          </div>
          {tu.result && (
            <div>
              <p className={cn("font-medium mb-1", tu.result.is_error ? "text-destructive" : "text-muted-foreground")}>
                {tu.result.is_error ? "Error" : "Output"}
              </p>
              <pre className="whitespace-pre-wrap break-all text-foreground font-mono text-xs">{tu.result.content}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Shared header strip ───────────────────────────────────────────────────────

function HeaderStrip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-stretch divide-x divide-border/40 border-b border-border/40 text-[11px] text-muted-foreground bg-muted/10">
      {children}
    </div>
  );
}

function HeaderCell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("px-2 py-1 flex items-center", className)}>
      {children}
    </span>
  );
}

// ── Entry bubble ──────────────────────────────────────────────────────────────

function EntryBubble({ entry }: { entry: ConversationEntry }) {
  const [showRaw, setShowRaw] = useState(false);
  const isUser = entry.type === "user";
  const parsed = isUser && entry.text ? parseXmlMessages(entry.text) : null;
  const isXml = parsed !== null && parsed.messages.length > 0;
  const typeLabel = getEntryTypeLabel(entry, isXml);

  return (
    <div className="flex gap-3">
      <div className="text-lg shrink-0 mt-0.5">{isUser ? "👤" : "🤖"}</div>
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            "rounded-xl overflow-hidden text-sm",
            isUser
              ? "bg-muted/30 border border-border"
              : "bg-secondary/5 border border-secondary/20",
          )}
        >
          {/* ── XML messages: rich tabbed header ── */}
          {isXml && parsed ? (
            <>
              {parsed.messages.map((msg, i) => {
                const icon = getChannelIcon(msg.fromChannel, msg.fromType === "agent" ? undefined : msg.from);
                return (
                  <div key={i} className={i > 0 ? "border-t border-border/30" : ""}>
                    <HeaderStrip>
                      {/* type */}
                      <HeaderCell className="font-mono text-[10px] shrink-0 text-muted-foreground/70">
                        {typeLabel}
                      </HeaderCell>
                      {/* time + tz */}
                      {msg.time && (
                        <HeaderCell className="shrink-0 gap-1">
                          <span>{msg.time}</span>
                          {parsed.timezone && (
                            <span className="text-[9px] opacity-40">{shortTz(parsed.timezone)}</span>
                          )}
                        </HeaderCell>
                      )}
                      {/* message id */}
                      {msg.id && (
                        <HeaderCell className="font-mono text-[10px] opacity-50 shrink-0">
                          #{msg.id}
                        </HeaderCell>
                      )}
                      {/* from / sender */}
                      <HeaderCell className="flex-1 min-w-0 gap-1 overflow-hidden">
                        {icon && (
                          <span className="opacity-60 shrink-0">{icon}</span>
                        )}
                        {msg.from && (
                          <span className="font-semibold text-foreground/70 truncate shrink-0">
                            {msg.from}
                          </span>
                        )}
                        {msg.sender && (
                          <>
                            <span className="opacity-40 shrink-0">←</span>
                            <span className="truncate">{msg.sender}</span>
                          </>
                        )}
                      </HeaderCell>
                    </HeaderStrip>
                    <p className="px-4 py-3 whitespace-pre-wrap break-words text-foreground">
                      {msg.content}
                    </p>
                  </div>
                );
              })}
            </>
          ) : (
            /* ── Non-XML entries: minimal type header ── */
            <>
              <HeaderStrip>
                <HeaderCell className="font-mono text-[10px] text-muted-foreground/70 shrink-0">
                  {typeLabel}
                </HeaderCell>
                {entry.timestamp && (
                  <HeaderCell className="opacity-60 shrink-0">
                    {new Date(entry.timestamp).toLocaleTimeString("fr", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </HeaderCell>
                )}
              </HeaderStrip>
              <div className="px-4 py-3">
                {entry.text && (
                  <p className="whitespace-pre-wrap break-words text-foreground">{entry.text}</p>
                )}
                {entry.tool_uses && entry.tool_uses.length > 0 && (
                  <div className={cn("space-y-2", entry.text ? "mt-3" : "")}>
                    {entry.tool_uses.map((tu, i) => (
                      <ToolCallBlock key={tu.id ?? i} tu={tu} />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Footer: JSON toggle (left) + SDK timestamp (right) ── */}
          <div className="flex items-center gap-2 px-3 py-1 border-t border-border/20">
            <button
              onClick={() => setShowRaw((v) => !v)}
              className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors"
            >
              {showRaw ? "Masquer JSON" : "JSON"}
            </button>
            {entry.timestamp && (
              <span className="text-[10px] text-muted-foreground/50 ml-auto">
                {new Date(entry.timestamp).toLocaleTimeString("fr", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>
          {showRaw && (
            <pre className="px-4 pb-3 text-xs font-mono whitespace-pre-wrap break-all text-muted-foreground bg-muted/30 rounded-b">
              {JSON.stringify(entry, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ConversationTab({
  data,
  isActive,
}: {
  data: ConversationResult | undefined;
  isActive: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  useEffect(() => {
    const count = data?.entries.length ?? 0;
    if (count !== prevCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      prevCountRef.current = count;
    }
  }, [data?.entries.length]);

  if (!data) {
    return <p className="text-sm text-muted-foreground">Chargement…</p>;
  }

  if (!data.sdk_session_id) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Aucune conversation — le container n'a pas encore démarré.</p>
      </div>
    );
  }

  const hasArchives = data.archived_jsonl.length > 0 || data.archived_conversations.length > 0;

  return (
    <div className="space-y-3">
      {hasArchives && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="flex-1 h-px bg-border" />
          <span>Contexte compact · messages antérieurs archivés</span>
          <div className="flex-1 h-px bg-border" />
        </div>
      )}

      {data.entries.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">Aucun message dans cette session.</p>
      )}

      {data.entries.map((entry, i) => (
        <EntryBubble key={entry.uuid ?? i} entry={entry} />
      ))}

      <div ref={bottomRef} />
    </div>
  );
}
