import { useEffect, useRef } from "react";
import gsap from "gsap";
import Lenis from "lenis";
import { useNancyConnection } from "./hooks/useNancyConnection.js";
import MeetNancy from "./components/MeetNancy.jsx";
import LiveCall from "./components/LiveCall.jsx";
import Receipt from "./components/Receipt.jsx";
import "./styles/global.css";
import "./App.css";

/**
 * Single-page state machine: idle → connecting → live → ended
 * Receipt animates in below call UI — no route change for main flow.
 */
export default function DemoPage() {
  const {
    phase,
    agentState,
    transcript,
    receipt,
    error,
    reconnecting,
    amplitude,
    startCall,
    endCall,
    retry,
    isMockMode,
  } = useNancyConnection();

  const lenisRef = useRef(null);
  const receiptAnchorRef = useRef(null);
  const prevPhaseRef = useRef(phase);

  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });
    lenisRef.current = lenis;

    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    return () => {
      lenis.destroy();
    };
  }, []);

  useEffect(() => {
    if (prevPhaseRef.current !== phase) {
      gsap.fromTo(
        ".demo-stage--active",
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" }
      );
      prevPhaseRef.current = phase;
    }
  }, [phase]);

  useEffect(() => {
    if (phase === "ended" && receiptAnchorRef.current) {
      setTimeout(() => {
        lenisRef.current?.scrollTo(receiptAnchorRef.current, { offset: -24 });
      }, 400);
    }
  }, [phase]);

  const showMeet = phase === "idle";
  const showCall = phase === "connecting" || phase === "live" || phase === "ended";
  const showReceipt = phase === "ended" && receipt;

  const handleStart = () => {
    void startCall();
  };

  const handleEnd = () => {
    endCall(true);
  };

  return (
    <div className="rift-demo">
      <div className="rift-shell">
        {showMeet && (
          <div className="demo-stage demo-stage--active">
            <MeetNancy
              onStart={handleStart}
              error={error}
              onRetry={retry}
              isMockMode={isMockMode}
              isConnecting={false}
            />
          </div>
        )}

        {showCall && (
          <div className={`demo-stage demo-stage--active ${phase === "ended" ? "demo-stage--ended" : ""}`}>
            <LiveCall
              transcript={transcript}
              agentState={phase === "connecting" ? "connecting" : agentState}
              amplitude={phase === "ended" ? 0 : amplitude}
              phase={phase === "ended" ? "live" : phase}
              onEnd={handleEnd}
              reconnecting={reconnecting}
            />
            {error && phase !== "ended" && (
              <div className="error-banner" style={{ marginTop: 16 }}>
                <p>{error}</p>
              </div>
            )}
          </div>
        )}

        {showReceipt && (
          <div ref={receiptAnchorRef}>
            <Receipt receipt={receipt} />
          </div>
        )}

        {phase === "ended" && showReceipt && (
          <div className="rift-footer">
            <a href="https://rift.studio" target="_blank" rel="noreferrer">
              Get Nancy for your restaurant → RIFT.STUDIO
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
