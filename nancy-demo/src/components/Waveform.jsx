import { useEffect, useRef } from "react";
import gsap from "gsap";

export default function Waveform({ amplitude, agentState, isActive }) {
  const barsRef = useRef([]);
  const orbRef = useRef(null);

  useEffect(() => {
    if (!isActive) return;
    const bars = barsRef.current;
    bars.forEach((bar, i) => {
      if (!bar) return;
      const base = 0.12 + (i % 5) * 0.04;
      const boost = agentState === "speaking" ? 0.25 : amplitude;
      const h = Math.max(8, (base + boost * (0.6 + (i % 3) * 0.15)) * 72);
      gsap.to(bar, {
        height: h,
        duration: 0.12,
        ease: "power2.out",
        overwrite: true,
      });
    });
  }, [amplitude, agentState, isActive]);

  useEffect(() => {
    if (!orbRef.current || !isActive) return;
    gsap.to(orbRef.current, {
      scale: 1 + amplitude * 0.35,
      opacity: 0.35 + amplitude * 0.4,
      duration: 0.5,
      ease: "power2.out",
      overwrite: true,
    });
  }, [amplitude, isActive]);

  if (!isActive) {
    return (
      <div className="waveform waveform--rest">
        <div className="waveform__orb" ref={orbRef} />
      </div>
    );
  }

  const accent = agentState === "speaking" ? "var(--muted)" : "var(--accent)";

  return (
    <div className="waveform waveform--live">
      <div
        className="waveform__orb waveform__orb--live"
        ref={orbRef}
        style={{ boxShadow: `0 0 60px ${accent}44` }}
      />
      <div className="waveform__bars" aria-hidden="true">
        {Array.from({ length: 24 }).map((_, i) => (
          <span
            key={i}
            ref={(el) => {
              barsRef.current[i] = el;
            }}
            className="waveform__bar"
            style={{ background: accent }}
          />
        ))}
      </div>
    </div>
  );
}
