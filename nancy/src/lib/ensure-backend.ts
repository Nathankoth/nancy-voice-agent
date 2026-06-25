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

/** Wake Python backend in dev; return error response or null if ready. */
export async function ensureBackend(): Promise<NextResponse | null> {
  if (usesRemoteBackend()) {
    const up = await checkRemoteBackendHealth();
    if (!up) {
      return NextResponse.json({ error: "Nancy backend is offline." }, { status: 503 });
    }
    return null;
  }

  if (isDevAutoStartEnabled() && isLocalSpawnAllowed()) {
    const boot = await ensureBackendRunning();
    if (!boot.ok && boot.error) {
      return NextResponse.json({ error: boot.error }, { status: 500 });
    }
    if (!boot.ok) {
      const ready = await waitForBackend(20_000);
      if (!ready) {
        return NextResponse.json(
          { error: "Nancy backend is starting. Wait a few seconds and refresh." },
          { status: 503 }
        );
      }
    }
  } else if (!(await isBackendReachable())) {
    return NextResponse.json({ error: "Nancy backend is offline." }, { status: 503 });
  }
  return null;
}
