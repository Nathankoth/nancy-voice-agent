import type { ConversationSession } from "./conversations";

import { extractCallDetailsFromLogs } from "./call-details";

export interface ReservationSummary {
  guest_name: string;
  phone?: string;
  date: string;
  time: string;
  party_size: number;
  special_requests?: string;
}

export interface CallSummary {
  session_id: string;
  started_at: string;
  intent: string;
  preview: string;
  summary: string;
  highlights: string[];
  message_count: number;
  reservation?: ReservationSummary;
}

function detectIntent(text: string, hasReservation: boolean): string {
  if (hasReservation) return "Reservation";
  const lower = text.toLowerCase();
  if (lower.includes("book") || lower.includes("reserv") || lower.includes("table")) {
    return "Booking inquiry";
  }
  if (lower.includes("order") || lower.includes("takeaway") || lower.includes("delivery")) {
    return "Order inquiry";
  }
  if (lower.includes("cancel")) return "Cancellation";
  return "General inquiry";
}

/** Build a readable call summary from session logs (no raw transcript in list view). */
export function buildCallSummary(
  session: ConversationSession,
  reservation?: ReservationSummary
): CallSummary {
  const userLines = session.logs.filter((l) => l.category === "stt").map((l) => l.message);
  const nancyLines = session.logs.filter((l) => l.category === "llm").map((l) => l.message);
  const parsed = extractCallDetailsFromLogs(session.logs);
  const firstUser = userLines[0] || "";
  const intent = reservation
    ? "Reservation"
    : parsed.topic || detectIntent(firstUser, false);

  const preview =
    reservation
      ? `${reservation.guest_name}, ${reservation.party_size} guests, ${reservation.date}`
      : parsed.name && parsed.topic
        ? `${parsed.name} · ${parsed.topic}`
        : firstUser.length > 72
          ? `${firstUser.slice(0, 72)}…`
          : firstUser || "Voice call with Nancy";

  const highlights: string[] = [];
  if (reservation) {
    highlights.push(`Guest: ${reservation.guest_name}`);
    if (reservation.phone) highlights.push(`Phone: ${reservation.phone}`);
    highlights.push(`Party of ${reservation.party_size} · ${reservation.date} at ${reservation.time}`);
    if (reservation.special_requests) {
      highlights.push(`Notes: ${reservation.special_requests}`);
    }
  }
  if (userLines.length) {
    highlights.push(`Caller said: “${userLines[0]}”`);
  }
  if (nancyLines.length) {
    highlights.push(`Nancy replied: “${nancyLines[nancyLines.length - 1]}”`);
  }
  highlights.push("Manager follow-up promised within 10 to 20 minutes");

  let summary: string;
  if (reservation) {
    summary = `${reservation.guest_name} called to request a table for ${reservation.party_size} on ${reservation.date} at ${reservation.time}. Nancy captured their details${reservation.phone ? ` (${reservation.phone})` : ""} and let them know a manager will confirm within ten to twenty minutes.`;
    if (reservation.special_requests) {
      summary += ` Special request: ${reservation.special_requests}.`;
    }
  } else if (userLines.length) {
    summary = `A caller spoke with Nancy about ${intent.toLowerCase()}. Nancy handled the conversation in ${session.logs.length} exchanges and provided assistance. Key topic: “${firstUser}”.`;
  } else {
    summary = "A brief voice session with Nancy. No transcript lines were captured for this call.";
  }

  return {
    session_id: session.session_id,
    started_at: session.started_at,
    intent,
    preview,
    summary,
    highlights,
    message_count: session.logs.length,
    reservation,
  };
}

export function buildCallSummaries(
  sessions: ConversationSession[],
  reservationBySession: Map<string, ReservationSummary>
): CallSummary[] {
  return sessions.map((session) => {
    const res = reservationBySession.get(session.session_id);
    return buildCallSummary(session, res);
  });
}
