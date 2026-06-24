import type { LogEntry, Reservation } from "@/hooks/useNancyVoice";
import type { ConversationSession } from "./conversations";
import {
  buildCardTitle,
  extractCallDetailsFromLogs,
  type ParsedCallDetails,
} from "./call-details";

const RECEIPT_TIMEZONE =
  process.env.NEXT_PUBLIC_RESTAURANT_TIMEZONE || "Africa/Lagos";

export interface CallReceipt {
  id: string;
  session_id: string;
  type: "booking" | "inquiry";
  guest_name: string;
  phone?: string;
  party_size?: number;
  date?: string;
  time?: string;
  special_requests?: string;
  inquiry_topic?: string;
  card_title?: string;
  card_subtitle?: string;
  parsed_details?: Record<string, string>;
  created_at: string;
  reservation_id?: string;
}

function enrichReceipt(
  base: CallReceipt,
  logs: LogEntry[]
): CallReceipt {
  const parsed: ParsedCallDetails = extractCallDetailsFromLogs(logs);
  const guestName = parsed.name || base.guest_name;
  const topic =
    base.type === "booking"
      ? parsed.topic ||
        (base.party_size
          ? `Table reservation for ${base.party_size} guests`
          : "Table reservation")
      : parsed.topic || "Inquiry";

  const subtitle =
    parsed.subtitle ||
    [
      base.phone || parsed.phone,
      base.date,
      base.time,
      base.party_size != null ? `${base.party_size} guests` : "",
      base.special_requests,
    ]
      .filter(Boolean)
      .join(" · ");

  return {
    ...base,
    guest_name: guestName,
    phone: base.phone || parsed.phone,
    special_requests: base.special_requests || parsed.fields.event || parsed.fields.special_request,
    inquiry_topic: topic,
    card_title: buildCardTitle(guestName, topic),
    card_subtitle: subtitle,
    parsed_details: Object.keys(parsed.fields).length ? parsed.fields : undefined,
  };
}

export function buildAdminReceipts(
  reservations: Array<{
    id?: string;
    session_id?: string;
    guest_name: string;
    phone?: string;
    party_size: number;
    date: string;
    time: string;
    special_requests?: string;
    created_at?: string;
    status?: string;
  }>,
  sessions: ConversationSession[],
  dismissedSessionIds: Iterable<string> = []
): CallReceipt[] {
  const dismissed = new Set(dismissedSessionIds);
  const receipts: CallReceipt[] = [];
  const seenSessions = new Set<string>();

  const sessionLogs = new Map(sessions.map((s) => [s.session_id, s.logs]));

  for (const r of reservations) {
    const sid = r.session_id || r.id || `res-${r.guest_name}-${r.date}`;
    seenSessions.add(sid);
    const base: CallReceipt = {
      id: r.id || sid,
      session_id: sid,
      type: "booking",
      guest_name: r.guest_name,
      phone: r.phone,
      party_size: r.party_size,
      date: r.date,
      time: r.time,
      special_requests: r.special_requests,
      created_at: r.created_at || new Date().toISOString(),
      reservation_id: r.id,
    };
    receipts.push(enrichReceipt(base, sessionLogs.get(sid) || []));
  }

  for (const session of sessions) {
    if (seenSessions.has(session.session_id)) continue;
    if (dismissed.has(session.session_id)) continue;
    const base: CallReceipt = {
      id: session.session_id,
      session_id: session.session_id,
      type: "inquiry",
      guest_name: "Caller",
      created_at: session.started_at || new Date().toISOString(),
    };
    receipts.push(enrichReceipt(base, session.logs));
  }

  return receipts.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export function receiptCode(sessionId: string): string {
  const slug = sessionId.replace(/[^a-zA-Z0-9]/g, "").slice(-5).toUpperCase();
  return `NR-${slug || "NEW"}`;
}

export function formatReceiptTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-NG", {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: RECEIPT_TIMEZONE,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function reservationToReceipt(reservation: Reservation): CallReceipt {
  return {
    id: reservation.id || `local-${Date.now()}`,
    session_id: reservation.session_id || `local-${Date.now()}`,
    type: "booking",
    guest_name: reservation.guest_name || "Guest",
    phone: reservation.phone,
    party_size: reservation.party_size ?? reservation.guests,
    date: reservation.date,
    time: reservation.time,
    special_requests: reservation.special_requests,
    created_at: new Date().toISOString(),
    reservation_id: reservation.id,
  };
}
