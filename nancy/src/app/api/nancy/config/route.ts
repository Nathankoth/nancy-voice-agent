import { NextResponse } from "next/server";
import {
  backendHttpUrl,
  backendWsUrl,
  checkRemoteBackendHealth,
  remoteBackendConfigError,
  usesRemoteBackend,
} from "@/lib/nancy-backend";

/** GET /api/nancy/config — runtime WebSocket URL + backend status for the voice widget. */
export async function GET() {
  const configError = remoteBackendConfigError();
  if (configError) {
    return NextResponse.json({ error: configError }, { status: 503 });
  }

  const backendOk = usesRemoteBackend()
    ? await checkRemoteBackendHealth()
    : true;

  return NextResponse.json({
    wsUrl: backendWsUrl(),
    backend: backendHttpUrl(),
    backendOk,
    mode: usesRemoteBackend() ? "remote" : "local",
  });
}
