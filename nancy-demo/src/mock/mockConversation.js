import { SAMPLE_RECEIPT } from "./sampleReceipt.js";

const SCRIPT = [
  { delay: 600, event: { type: "state", value: "listening" } },
  {
    delay: 1200,
    event: { type: "transcript", speaker: "nancy", text: "Good evening, thank you for calling Terra Kulture.", final: false },
  },
  {
    delay: 1800,
    event: {
      type: "transcript",
      speaker: "nancy",
      text: "Good evening, thank you for calling Terra Kulture. This is Nancy. How may I help you?",
      final: true,
    },
    speak: true,
  },
  { delay: 3200, event: { type: "state", value: "listening" } },
  {
    delay: 4000,
    event: { type: "transcript", speaker: "caller", text: "Hi, I'd like to book", final: false },
  },
  {
    delay: 5200,
    event: {
      type: "transcript",
      speaker: "caller",
      text: "Hi, I'd like to book a table for six this Friday.",
      final: true,
    },
  },
  { delay: 5800, event: { type: "state", value: "thinking" } },
  {
    delay: 6800,
    event: { type: "transcript", speaker: "nancy", text: "Of course. Friday", final: false },
  },
  {
    delay: 8200,
    event: {
      type: "transcript",
      speaker: "nancy",
      text: "Of course. Friday the twenty-seventh at eight PM for six guests — may I have a name and phone number?",
      final: true,
    },
    speak: true,
  },
  { delay: 10000, event: { type: "state", value: "listening" } },
  {
    delay: 10800,
    event: { type: "transcript", speaker: "caller", text: "Adaeze Okafor.", final: false },
  },
  {
    delay: 12800,
    event: {
      type: "transcript",
      speaker: "caller",
      text: "Adaeze Okafor. Zero eight zero three, five five five, zero one nine two.",
      final: true,
    },
  },
  { delay: 13600, event: { type: "state", value: "thinking" } },
  {
    delay: 14800,
    event: {
      type: "transcript",
      speaker: "nancy",
      text: "Perfect, Adaeze. Table for six, Friday at eight. Any special requests?",
      final: true,
    },
    speak: true,
  },
  { delay: 16800, event: { type: "state", value: "listening" } },
  {
    delay: 17600,
    event: {
      type: "transcript",
      speaker: "caller",
      text: "It's a birthday — window table if you have one.",
      final: true,
    },
  },
  {
    delay: 19200,
    event: {
      type: "transcript",
      speaker: "nancy",
      text: "Noted. You're confirmed. We'll see you Friday at eight. Have a lovely evening.",
      final: true,
    },
    speak: true,
  },
  { delay: 21000, event: { type: "state", value: "listening" } },
  {
    delay: 21500,
    event: {
      type: "result",
      receipt: {
        ...SAMPLE_RECEIPT,
        timestamp: new Date().toISOString(),
      },
    },
  },
];

/**
 * Simulates a full Nancy call when VITE_NANCY_WS_URL is unset.
 * Returns { start, stop } with onEvent callback.
 */
export function createMockConnection({ onEvent, onSpeak, onAmplitude }) {
  const timers = [];
  let amplitudeTimer = null;
  let running = false;

  function start() {
    if (running) return;
    running = true;
    onEvent({ type: "state", value: "listening" });

    // Faux reactive waveform — random bursts when "caller" speaks
    amplitudeTimer = setInterval(() => {
      if (!running) return;
      const level = 0.15 + Math.random() * 0.55;
      onAmplitude?.(level);
    }, 80);

    let elapsed = 0;
    SCRIPT.forEach((step) => {
      const t = setTimeout(() => {
        if (!running) return;
        onEvent(step.event);
        if (step.speak) {
          onEvent({ type: "state", value: "speaking" });
          onSpeak?.();
        }
      }, elapsed + step.delay);
      timers.push(t);
    });
  }

  function stop() {
    running = false;
    timers.forEach(clearTimeout);
    timers.length = 0;
    if (amplitudeTimer) clearInterval(amplitudeTimer);
  }

  return { start, stop };
}
