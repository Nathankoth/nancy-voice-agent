import { NextRequest, NextResponse } from "next/server";
import { backendHttpUrl } from "@/lib/nancy-backend";
import { ensureBackend } from "@/lib/ensure-backend";

/** GET /api/nancy/logs — conversation history for admin dashboard */
export async function GET(request: NextRequest) {
  const blocked = await ensureBackend();
  if (blocked) return blocked;

  const sessionId = request.nextUrl.searchParams.get("session_id");
  const limit = request.nextUrl.searchParams.get("limit") || "200";
  const qs = new URLSearchParams({ limit });
  if (sessionId) qs.set("session_id", sessionId);

  try {
    const upstream = await fetch(`${backendHttpUrl()}/api/logs?${qs}`, {
      cache: "no-store",
    });
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json({ error: "Could not fetch conversation logs." }, { status: 502 });
  }
}
