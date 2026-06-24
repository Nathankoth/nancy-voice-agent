import type { LogEntry } from "@/hooks/useNancyVoice";

export interface ConversationLogRow {
  id?: string;
  session_id?: string;
  category: string;
  message: string;
  created_at?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export interface ConversationSession {
  session_id: string;
  started_at: string;
  logs: LogEntry[];
}

export function toLogEntry(row: ConversationLogRow): LogEntry {
  return {
    category: row.category,
    message: row.message,
    timestamp: row.created_at || row.timestamp || new Date().toISOString(),
  };
}

/** Group stt/llm logs into sessions for the admin dashboard */
export function groupConversationSessions(rows: ConversationLogRow[]): ConversationSession[] {
  const bySession = new Map<string, ConversationLogRow[]>();

  for (const row of rows) {
    if (row.category !== "stt" && row.category !== "llm") continue;
    const sid = row.session_id || "unknown";
    if (!bySession.has(sid)) bySession.set(sid, []);
    bySession.get(sid)!.push(row);
  }

  return [...bySession.entries()]
    .map(([session_id, messages]) => {
      const chronological = [...messages].sort(
        (a, b) =>
          new Date(a.created_at || a.timestamp || 0).getTime() -
          new Date(b.created_at || b.timestamp || 0).getTime()
      );
      return {
        session_id,
        started_at: chronological[0]?.created_at || chronological[0]?.timestamp || "",
        logs: chronological.map(toLogEntry),
      };
    })
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
}
