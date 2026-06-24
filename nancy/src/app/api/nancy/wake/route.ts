import { NextResponse } from "next/server";
import {
  ensureBackendRunning,
  isBackendReachable,
  isDevAutoStartEnabled,
  waitForBackend,
} from "@/lib/nancy-backend";

/** POST /api/nancy/wake — start Python backend on demand (local dev). */
export async function POST() {
  if (!isDevAutoStartEnabled()) {
    const up = await isBackendReachable();
    return NextResponse.json({
      ok: up,
      mode: "production",
      message: up
        ? "Backend is reachable."
        : "Set NEXT_PUBLIC_NANCY_WS_URL to your deployed backend.",
    });
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
