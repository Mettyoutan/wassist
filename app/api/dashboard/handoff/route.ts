import { NextResponse } from "next/server";

// post-MVP: handoff queue butuh tabel atau query wa_sessions untuk state handoff
export async function GET() {
  return NextResponse.json({ handoffs: [] });
}
