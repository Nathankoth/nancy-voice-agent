"use client";

import { useState } from "react";
import { useNancyVoice } from "@/hooks/useNancyVoice";
import NancyCallPanel from "./NancyCallPanel";

export type NancyWidgetVariant = "full" | "floating" | "inline";

export interface NancyWidgetProps {
  /** full = embedded panel, floating = FAB + drawer, inline = slim bar */
  variant?: NancyWidgetVariant;
  restaurantName?: string;
  className?: string;
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export default function NancyWidget({
  variant = "full",
  restaurantName = "XYZ Restaurant",
  className = "",
}: NancyWidgetProps) {
  const voice = useNancyVoice();
  const [open, setOpen] = useState(false);

  const panel = (
    <NancyCallPanel
      status={voice.status}
      logs={voice.logs}
      viewPhase={voice.viewPhase}
      customerReceipt={voice.customerReceipt}
      isRecording={voice.isRecording}
      error={voice.error}
      restaurantName={restaurantName}
      compact={variant !== "full"}
      onConnect={voice.connect}
      onDisconnect={voice.disconnect}
      onNewCall={voice.startNewCall}
    />
  );

  if (variant === "full") {
    return <div className={`nancy-widget nancy-widget--full ${className}`}>{panel}</div>;
  }

  if (variant === "inline") {
    return (
      <div className={`nancy-widget nancy-widget--inline ${className}`}>
        <div className="nancy-inline">
          <div className="nancy-inline__info">
            <span className="nancy-inline__dot" data-active={voice.isActive} />
            <span className="nancy-inline__label">
              {voice.isActive ? "On a call with Nancy" : "Need a table? Talk to Nancy"}
            </span>
          </div>
          <button
            type="button"
            className="nancy-inline__btn"
            onClick={voice.isActive ? voice.disconnect : voice.connect}
          >
            {voice.isActive ? "End call" : "Call Nancy"}
          </button>
        </div>
        {voice.isActive && <div className="nancy-inline__expand">{panel}</div>}
      </div>
    );
  }

  // floating widget
  return (
    <div className={`nancy-widget nancy-widget--floating ${className}`}>
      {open && (
        <div className="nancy-floating__backdrop" onClick={() => setOpen(false)} aria-hidden="true" />
      )}

      <div className={`nancy-floating__panel ${open ? "nancy-floating__panel--open" : ""}`}>
        <button
          type="button"
          className="nancy-floating__close"
          onClick={() => setOpen(false)}
          aria-label="Close Nancy"
        >
          <CloseIcon />
        </button>
        {panel}
      </div>

      <button
        type="button"
        className={`nancy-floating__fab ${voice.isActive ? "nancy-floating__fab--active" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close Nancy assistant" : "Open Nancy assistant"}
        aria-expanded={open}
      >
        {open ? <CloseIcon /> : <span className="nancy-floating__fab-label">N</span>}
        {voice.isActive && !open && <span className="nancy-floating__fab-ring" />}
      </button>
    </div>
  );
}
