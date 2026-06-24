import { NextResponse } from "next/server";
import {
  backendHttpUrl,
  isBackendReachable,
  isVercelDeploy,
  NANCY_HOST,
  NANCY_PORT,
} from "@/lib/nancy-backend";

/** GET /api/nancy/health — is the Python server accepting connections? */
export async function GET() {
  const ok = await isBackendReachable();
  return NextResponse.json({
    ok,
    mode: isVercelDeploy() ? "vercel" : "local",
    backend: isVercelDeploy() ? backendHttpUrl() : undefined,
    host: NANCY_HOST,
    port: NANCY_PORT,
  });
}
