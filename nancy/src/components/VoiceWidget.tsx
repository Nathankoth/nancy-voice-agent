"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const WS_URL = process.env.NEXT_PUBLIC_NANCY_WS_URL || "ws://localhost:8765/ws";

type Status = "idle" | "connecting" | "ready" | "listening" | "speaking" | "error";

interface LogEntry {
  category: string;
  message: string;
  timestamp: string;
  role?: string;
}

interface Reservation {
  guest_name?: string;
  phone?: string;
  email?: string;
  date?: string;
  time?: string;
  party_size?: number;
  table_number?: number;
}

const STATUS_CONFIG: Record<Status, { label: string; color: string; sublabel?: string }> = {
  idle: { label: "Talk to Nancy", color: "#22c55e" },
  connecting: { label: "Connecting...", color: "#f59e0b", sublabel: "Setting up your session" },
  ready: { label: "Nancy is listening", color: "#22c55e", sublabel: "Start speaking" },
  listening: { label: "Listening...", color: "#3b82f6", sublabel: "Go ahead, I'm listening" },
  speaking: { label: "Nancy is speaking", color: "#8b5cf6", sublabel: "Please wait..." },
  error: { label: "Connection failed", color: "#ef4444" },
};

function downsample(buffer: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return buffer;
  const ratio = fromRate / toRate;
  const length = Math.round(buffer.length / ratio);
  const result = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    result[i] = buffer[Math.floor(i * ratio)];
  }
  return result;
}

function floatTo16BitPCM(float32: Float32Array): Int16Array {
  const buffer = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    buffer[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return buffer;
}

export default function VoiceWidget() {
  const [status, setStatus] = useState<Status>("idle");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [error, setError] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const captureCtxRef = useRef<AudioContext | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextPlayTimeRef = useRef(0);
  const scheduledSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<Status>("idle");

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const addLog = useCallback((entry: LogEntry) => {
    setLogs((prev) => {
      const last = prev[prev.length - 1];
      if (last?.message === entry.message && last?.category === entry.category) return prev;
      return [...prev.slice(-99), entry];
    });
  }, []);

  const stopPlayback = useCallback(() => {
    scheduledSourcesRef.current.forEach((s) => {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    });
    scheduledSourcesRef.current = [];
    nextPlayTimeRef.current = 0;
  }, []);

  const playPcm = useCallback((int16Buffer: ArrayBuffer) => {
    if (!playbackCtxRef.current) {
      playbackCtxRef.current = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });
    }
    const ctx = playbackCtxRef.current;
    if (ctx.state === "suspended") void ctx.resume();

    const samples = new Int16Array(int16Buffer);
    const float32 = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      float32[i] = samples[i] / 32768;
    }

    const buffer = ctx.createBuffer(1, float32.length, OUTPUT_SAMPLE_RATE);
    buffer.copyToChannel(float32, 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    const start = Math.max(now, nextPlayTimeRef.current);
    source.start(start);
    nextPlayTimeRef.current = start + buffer.duration;
    scheduledSourcesRef.current.push(source);
    source.onended = () => {
      scheduledSourcesRef.current = scheduledSourcesRef.current.filter((s) => s !== source);
      if (scheduledSourcesRef.current.length === 0 && statusRef.current !== "idle") {
        setStatus("listening");
      }
    };
    setStatus("speaking");
  }, []);

  const cleanup = useCallback(() => {
    stopPlayback();
    processorRef.current?.disconnect();
    processorRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    void captureCtxRef.current?.close();
    captureCtxRef.current = null;
    void playbackCtxRef.current?.close();
    playbackCtxRef.current = null;
  }, [stopPlayback]);

  const connect = useCallback(async () => {
    setStatus("connecting");
    setError("");
    setLogs([]);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      mediaStreamRef.current = stream;

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.binaryType = "arraybuffer";

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          playPcm(event.data);
          return;
        }
        try {
          const data = JSON.parse(event.data as string);

          if (data.type === "ready") {
            setStatus("ready");
            const ctx = new AudioContext();
            captureCtxRef.current = ctx;
            const source = ctx.createMediaStreamSource(stream);
            const processor = ctx.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;
            processor.onaudioprocess = (e) => {
              if (ws.readyState !== WebSocket.OPEN) return;
              const input = e.inputBuffer.getChannelData(0);
              const downsampled = downsample(input, ctx.sampleRate, INPUT_SAMPLE_RATE);
              const pcm = floatTo16BitPCM(downsampled);
              ws.send(pcm.buffer);
            };
            source.connect(processor);
            processor.connect(ctx.destination);
            setStatus("listening");
            return;
          }

          if (data.type === "agent_event" && data.event?.type === "UserStartedSpeaking") {
            stopPlayback();
            return;
          }

          if (data.category) {
            addLog({
              category: data.category,
              message: data.message || "",
              timestamp: data.timestamp || new Date().toISOString(),
              role: data.extra?.role,
            });

            if (data.category === "stt") setStatus("listening");
            if (data.category === "tts") setStatus("speaking");

            if (data.category === "calendar" && data.extra?.result?.reservation) {
              setReservation(data.extra.result.reservation);
            }
          }
        } catch {
          /* ignore parse errors */
        }
      };

      ws.onerror = () => {
        setError("Cannot connect. Make sure the Python server is running: uv run main.py");
        setStatus("error");
        cleanup();
      };

      ws.onclose = () => {
        if (statusRef.current !== "error") setStatus("idle");
        cleanup();
      };
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Microphone access denied.");
      setStatus("error");
      cleanup();
    }
  }, [addLog, cleanup, playPcm, stopPlayback]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    cleanup();
    setStatus("idle");
  }, [cleanup]);

  useEffect(() => () => disconnect(), [disconnect]);

  const cfg = STATUS_CONFIG[status];
  const isActive = !["idle", "error"].includes(status);
  const conversation = logs.filter((l) => ["stt", "llm"].includes(l.category));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
        <div style={{ position: "relative" }}>
          {isActive && (
            <div
              style={{
                position: "absolute",
                inset: "-12px",
                borderRadius: "50%",
                border: `2px solid ${cfg.color}`,
                opacity: 0.3,
                animation: "pulse 2s ease-in-out infinite",
              }}
            />
          )}
          <button
            onClick={isActive ? disconnect : connect}
            style={{
              width: "100px",
              height: "100px",
              borderRadius: "50%",
              background: isActive ? "#111" : "#22c55e",
              border: `2px solid ${cfg.color}`,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s ease",
              position: "relative",
              zIndex: 1,
            }}
          >
            {isActive ? (
              <svg width="28" height="28" viewBox="0 0 24 24" fill={cfg.color}>
                <rect x="6" y="6" width="12" height="12" rx="3" />
              </svg>
            ) : (
              <svg width="32" height="32" viewBox="0 0 24 24">
                <path fill="white" d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"
                />
              </svg>
            )}
          </button>
        </div>

        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: "15px", fontWeight: 600, color: cfg.color }}>
            {cfg.label}
          </p>
          {cfg.sublabel && (
            <p style={{ fontSize: "12px", color: "#6b7280", marginTop: "3px" }}>
              {cfg.sublabel}
            </p>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.1); opacity: 0.15; }
        }
      `}</style>

      {error && (
        <div
          style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.15)",
            borderRadius: "10px",
            padding: "12px 16px",
            fontSize: "13px",
            color: "#f87171",
            lineHeight: 1.5,
          }}
        >
          {error}
        </div>
      )}

      {reservation && (
        <div
          style={{
            background: "rgba(34,197,94,0.06)",
            border: "1px solid rgba(34,197,94,0.2)",
            borderRadius: "12px",
            padding: "20px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
            <span style={{ fontSize: "16px" }}>✓</span>
            <p style={{ fontSize: "14px", fontWeight: 600, color: "#22c55e" }}>
              Reservation Confirmed
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {[
              { label: "Name", value: reservation.guest_name },
              { label: "Date", value: reservation.date },
              { label: "Time", value: reservation.time },
              {
                label: "Guests",
                value: reservation.party_size ? `${reservation.party_size} people` : undefined,
              },
              { label: "Phone", value: reservation.phone },
              { label: "Email", value: reservation.email },
            ]
              .filter((f) => f.value)
              .map((field) => (
                <div
                  key={field.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingBottom: "10px",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  <span style={{ fontSize: "12px", color: "#6b7280" }}>{field.label}</span>
                  <span style={{ fontSize: "13px", color: "#ffffff", fontWeight: 500 }}>
                    {field.value}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {conversation.length > 0 && (
        <div
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: "12px",
            padding: "20px",
          }}
        >
          <p
            style={{
              fontSize: "11px",
              color: "#4b5563",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: "16px",
              fontWeight: 600,
            }}
          >
            Conversation
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {conversation.map((log, i) => {
              const isUser = log.category === "stt";
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: isUser ? "flex-end" : "flex-start",
                    gap: "4px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "10px",
                      color: "#4b5563",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {isUser ? "You" : "Nancy"}
                  </span>
                  <div
                    style={{
                      maxWidth: "80%",
                      padding: "10px 14px",
                      borderRadius: isUser ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                      background: isUser ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.05)",
                      border: `1px solid ${isUser ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.08)"}`,
                      fontSize: "13px",
                      color: "#e5e7eb",
                      lineHeight: 1.6,
                    }}
                  >
                    {log.message}
                  </div>
                </div>
              );
            })}
          </div>
          <div ref={logsEndRef} />
        </div>
      )}
    </div>
  );
}
