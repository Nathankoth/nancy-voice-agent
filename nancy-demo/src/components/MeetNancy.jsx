import Waveform from "./Waveform.jsx";

/*
 * Headline options (pick strongest):
 * - "Nancy answers the calls your staff are too busy to catch."
 * - "Your front desk never misses a reservation again."
 * - "Every ring answered. Every order captured."
 */
const HEADLINE = "Nancy answers the calls your staff are too busy to catch.";

export default function MeetNancy({ onStart, error, onRetry, isMockMode, isConnecting }) {
  return (
    <section className="meet" aria-label="Meet Nancy">
      <p className="meet__eyebrow muted">RIFT.STUDIO × Voice AI</p>

      <h1 className="display meet__headline">{HEADLINE}</h1>

      <p className="serif-accent meet__sub">
        A receptionist who never puts a caller on hold.
      </p>

      <div className="meet__cta">
        <button
          type="button"
          className="btn-primary"
          onClick={onStart}
          disabled={isConnecting}
        >
          {isConnecting ? "Connecting…" : "Talk to Nancy"}
        </button>
        <p className="meet__reassure muted">
          Uses your phone&apos;s mic. No app, no dialing.
        </p>
        {isMockMode && (
          <span className="mock-badge">Demo mode — no backend required</span>
        )}
      </div>

      <Waveform amplitude={0} agentState="listening" isActive={false} />

      {error && (
        <div className="error-banner">
          <p>{error}</p>
          <button type="button" className="btn-link" onClick={onRetry} style={{ marginTop: 8 }}>
            Try again
          </button>
        </div>
      )}
    </section>
  );
}
