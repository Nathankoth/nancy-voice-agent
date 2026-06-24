import { NextResponse } from "next/server";
import { backendHttpUrl } from "@/lib/nancy-backend";
import { ensureBackend } from "@/lib/ensure-backend";

/** POST /api/nancy/sessions/:id/dismiss — hide inquiry from admin */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = await ensureBackend();
  if (blocked) return blocked;

  const { id } = await params;

  try {
    const upstream = await fetch(`${backendHttpUrl()}/api/sessions/${id}/dismiss`, {
      method: "POST",
    });
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json({ error: "Could not dismiss session." }, { status: 502 });
  }
}
