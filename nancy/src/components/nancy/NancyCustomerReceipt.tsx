import Link from "next/link";
import type { CallReceipt } from "@/lib/receipts";
import NancyTicket from "./NancyTicket";

interface NancyCustomerReceiptProps {
  receipt: CallReceipt;
  onNewCall: () => void;
}

export default function NancyCustomerReceipt({ receipt, onNewCall }: NancyCustomerReceiptProps) {
  return (
    <div className="nancy-receipt-wrap">
      <p className="nancy-receipt-wrap__cap">Your request is recorded. Here&apos;s your receipt.</p>

      <NancyTicket receipt={receipt} showFooter={false} />

      <div className="nancy-receipt__timeline">
        <p className="nancy-receipt__timeline-title">What happens next</p>
        <ol className="nancy-receipt__steps">
          <li className="nancy-receipt__step nancy-receipt__step--done">
            <span>Details recorded by Nancy</span>
          </li>
          <li className="nancy-receipt__step nancy-receipt__step--active">
            <span>Manager reviews your request</span>
            <em>Within 10 to 20 minutes</em>
          </li>
          <li className="nancy-receipt__step">
            <span>Confirmation call to you</span>
          </li>
        </ol>
      </div>

      <div className="nancy-receipt-wrap__actions">
        <button type="button" className="nancy-btn-ghost" onClick={onNewCall}>
          Talk to Nancy again
        </button>
        <Link href="/admin" className="nancy-btn-primary nancy-receipt-wrap__admin">
          Owner view →
        </Link>
      </div>
    </div>
  );
}
