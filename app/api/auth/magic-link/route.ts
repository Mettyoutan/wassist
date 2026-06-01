import { NextResponse } from "next/server";

// Opsi B TODO: implementasi magic link JWT via jose
// Alur: POST → kirim link WA → GET /api/auth/verify?token= → set cookie
export async function POST() {
  return NextResponse.json({ error: "Not implemented — Auth Opsi B TODO" }, { status: 501 });
}
