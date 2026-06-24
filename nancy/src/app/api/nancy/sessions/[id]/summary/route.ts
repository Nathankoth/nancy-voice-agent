import { NextRequest, NextResponse } from "next/server";
import { backendHttpUrl } from "@/lib/nancy-backend";
import { ensureBackend } from "@/lib/ensure-backend";

/** GET /api/nancy/sessions/:id/summary — AI or rule-based call summary */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = await ensureBackend();
  if (blocked) return blocked;

  const { id } = await params;
  try {
    const upstream = await fetch(`${backendHttpUrl()}/api/sessions/${id}/summary`, {
      cache: "no-store",
    });
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json({ error: "Could not generate summary." }, { status: 502 });
  }
}
