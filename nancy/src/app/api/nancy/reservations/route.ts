import { NextResponse } from "next/server";
import { backendHttpUrl } from "@/lib/nancy-backend";
import { ensureBackend } from "@/lib/ensure-backend";

/** GET /api/nancy/reservations */
export async function GET() {
  const blocked = await ensureBackend();
  if (blocked) return blocked;

  try {
    const upstream = await fetch(`${backendHttpUrl()}/api/reservations`, {
      cache: "no-store",
    });
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json({ error: "Could not reach Nancy backend." }, { status: 502 });
  }
}
