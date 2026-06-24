import { NextResponse } from "next/server";
import { backendHttpUrl } from "@/lib/nancy-backend";
import { ensureBackend } from "@/lib/ensure-backend";

/** GET /api/nancy/dismissed-sessions */
export async function GET() {
  const blocked = await ensureBackend();
  if (blocked) return blocked;

  try {
    const upstream = await fetch(`${backendHttpUrl()}/api/dismissed-sessions`);
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json({ error: "Could not load dismissed sessions." }, { status: 502 });
  }
}
