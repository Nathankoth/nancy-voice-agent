import Transcript from "./Transcript.jsx";
import Waveform from "./Waveform.jsx";

const STATE_LABELS = {
  listening: "Listening",
  thinking: "Nancy is thinking",
  speaking: "Nancy is speaking",
  connecting: "Connecting",
};

export default function LiveCall({
  transcript,
  agentState,
  amplitude,
  phase,
  onEnd,
  reconnecting,
}) {
  const isConnecting = phase === "connecting";

  return (
    <section className="live" aria-label="Live call with Nancy">
      <div className="live__status">
        <span className={`live__dot live__dot--${agentState}`} />
        <span className="live__label">
          {reconnecting ? "Reconnecting…" : STATE_LABELS[agentState] || "Live"}
        </span>
      </div>

      <Waveform
        amplitude={amplitude}
        agentState={agentState}
        isActive={!isConnecting}
      />

      <Transcript lines={transcript} agentState={isConnecting ? "connecting" : agentState} />

      <div className="live__actions">
        <button type="button" className="btn-ghost" onClick={onEnd} disabled={isConnecting}>
          End call
        </button>
      </div>
    </section>
  );
}
