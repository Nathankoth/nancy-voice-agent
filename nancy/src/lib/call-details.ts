import type { LogEntry } from "@/hooks/useNancyVoice";

export interface ParsedCallDetails {
  name?: string;
  phone?: string;
  topic?: string;
  subtitle?: string;
  fields: Record<string, string>;
  confirmationText?: string;
}

const CONFIRM_RE = /to confirm,\s*your details are as follows:/i;

const FIELD_LABELS = [
  "your Name",
  "Name",
  "Phone Number",
  "Event",
  "Timeframe",
  "Date",
  "Time",
  "Guests",
  "Party size",
  "Special request",
  "Inquiry",
  "Request",
  "Topic",
  "Service",
] as const;

const LABEL_PATTERN = FIELD_LABELS.map((label) =>
  label.replace(/\s+/g, "\\s+")
).join("|");

const FIELD_RE = new RegExp(`(?:${LABEL_PATTERN}):\\s*`, "gi");

export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^\s*-\s+/gm, "")
    .replace(/\s+-\s+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeFieldKey(label: string): string {
  const key = label.toLowerCase().replace(/^your\s+/, "").trim();
  if (key === "name") return "name";
  if (key.includes("phone")) return "phone";
  if (key === "event") return "event";
  if (key === "timeframe") return "timeframe";
  if (key === "date") return "date";
  if (key === "time") return "time";
  if (key === "guests" || key === "party size") return "guests";
  if (key.includes("special")) return "special_request";
  if (key === "inquiry" || key === "request" || key === "topic" || key === "service") {
    return "topic";
  }
  return key.replace(/\s+/g, "_");
}

export function parseConfirmationText(text: string): Record<string, string> {
  const cleaned = stripMarkdown(text);
  if (!CONFIRM_RE.test(cleaned)) return {};

  const fields: Record<string, string> = {};
  const matches = [...cleaned.matchAll(FIELD_RE)];
  if (!matches.length) return fields;

  for (let i = 0; i < matches.length; i++) {
    const rawLabel = matches[i][0].replace(/:\s*$/, "").trim();
    const start = matches[i].index! + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : cleaned.length;
    let value = cleaned.slice(start, end).trim();
    value = value.replace(/\s*A manager will call.*$/i, "").trim();
    value = value.replace(/^,\s*/, "").replace(/,\s*$/, "").trim();
    if (!value) continue;
    fields[normalizeFieldKey(rawLabel)] = value;
  }

  return fields;
}

function detectTopicFromSpeech(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("cater")) return "Catering inquiry";
  if (lower.includes("private dining") || lower.includes("private room")) {
    return "Private dining inquiry";
  }
  if (lower.includes("book") || lower.includes("reserv") || lower.includes("table")) {
    return "Table reservation";
  }
  if (lower.includes("order") || lower.includes("takeaway") || lower.includes("delivery")) {
    return "Order inquiry";
  }
  if (lower.includes("cancel")) return "Cancellation request";
  if (lower.includes("menu")) return "Menu inquiry";
  if (lower.includes("hours") || lower.includes("open")) return "Hours inquiry";
  const trimmed = text.trim();
  if (trimmed.length > 80) return `${trimmed.slice(0, 77)}...`;
  return trimmed || "General inquiry";
}

function buildSubtitle(fields: Record<string, string>): string {
  const parts: string[] = [];
  if (fields.phone) parts.push(fields.phone);
  if (fields.date) parts.push(fields.date);
  if (fields.time) parts.push(fields.time);
  if (fields.guests) parts.push(`${fields.guests} guests`);
  if (fields.timeframe) parts.push(fields.timeframe);
  if (fields.special_request) parts.push(fields.special_request);
  return parts.join(" · ");
}

function pickTopic(fields: Record<string, string>, fallback: string): string {
  return (
    fields.event ||
    fields.topic ||
    fields.special_request ||
    fallback
  );
}

/** Pull structured details from Nancy's confirmation readback in the transcript. */
export function extractCallDetailsFromLogs(logs: LogEntry[]): ParsedCallDetails {
  const nancyLines = logs
    .filter((l) => l.category === "llm")
    .map((l) => stripMarkdown(l.message));

  let fields: Record<string, string> = {};
  let confirmationText: string | undefined;

  for (const line of [...nancyLines].reverse()) {
    const parsed = parseConfirmationText(line);
    if (Object.keys(parsed).length) {
      fields = parsed;
      confirmationText = line;
      break;
    }
  }

  const userLines = logs.filter((l) => l.category === "stt").map((l) => l.message);
  const firstUser = userLines[0] || "";
  const topic = pickTopic(fields, detectTopicFromSpeech(firstUser));

  return {
    name: fields.name,
    phone: fields.phone,
    topic,
    subtitle: buildSubtitle(fields),
    fields,
    confirmationText,
  };
}

export function buildCardTitle(name: string, topic: string): string {
  const cleanName = name.trim() || "Caller";
  const cleanTopic = topic.trim() || "Inquiry";
  return `${cleanName} · ${cleanTopic}`;
}

export function formatLogMessage(message: string): string {
  return stripMarkdown(message);
}
