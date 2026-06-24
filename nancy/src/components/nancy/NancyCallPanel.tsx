"use client";

import type { ConnectionStatus, LogEntry, Reservation, ViewPhase } from "@/hooks/useNancyVoice";
import { STATUS_META } from "@/hooks/useNancyVoice";
import type { CallReceipt } from "@/lib/receipts";
import NancyWaveform from "./NancyWaveform";
import NancyTranscript from "./NancyTranscript";
import NancyCustomerReceipt from "./NancyCustomerReceipt";

interface NancyCallPanelProps {
  status: ConnectionStatus;
  logs: LogEntry[];
  viewPhase: ViewPhase;
  customerReceipt: CallReceipt | null;
  isRecording: boolean;
  error: string;
  restaurantName?: string;
  compact?: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onNewCall: () => void;
}

function MicIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" fill="currentColor" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="8" y1="23" x2="16" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
    </svg>
  );
}

export default function NancyCallPanel({
  status,
  logs,
  viewPhase,
  customerReceipt,
  isRecording,
  error,
  restaurantName = "XYZ Restaurant",
  compact,
  onConnect,
  onDisconnect,
  onNewCall,
}: NancyCallPanelProps) {
  if (viewPhase === "receipt" && customerReceipt) {
    return (
      <div className={`nancy-panel nancy-panel--receipt ${compact ? "nancy-panel--compact" : ""}`}>
        <NancyCustomerReceipt receipt={customerReceipt} onNewCall={onNewCall} />
      </div>
    );
  }

  const meta = STATUS_META[status];
  const canStart = status === "idle" || status === "error";
  const inCall = !canStart;

  return (
    <div className={`nancy-panel ${compact ? "nancy-panel--compact" : ""}`}>
      {!compact && (
        <header className="nancy-panel__header">
          <div className="nancy-panel__avatar">N</div>
          <div>
            <h2 className="nancy-panel__title">Nancy</h2>
            <p className="nancy-panel__subtitle">{restaurantName} · Voice receptionist</p>
          </div>
          {inCall && (
            <span className="nancy-panel__live">
              <span className="nancy-panel__live-dot" />
              Live
            </span>
          )}
        </header>
      )}

      <div className="nancy-panel__stage">
        <NancyWaveform status={status} />
        <button
          type="button"
          className={`nancy-panel__cta ${meta.pulse ? "nancy-panel__cta--pulse" : ""}`}
          style={{ "--cta-color": meta.color } as React.CSSProperties}
          onClick={canStart ? onConnect : onDisconnect}
          aria-label={canStart ? "Start call with Nancy" : "End call"}
        >
          {canStart ? <MicIcon /> : <StopIcon />}
        </button>
        <p className="nancy-panel__status" style={{ color: meta.color }}>
          {meta.label}
        </p>
        {isRecording && <p className="nancy-panel__hint">Tap the button to end the call</p>}
        {canStart && !error && (
          <p className="nancy-panel__hint">Uses your mic · No app required</p>
        )}
      </div>

      {error && (
        <div className="nancy-panel__error" role="alert">
          {error}
        </div>
      )}

      {inCall && logs.some((l) => l.category === "stt" || l.category === "llm") && (
        <NancyTranscript logs={logs} compact={compact} />
      )}
    </div>
  );
}
