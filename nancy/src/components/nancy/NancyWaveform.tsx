"use client";

import type { ConnectionStatus } from "@/hooks/useNancyVoice";

interface NancyWaveformProps {
  status: ConnectionStatus;
}

export default function NancyWaveform({ status }: NancyWaveformProps) {
  const active = status === "listening" || status === "speaking" || status === "ready";
  const speaking = status === "speaking";

  return (
    <div className="nancy-waveform" aria-hidden="true">
      <div className={`nancy-waveform__orb ${active ? "nancy-waveform__orb--live" : ""}`} />
      <div className={`nancy-waveform__bars ${active ? "nancy-waveform__bars--live" : ""}`}>
        {Array.from({ length: 20 }).map((_, i) => (
          <span
            key={i}
            className={`nancy-waveform__bar ${speaking ? "nancy-waveform__bar--agent" : ""}`}
            style={{ animationDelay: `${i * 0.05}s` }}
          />
        ))}
      </div>
    </div>
  );
}
