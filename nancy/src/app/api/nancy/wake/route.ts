import { NextResponse } from "next/server";
import {
  checkRemoteBackendHealth,
  ensureBackendRunning,
  isBackendReachable,
  isDevAutoStartEnabled,
  isLocalSpawnAllowed,
  usesRemoteBackend,
  waitForBackend,
} from "@/lib/nancy-backend";

/** POST /api/nancy/wake — start Python backend on demand (local dev only). */
export async function POST() {
  if (usesRemoteBackend()) {
    const up = await checkRemoteBackendHealth();
    return NextResponse.json(
      {
        ok: up,
        mode: "production",
        message: up
          ? "Backend is reachable."
          : "Nancy backend is offline. Check Railway and NANCY_BACKEND_URL.",
      },
      { status: up ? 200 : 503 }
    );
  }

  if (!isDevAutoStartEnabled()) {
    const up = await isBackendReachable();
    return NextResponse.json(
      {
        ok: up,
        mode: "local",
        message: up ? "Backend is reachable." : "Nancy backend is offline.",
      },
      { status: up ? 200 : 503 }
    );
  }

  const first = await ensureBackendRunning();
  if (first.ok) {
    return NextResponse.json({
      ok: true,
      alreadyRunning: first.alreadyRunning,
      started: false,
    });
  }

  if (first.error) {
    return NextResponse.json({ ok: false, error: first.error }, { status: 500 });
  }

  const ready = await waitForBackend();
  if (!ready) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Backend is starting but not ready yet. Check voice_agent/logs/spawn.log",
      },
      { status: 503 }
    );
  }

  return NextResponse.json({
    ok: true,
    alreadyRunning: false,
    started: true,
  });
}
