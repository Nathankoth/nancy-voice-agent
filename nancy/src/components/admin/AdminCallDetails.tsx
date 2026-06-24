import type { LogEntry } from "@/hooks/useNancyVoice";
import type { CallReceipt } from "@/lib/receipts";
import { formatReceiptTime } from "@/lib/receipts";
import { formatLogMessage } from "@/lib/call-details";

interface AdminCallDetailsProps {
  receipt: CallReceipt;
  transcript: LogEntry[];
}

function DetailRow({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === "") return null;
  return (
    <div className="nancy-admin__detail-row">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

const DETAIL_LABELS: Record<string, string> = {
  name: "Name",
  phone: "Phone",
  event: "Event",
  timeframe: "Timeframe",
  date: "Date",
  time: "Time",
  guests: "Guests",
  special_request: "Special request",
  topic: "Topic",
};

export default function AdminCallDetails({ receipt, transcript }: AdminCallDetailsProps) {
  const parsed = receipt.parsed_details || {};

  return (
    <div className="nancy-admin__card-body">
      <DetailRow label="Name" value={parsed.name || receipt.guest_name} />
      <DetailRow label="Phone" value={parsed.phone || receipt.phone} />
      <DetailRow label="Topic" value={receipt.inquiry_topic} />
      <DetailRow label="Guests" value={parsed.guests || receipt.party_size} />
      <DetailRow label="Date" value={parsed.date || receipt.date} />
      <DetailRow label="Time" value={parsed.time || receipt.time} />
      <DetailRow
        label="Event / request"
        value={parsed.event || parsed.special_request || receipt.special_requests}
      />
      <DetailRow label="Timeframe" value={parsed.timeframe} />
      <DetailRow label="Captured" value={formatReceiptTime(receipt.created_at)} />

      {Object.entries(parsed)
        .filter(([key]) => !["name", "phone", "date", "time", "guests", "event", "timeframe", "special_request", "topic"].includes(key))
        .map(([key, value]) => (
          <DetailRow key={key} label={DETAIL_LABELS[key] || key} value={value} />
        ))}

      {transcript.length > 0 ? (
        <div className="nancy-admin__transcript">
          <p className="nancy-admin__transcript-title">Conversation</p>
          {transcript.map((line, i) => (
            <p
              key={`${line.timestamp}-${i}`}
              className={`nancy-admin__transcript-line nancy-admin__transcript-line--${line.category}`}
            >
              <strong>{line.category === "llm" ? "Nancy" : "Caller"}:</strong>{" "}
              {formatLogMessage(line.message)}
            </p>
          ))}
        </div>
      ) : (
        <p className="nancy-admin__transcript-empty">No transcript captured for this call.</p>
      )}
    </div>
  );
}
