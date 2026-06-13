import VoiceWidget from "@/components/VoiceWidget";
import Link from "next/link";

export default function NancyPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "#ffffff",
        fontFamily: "system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div style={{ width: "100%", maxWidth: "480px" }}>
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <div
            style={{
              width: "64px",
              height: "64px",
              background: "rgba(34,197,94,0.1)",
              border: "1px solid rgba(34,197,94,0.2)",
              borderRadius: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
              fontSize: "28px",
            }}
          >
            🍽️
          </div>
          <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "6px" }}>Nancy</h1>
          <p style={{ fontSize: "14px", color: "#6b7280" }}>Your restaurant reservation assistant</p>
        </div>

        <VoiceWidget />

        <div style={{ textAlign: "center", marginTop: "32px" }}>
          <Link
            href="/admin"
            style={{
              fontSize: "13px",
              color: "#4b5563",
              textDecoration: "none",
              borderBottom: "1px solid rgba(255,255,255,0.1)",
              paddingBottom: "2px",
            }}
          >
            View reservations admin →
          </Link>
        </div>
      </div>
    </main>
  );
}
