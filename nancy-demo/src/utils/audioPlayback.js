import { OUTPUT_SAMPLE_RATE } from "./audioCapture.js";

export function createAudioPlayer(sampleRate = OUTPUT_SAMPLE_RATE) {
  let ctx = null;
  let nextPlayTime = 0;
  const scheduled = [];

  function ensureContext() {
    if (!ctx) ctx = new AudioContext({ sampleRate });
    return ctx;
  }

  async function resume() {
    const audioCtx = ensureContext();
    if (audioCtx.state === "suspended") await audioCtx.resume();
    return audioCtx;
  }

  function stopAll() {
    scheduled.forEach((s) => {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    });
    scheduled.length = 0;
    nextPlayTime = 0;
  }

  function playPcm(arrayBuffer, onEnded) {
    const audioCtx = ensureContext();
    if (audioCtx.state === "suspended") void audioCtx.resume();

    const samples = new Int16Array(arrayBuffer);
    const float32 = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      float32[i] = samples[i] / 32768;
    }

    const buffer = audioCtx.createBuffer(1, float32.length, sampleRate);
    buffer.copyToChannel(float32, 0);

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);

    const now = audioCtx.currentTime;
    const start = Math.max(now, nextPlayTime);
    source.start(start);
    nextPlayTime = start + buffer.duration;
    scheduled.push(source);

    source.onended = () => {
      const idx = scheduled.indexOf(source);
      if (idx >= 0) scheduled.splice(idx, 1);
      if (scheduled.length === 0 && onEnded) onEnded();
    };
  }

  /** Short tone for mock Nancy speech stand-in */
  function playTone(duration = 0.35, frequency = 220) {
    const audioCtx = ensureContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, audioCtx.currentTime + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    const start = Math.max(now, nextPlayTime);
    osc.start(start);
    osc.stop(start + duration);
    nextPlayTime = start + duration;
    osc.onended = () => {
      if (scheduled.length === 0) {
        /* noop */
      }
    };
  }

  function destroy() {
    stopAll();
    if (ctx) {
      void ctx.close();
      ctx = null;
    }
  }

  return { resume, playPcm, playTone, stopAll, destroy };
}
