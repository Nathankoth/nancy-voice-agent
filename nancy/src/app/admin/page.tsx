"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Reservation {
  id?: string;
  guest_name: string;
  phone?: string;
  date: string;
  time: string;
  party_size: number;
  guests?: number;
  created_at?: string;
  calendar_synced?: boolean;
  session_id?: string;
}

interface TableLayout {
  id: number;
  capacity: number;
  status: "available" | "reserved" | "merged";
  reservation?: Reservation;
  mergedWith?: number;
}

const API_URL = process.env.NEXT_PUBLIC_NANCY_API_URL || "http://localhost:8765";
const TOTAL_TABLES = 4;
const SEATS_PER_TABLE = 5;
const TOTAL_SEATS = TOTAL_TABLES * SEATS_PER_TABLE;

function normalizeReservation(r: Record<string, unknown>): Reservation {
  return {
    id: r.id as string | undefined,
    guest_name: r.guest_name as string,
    phone: r.phone as string | undefined,
    date: r.date as string,
    time: r.time as string,
    party_size: (r.party_size as number) ?? (r.guests as number) ?? 0,
    guests: r.guests as number | undefined,
    created_at: r.created_at as string | undefined,
    calendar_synced: r.calendar_synced as boolean | undefined,
    session_id: r.session_id as string | undefined,
  };
}

function calculateTables(reservations: Reservation[]): TableLayout[] {
  const tables: TableLayout[] = Array.from({ length: TOTAL_TABLES }, (_, i) => ({
    id: i + 1,
    capacity: SEATS_PER_TABLE,
    status: "available",
  }));

  const today = new Date().toISOString().split("T")[0];
  const todayReservations = reservations.filter(
    (r) => r.date === today || r.date?.includes(today)
  );

  let tableIndex = 0;
  for (const res of todayReservations) {
    if (tableIndex >= TOTAL_TABLES) break;
    const tablesNeeded = Math.ceil(res.party_size / SEATS_PER_TABLE);

    if (tablesNeeded === 1) {
      tables[tableIndex].status = "reserved";
      tables[tableIndex].reservation = res;
      tableIndex++;
    } else {
      for (let t = 0; t < tablesNeeded && tableIndex < TOTAL_TABLES; t++) {
        tables[tableIndex].status = t === 0 ? "reserved" : "merged";
        tables[tableIndex].reservation = res;
        tables[tableIndex].mergedWith = t === 0 ? undefined : tableIndex - t;
        tableIndex++;
      }
    }
  }

  return tables;
}

export default function AdminPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetchReservations = async () => {
    try {
      const res = await fetch(`${API_URL}/api/reservations`);
      if (!res.ok) throw new Error("Server not responding");
      const data = await res.json();
      const list = Array.isArray(data) ? data.map(normalizeReservation) : [];
      setReservations(list);
      setLastFetch(new Date());
      setError("");
    } catch {
      setError("Cannot reach Nancy server. Make sure uv run main.py is running.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchReservations();
    const interval = setInterval(() => void fetchReservations(), 30000);
    return () => clearInterval(interval);
  }, []);

  const tables = calculateTables(reservations);
  const today = new Date().toISOString().split("T")[0];
  const todayReservations = reservations.filter(
    (r) => r.date === today || r.date?.includes(today)
  );
  const reservedSeats = todayReservations.reduce((sum, r) => sum + (r.party_size || 0), 0);
  const availableSeats = Math.max(0, TOTAL_SEATS - reservedSeats);

  const tableColors = {
    available: { bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.2)", dot: "#22c55e" },
    reserved: { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.2)", dot: "#ef4444" },
    merged: { bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.2)", dot: "#f59e0b" },
  };

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
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "32px",
          }}
        >
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "4px" }}>Reservations</h1>
            <p style={{ fontSize: "13px", color: "#6b7280" }}>
              {lastFetch ? `Updated ${lastFetch.toLocaleTimeString()}` : "Loading..."}
            </p>
          </div>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <button
              onClick={() => void fetchReservations()}
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
              ← Back to Nancy
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
            marginBottom: "32px",
          }}
        >
          {[
            { label: "Total seats", value: TOTAL_SEATS.toString(), color: "#ffffff" },
            { label: "Reserved", value: reservedSeats.toString(), color: "#ef4444" },
            { label: "Available", value: availableSeats.toString(), color: "#22c55e" },
            { label: "Today's bookings", value: todayReservations.length.toString(), color: "#f59e0b" },
          ].map((card) => (
            <div
              key={card.label}
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: "12px",
                padding: "16px",
              }}
            >
              <p style={{ fontSize: "11px", color: "#6b7280", marginBottom: "6px" }}>{card.label}</p>
              <p style={{ fontSize: "24px", fontWeight: 700, color: card.color }}>{card.value}</p>
            </div>
          ))}
        </div>

        <div
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: "14px",
            padding: "24px",
            marginBottom: "32px",
          }}
        >
          <p style={{ fontSize: "14px", fontWeight: 600, marginBottom: "16px" }}>Table Layout — Today</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
            {tables.map((table) => {
              const colors = tableColors[table.status];
              return (
                <div
                  key={table.id}
                  style={{
                    background: colors.bg,
                    border: `1px solid ${colors.border}`,
                    borderRadius: "10px",
                    padding: "14px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "8px",
                    }}
                  >
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "#ffffff" }}>
                      Table {table.id}
                    </span>
                    <span
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: colors.dot,
                        display: "block",
                      }}
                    />
                  </div>
                  <p style={{ fontSize: "11px", color: "#6b7280", marginBottom: "4px" }}>
                    {SEATS_PER_TABLE} seats
                  </p>
                  {table.status === "reserved" && table.reservation && (
                    <div>
                      <p style={{ fontSize: "11px", color: "#ffffff", fontWeight: 500 }}>
                        {table.reservation.guest_name}
                      </p>
                      <p style={{ fontSize: "11px", color: "#6b7280" }}>
                        {table.reservation.time} · {table.reservation.party_size} guests
                      </p>
                    </div>
                  )}
                  {table.status === "merged" && (
                    <p style={{ fontSize: "11px", color: "#f59e0b" }}>
                      Merged → Table {table.mergedWith}
                    </p>
                  )}
                  {table.status === "available" && (
                    <p style={{ fontSize: "11px", color: "#22c55e" }}>Available</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: "14px",
            padding: "24px",
          }}
        >
          <p style={{ fontSize: "14px", fontWeight: 600, marginBottom: "16px" }}>
            All Reservations ({reservations.length})
          </p>

          {loading ? (
            <p style={{ fontSize: "13px", color: "#6b7280" }}>Loading...</p>
          ) : reservations.length === 0 ? (
            <p style={{ fontSize: "13px", color: "#6b7280" }}>
              No reservations yet. Talk to Nancy to make one.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {[...reservations].reverse().map((res, i) => (
                <div
                  key={res.id ?? i}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr 80px 80px",
                    gap: "12px",
                    alignItems: "center",
                    padding: "14px 16px",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.05)",
                    borderRadius: "10px",
                  }}
                >
                  <div>
                    <p style={{ fontSize: "13px", fontWeight: 600 }}>{res.guest_name}</p>
                    {res.phone && <p style={{ fontSize: "11px", color: "#6b7280" }}>{res.phone}</p>}
                  </div>
                  <div>
                    <p style={{ fontSize: "13px", color: "#ffffff" }}>{res.date}</p>
                    <p style={{ fontSize: "11px", color: "#6b7280" }}>{res.time}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: "13px", color: "#ffffff" }}>{res.party_size} guests</p>
                  </div>
                  <div>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        color: res.calendar_synced ? "#22c55e" : "#6b7280",
                        background: res.calendar_synced
                          ? "rgba(34,197,94,0.1)"
                          : "rgba(255,255,255,0.05)",
                        padding: "3px 8px",
                        borderRadius: "6px",
                      }}
                    >
                      {res.calendar_synced ? "Synced" : "Local"}
                    </span>
                  </div>
                  <div>
                    {res.created_at && (
                      <p style={{ fontSize: "11px", color: "#4b5563" }}>
                        {new Date(res.created_at).toLocaleTimeString()}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
