import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { formatNaira, formatReceiptTime, generateReceiptId } from "../utils/format.js";
import { saveReceipt } from "../storage/receiptStorage.js";

export default function Receipt({ receipt, onSave }) {
  const rootRef = useRef(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [savedUrl, setSavedUrl] = useState(null);

  useEffect(() => {
    if (!receipt || !rootRef.current) return;
    const els = rootRef.current.querySelectorAll("[data-reveal]");
    gsap.fromTo(
      els,
      { opacity: 0, y: 18 },
      {
        opacity: 1,
        y: 0,
        duration: 0.7,
        stagger: 0.08,
        ease: "power3.out",
      }
    );
  }, [receipt]);

  if (!receipt) return null;

  const handleSave = () => {
    const id = generateReceiptId();
    saveReceipt(id, receipt);
    const url = `${window.location.origin}/nancy/r/${id}`;
    setSavedUrl(url);
    onSave?.(id, url);
  };

  return (
    <section className="receipt-section" ref={rootRef} aria-label="Call receipt">
      <p className="receipt-section__caption serif-accent" data-reveal>
        This is what lands in your dashboard every morning.
      </p>

      <article className="receipt" data-reveal>
        <header className="receipt__header">
          <div>
            <h2 className="receipt__restaurant">{receipt.restaurant?.name}</h2>
            <p className="muted">{receipt.restaurant?.area}</p>
          </div>
          <span className="receipt__type">
            {receipt.type === "order" ? "Order" : "Booking"}
          </span>
        </header>

        <div className="receipt__meta" data-reveal>
          <div>
            <span className="receipt__label">Caller</span>
            <p>{receipt.caller?.name}</p>
            <p className="muted">{receipt.caller?.phone}</p>
          </div>
          <div>
            <span className="receipt__label">Time</span>
            <p>{formatReceiptTime(receipt.timestamp)}</p>
          </div>
        </div>

        {receipt.booking && (
          <div className="receipt__body" data-reveal>
            <span className="receipt__label">Reservation</span>
            <p>
              {receipt.booking.partySize} guests · {receipt.booking.date} at{" "}
              {receipt.booking.time}
            </p>
            {receipt.booking.notes && (
              <p className="muted receipt__notes">{receipt.booking.notes}</p>
            )}
          </div>
        )}

        {receipt.order && (
          <div className="receipt__body" data-reveal>
            <span className="receipt__label">Order</span>
            <ul className="receipt__items">
              {receipt.order.items.map((item, i) => (
                <li key={i}>
                  <span>
                    {item.qty}× {item.name}
                    {item.notes ? ` (${item.notes})` : ""}
                  </span>
                  <span>{formatNaira(item.qty * item.price)}</span>
                </li>
              ))}
            </ul>
            <p className="receipt__total">
              Total <strong>{formatNaira(receipt.order.total)}</strong>
            </p>
          </div>
        )}

        <div className="receipt__transcript" data-reveal>
          <button
            type="button"
            className="btn-link receipt__toggle"
            onClick={() => setTranscriptOpen((o) => !o)}
            aria-expanded={transcriptOpen}
          >
            {transcriptOpen ? "Hide full transcript" : "View full transcript"}
          </button>
          {transcriptOpen && (
            <div className="receipt__transcript-body">
              {receipt.transcript?.map((line, i) => (
                <p key={i} className={`receipt__tx receipt__tx--${line.speaker}`}>
                  <strong>{line.speaker === "nancy" ? "Nancy" : "Caller"}:</strong> {line.text}
                </p>
              ))}
            </div>
          )}
        </div>
      </article>

      <div className="receipt-section__actions" data-reveal>
        <button type="button" className="btn-link" onClick={handleSave}>
          Save this call record
        </button>
        {savedUrl && (
          <p className="receipt-section__saved muted">
            Saved —{" "}
            <a href={savedUrl} target="_blank" rel="noreferrer">
              {savedUrl.replace(/^https?:\/\//, "")}
            </a>
          </p>
        )}
      </div>
    </section>
  );
}
