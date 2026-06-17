"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  RESTAURANT_TIMEZONE,
  todayInRestaurantTz,
  formatRestaurantDate,
  formatRestaurantLongDate,
  formatRestaurantTime,
  formatRestaurantDateTime,
  isTodayInRestaurantTz,
} from "@/lib/timezone";

const API_URL = process.env.NEXT_PUBLIC_NANCY_API_URL || "http://localhost:8765";

interface Reservation {
  id?: string;
  guest_name: string;
  phone?: string;
  email?: string;
  date: string;
  time: string;
  party_size: number;
  created_at?: string;
  calendar_synced?: boolean;
  session_id?: string;
  notes?: string;
}

interface ConversationLog {
  id?: string;
  session_id?: string;
  category: string;
  message: string;
  timestamp: string;
  extra?: Record<string, unknown>;
}

const TABLES = 4;
const SEATS_PER_TABLE = 5;
const TOTAL_SEATS = TABLES * SEATS_PER_TABLE;
const AVG_DINING_MINUTES = 60;

function timeToMinutes(time: string): number {
  const [h, m] = time.replace(/[AP]M/i, "").split(":").map(Number);
  const isPM = time.toLowerCase().includes("pm") && h !== 12;
  const isAM = time.toLowerCase().includes("am") && h === 12;
  return (isPM ? h + 12 : isAM ? 0 : h) * 60 + (m || 0);
}

function slotsOverlap(time1: string, time2: string): boolean {
  const t1 = timeToMinutes(time1);
  const t2 = timeToMinutes(time2);
  return Math.abs(t1 - t2) < AVG_DINING_MINUTES;
}

function getCapacityStatus(reservations: Reservation[], date: string, time: string) {
  const concurrent = reservations.filter((r) => r.date === date && slotsOverlap(r.time, time));
  const seatsUsed = concurrent.reduce((sum, r) => sum + r.party_size, 0);
  return {
    seatsUsed,
    seatsAvailable: Math.max(0, TOTAL_SEATS - seatsUsed),
    isFull: seatsUsed >= TOTAL_SEATS,
    percent: Math.round((seatsUsed / TOTAL_SEATS) * 100),
  };
}

function normalizeReservation(r: Record<string, unknown>): Reservation {
  const partySize = Number(r.party_size ?? r.guests ?? 0);
  return {
    id: r.id as string | undefined,
    guest_name: r.guest_name as string,
    phone: r.phone as string | undefined,
    email: r.email as string | undefined,
    date: r.date as string,
    time: r.time as string,
    party_size: partySize,
    created_at: r.created_at as string | undefined,
    calendar_synced: r.calendar_synced as boolean | undefined,
    session_id: r.session_id as string | undefined,
    notes: r.notes as string | undefined,
  };
}

export default function AdminPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [conversationLogs, setConversationLogs] = useState<ConversationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayInRestaurantTz());

  const fetchData = async () => {
    try {
      const [resRes, logsRes] = await Promise.all([
        fetch(`${API_URL}/api/reservations`),
        fetch(`${API_URL}/api/logs`),
      ]);
      if (!resRes.ok) throw new Error("Server not responding");
      const data = await resRes.json();
      const list = Array.isArray(data) ? data.map(normalizeReservation) : [];
      setReservations(list);

      if (logsRes.ok) {
        const logs = await logsRes.json();
        setConversationLogs(Array.isArray(logs) ? logs : []);
      }

      setLastFetch(new Date());
      setError("");
    } catch {
      setError("Cannot reach Nancy server. Make sure the Python server is running.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 30000);
    return () => clearInterval(t);
  }, []);

  const dateRes = reservations.filter((r) => r.date === selectedDate);
  const totalGuestsToday = dateRes.reduce((s, r) => s + (r.party_size || 0), 0);
  const tablesNeededToday = Math.ceil(totalGuestsToday / SEATS_PER_TABLE);

  const timeSlots: string[] = [];
  for (let h = 11; h <= 22; h++) {
    timeSlots.push(`${h}:00`);
    if (h < 22) timeSlots.push(`${h}:30`);
  }

  const readableLogs = conversationLogs.filter((l) =>
    ["stt", "llm"].includes(l.category)
  );

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "#ffffff",
        fontFamily: "system-ui, sans-serif",
        padding: "32px 24px",
      }}
    >
      <div style={{ maxWidth: "960px", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "32px",
          }}
        >
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "4px" }}>
              Admin — Reservations
            </h1>
            <p style={{ fontSize: "13px", color: "#6b7280" }}>
              {lastFetch
                ? `Last updated ${formatRestaurantTime(lastFetch)} WAT`
                : "Loading..."}
              {" · "}
              {RESTAURANT_TIMEZONE.replace("_", " ")}
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{
                background: "#111",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px",
                color: "#ffffff",
                fontSize: "13px",
                padding: "8px 12px",
                cursor: "pointer",
              }}
            />
            <button
              onClick={fetchData}
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px",
                color: "#9ca3af",
                fontSize: "13px",
                padding: "8px 14px",
                cursor: "pointer",
              }}
            >
              Refresh
            </button>
            <Link href="/" style={{ fontSize: "13px", color: "#22c55e", textDecoration: "none" }}>
              ← Nancy
            </Link>
          </div>
        </div>

        {error && (
          <div
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: "10px",
              padding: "14px 18px",
              fontSize: "13px",
              color: "#f87171",
              marginBottom: "24px",
              lineHeight: 1.6,
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "12px",
            marginBottom: "28px",
          }}
        >
          {[
            {
              label: "Total seats",
              value: TOTAL_SEATS,
              color: "#ffffff",
              sub: `${TABLES} tables × ${SEATS_PER_TABLE} seats`,
            },
            {
              label: "Booked",
              value: totalGuestsToday,
              color: "#f59e0b",
              sub: `${dateRes.length} reservation${dateRes.length !== 1 ? "s" : ""} on selected date`,
            },
            {
              label: "Available seats",
              value: Math.max(0, TOTAL_SEATS - totalGuestsToday),
              color: "#22c55e",
              sub: `For ${formatRestaurantDate(selectedDate)}`,
            },
            {
              label: "Tables needed",
              value: tablesNeededToday,
              color: "#8b5cf6",
              sub: `of ${TABLES} total`,
            },
          ].map((card) => (
            <div
              key={card.label}
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: "12px",
                padding: "18px",
              }}
            >
              <p style={{ fontSize: "11px", color: "#6b7280", marginBottom: "8px" }}>
                {card.label}
              </p>
              <p
                style={{
                  fontSize: "28px",
                  fontWeight: 700,
                  color: card.color,
                  marginBottom: "4px",
                }}
              >
                {card.value}
              </p>
              <p style={{ fontSize: "11px", color: "#4b5563" }}>{card.sub}</p>
            </div>
          ))}
        </div>

        <div
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: "14px",
            padding: "24px",
            marginBottom: "28px",
          }}
        >
          <p style={{ fontSize: "13px", fontWeight: 600, marginBottom: "16px", color: "#ffffff" }}>
            Availability — {formatRestaurantLongDate(selectedDate)}
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))",
              gap: "6px",
            }}
          >
            {timeSlots.map((slot) => {
              const cap = getCapacityStatus(reservations, selectedDate, slot);
              return (
                <div
                  key={slot}
                  style={{
                    padding: "8px 6px",
                    borderRadius: "8px",
                    textAlign: "center",
                    background: cap.isFull
                      ? "rgba(239,68,68,0.1)"
                      : cap.seatsUsed > 0
                        ? "rgba(245,158,11,0.1)"
                        : "rgba(34,197,94,0.06)",
                    border: `1px solid ${
                      cap.isFull
                        ? "rgba(239,68,68,0.2)"
                        : cap.seatsUsed > 0
                          ? "rgba(245,158,11,0.2)"
                          : "rgba(34,197,94,0.12)"
                    }`,
                  }}
                >
                  <p style={{ fontSize: "11px", color: "#9ca3af", marginBottom: "3px" }}>{slot}</p>
                  <p
                    style={{
                      fontSize: "10px",
                      fontWeight: 600,
                      color: cap.isFull ? "#ef4444" : cap.seatsUsed > 0 ? "#f59e0b" : "#22c55e",
                    }}
                  >
                    {cap.isFull ? "Full" : cap.seatsUsed > 0 ? `${cap.seatsAvailable} left` : "Open"}
                  </p>
                </div>
              );
            })}
          </div>

          <div
            style={{
              display: "flex",
              gap: "16px",
              marginTop: "14px",
              paddingTop: "14px",
              borderTop: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            {[
              { label: "Open", color: "#22c55e" },
              { label: "Partially booked", color: "#f59e0b" },
              { label: "Fully booked", color: "#ef4444" },
            ].map((l) => (
              <div key={l.label} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: l.color,
                    display: "block",
                  }}
                />
                <span style={{ fontSize: "11px", color: "#6b7280" }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: "14px",
            padding: "24px",
            marginBottom: "28px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "20px",
            }}
          >
            <p style={{ fontSize: "14px", fontWeight: 600 }}>
              Reservations —{" "}
              {dateRes.length > 0 ? `${dateRes.length} on selected date` : "All bookings"}
            </p>
            <span
              style={{
                fontSize: "11px",
                color: "#6b7280",
                background: "rgba(255,255,255,0.04)",
                padding: "4px 10px",
                borderRadius: "20px",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {reservations.length} total
            </span>
          </div>

          {loading ? (
            <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "24px 0" }}>
              <div
                style={{
                  width: "18px",
                  height: "18px",
                  borderRadius: "50%",
                  border: "2px solid rgba(34,197,94,0.2)",
                  borderTopColor: "#22c55e",
                  animation: "spin 0.8s linear infinite",
                }}
              />
              <span style={{ fontSize: "13px", color: "#6b7280" }}>Loading reservations...</span>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : reservations.length === 0 ? (
            <div style={{ padding: "32px 0", textAlign: "center" }}>
              <p style={{ fontSize: "13px", color: "#6b7280" }}>
                No reservations yet. Nancy will log them here when customers book.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {[...reservations]
                .sort((a, b) => {
                  if (a.date !== b.date) return a.date > b.date ? 1 : -1;
                  return timeToMinutes(a.time) - timeToMinutes(b.time);
                })
                .map((res, i) => {
                  const tablesNeeded = Math.ceil(res.party_size / SEATS_PER_TABLE);
                  const isSelected = res.date === selectedDate;
                  const isToday = isTodayInRestaurantTz(res.date);

                  return (
                    <div
                      key={res.id || i}
                      style={{
                        background: isSelected ? "rgba(34,197,94,0.04)" : "rgba(255,255,255,0.02)",
                        border: `1px solid ${isSelected ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.06)"}`,
                        borderRadius: "12px",
                        padding: "20px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          marginBottom: "16px",
                          paddingBottom: "14px",
                          borderBottom: "1px dashed rgba(255,255,255,0.08)",
                        }}
                      >
                        <div>
                          <p
                            style={{
                              fontSize: "16px",
                              fontWeight: 700,
                              color: "#ffffff",
                              marginBottom: "3px",
                            }}
                          >
                            {res.guest_name}
                          </p>
                          {res.phone && (
                            <p style={{ fontSize: "12px", color: "#6b7280" }}>{res.phone}</p>
                          )}
                          {res.email && (
                            <p style={{ fontSize: "12px", color: "#6b7280" }}>{res.email}</p>
                          )}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          {isToday && (
                            <span
                              style={{
                                fontSize: "10px",
                                fontWeight: 700,
                                color: "#22c55e",
                                background: "rgba(34,197,94,0.1)",
                                padding: "3px 8px",
                                borderRadius: "20px",
                                display: "inline-block",
                                marginBottom: "6px",
                              }}
                            >
                              TODAY
                            </span>
                          )}
                          <p
                            style={{
                              fontSize: "11px",
                              color: res.calendar_synced ? "#22c55e" : "#6b7280",
                            }}
                          >
                            {res.calendar_synced ? "✓ Calendar synced" : "Local only"}
                          </p>
                        </div>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr 1fr",
                          gap: "16px",
                          marginBottom: "14px",
                        }}
                      >
                        <div>
                          <p
                            style={{
                              fontSize: "10px",
                              color: "#6b7280",
                              marginBottom: "4px",
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                            }}
                          >
                            Date
                          </p>
                          <p style={{ fontSize: "14px", fontWeight: 600, color: "#ffffff" }}>
                            {formatRestaurantDate(res.date)}
                          </p>
                        </div>
                        <div>
                          <p
                            style={{
                              fontSize: "10px",
                              color: "#6b7280",
                              marginBottom: "4px",
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                            }}
                          >
                            Time
                          </p>
                          <p style={{ fontSize: "14px", fontWeight: 600, color: "#ffffff" }}>
                            {res.time}
                          </p>
                        </div>
                        <div>
                          <p
                            style={{
                              fontSize: "10px",
                              color: "#6b7280",
                              marginBottom: "4px",
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                            }}
                          >
                            Party
                          </p>
                          <p style={{ fontSize: "14px", fontWeight: 600, color: "#ffffff" }}>
                            {res.party_size} guests
                          </p>
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          paddingTop: "12px",
                          borderTop: "1px dashed rgba(255,255,255,0.08)",
                        }}
                      >
                        <div style={{ display: "flex", gap: "8px" }}>
                          {Array.from({ length: tablesNeeded }).map((_, t) => (
                            <span
                              key={t}
                              style={{
                                fontSize: "11px",
                                color: "#8b5cf6",
                                background: "rgba(139,92,246,0.1)",
                                border: "1px solid rgba(139,92,246,0.2)",
                                padding: "3px 10px",
                                borderRadius: "20px",
                                fontWeight: 600,
                              }}
                            >
                              Table {t + 1}
                              {tablesNeeded > 1 ? (t === 0 ? " (main)" : " (merged)") : ""}
                            </span>
                          ))}
                        </div>
                        {res.created_at && (
                          <p style={{ fontSize: "11px", color: "#4b5563" }}>
                            Booked {formatRestaurantDateTime(res.created_at)}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        <div
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: "14px",
            padding: "24px",
          }}
        >
          <p style={{ fontSize: "14px", fontWeight: 600, marginBottom: "20px" }}>
            Conversation Log
          </p>

          {readableLogs.length === 0 ? (
            <p style={{ fontSize: "13px", color: "#6b7280", padding: "16px 0" }}>
              No conversations logged yet.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {[...readableLogs]
                .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                .slice(-50)
                .map((log, i) => {
                  const isUser = log.category === "stt";
                  return (
                    <div
                      key={log.id || i}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                        paddingBottom: "20px",
                        borderBottom:
                          i < readableLogs.length - 1
                            ? "1px solid rgba(255,255,255,0.04)"
                            : "none",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            color: isUser ? "#22c55e" : "#8b5cf6",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}
                        >
                          {isUser ? "Guest" : "Nancy"}
                        </span>
                        <span style={{ fontSize: "11px", color: "#4b5563" }}>
                          {formatRestaurantDateTime(log.timestamp)} WAT
                        </span>
                      </div>
                      <p style={{ fontSize: "14px", color: "#e5e7eb", lineHeight: 1.7 }}>
                        {log.message}
                      </p>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
