import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return NextResponse.json({ status: "revoked" }, { headers: { "Cache-Control": "no-store" } });
  }
  const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
  const anon = process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) {
    return NextResponse.json({ error: "Verification is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  let response: Response;
  try {
    response = await fetch(url + "/rest/v1/rpc/verify_clinical_document", {
      method: "POST",
      cache: "no-store",
      headers: { apikey: anon, Authorization: "Bearer " + anon, "Content-Type": "application/json" },
      body: JSON.stringify({ p_token: token }),
    });
  } catch {
    return NextResponse.json({ error: "Verification service is unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!response.ok) {
    return NextResponse.json({ error: "Verification service is unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const rows = await response.json().catch(() => []) as Array<{ status?: unknown }>;
  const status = rows[0]?.status === "valid" ? "valid" : "revoked";
  return NextResponse.json({ status }, { headers: { "Cache-Control": "no-store" } });
}
