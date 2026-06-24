import { useCallback, useEffect, useRef, useState } from "react";
import { createMockConnection } from "../mock/mockConversation.js";
import { SAMPLE_RECEIPT } from "../mock/sampleReceipt.js";
import { createMicCapture } from "../utils/audioCapture.js";
import { createAudioPlayer } from "../utils/audioPlayback.js";

const WS_URL = import.meta.env.VITE_NANCY_WS_URL || "";
const IS_MOCK = !WS_URL;

const DEFAULT_RESTAURANT = {
  name: "Terra Kulture",
  area: "Victoria Island",
};

/**
 * useNancyConnection — abstracts live WebSocket vs mock demo transport.
 * Live mode adapts the existing Python bridge log events into transcript/state.
 */
export function useNancyConnection() {
  const [phase, setPhase] = useState("idle"); // idle | connecting | live | ended
  const [agentState, setAgentState] = useState("listening");
  const [transcript, setTranscript] = useState([]);
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState(null);
  const [isMock, setIsMock] = useState(IS_MOCK);
  const [reconnecting, setReconnecting] = useState(false);
  const [amplitude, setAmplitude] = useState(0);

  const wsRef = useRef(null);
  const captureRef = useRef(null);
  const playerRef = useRef(null);
  const mockRef = useRef(null);
  const streamRef = useRef(null);
  const transcriptRef = useRef([]);
  const reservationRef = useRef(null);
  const ampFrameRef = useRef(null);
  const restaurantRef = useRef(DEFAULT_RESTAURANT);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const pushTranscript = useCallback((entry) => {
    setTranscript((prev) => {
      const last = prev[prev.length - 1];
      if (!entry.final && last && last.speaker === entry.speaker && !last.final) {
        const next = [...prev.slice(0, -1), { ...entry, t: Date.now() }];
        transcriptRef.current = next;
        return next;
      }
      if (entry.final && last && last.speaker === entry.speaker && !last.final) {
        const next = [...prev.slice(0, -1), { ...entry, final: true, t: Date.now() }];
        transcriptRef.current = next;
        return next;
      }
      const next = [...prev, { ...entry, t: Date.now() }];
      transcriptRef.current = next;
      return next;
    });
  }, []);

  const handleServerEvent = useCallback(
    (event) => {
      if (event.type === "transcript") {
        pushTranscript(event);
        return;
      }
      if (event.type === "state") {
        setAgentState(event.value);
        return;
      }
      if (event.type === "result") {
        setReceipt(event.receipt);
        setPhase("ended");
        return;
      }
      if (event.type === "error") {
        setError(event.message);
      }
    },
    [pushTranscript]
  );

  /** Map existing Python bridge log format → demo contract */
  const adaptLegacyMessage = useCallback(
    (data) => {
      if (data.type === "ready") {
        setAgentState("listening");
        return;
      }

      if (data.type === "log" || data.category) {
        const category = data.category || "system";
        const message = data.message || "";

        if (category === "stt") {
          handleServerEvent({
            type: "transcript",
            speaker: "caller",
            text: message,
            final: true,
          });
          setAgentState("listening");
        } else if (category === "llm") {
          handleServerEvent({
            type: "transcript",
            speaker: "nancy",
            text: message,
            final: true,
          });
          setAgentState("thinking");
        } else if (category === "tts") {
          setAgentState("speaking");
        }

        if (category === "calendar" && message.includes("Reservation confirmed")) {
          const res = data.extra?.result?.reservation;
          if (res) reservationRef.current = res;
        }
      }

      if (data.type === "agent_event") {
        const ev = data.event;
        if (ev?.type === "UserStartedSpeaking") {
          playerRef.current?.stopAll();
          setAgentState("listening");
        }
        if (ev?.type === "ConversationText") {
          const speaker = ev.role === "user" ? "caller" : "nancy";
          handleServerEvent({
            type: "transcript",
            speaker,
            text: ev.content || "",
            final: true,
          });
        }
      }
    },
    [handleServerEvent]
  );

  const buildReceiptFromSession = useCallback(() => {
    const res = reservationRef.current;
    const lines = transcriptRef.current.map(({ speaker, text, t }) => ({
      speaker,
      text,
      t: typeof t === "number" ? t : 0,
    }));

    if (res) {
      return {
        type: "booking",
        restaurant: restaurantRef.current,
        caller: {
          name: res.guest_name || res.name || "Guest",
          phone: res.phone || "",
        },
        timestamp: new Date().toISOString(),
        booking: {
          date: res.date,
          time: res.time,
          partySize: res.party_size ?? res.guests,
          name: res.guest_name || res.name,
          notes: res.notes || "",
        },
        order: null,
        transcript: lines.length ? lines : SAMPLE_RECEIPT.transcript,
      };
    }

    return {
      type: "booking",
      restaurant: restaurantRef.current,
      caller: { name: "Caller", phone: "" },
      timestamp: new Date().toISOString(),
      booking: null,
      order: null,
      transcript: lines.length ? lines : SAMPLE_RECEIPT.transcript,
    };
  }, []);

  const startAmplitudeLoop = useCallback(() => {
    const tick = () => {
      const analyser = captureRef.current?.analyser;
      if (analyser) {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length / 255;
        setAmplitude(avg);
      }
      ampFrameRef.current = requestAnimationFrame(tick);
    };
    ampFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const stopAmplitudeLoop = useCallback(() => {
    if (ampFrameRef.current) cancelAnimationFrame(ampFrameRef.current);
    setAmplitude(0);
  }, []);

  const cleanup = useCallback(() => {
    mockRef.current?.stop();
    mockRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
    captureRef.current?.destroy();
    captureRef.current = null;
    playerRef.current?.destroy();
    playerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    stopAmplitudeLoop();
    setReconnecting(false);
  }, [stopAmplitudeLoop]);

  const endCall = useCallback(
    (withReceipt = true) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: "stop" }));
        } catch {
          /* ignore */
        }
      }
      mockRef.current?.stop();
      cleanup();

      if (withReceipt) {
        if (!receipt) {
          setReceipt(buildReceiptFromSession());
        }
        setPhase("ended");
      } else {
        setPhase("idle");
      }
    },
    [buildReceiptFromSession, cleanup, receipt]
  );

  const connectLive = useCallback(
    async (stream) => {
      setIsMock(false);
      setPhase("connecting");
      setError(null);
      setTranscript([]);
      transcriptRef.current = [];
      reservationRef.current = null;

      playerRef.current = createAudioPlayer();

      const ws = new WebSocket(WS_URL);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: "start",
            restaurant: restaurantRef.current,
          })
        );
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          playerRef.current?.playPcm(event.data, () => setAgentState("listening"));
          setAgentState("speaking");
          return;
        }
        try {
          const data = JSON.parse(event.data);
          if (data.type === "result") {
            handleServerEvent(data);
            return;
          }
          if (data.type === "session_end") {
            handleServerEvent({
              type: "error",
              message: data.message || "Call ended.",
            });
            endCall(true);
            return;
          }
          if (data.type === "transcript" || data.type === "state" || data.type === "error") {
            handleServerEvent(data);
            return;
          }
          adaptLegacyMessage(data);
          if (data.type === "ready") {
            setPhase("live");
            captureRef.current = createMicCapture(stream, (buf) => {
              if (ws.readyState === WebSocket.OPEN) ws.send(buf);
            });
            void captureRef.current.resume();
            startAmplitudeLoop();
          }
        } catch {
          /* ignore */
        }
      };

      ws.onerror = () => {
        setError("Connection lost. Falling back to demo mode.");
        setReconnecting(true);
        ws.close();
      };

      ws.onclose = () => {
        const current = phaseRef.current;
        if (current === "connecting" || current === "live") {
          if (transcriptRef.current.length === 0) {
            setError("Could not reach Nancy. Try again or use demo mode.");
            setPhase("idle");
            cleanup();
            return;
          }
          setReceipt((prev) => prev || buildReceiptFromSession());
          setPhase("ended");
        }
        cleanup();
      };
    },
    [adaptLegacyMessage, buildReceiptFromSession, cleanup, handleServerEvent, startAmplitudeLoop]
  );

  const connectMock = useCallback(
    async (stream) => {
      setIsMock(true);
      setPhase("connecting");
      setError(null);
      setTranscript([]);
      transcriptRef.current = [];

      playerRef.current = createAudioPlayer();
      await playerRef.current.resume();

      captureRef.current = createMicCapture(stream, () => {
        /* mock doesn't send audio upstream */
      });
      await captureRef.current.resume();
      startAmplitudeLoop();

      setPhase("live");
      setAgentState("listening");

      mockRef.current = createMockConnection({
        onEvent: (ev) => {
          handleServerEvent(ev);
          if (ev.type === "result") setPhase("ended");
        },
        onSpeak: () => {
          playerRef.current?.playTone(0.4, 180 + Math.random() * 40);
        },
        onAmplitude: (level) => {
          if (agentState !== "speaking") setAmplitude(level);
        },
      });

      setTimeout(() => mockRef.current?.start(), 400);
    },
    [agentState, handleServerEvent, startAmplitudeLoop]
  );

  const startCall = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      // iOS Safari: AudioContext must resume on user gesture — handled in capture/player resume.
      if (IS_MOCK) {
        await connectMock(stream);
      } else {
        await connectLive(stream);
      }
    } catch (err) {
      const msg =
        err?.name === "NotAllowedError"
          ? "Microphone access was denied. Tap below to try again."
          : err?.message || "Could not start the call.";
      setError(msg);
      setPhase("idle");
      cleanup();
    }
  }, [cleanup, connectLive, connectMock]);

  const retry = useCallback(() => {
    setError(null);
    setPhase("idle");
    cleanup();
  }, [cleanup]);

  useEffect(() => () => cleanup(), [cleanup]);

  return {
    phase,
    agentState,
    transcript,
    receipt,
    error,
    isMock,
    reconnecting,
    amplitude,
    startCall,
    endCall,
    retry,
    isMockMode: IS_MOCK,
  };
}
