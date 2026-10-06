import { NextRequest, NextResponse } from "next/server";
import { AuthRouteError, getAuthenticatedClinicStaff, errorResponse, setSessionCookies } from "../../../../../lib/server/supabase-auth";
import {
  createStoredContent,
  mapRpcDocument,
  rpcDocument,
  verifyDocumentWritePermission,
} from "../../../../../lib/server/clinical-documents";
import {
  documentVerificationDigest,
  documentVerificationOrigin,
  documentVerificationToken,
  documentVerificationUrl,
} from "../../../../../lib/server/document-verification";
import { withSessionClient } from "../../../../../lib/server/db";

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
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      throw new AuthRouteError(400, "DOCUMENT_INVALID", "Select a valid clinical document.");
    }

    const { document, currentVersion } = await withSessionClient(session.user.auth_user_id, async (client) => {
      const docRes = await client.query<DocumentRow>(
        `SELECT id, document_number, document_type, patient_id, current_version, status
         FROM public.clinical_documents
         WHERE id = $1 AND clinic_id = $2 AND branch_id = $3
         LIMIT 1;`,
        [id, session.user.clinic_id, session.user.branch_id],
      );
      const doc = docRes.rows[0];
      if (!doc) throw new AuthRouteError(404, "DOCUMENT_NOT_FOUND", "Clinical document was not found in this branch.");
      if (doc.status !== "active") throw new AuthRouteError(409, "DOCUMENT_REVOKED", "Revoked documents cannot be regenerated.");

      const verRes = await client.query<VersionRow>(
        `SELECT content
         FROM public.clinical_document_versions
         WHERE clinic_id = $1 AND branch_id = $2 AND document_id = $3 AND version_number = $4
         LIMIT 1;`,
        [session.user.clinic_id, session.user.branch_id, id, doc.current_version],
      );
      const ver = verRes.rows[0];
      if (!ver) throw new AuthRouteError(404, "DOCUMENT_VERSION_NOT_FOUND", "Latest document version was not found.");

      return { document: doc, currentVersion: ver };
    });

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

    const result = NextResponse.json(
      {
        ok: true,
        document: mapRpcDocument(row, documentVerificationUrl(documentVerificationOrigin(request.nextUrl.origin), document.id, row.current_version)),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
    return session.rotatedTokens ? setSessionCookies(result, session.rotatedTokens) : result;
  } catch (error) {
    return errorResponse(error);
  }
}
