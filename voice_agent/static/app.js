const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;

const statusEl = document.getElementById("status");
const statusText = document.getElementById("status-text");
const connectBtn = document.getElementById("connect-btn");
const disconnectBtn = document.getElementById("disconnect-btn");
const transcriptEl = document.getElementById("transcript");
const eventLogEl = document.getElementById("event-log");
const configEditor = document.getElementById("config-editor");
const configMessage = document.getElementById("config-message");
const loadConfigBtn = document.getElementById("load-config-btn");
const saveConfigBtn = document.getElementById("save-config-btn");

let ws = null;
let micStream = null;
let audioContext = null;
let processor = null;
let playbackContext = null;
let nextPlayTime = 0;
let scheduledSources = [];

function setStatus(state, text) {
  statusEl.className = `status ${state}`;
  statusText.textContent = text;
}

function formatTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString();
}

function addEntry(container, category, message, timestamp) {
  const div = document.createElement("div");
  div.className = `entry ${category}`;
  div.innerHTML = `
    <span class="time">${formatTime(timestamp)}</span>
    <div class="label">${category}</div>
    <div>${escapeHtml(message)}</div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function logEvent(category, message, timestamp) {
  addEntry(eventLogEl, category, message, timestamp);
  if (category === "stt") {
    addEntry(transcriptEl, "stt", `You: ${message}`, timestamp);
  } else if (category === "llm" && message !== "Agent is thinking…") {
    addEntry(transcriptEl, "llm", `Nancy: ${message}`, timestamp);
  }
}

function stopPlayback() {
  scheduledSources.forEach((s) => {
    try { s.stop(); } catch (_) {}
  });
  scheduledSources = [];
  nextPlayTime = 0;
}

function playPcm(int16Buffer) {
  if (!playbackContext) {
    playbackContext = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });
  }
  if (playbackContext.state === "suspended") {
    playbackContext.resume();
  }

  const samples = new Int16Array(int16Buffer);
  const float32 = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    float32[i] = samples[i] / 32768;
  }

  const buffer = playbackContext.createBuffer(1, float32.length, OUTPUT_SAMPLE_RATE);
  buffer.copyToChannel(float32, 0);

  const source = playbackContext.createBufferSource();
  source.buffer = buffer;
  source.connect(playbackContext.destination);

  const now = playbackContext.currentTime;
  const start = Math.max(now, nextPlayTime);
  source.start(start);
  nextPlayTime = start + buffer.duration;
  scheduledSources.push(source);
  source.onended = () => {
    scheduledSources = scheduledSources.filter((s) => s !== source);
  };
}

function downsample(buffer, fromRate, toRate) {
  if (fromRate === toRate) return buffer;
  const ratio = fromRate / toRate;
  const length = Math.round(buffer.length / ratio);
  const result = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    result[i] = buffer[Math.floor(i * ratio)];
  }
  return result;
}

function floatTo16BitPCM(float32) {
  const buffer = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    buffer[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return buffer;
}

async function startMic(ws) {
  micStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
    },
  });

  audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(micStream);
  processor = audioContext.createScriptProcessor(4096, 1, 1);

  processor.onaudioprocess = (e) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const input = e.inputBuffer.getChannelData(0);
    const downsampled = downsample(input, audioContext.sampleRate, INPUT_SAMPLE_RATE);
    const pcm = floatTo16BitPCM(downsampled);
    ws.send(pcm.buffer);
  };

  source.connect(processor);
  processor.connect(audioContext.destination);
}

function stopMic() {
  if (processor) {
    processor.disconnect();
    processor = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
}

async function connect() {
  connectBtn.disabled = true;
  setStatus("connecting", "Connecting…");

  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${protocol}//${location.host}/ws`);
  ws.binaryType = "arraybuffer";

  ws.onopen = () => {
    setStatus("connecting", "Waiting for agent…");
  };

  ws.onmessage = async (event) => {
    if (event.data instanceof ArrayBuffer) {
      playPcm(event.data);
      return;
    }

    const data = JSON.parse(event.data);

    if (data.type === "ready") {
      setStatus("ready", "Listening");
      disconnectBtn.disabled = false;
      await startMic(ws);
      return;
    }

    if (data.type === "session_end") {
      logEvent("system", data.message || "Call ended.", new Date().toISOString());
      disconnect();
      return;
    }

    if (data.type === "log") {
      logEvent(data.category, data.message, data.timestamp);
      return;
    }

    if (data.type === "agent_event") {
      const ev = data.event;
      if (ev.type === "UserStartedSpeaking") {
        stopPlayback();
      }
    }
  };

  ws.onerror = () => {
    setStatus("error", "Connection error");
    connectBtn.disabled = false;
  };

  ws.onclose = () => {
    disconnect();
  };
}

function disconnect() {
  stopMic();
  stopPlayback();
  if (ws) {
    ws.close();
    ws = null;
  }
  connectBtn.disabled = false;
  disconnectBtn.disabled = true;
  setStatus("", "Disconnected");
}

async function loadConfig() {
  const res = await fetch("/api/config");
  const config = await res.json();
  configEditor.value = JSON.stringify(config, null, 4);
  configMessage.textContent = "";
  configMessage.className = "config-message";
}

async function saveConfig() {
  try {
    const config = JSON.parse(configEditor.value);
    const res = await fetch("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    const data = await res.json();
    if (!res.ok) {
      configMessage.textContent = data.error || "Save failed";
      configMessage.className = "config-message err";
      return;
    }
    configEditor.value = JSON.stringify(data.config, null, 4);
    configMessage.textContent = "Saved. Reconnect for changes to take effect.";
    configMessage.className = "config-message ok";
  } catch (err) {
    configMessage.textContent = `Invalid JSON: ${err.message}`;
    configMessage.className = "config-message err";
  }
}

connectBtn.addEventListener("click", connect);
disconnectBtn.addEventListener("click", disconnect);
loadConfigBtn.addEventListener("click", loadConfig);
saveConfigBtn.addEventListener("click", saveConfig);

loadConfig();
