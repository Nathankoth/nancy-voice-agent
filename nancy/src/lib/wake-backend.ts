const LOCAL_WS_PATTERN = /^(ws|wss):\/\/(localhost|127\.0\.0\.1)(:\d+)?/;

export function isLocalNancyBackend(wsUrl: string): boolean {
  return LOCAL_WS_PATTERN.test(wsUrl);
}

/** Ask Next.js to start the Python server, then wait until port is open. */
export async function wakeLocalBackend(maxWaitMs = 20_000): Promise<void> {
  const res = await fetch("/api/nancy/wake", { method: "POST" });
  const data = await res.json().catch(() => ({}));

  if (data.ok) return;

  if (data.error && res.status >= 500) {
    throw new Error(data.error);
  }

  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const health = await fetch("/api/nancy/health");
    const h = await health.json().catch(() => ({}));
    if (h.ok) return;
    await new Promise((r) => setTimeout(r, 500));
  }

  throw new Error(
    "Nancy backend did not start in time. Run: cd voice_agent && uv run main.py"
  );
}
