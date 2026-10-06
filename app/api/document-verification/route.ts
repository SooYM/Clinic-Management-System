import { NextRequest, NextResponse } from "next/server";
import { query } from "../../../lib/server/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return NextResponse.json({ status: "revoked" }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const res = await query<{ status: string }>(
      `SELECT status FROM public.verify_clinical_document($1);`,
      [token],
    );
    const status = res.rows[0]?.status === "valid" ? "valid" : "revoked";
    return NextResponse.json({ status }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Verification service is unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
