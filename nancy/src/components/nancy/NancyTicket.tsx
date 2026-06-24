import type { CallReceipt } from "@/lib/receipts";
import { receiptCode, formatReceiptTime } from "@/lib/receipts";

const RESTAURANT = process.env.NEXT_PUBLIC_RESTAURANT_NAME || "XYZ Restaurant";
const RESTAURANT_SUB = process.env.NEXT_PUBLIC_RESTAURANT_SUB || "Voice receptionist";

interface NancyTicketProps {
  receipt: CallReceipt;
  showFooter?: boolean;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="nancy-ticket__row">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export default function NancyTicket({ receipt, showFooter = true }: NancyTicketProps) {
  const typeLabel = receipt.type === "booking" ? "RESERVATION" : "INQUIRY";
  const code = receiptCode(receipt.session_id);

  return (
    <div className="nancy-ticket">
      <div className="nancy-ticket__edge" aria-hidden="true" />
      <div className="nancy-ticket__body">
        <div className="nancy-ticket__head">
          <div className="nancy-ticket__rest">{RESTAURANT}</div>
          <div className="nancy-ticket__sub">{RESTAURANT_SUB}</div>
        </div>
        <div className="nancy-ticket__type">
          {typeLabel} · {code}
        </div>
        <div className="nancy-ticket__rule" />

        {receipt.guest_name && <Row label="Name" value={receipt.guest_name} />}
        {receipt.phone && <Row label="Phone" value={receipt.phone} />}
        {receipt.type === "booking" && (
          <>
            {receipt.date && <Row label="Date" value={receipt.date} />}
            {receipt.time && <Row label="Time" value={receipt.time} />}
            {receipt.party_size != null && (
              <Row label="Party" value={`${receipt.party_size} guests`} />
            )}
            {receipt.special_requests && (
              <Row label="Special request" value={receipt.special_requests} />
            )}
          </>
        )}

        {receipt.type === "inquiry" && receipt.parsed_details && (
          <>
            {receipt.parsed_details.event && (
              <Row label="Event" value={receipt.parsed_details.event} />
            )}
            {receipt.parsed_details.timeframe && (
              <Row label="Timeframe" value={receipt.parsed_details.timeframe} />
            )}
            {receipt.inquiry_topic && !receipt.parsed_details.event && (
              <Row label="Topic" value={receipt.inquiry_topic} />
            )}
          </>
        )}

        {showFooter && (
          <>
            <div className="nancy-ticket__rule nancy-ticket__rule--dash" />
            <div className="nancy-ticket__foot">
              Captured by Nancy · {formatReceiptTime(receipt.created_at)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
