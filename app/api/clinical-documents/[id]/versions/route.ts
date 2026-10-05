import { NextRequest, NextResponse } from "next/server";
import { AuthRouteError, getAuthenticatedClinicStaff, errorResponse, setSessionCookies } from "../../../../../lib/server/supabase-auth";
import {
  createStoredContent, databaseRequest, mapRpcDocument, readDatabaseError,
  rpcDocument, verifyDocumentWritePermission,
} from "../../../../../lib/server/clinical-documents";
import { documentVerificationDigest, documentVerificationOrigin, documentVerificationToken, documentVerificationUrl } from "../../../../../lib/server/document-verification";

export const runtime = "nodejs";

type DocumentRow = {
  id: string;
  document_number: string;
  document_type: "medical_certificate" | "referral_letter" | "lab_requisition";
  patient_id: string;
  current_version: number;
  status: "active" | "revoked";
};
type VersionRow = { content: { sourceData?: Record<string, unknown>; practitioner?: object; clinic?: object } };
const typeMap = {
  medical_certificate: "MC",
  referral_letter: "REFERRAL",
  lab_requisition: "LAB_REQUISITION",
} as const;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAuthenticatedClinicStaff(request);
    await verifyDocumentWritePermission(session);
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AuthRouteError(400, "DOCUMENT_INVALID", "Select a valid clinical document.");
    const query = new URLSearchParams({
      select: "id,document_number,document_type,patient_id,current_version,status",
      id: "eq." + id, limit: "1",
    });
    const response = await databaseRequest(session.accessToken, "clinical_documents?" + query);
    if (!response.ok) throw await readDatabaseError(response);
    const [document] = await response.json() as DocumentRow[];
    if (!document) throw new AuthRouteError(404, "DOCUMENT_NOT_FOUND", "Clinical document was not found in this branch.");
    if (document.status !== "active") throw new AuthRouteError(409, "DOCUMENT_REVOKED", "Revoked documents cannot be regenerated.");

    const versionQuery = new URLSearchParams({
      select: "content", document_id: "eq." + id,
      version_number: "eq." + document.current_version, limit: "1",
    });
    const versionResponse = await databaseRequest(session.accessToken, "clinical_document_versions?" + versionQuery);
    if (!versionResponse.ok) throw await readDatabaseError(versionResponse);
    const [currentVersion] = await versionResponse.json() as VersionRow[];
    if (!currentVersion) throw new AuthRouteError(404, "DOCUMENT_VERSION_NOT_FOUND", "Latest document version was not found.");

    const kind = typeMap[document.document_type];
    const sourceData = currentVersion.content.sourceData;
    const content = await createStoredContent(session, kind, document.patient_id, sourceData);
    content.reference = document.document_number;
    content.practitioner = currentVersion.content.practitioner as typeof content.practitioner;
    content.clinic = currentVersion.content.clinic as typeof content.clinic;
    const nextVersion = document.current_version + 1;
    const token = documentVerificationToken(document.id, nextVersion);
    const row = await rpcDocument(session, "regenerate_clinical_document", {
      p_document_id: document.id,
      p_expected_version: document.current_version,
      p_content: content,
      p_token_sha256: documentVerificationDigest(token),
    });
    const result = NextResponse.json({
      ok: true,
      document: mapRpcDocument(row, documentVerificationUrl(documentVerificationOrigin(request.nextUrl.origin), document.id, row.current_version)),
    }, { headers: { "Cache-Control": "no-store" } });
    return session.rotatedTokens ? setSessionCookies(result, session.rotatedTokens) : result;
  } catch (error) { return errorResponse(error); }
}
