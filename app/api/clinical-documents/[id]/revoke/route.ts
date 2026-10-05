import { NextRequest, NextResponse } from "next/server";
import { AuthRouteError, getAuthenticatedClinicStaff, errorResponse, setSessionCookies } from "../../../../../lib/server/supabase-auth";
import { rpcDocument } from "../../../../../lib/server/clinical-documents";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAuthenticatedClinicStaff(request);
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AuthRouteError(400, "DOCUMENT_INVALID", "Select a valid clinical document.");
    const body = await request.json().catch(() => ({})) as { reason?: unknown };
    if (typeof body.reason !== "string" || body.reason.trim().length < 3 || body.reason.trim().length > 500) {
      throw new AuthRouteError(400, "DOCUMENT_INVALID", "Enter a revocation reason between 3 and 500 characters.");
    }
    const result = await rpcDocument(session, "revoke_clinical_document", { p_document_id: id, p_reason: body.reason.trim() });
    const response = NextResponse.json({ ok: true, document: { id: result.document_id, status: "revoked" } }, { headers: { "Cache-Control": "no-store" } });
    return session.rotatedTokens ? setSessionCookies(response, session.rotatedTokens) : response;
  } catch (error) { return errorResponse(error); }
}
