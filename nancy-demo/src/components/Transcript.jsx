import { useEffect, useRef } from "react";

export default function Transcript({ lines, agentState }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines]);

  if (!lines.length) {
    return (
      <div className="transcript transcript--empty">
        <p className="muted">
          {agentState === "connecting" ? "Connecting…" : "Speak when you're ready."}
        </p>
      </div>
    );
  }

  return (
    <div className="transcript" role="log" aria-live="polite">
      {lines.map((line, i) => (
        <div
          key={`${line.speaker}-${i}-${line.t}`}
          className={`transcript__line transcript__line--${line.speaker} ${
            line.final === false ? "transcript__line--interim" : ""
          }`}
        >
          <span className="transcript__label">
            {line.speaker === "nancy" ? "Nancy" : "You"}
          </span>
          <p>{line.text}</p>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
