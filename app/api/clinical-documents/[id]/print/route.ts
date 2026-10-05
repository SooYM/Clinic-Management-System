import { NextRequest, NextResponse } from "next/server";
import { AuthRouteError, getAuthenticatedClinicStaff, errorResponse, setSessionCookies } from "../../../../../lib/server/supabase-auth";
import { rpcDocument, verifyDocumentReadPermission } from "../../../../../lib/server/clinical-documents";

export const runtime = "nodejs";

type PrintResult = { print_id: string; printed_at: string; version_number: number };

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAuthenticatedClinicStaff(request);
    await verifyDocumentReadPermission(session);
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AuthRouteError(400, "DOCUMENT_INVALID", "Select a valid clinical document.");
    const body = await request.json().catch(() => ({})) as { version?: unknown; purpose?: unknown };
    const version = Number(body.version);
    if (!Number.isInteger(version) || version < 1) throw new AuthRouteError(400, "DOCUMENT_INVALID", "Select a valid document version.");
    const result = await rpcDocument(session, "record_clinical_document_print", {
      p_document_id: id,
      p_version_number: version,
      p_purpose: typeof body.purpose === "string" ? body.purpose.slice(0, 120) : "Print / Save PDF",
    }) as unknown as PrintResult;
    const response = NextResponse.json({
      ok: true,
      record: { printId: result.print_id, printedAt: result.printed_at, artifactId: id, version: result.version_number },
    }, { headers: { "Cache-Control": "no-store" } });
    return session.rotatedTokens ? setSessionCookies(response, session.rotatedTokens) : response;
  } catch (error) { return errorResponse(error); }
}
