import { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { loadReceipt } from "../storage/receiptStorage.js";
import { formatNaira, formatReceiptTime } from "../utils/format.js";
import "../styles/global.css";
import "../App.css";

/** Read-only share view for /nancy/r/:id — loads from localStorage in demo. */
export default function ReceiptSharePage() {
  const { id } = useParams();
  const receipt = id ? loadReceipt(id) : null;

  useEffect(() => {
    document.title = receipt
      ? `Call record — ${receipt.restaurant?.name} | Nancy`
      : "Call record | Nancy";
  }, [receipt]);

  if (!receipt) {
    return (
      <div className="rift-demo">
        <div className="rift-shell share-page">
          <h1 className="display">Record not found</h1>
          <p className="muted">This demo link may have expired or was opened on another device.</p>
          <Link to="/" className="btn-primary" style={{ marginTop: 24, display: "inline-flex" }}>
            Back to demo
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="rift-demo">
      <div className="rift-shell share-page">
        <p className="meet__eyebrow muted">Nancy call record</p>
        <h1 className="display" style={{ fontSize: "clamp(1.5rem, 5vw, 2.25rem)" }}>
          {receipt.restaurant?.name}
        </h1>
        <p className="muted">{formatReceiptTime(receipt.timestamp)}</p>

        <article className="receipt" style={{ marginTop: 32 }}>
          <header className="receipt__header">
            <div>
              <p className="muted">{receipt.restaurant?.area}</p>
            </div>
            <span className="receipt__type">
              {receipt.type === "order" ? "Order" : "Booking"}
            </span>
          </header>

          <div className="receipt__meta">
            <div>
              <span className="receipt__label">Caller</span>
              <p>{receipt.caller?.name}</p>
              <p className="muted">{receipt.caller?.phone}</p>
            </div>
          </div>

          {receipt.booking && (
            <div className="receipt__body">
              <span className="receipt__label">Reservation</span>
              <p>
                {receipt.booking.partySize} guests · {receipt.booking.date} at {receipt.booking.time}
              </p>
              {receipt.booking.notes && <p className="muted">{receipt.booking.notes}</p>}
            </div>
          )}

          {receipt.order && (
            <div className="receipt__body">
              <span className="receipt__label">Order</span>
              <ul className="receipt__items">
                {receipt.order.items.map((item, i) => (
                  <li key={i}>
                    <span>
                      {item.qty}× {item.name}
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

          <div className="receipt__transcript-body" style={{ marginTop: 20 }}>
            {receipt.transcript?.map((line, i) => (
              <p key={i} className={`receipt__tx receipt__tx--${line.speaker}`}>
                <strong>{line.speaker === "nancy" ? "Nancy" : "Caller"}:</strong> {line.text}
              </p>
            ))}
          </div>
        </article>

        <div className="rift-footer">
          <a href="https://rift.studio" target="_blank" rel="noreferrer">
            Get Nancy for your restaurant → RIFT.STUDIO
          </a>
        </div>
      </div>
    </div>
  );
}
