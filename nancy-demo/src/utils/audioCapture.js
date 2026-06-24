export const INPUT_SAMPLE_RATE = 16000;
// Existing Python bridge returns Deepgram TTS at 24kHz; mock uses 16kHz beeps.
export const OUTPUT_SAMPLE_RATE = 24000;

export function downsample(buffer, fromRate, toRate) {
  if (fromRate === toRate) return buffer;
  const ratio = fromRate / toRate;
  const length = Math.round(buffer.length / ratio);
  const result = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    result[i] = buffer[Math.floor(i * ratio)];
  }
  return result;
}

export function floatTo16BitPCM(float32) {
  const buffer = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    buffer[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return buffer;
}

export function createMicCapture(stream, onPcm, sampleRate = INPUT_SAMPLE_RATE) {
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.75;

  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);

  processor.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    const downsampled = downsample(input, ctx.sampleRate, sampleRate);
    const pcm = floatTo16BitPCM(downsampled);
    onPcm(pcm.buffer);
  };

  source.connect(analyser);
  analyser.connect(processor);
  processor.connect(ctx.destination);

  return {
    ctx,
    analyser,
    processor,
    async resume() {
      if (ctx.state === "suspended") await ctx.resume();
    },
    destroy() {
      processor.disconnect();
      source.disconnect();
      analyser.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      return ctx.close();
    },
  };
}
