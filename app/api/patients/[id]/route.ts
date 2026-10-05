import { NextRequest } from "next/server";
import { AuthRouteError, getAuthenticatedClinicStaff, jsonResponse, errorResponse, setSessionCookies } from "../../../../lib/server/supabase-auth";
import { decryptPatientNationalId } from "../../../../lib/server/patient-identifiers";

export const runtime = "nodejs";

async function requireIdentifierPermission(base: string, anon: string, accessToken: string, clinicId: string, branchId: string) {
  let response: Response;
  try {
    response = await fetch(`${base}/rest/v1/rpc/has_branch_permission`, {
      method: "POST", cache: "no-store",
      headers: { apikey: anon, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_clinic_id: clinicId, p_branch_id: branchId, p_permission_key: "patients.identifiers.read" }),
    });
  } catch { throw new AuthRouteError(503, "PERMISSION_CHECK_UNAVAILABLE", "Could not verify identifier access."); }
  if (!response.ok) throw new AuthRouteError(503, "PERMISSION_CHECK_UNAVAILABLE", "Could not verify identifier access.");
  if (await response.json() !== true) throw new AuthRouteError(403, "IDENTIFIER_ACCESS_DENIED", "Your clinic role cannot view national identifiers.");
}

async function recordIdentifierRead(base: string, patientId: string, clinicId: string, branchId: string, staffId: string) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) throw new AuthRouteError(503, "AUDIT_NOT_CONFIGURED", "Identifier access auditing is not configured.");
  let response: Response;
  try {
    response = await fetch(`${base}/rest/v1/audit_events`, {
      method: "POST", cache: "no-store",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        clinic_id: clinicId, branch_id: branchId, actor_id: staffId,
        action: "patients.identifier.read", entity_type: "patient", entity_id: patientId,
        metadata: { data_class: "national_identifier" },
      }),
    });
  } catch { throw new AuthRouteError(503, "AUDIT_WRITE_FAILED", "Identifier access could not be recorded."); }
  if (!response.ok) throw new AuthRouteError(503, "AUDIT_WRITE_FAILED", "Identifier access could not be recorded.");
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAuthenticatedClinicStaff(request);
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AuthRouteError(400, "INVALID_PATIENT", "Select a valid patient.");
    const base = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
    const anon = process.env.SUPABASE_ANON_KEY?.trim();
    if (!base || !anon) throw new AuthRouteError(503, "DATABASE_NOT_CONFIGURED", "PostgreSQL is not configured.");
    await requireIdentifierPermission(base, anon, session.accessToken, session.user.clinic_id, session.user.branch_id);
    const query = new URLSearchParams({ select: "id,national_id_ciphertext", id: `eq.${id}`, limit: "1" });
    let response: Response;
    try {
      response = await fetch(`${base}/rest/v1/patients?${query}`, { cache: "no-store", headers: { apikey: anon, Authorization: `Bearer ${session.accessToken}` } });
    } catch { throw new AuthRouteError(503, "DATABASE_UNAVAILABLE", "The clinic database is unavailable."); }
    if (!response.ok) throw new AuthRouteError(502, "PATIENT_LOAD_FAILED", "Could not load the patient record.");
    const [patient] = await response.json() as Array<{ id: string; national_id_ciphertext: string | null }>;
    if (!patient) throw new AuthRouteError(404, "PATIENT_NOT_FOUND", "Patient record not found.");
    const nationalId = patient.national_id_ciphertext ? decryptPatientNationalId(patient.national_id_ciphertext) : null;
    if (nationalId) await recordIdentifierRead(base, patient.id, session.user.clinic_id, session.user.branch_id, session.user.id);
    const result = jsonResponse({ ok: true, patient: { id: patient.id, nationalId } });
    return session.rotatedTokens ? setSessionCookies(result, session.rotatedTokens) : result;
  } catch (error) { return errorResponse(error); }
}
