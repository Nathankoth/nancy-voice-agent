"use client";

import { useEffect, useRef } from "react";
import type { LogEntry } from "@/hooks/useNancyVoice";

interface NancyTranscriptProps {
  logs: LogEntry[];
  compact?: boolean;
}

export default function NancyTranscript({ logs, compact }: NancyTranscriptProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const conversation = logs.filter((l) => l.category === "stt" || l.category === "llm");

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [conversation]);

  if (!conversation.length) {
    return (
      <div className={`nancy-transcript ${compact ? "nancy-transcript--compact" : ""}`}>
        <p className="nancy-transcript__empty">Your conversation will appear here…</p>
      </div>
    );
  }

  return (
    <div
      className={`nancy-transcript ${compact ? "nancy-transcript--compact" : ""}`}
      role="log"
      aria-live="polite"
    >
      {conversation.map((line, i) => {
        const isNancy = line.category === "llm";
        return (
          <div
            key={`${line.timestamp}-${i}`}
            className={`nancy-transcript__line nancy-transcript__line--${isNancy ? "nancy" : "caller"}`}
          >
            <span className="nancy-transcript__who">{isNancy ? "Nancy" : "You"}</span>
            <p>{line.message}</p>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
