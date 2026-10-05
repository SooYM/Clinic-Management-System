import "server-only";

import { randomBytes } from "node:crypto";
import { AuthRouteError, type AuthenticatedClinicStaff } from "./supabase-auth";
import type { ClinicDocumentArtifact, ClinicDocumentKind, ClinicDocumentSection } from "../../components/documents/types";

export type PersistedDocumentKind = Extract<ClinicDocumentKind, "MC" | "REFERRAL" | "LAB_REQUISITION">;
export type DocumentSourceData =
  | { days: number; startDate: string; diagnosis: string; isDiagnosisRedacted: boolean }
  | { hospitalOrSpecialty: string; urgency: "ROUTINE" | "SEMI_URGENT" | "URGENT_SAME_DAY" | "EMERGENCY"; reason: string; summary: string; medications: string[] }
  | { panels: string[]; specimenType: "BLOOD" | "URINE" | "SWAB" | "BIOPSY"; isFastingRequired: boolean; notes: string };

type PatientRow = { id: string; full_name: string; medical_record_number: string; date_of_birth: string | null; phone: string | null };
type ClinicRow = { id: string; name: string; currency: string };
type BranchRow = { id: string; name: string; address: Record<string, unknown>; phone: string | null };
type StoredContent = Omit<ClinicDocumentArtifact, "artifactId" | "version"> & { sourceData: Record<string, unknown> };
type RpcDocument = {
  document_id: string; document_number: string; document_type: "medical_certificate" | "referral_letter" | "lab_requisition";
  issued_at: string; current_version: number; content: StoredContent; print_count?: number;
};

function databaseConfig() {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
  const anon = process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) throw new AuthRouteError(503, "DATABASE_NOT_CONFIGURED", "PostgreSQL is not configured.");
  return { url, anon };
}

export async function databaseRequest(token: string, path: string, init: RequestInit = {}) {
  const { url, anon } = databaseConfig();
  try {
    return await fetch(url + "/rest/v1/" + path, {
      ...init,
      cache: "no-store",
      headers: { apikey: anon, Authorization: "Bearer " + token, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
  } catch {
    throw new AuthRouteError(503, "DATABASE_UNAVAILABLE", "The clinic database is unavailable.");
  }
}

export async function readDatabaseError(response: Response): Promise<AuthRouteError> {
  const payload = await response.json().catch(() => ({})) as { code?: string };
  if (payload.code === "42501") return new AuthRouteError(403, "DOCUMENT_PERMISSION_DENIED", "Your clinic role cannot perform this document action.");
  if (payload.code === "P0002") return new AuthRouteError(404, "DOCUMENT_NOT_FOUND", "Clinical document or patient record was not found.");
  if (payload.code === "40001") return new AuthRouteError(409, "DOCUMENT_STALE", "This document changed in another session. Reload the reception log and retry.");
  if (payload.code === "23505") return new AuthRouteError(409, "DOCUMENT_DUPLICATE", "A document with this reference already exists.");
  if (payload.code === "22023" || payload.code === "23514") return new AuthRouteError(400, "DOCUMENT_INVALID", "Document data is invalid.");
  return new AuthRouteError(502, "DOCUMENT_DATABASE_ERROR", "The database could not complete the document action.");
}

function requiredString(value: unknown, label: string, max = 1000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new AuthRouteError(400, "DOCUMENT_INVALID", "Enter a valid " + label + ".");
  return value.trim();
}

function validDate(value: unknown, label: string): string {
  const date = requiredString(value, label, 10);
  const parsed = new Date(date + "T00:00:00.000Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new AuthRouteError(400, "DOCUMENT_INVALID", "Enter a real " + label + ".");
  }
  return date;
}

export function validateDocumentSource(kind: PersistedDocumentKind, input: unknown): DocumentSourceData {
  if (!input || typeof input !== "object") throw new AuthRouteError(400, "DOCUMENT_INVALID", "Document details are required.");
  const data = input as Record<string, unknown>;
  if (kind === "MC") {
    const days = Number(data.days);
    if (!Number.isInteger(days) || days < 1 || days > 30) throw new AuthRouteError(400, "DOCUMENT_INVALID", "Medical leave must be from 1 to 30 days.");
    return {
      days, startDate: validDate(data.startDate, "start date"),
      diagnosis: typeof data.diagnosis === "string" ? data.diagnosis.trim().slice(0, 500) : "",
      isDiagnosisRedacted: data.isDiagnosisRedacted === true,
    };
  }
  if (kind === "REFERRAL") {
    const urgencyOptions = ["ROUTINE", "SEMI_URGENT", "URGENT_SAME_DAY", "EMERGENCY"] as const;
    if (typeof data.urgency !== "string" || !urgencyOptions.includes(data.urgency as typeof urgencyOptions[number])) throw new AuthRouteError(400, "DOCUMENT_INVALID", "Select a valid referral urgency.");
    const meds = Array.isArray(data.medications) ? data.medications : [];
    if (meds.length > 20 || meds.some((item) => typeof item !== "string" || item.length > 120)) throw new AuthRouteError(400, "DOCUMENT_INVALID", "Referral medication list is invalid.");
    return {
      hospitalOrSpecialty: requiredString(data.hospitalOrSpecialty, "referral destination", 160),
      urgency: data.urgency as "ROUTINE" | "SEMI_URGENT" | "URGENT_SAME_DAY" | "EMERGENCY",
      reason: requiredString(data.reason, "referral reason", 1000),
      summary: typeof data.summary === "string" ? data.summary.trim().slice(0, 4000) : "",
      medications: meds.map((item) => (item as string).trim()).filter(Boolean),
    };
  }
  const specimenOptions = ["BLOOD", "URINE", "SWAB", "BIOPSY"] as const;
  if (typeof data.specimenType !== "string" || !specimenOptions.includes(data.specimenType as typeof specimenOptions[number])) throw new AuthRouteError(400, "DOCUMENT_INVALID", "Select a valid specimen type.");
  const panels = Array.isArray(data.panels) ? data.panels : [];
  if (panels.length < 1 || panels.length > 30 || panels.some((item) => typeof item !== "string" || item.length > 120)) throw new AuthRouteError(400, "DOCUMENT_INVALID", "Select one or more valid investigation panels.");
  return {
    panels: panels.map((item) => (item as string).trim()).filter(Boolean),
    specimenType: data.specimenType as "BLOOD" | "URINE" | "SWAB" | "BIOPSY",
    isFastingRequired: data.isFastingRequired === true,
    notes: typeof data.notes === "string" ? data.notes.trim().slice(0, 1000) : "",
  };
}

function addressLines(address: Record<string, unknown>): string[] {
  const values = Array.isArray(address.lines) ? address.lines : [address.line1, address.line2, address.city, address.postcode, address.state];
  return values.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim()).slice(0, 6);
}

async function clinicSnapshot(session: AuthenticatedClinicStaff) {
  const clinicQuery = new URLSearchParams({ select: "id,name,currency", id: "eq." + session.user.clinic_id, limit: "1" });
  const clinicResponse = await databaseRequest(session.accessToken, "clinics?" + clinicQuery);
  if (!clinicResponse.ok) throw await readDatabaseError(clinicResponse);
  const [clinic] = await clinicResponse.json() as ClinicRow[];
  const branchQuery = new URLSearchParams({ select: "id,name,address,phone", id: "eq." + session.user.branch_id, limit: "1" });
  const branchResponse = await databaseRequest(session.accessToken, "branches?" + branchQuery);
  if (!branchResponse.ok) throw await readDatabaseError(branchResponse);
  const [branch] = await branchResponse.json() as BranchRow[];
  if (!clinic || !branch) throw new AuthRouteError(404, "CLINIC_NOT_FOUND", "Clinic details are not configured.");
  return {
    name: clinic.name,
    addressLines: [branch.name, ...addressLines(branch.address ?? {})],
    phone: branch.phone ?? undefined,
    currency: clinic.currency === "MYR" ? "MYR" as const : undefined,
  };
}

function sectionsFor(kind: PersistedDocumentKind, source: DocumentSourceData, patientName: string) {
  if (kind === "MC") {
    const data = source as Extract<DocumentSourceData, { days: number }>;
    const end = new Date(data.startDate + "T00:00:00.000Z");
    end.setUTCDate(end.getUTCDate() + data.days - 1);
    const endDate = end.toISOString().slice(0, 10);
    return {
      title: "Medical Certificate",
      sections: [{
        heading: "Medical leave",
        paragraphs: [
          "This certificate records that " + patientName + " was assessed by the issuing practitioner and is advised medical leave from " + data.startDate + " to " + endDate + " (" + data.days + " day" + (data.days === 1 ? "" : "s") + ").",
          ...(!data.isDiagnosisRedacted && data.diagnosis ? ["Clinical information: " + data.diagnosis] : []),
        ],
        fields: [{ label: "Start date", value: data.startDate }, { label: "End date", value: endDate }, { label: "Duration", value: data.days + " day" + (data.days === 1 ? "" : "s") }],
      }] satisfies ClinicDocumentSection[],
    };
  }
  if (kind === "REFERRAL") {
    const data = source as Extract<DocumentSourceData, { hospitalOrSpecialty: string }>;
    return {
      title: "Referral Letter",
      sections: [
        { heading: "Referral destination", fields: [{ label: "Hospital / specialty", value: data.hospitalOrSpecialty }, { label: "Urgency", value: data.urgency.replaceAll("_", " ") }] },
        { heading: "Reason for referral", paragraphs: [data.reason] },
        ...(data.summary ? [{ heading: "Clinical summary", paragraphs: [data.summary] }] : []),
        ...(data.medications.length ? [{ heading: "Current medications", items: data.medications }] : []),
      ] satisfies ClinicDocumentSection[],
    };
  }
  const data = source as Extract<DocumentSourceData, { panels: string[] }>;
  return {
    title: "Laboratory Requisition",
    sections: [
      { heading: "Requested investigations", items: data.panels },
      { heading: "Collection details", fields: [{ label: "Specimen", value: data.specimenType }, { label: "Fasting", value: data.isFastingRequired ? "Required; follow clinic instructions" : "Not indicated" }] },
      ...(data.notes ? [{ heading: "Clinical notes", paragraphs: [data.notes] }] : []),
    ] satisfies ClinicDocumentSection[],
  };
}

export async function createStoredContent(
  session: AuthenticatedClinicStaff,
  kind: PersistedDocumentKind,
  patientId: string,
  rawSource: unknown,
): Promise<StoredContent> {
  if (!/^[0-9a-f-]{36}$/i.test(patientId)) throw new AuthRouteError(400, "INVALID_PATIENT", "Select a valid patient.");
  const source = validateDocumentSource(kind, rawSource);
  const query = new URLSearchParams({
    select: "id,full_name,medical_record_number,date_of_birth,phone",
    id: "eq." + patientId, clinic_id: "eq." + session.user.clinic_id, branch_id: "eq." + session.user.branch_id, limit: "1",
  });
  const response = await databaseRequest(session.accessToken, "patients?" + query);
  if (!response.ok) throw await readDatabaseError(response);
  const [patient] = await response.json() as PatientRow[];
  if (!patient) throw new AuthRouteError(404, "PATIENT_NOT_FOUND", "Patient was not found in this clinic branch.");
  const clinic = await clinicSnapshot(session);
  const built = sectionsFor(kind, source, patient.full_name);
  return {
    reference: "", kind, title: built.title, issuedAt: new Date().toISOString(),
    patient: { name: patient.full_name, patientNumber: patient.medical_record_number, dateOfBirth: patient.date_of_birth ?? undefined, contactNumber: patient.phone ?? undefined },
    practitioner: { name: session.user.full_name, registrationNumber: session.user.license_number ?? undefined },
    clinic, sections: built.sections, sourceData: source as unknown as Record<string, unknown>,
  };
}

export function generateDocumentNumber(kind: PersistedDocumentKind) {
  const prefix = kind === "MC" ? "MC" : kind === "REFERRAL" ? "REF" : "LAB";
  const year = new Date(Date.now() + 8 * 60 * 60 * 1000).getUTCFullYear();
  return prefix + "-" + year + "-" + randomBytes(4).toString("hex").toUpperCase();
}

export function mapRpcDocument(row: RpcDocument, verificationUrl?: string): ClinicDocumentArtifact {
  const kinds: Record<RpcDocument["document_type"], PersistedDocumentKind> = {
    medical_certificate: "MC", referral_letter: "REFERRAL", lab_requisition: "LAB_REQUISITION",
  };
  return {
    ...row.content, artifactId: row.document_id, reference: row.document_number,
    kind: kinds[row.document_type], issuedAt: row.content.issuedAt || row.issued_at,
    version: row.current_version, printCount: row.print_count ?? 0,
    verificationUrl,
  };
}

export async function rpcDocument(session: AuthenticatedClinicStaff, name: string, body: unknown): Promise<RpcDocument> {
  const response = await databaseRequest(session.accessToken, "rpc/" + name, { method: "POST", body: JSON.stringify(body) });
  if (!response.ok) throw await readDatabaseError(response);
  return await response.json() as RpcDocument;
}

export async function verifyDocumentWritePermission(session: AuthenticatedClinicStaff) {
  const query = new URLSearchParams({
    select: "is_allowed", clinic_id: "eq." + session.user.clinic_id,
    branch_id: "eq." + session.user.branch_id, role: "eq." + session.user.role,
    permission_key: "eq.documents.write", limit: "1",
  });
  const response = await databaseRequest(session.accessToken, "role_permissions?" + query);
  if (!response.ok) throw await readDatabaseError(response);
  const [row] = await response.json() as Array<{ is_allowed: boolean }>;
  if (row?.is_allowed !== true) throw new AuthRouteError(403, "DOCUMENT_PERMISSION_DENIED", "Document writing permission is not enabled for this clinic role.");
}

export async function verifyDocumentReadPermission(session: AuthenticatedClinicStaff) {
  const query = new URLSearchParams({
    select: "is_allowed", clinic_id: "eq." + session.user.clinic_id,
    branch_id: "eq." + session.user.branch_id, role: "eq." + session.user.role,
    permission_key: "eq.documents.read", limit: "1",
  });
  const response = await databaseRequest(session.accessToken, "role_permissions?" + query);
  if (!response.ok) throw await readDatabaseError(response);
  const [row] = await response.json() as Array<{ is_allowed: boolean }>;
  if (row?.is_allowed !== true) throw new AuthRouteError(403, "DOCUMENT_PERMISSION_DENIED", "Document reading permission is not enabled for this clinic role.");
}
