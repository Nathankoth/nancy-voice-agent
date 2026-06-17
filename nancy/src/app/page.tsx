import VoiceWidget from "@/components/VoiceWidget";

export default function NancyPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ width: "100%", maxWidth: "420px" }}>
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <div
            style={{
              width: "56px",
              height: "56px",
              background: "rgba(34,197,94,0.1)",
              border: "1px solid rgba(34,197,94,0.15)",
              borderRadius: "14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 14px",
              fontSize: "24px",
            }}
          >
            🍽️
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#ffffff", marginBottom: "6px" }}>
            Nancy
          </h1>
          <p style={{ fontSize: "13px", color: "#6b7280", lineHeight: 1.5 }}>
            Hi! I&apos;m Nancy, your reservation assistant.
            <br />
            Press the button below and tell me when you&apos;d like to dine.
          </p>
        </div>
        <VoiceWidget />
      </div>
    </main>
  );
}
