import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { AuthRouteError, getAuthenticatedClinicStaff, errorResponse, jsonResponse, setSessionCookies } from "../../../lib/server/supabase-auth";
import {
  createStoredContent,
  generateDocumentNumber,
  mapRpcDocument,
  PersistedDocumentKind,
  rpcDocument,
  verifyDocumentReadPermission,
  verifyDocumentWritePermission,
} from "../../../lib/server/clinical-documents";
import {
  documentVerificationDigest,
  documentVerificationOrigin,
  documentVerificationToken,
  documentVerificationUrl,
} from "../../../lib/server/document-verification";
import { withSessionClient } from "../../../lib/server/db";

export const runtime = "nodejs";

type DocumentRow = {
  id: string;
  document_number: string;
  document_type: "medical_certificate" | "referral_letter" | "lab_requisition";
  current_version: number;
  issued_at: string;
};
type VersionRow = {
  id: string;
  document_id: string;
  version_number: number;
  content: Parameters<typeof mapRpcDocument>[0]["content"];
};

const kindToDb = {
  MC: "medical_certificate",
  REFERRAL: "referral_letter",
  LAB_REQUISITION: "lab_requisition",
} as const;

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthenticatedClinicStaff(request);
    await verifyDocumentReadPermission(session);

    const documents = await withSessionClient(session.user.auth_user_id, async (client) => {
      const docsRes = await client.query<DocumentRow>(
        `SELECT id, document_number, document_type, current_version, issued_at
         FROM public.clinical_documents
         WHERE clinic_id = $1 AND branch_id = $2
         ORDER BY issued_at DESC LIMIT 500;`,
        [session.user.clinic_id, session.user.branch_id],
      );
      return docsRes.rows;
    });

    if (documents.length === 0) {
      const result = jsonResponse({ ok: true, documents: [] });
      return session.rotatedTokens ? setSessionCookies(result, session.rotatedTokens) : result;
    }

    const ids = documents.map((document) => document.id).filter((id) => /^[0-9a-f-]{36}$/i.test(id));

    const { versions, printCounts } = await withSessionClient(session.user.auth_user_id, async (client) => {
      const versRes = await client.query<VersionRow>(
        `SELECT id, document_id, version_number, content
         FROM public.clinical_document_versions
         WHERE clinic_id = $1 AND branch_id = $2 AND document_id = ANY($3::uuid[])
         ORDER BY version_number DESC;`,
        [session.user.clinic_id, session.user.branch_id, ids],
      );

      const vRows = versRes.rows;
      const vIds = vRows.map((r) => r.id);
      const counts = new Map<string, number>();

      if (vIds.length) {
        const printRes = await client.query<{ document_version_id: string }>(
          `SELECT document_version_id
           FROM public.document_print_logs
           WHERE clinic_id = $1 AND branch_id = $2 AND document_version_id = ANY($3::uuid[]);`,
          [session.user.clinic_id, session.user.branch_id, vIds],
        );
        for (const row of printRes.rows) {
          counts.set(row.document_version_id, (counts.get(row.document_version_id) ?? 0) + 1);
        }
      }

      return { versions: vRows, printCounts: counts };
    });

    const versionByDocument = new Map(versions.map((row) => [row.document_id + ":" + row.version_number, row]));
    const latestVersions = documents
      .map((document) => ({
        document,
        version: versionByDocument.get(document.id + ":" + document.current_version),
      }))
      .filter((entry): entry is { document: DocumentRow; version: VersionRow } => Boolean(entry.version));

    const responseDocuments = latestVersions.map(({ document, version }) =>
      mapRpcDocument(
        {
          document_id: document.id,
          document_number: document.document_number,
          document_type: document.document_type,
          issued_at: document.issued_at,
          current_version: document.current_version,
          content: version.content,
          print_count: printCounts.get(version.id) ?? 0,
        },
        documentVerificationUrl(documentVerificationOrigin(request.nextUrl.origin), document.id, document.current_version),
      ),
    );

    const result = jsonResponse({ ok: true, documents: responseDocuments });
    return session.rotatedTokens ? setSessionCookies(result, session.rotatedTokens) : result;
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthenticatedClinicStaff(request);
    if (!["doctor", "manager"].includes(session.user.role)) {
      throw new AuthRouteError(403, "DOCUMENT_ROLE_FORBIDDEN", "Only an authorized clinician or manager may issue clinical documents.");
    }
    await verifyDocumentWritePermission(session);
    const body = (await request.json()) as { patientId?: unknown; kind?: unknown; sourceData?: unknown };
    if (typeof body.patientId !== "string" || typeof body.kind !== "string" || !(body.kind in kindToDb)) {
      throw new AuthRouteError(400, "DOCUMENT_INVALID", "Choose a supported clinical document and patient.");
    }
    const kind = body.kind as PersistedDocumentKind;
    const content = await createStoredContent(session, kind, body.patientId, body.sourceData);
    const reference = generateDocumentNumber(kind);
    content.reference = reference;
    const documentId = randomUUID();
    const verificationToken = documentVerificationToken(documentId, 1);
    const dbType = kindToDb[kind];

    const row = await rpcDocument(session, "issue_clinical_document", {
      p_document_id: documentId,
      p_patient_id: body.patientId,
      p_document_type: dbType,
      p_document_number: reference,
      p_content: content,
      p_token_sha256: documentVerificationDigest(verificationToken),
    });

    const result = NextResponse.json(
      {
        ok: true,
        document: mapRpcDocument(row, documentVerificationUrl(documentVerificationOrigin(request.nextUrl.origin), documentId, 1)),
      },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
    return session.rotatedTokens ? setSessionCookies(result, session.rotatedTokens) : result;
  } catch (error) {
    return errorResponse(error);
  }
}
