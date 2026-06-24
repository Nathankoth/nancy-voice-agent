"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import NancyShell from "@/components/nancy/NancyShell";
import AdminModal from "@/components/admin/AdminModal";
import AdminCallDetails from "@/components/admin/AdminCallDetails";
import {
  type ConversationLogRow,
  type ConversationSession,
  groupConversationSessions,
} from "@/lib/conversations";
import { buildAdminReceipts, formatReceiptTime, type CallReceipt } from "@/lib/receipts";
import type { LogEntry } from "@/hooks/useNancyVoice";

const API = "/api/nancy";
const ACTIVE_STATUSES = new Set(["confirmed", "pending", undefined, ""]);
type Filter = "All" | "Reservations" | "Inquiries";

interface Reservation {
  id?: string;
  guest_name: string;
  phone?: string;
  date: string;
  time: string;
  party_size: number;
  guests?: number;
  special_requests?: string;
  created_at?: string;
  calendar_synced?: boolean;
  session_id?: string;
  status?: string;
}

function normalizeReservation(r: Record<string, unknown>): Reservation {
  return {
    id: r.id as string | undefined,
    guest_name: r.guest_name as string,
    phone: r.phone as string | undefined,
    date: r.date as string,
    time: r.time as string,
    party_size: (r.party_size as number) ?? (r.guests as number) ?? 0,
    guests: r.guests as number | undefined,
    special_requests: r.special_requests as string | undefined,
    created_at: r.created_at as string | undefined,
    calendar_synced: r.calendar_synced as boolean | undefined,
    session_id: r.session_id as string | undefined,
    status: r.status as string | undefined,
  };
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className={`nancy-admin__stat ${accent ? "nancy-admin__stat--accent" : ""}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

export default function AdminPage() {
  const [receipts, setReceipts] = useState<CallReceipt[]>([]);
  const [transcripts, setTranscripts] = useState<Record<string, LogEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [filter, setFilter] = useState<Filter>("All");
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<CallReceipt | null>(null);
  const [removing, setRemoving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [resRes, logsRes, dismissedRes] = await Promise.all([
        fetch(`${API}/reservations`),
        fetch(`${API}/logs?limit=300`),
        fetch(`${API}/dismissed-sessions`),
      ]);
      if (!resRes.ok || !logsRes.ok) throw new Error("fetch failed");

      const resData = await resRes.json();
      const logsData = await logsRes.json();
      const dismissedData = dismissedRes.ok ? await dismissedRes.json() : { dismissed: [] };
      const dismissed: string[] = Array.isArray(dismissedData.dismissed)
        ? dismissedData.dismissed
        : [];

      const activeRes = (Array.isArray(resData) ? resData.map(normalizeReservation) : []).filter(
        (r) => ACTIVE_STATUSES.has(r.status || "")
      );
      const sessions: ConversationSession[] = groupConversationSessions(
        Array.isArray(logsData) ? (logsData as ConversationLogRow[]) : []
      );

      const transcriptMap: Record<string, LogEntry[]> = {};
      for (const session of sessions) {
        transcriptMap[session.session_id] = session.logs;
      }

      setTranscripts(transcriptMap);
      setReceipts(buildAdminReceipts(activeRes, sessions, dismissed));
      setLastFetch(new Date());
      setError("");
    } catch {
      setError("Cannot reach Nancy. Wait a moment and tap Refresh.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 15000);
    return () => clearInterval(interval);
  }, [refresh]);

  const stats = useMemo(
    () => ({
      calls: receipts.length,
      reservations: receipts.filter((r) => r.type === "booking").length,
      inquiries: receipts.filter((r) => r.type === "inquiry").length,
    }),
    [receipts]
  );

  const filtered = useMemo(() => {
    if (filter === "Reservations") return receipts.filter((r) => r.type === "booking");
    if (filter === "Inquiries") return receipts.filter((r) => r.type === "inquiry");
    return receipts;
  }, [receipts, filter]);

  const toggleCard = (receipt: CallReceipt) => {
    setOpenCardId((current) => (current === receipt.id ? null : receipt.id));
  };

  const handleRemove = async (status?: "served" | "cancelled") => {
    if (!removeTarget) return;
    setRemoving(true);
    setError("");
    try {
      if (removeTarget.type === "inquiry") {
        const res = await fetch(`${API}/sessions/${removeTarget.session_id}/dismiss`, {
          method: "POST",
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "dismiss failed");
        }
      } else {
        const reservationId = removeTarget.reservation_id || removeTarget.id;
        const res = await fetch(`${API}/reservations/${reservationId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: status || "served" }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || data.error || "update failed");
        }
      }
      if (openCardId === removeTarget.id) setOpenCardId(null);
      setRemoveTarget(null);
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      setError(
        removeTarget.type === "inquiry"
          ? "Could not remove this call."
          : `Could not remove reservation: ${msg}`
      );
    } finally {
      setRemoving(false);
    }
  };

  const RESTAURANT = process.env.NEXT_PUBLIC_RESTAURANT_NAME || "XYZ Restaurant";

  return (
    <NancyShell active="admin">
      <div className="nancy-admin nancy-admin--dash">
        <header className="nancy-admin__header">
          <div>
            <h1 className="nancy-admin__title">{RESTAURANT} Owner Dashboard</h1>
            <p className="nancy-admin__subtitle">
              Tap a card for call details. Every call Nancy handled is logged here.
              {lastFetch && ` Updated ${lastFetch.toLocaleTimeString()}.`}
            </p>
          </div>
          <button type="button" className="nancy-btn-ghost" onClick={() => void refresh()}>
            Refresh
          </button>
        </header>

        {error && <div className="nancy-panel__error">{error}</div>}

        <div className="nancy-admin__stats">
          <Stat label="Calls handled" value={stats.calls} />
          <Stat label="Reservations" value={stats.reservations} accent />
          <Stat label="Inquiries" value={stats.inquiries} />
        </div>

        <div className="nancy-admin__tabs" role="tablist">
          {(["All", "Reservations", "Inquiries"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              className={filter === f ? "on" : ""}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="nancy-transcript__empty">Loading receipts…</p>
        ) : filtered.length === 0 ? (
          <div className="nancy-admin__empty">
            No {filter.toLowerCase()} yet. Take a call on the{" "}
            <Link href="/">Dashboard</Link> and it lands here.
          </div>
        ) : (
          <div className="nancy-admin__records">
            {filtered.map((receipt) => {
              const isOpen = openCardId === receipt.id;
              const transcript = transcripts[receipt.session_id] || [];

              return (
                <article
                  key={receipt.id}
                  className={`nancy-admin__card ${isOpen ? "nancy-admin__card--open" : ""}`}
                >
                  <div className="nancy-admin__card-top">
                    <span className={`nancy-admin__badge nancy-admin__badge--${receipt.type}`}>
                      {receipt.type === "booking" ? "Reservation" : "Inquiry"}
                    </span>
                    <span className="nancy-admin__card-time">
                      {formatReceiptTime(receipt.created_at)}
                    </span>
                    <button
                      type="button"
                      className="nancy-admin__del"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRemoveTarget(receipt);
                      }}
                      aria-label="Remove record"
                    >
                      ×
                    </button>
                  </div>

                  <button
                    type="button"
                    className="nancy-admin__card-hit"
                    onClick={() => toggleCard(receipt)}
                    aria-expanded={isOpen}
                  >
                    <div className="nancy-admin__card-name">
                      {receipt.card_title || receipt.guest_name}
                    </div>
                    <div className="nancy-admin__card-line">
                      {receipt.card_subtitle ||
                        (receipt.type === "booking" ? (
                          <>
                            Party of {receipt.party_size ?? "n/a"}
                            {receipt.date && ` · ${receipt.date}`}
                            {receipt.time && ` ${receipt.time}`}
                          </>
                        ) : (
                          <>Voice inquiry · {transcript.length} message(s)</>
                        ))}
                    </div>
                    {receipt.special_requests && (
                      <p className="nancy-admin__card-notes">{receipt.special_requests}</p>
                    )}
                    {receipt.phone && (
                      <p className="nancy-admin__card-phone">{receipt.phone}</p>
                    )}

                    <span className="nancy-admin__expand">
                      {isOpen ? "Hide call details ↑" : "View call details →"}
                    </span>
                  </button>

                  {isOpen && (
                    <AdminCallDetails receipt={receipt} transcript={transcript} />
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      {removeTarget && (
        <AdminModal title="Remove from list?" onClose={() => setRemoveTarget(null)}>
          <p className="nancy-summary-detail__text">
            Remove <strong>{removeTarget.guest_name}</strong> from the dashboard?
          </p>
          <div className="nancy-modal__actions">
            {removeTarget.type === "booking" ? (
              <>
                <button
                  type="button"
                  className="nancy-btn-primary"
                  disabled={removing}
                  onClick={() => void handleRemove("served")}
                >
                  Guest served
                </button>
                <button
                  type="button"
                  className="nancy-btn-ghost"
                  disabled={removing}
                  onClick={() => void handleRemove("cancelled")}
                >
                  Cancelled
                </button>
              </>
            ) : (
              <button
                type="button"
                className="nancy-btn-primary"
                disabled={removing}
                onClick={() => void handleRemove()}
              >
                Remove
              </button>
            )}
          </div>
        </AdminModal>
      )}
    </NancyShell>
  );
}
