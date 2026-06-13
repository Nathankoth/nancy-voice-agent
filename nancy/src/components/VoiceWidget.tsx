"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const WS_URL = process.env.NEXT_PUBLIC_NANCY_WS_URL || "ws://localhost:8765/ws";

type ConnectionStatus =
  | "idle"
  | "connecting"
  | "ready"
  | "speaking"
  | "listening"
  | "error";

interface LogEntry {
  category: string;
  message: string;
  timestamp: string;
}

interface Reservation {
  guest_name?: string;
  date?: string;
  time?: string;
  party_size?: number;
  guests?: number;
  phone?: string;
}

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
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [lastReservation, setLastReservation] = useState<Reservation | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const captureCtxRef = useRef<AudioContext | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef(0);
  const scheduledSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const addLog = useCallback((entry: LogEntry) => {
    setLogs((prev) => [...prev.slice(-49), entry]);
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
      if (scheduledSourcesRef.current.length === 0) {
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

  const startMicrophone = useCallback(
    (stream: MediaStream, ws: WebSocket) => {
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
      setIsRecording(true);
      setStatus("listening");
    },
    []
  );

  const connect = useCallback(async () => {
    setStatus("connecting");
    setError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      mediaStreamRef.current = stream;

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        addLog({
          category: "system",
          message: "Connecting to Nancy...",
          timestamp: new Date().toISOString(),
        });
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          playPcm(event.data);
          return;
        }

        try {
          const data = JSON.parse(event.data as string);

          if (data.type === "ready") {
            setStatus("ready");
            startMicrophone(stream, ws);
            return;
          }

          if (data.type === "agent_event" && data.event?.type === "UserStartedSpeaking") {
            stopPlayback();
            return;
          }

          if (data.type === "log" || data.category) {
            addLog({
              category: data.category || "system",
              message: data.message || "",
              timestamp: data.timestamp || new Date().toISOString(),
            });

            if (data.category === "calendar" && data.message?.includes("Reservation confirmed")) {
              const meta = data.extra?.result?.reservation;
              if (meta) {
                setLastReservation({
                  ...meta,
                  party_size: meta.party_size ?? meta.guests,
                });
              }
            }

            if (data.category === "tts") setStatus("speaking");
            if (data.category === "stt") setStatus("listening");
          }
        } catch {
          /* ignore parse errors */
        }
      };

      ws.onerror = () => {
        setError(
          "Cannot connect to Nancy. Make sure the Python server is running: uv run main.py"
        );
        setStatus("error");
      };

      ws.onclose = () => {
        setStatus("idle");
        setIsRecording(false);
        cleanup();
      };
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Microphone access denied");
      setStatus("error");
    }
  }, [addLog, cleanup, playPcm, startMicrophone, stopPlayback]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    cleanup();
    setStatus("idle");
    setIsRecording(false);
  }, [cleanup]);

  useEffect(() => () => disconnect(), [disconnect]);

  const statusConfig = {
    idle: { label: "Talk to Nancy", color: "#22c55e", pulse: false },
    connecting: { label: "Connecting...", color: "#f59e0b", pulse: true },
    ready: { label: "Nancy is ready", color: "#22c55e", pulse: true },
    listening: { label: "Listening...", color: "#3b82f6", pulse: true },
    speaking: { label: "Nancy is speaking", color: "#8b5cf6", pulse: true },
    error: { label: "Connection failed", color: "#ef4444", pulse: false },
  }[status];

  const categoryColors: Record<string, string> = {
    stt: "#3b82f6",
    llm: "#8b5cf6",
    tts: "#22c55e",
    calendar: "#f59e0b",
    system: "#6b7280",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px" }}>
        <button
          onClick={status === "idle" || status === "error" ? connect : disconnect}
          style={{
            width: "120px",
            height: "120px",
            borderRadius: "50%",
            background: status === "idle" || status === "error" ? "#22c55e" : "#1a1a1a",
            border: `3px solid ${statusConfig.color}`,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.2s ease",
            boxShadow: statusConfig.pulse
              ? `0 0 0 8px ${statusConfig.color}22, 0 0 0 16px ${statusConfig.color}11`
              : "none",
          }}
        >
          {status === "idle" || status === "error" ? (
            <svg width="40" height="40" viewBox="0 0 24 24" fill="white">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path
                d="M19 10v2a7 7 0 0 1-14 0v-2"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <line x1="12" y1="19" x2="12" y2="23" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <line x1="8" y1="23" x2="16" y2="23" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <rect x="6" y="6" width="12" height="12" rx="2" fill={statusConfig.color} />
            </svg>
          )}
        </button>

        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: "16px", fontWeight: 600, color: statusConfig.color }}>
            {statusConfig.label}
          </p>
          {isRecording && (
            <p style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>
              Click the button to end the call
            </p>
          )}
        </div>
      </div>

      {error && (
        <div
          style={{
            background: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: "10px",
            padding: "12px 16px",
            fontSize: "13px",
            color: "#f87171",
          }}
        >
          {error}
        </div>
      )}

      {lastReservation && (
        <div
          style={{
            background: "rgba(34,197,94,0.08)",
            border: "1px solid rgba(34,197,94,0.2)",
            borderRadius: "12px",
            padding: "16px",
          }}
        >
          <p style={{ fontSize: "13px", fontWeight: 600, color: "#22c55e", marginBottom: "10px" }}>
            ✓ Reservation Confirmed
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            {[
              { label: "Guest", value: lastReservation.guest_name },
              { label: "Date", value: lastReservation.date },
              { label: "Time", value: lastReservation.time },
              {
                label: "Party size",
                value: (lastReservation.party_size ?? lastReservation.guests)?.toString(),
              },
              { label: "Phone", value: lastReservation.phone },
            ]
              .filter((f) => f.value)
              .map((field) => (
                <div key={field.label}>
                  <p style={{ fontSize: "11px", color: "#6b7280" }}>{field.label}</p>
                  <p style={{ fontSize: "13px", color: "#ffffff", fontWeight: 500 }}>{field.value}</p>
                </div>
              ))}
          </div>
        </div>
      )}

      {logs.length > 0 && (
        <div
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: "12px",
            padding: "16px",
            maxHeight: "240px",
            overflowY: "auto",
          }}
        >
          <p
            style={{
              fontSize: "11px",
              color: "#4b5563",
              marginBottom: "10px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Conversation log
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {logs.map((log, i) => (
              <div key={i} style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 600,
                    color: categoryColors[log.category] || "#6b7280",
                    minWidth: "40px",
                    paddingTop: "1px",
                    textTransform: "uppercase",
                  }}
                >
                  {log.category}
                </span>
                <span style={{ fontSize: "12px", color: "#9ca3af", lineHeight: 1.4 }}>{log.message}</span>
              </div>
            ))}
          </div>
          <div ref={logsEndRef} />
        </div>
      )}
    </div>
  );
}
