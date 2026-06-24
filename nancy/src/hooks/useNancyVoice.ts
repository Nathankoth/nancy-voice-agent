"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { isLocalNancyBackend, wakeLocalBackend } from "@/lib/wake-backend";
import { reservationToReceipt, type CallReceipt } from "@/lib/receipts";

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const WS_URL = process.env.NEXT_PUBLIC_NANCY_WS_URL || "ws://localhost:8765/ws";

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "ready"
  | "speaking"
  | "listening"
  | "error";

export interface LogEntry {
  category: string;
  message: string;
  timestamp: string;
}

export interface Reservation {
  id?: string;
  guest_name?: string;
  date?: string;
  time?: string;
  party_size?: number;
  guests?: number;
  phone?: string;
  special_requests?: string;
  session_id?: string;
}

export type ViewPhase = "call" | "receipt";

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

export function useNancyVoice() {
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [lastReservation, setLastReservation] = useState<Reservation | null>(null);
  const [customerReceipt, setCustomerReceipt] = useState<CallReceipt | null>(null);
  const [viewPhase, setViewPhase] = useState<ViewPhase>("call");
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState("");

  const lastReservationRef = useRef<Reservation | null>(null);
  useEffect(() => {
    lastReservationRef.current = lastReservation;
  }, [lastReservation]);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const captureCtxRef = useRef<AudioContext | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef(0);
  const scheduledSourcesRef = useRef<AudioBufferSourceNode[]>([]);

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

  const finishCall = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    cleanup();
    setIsRecording(false);
    setStatus("idle");

    const res = lastReservationRef.current;
    if (res?.guest_name && res?.date) {
      setCustomerReceipt(
        reservationToReceipt({
          ...res,
          guest_name: res.guest_name,
          party_size: res.party_size ?? res.guests ?? 0,
          date: res.date,
          time: res.time ?? "",
          special_requests: res.special_requests,
        })
      );
      setViewPhase("receipt");
    } else {
      setViewPhase("call");
    }
  }, [cleanup]);

  const disconnect = finishCall;

  const startNewCall = useCallback(() => {
    setCustomerReceipt(null);
    setLastReservation(null);
    setLogs([]);
    setViewPhase("call");
    setError("");
    setStatus("idle");
  }, []);

  const startMicrophone = useCallback((stream: MediaStream, ws: WebSocket) => {
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
  }, []);

  const connect = useCallback(async () => {
    setStatus("connecting");
    setError("");
    setLastReservation(null);
    setCustomerReceipt(null);
    setViewPhase("call");
    setLogs([]);

    try {
      if (isLocalNancyBackend(WS_URL)) {
        addLog({
          category: "system",
          message: "Starting Nancy backend…",
          timestamp: new Date().toISOString(),
        });
        await wakeLocalBackend();
      }

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
          message: "Connected to Nancy",
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

          if (data.type === "session_end") {
            addLog({
              category: "system",
              message:
                data.message ||
                (data.reason === "conversation_complete"
                  ? "Thank you for calling. Goodbye!"
                  : "Call ended."),
              timestamp: new Date().toISOString(),
            });
            stopPlayback();
            finishCall();
            return;
          }

          if (data.type === "agent_event" && data.event?.type === "UserStartedSpeaking") {
            stopPlayback();
            return;
          }

          if (data.type === "log" || data.category) {
            const category = data.category || "system";
            const message = data.message || "";

            if (category === "stt" || category === "llm") {
              addLog({
                category,
                message,
                timestamp: data.timestamp || new Date().toISOString(),
              });
            }

            if (category === "calendar" && data.extra?.result?.reservation) {
              const meta = data.extra.result.reservation;
              if (meta.status !== "declined") {
                setLastReservation({
                  ...meta,
                  party_size: meta.party_size ?? meta.guests,
                  special_requests: meta.special_requests,
                });
              }
            }

            if (category === "tts") setStatus("speaking");
            if (category === "stt") setStatus("listening");
          }
        } catch {
          /* ignore */
        }
      };

      ws.onerror = () => {
        setError(
          isLocalNancyBackend(WS_URL)
            ? "Could not connect. Tap again. The backend starts automatically."
            : "Cannot connect to Nancy. Check your connection settings."
        );
        setStatus("error");
      };

      ws.onclose = () => {
        const wasConnected = wsRef.current === ws;
        if (!wasConnected) return;
        wsRef.current = null;
        stopPlayback();
        cleanup();
        setIsRecording(false);
        setStatus("idle");

        const res = lastReservationRef.current;
        if (res?.guest_name && res?.date) {
          setCustomerReceipt(
            reservationToReceipt({
              ...res,
              guest_name: res.guest_name,
              party_size: res.party_size ?? res.guests ?? 0,
              date: res.date,
              time: res.time ?? "",
              special_requests: res.special_requests,
            })
          );
          setViewPhase("receipt");
        }
      };
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Microphone access denied");
      setStatus("error");
    }
  }, [addLog, cleanup, disconnect, playPcm, startMicrophone, stopPlayback]);

  useEffect(() => () => disconnect(), [disconnect]);

  return {
    status,
    logs,
    lastReservation,
    customerReceipt,
    viewPhase,
    isRecording,
    error,
    isActive: status !== "idle" && status !== "error" && viewPhase === "call",
    connect,
    disconnect,
    startNewCall,
    setError,
  };
}

export const STATUS_META: Record<
  ConnectionStatus,
  { label: string; color: string; pulse: boolean }
> = {
  idle: { label: "Talk to Nancy", color: "var(--nancy-accent)", pulse: false },
  connecting: { label: "Connecting…", color: "#d4a574", pulse: true },
  ready: { label: "Nancy is ready", color: "var(--nancy-accent)", pulse: true },
  listening: { label: "Listening", color: "#7eb8da", pulse: true },
  speaking: { label: "Nancy is speaking", color: "#c4a0e8", pulse: true },
  error: { label: "Connection failed", color: "#e85d5d", pulse: false },
};
