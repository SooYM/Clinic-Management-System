import { NextRequest } from "next/server";
import { AuthRouteError, getAuthenticatedClinicStaff, jsonResponse, errorResponse, setSessionCookies, isLocalDemoEnabled } from "../../../../lib/server/supabase-auth";
import { decryptPatientNationalId } from "../../../../lib/server/patient-identifiers";
import { getDatabase, saveDatabase } from "../../../../lib/server/storage";
import { withSessionClient } from "../../../../lib/server/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getAuthenticatedClinicStaff(request);
    const { id } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new AuthRouteError(400, "INVALID_PATIENT", "Select a valid patient.");
    }

    if (isLocalDemoEnabled()) {
      if (!["receptionist", "doctor", "manager"].includes(session.user.role)) {
        throw new AuthRouteError(403, "IDENTIFIER_ACCESS_DENIED", "Your clinic role cannot view national identifiers.");
      }
      const db = getDatabase();
      const patient = db.patients.find((item) => item.id === id);
      if (!patient) throw new AuthRouteError(404, "PATIENT_NOT_FOUND", "Patient record not found.");
      saveDatabase({ identifierAccessLog: [...db.identifierAccessLog, {
        patientId: id,
        staffId: session.user.id,
        accessedAt: new Date().toISOString(),
      }] });
      const result = jsonResponse({ ok: true, patient: { id, nationalId: patient.nric || null } });
      return session.rotatedTokens ? setSessionCookies(result, session.rotatedTokens) : result;
    }

    const { patient, nationalId } = await withSessionClient(session.user.auth_user_id, async (client) => {
      // 1. Verify permission
      const permRes = await client.query<{ allowed: boolean }>(
        `SELECT public.has_branch_permission($1, $2, 'patients.identifiers.read') AS allowed;`,
        [session.user.clinic_id, session.user.branch_id],
      );
      if (permRes.rows[0]?.allowed !== true) {
        throw new AuthRouteError(403, "IDENTIFIER_ACCESS_DENIED", "Your clinic role cannot view national identifiers.");
      }

      // 2. Fetch ciphertext
      const patRes = await client.query<{ id: string; national_id_ciphertext: string | null }>(
        `SELECT id, national_id_ciphertext
         FROM public.patients
         WHERE id = $1 AND clinic_id = $2 AND branch_id = $3 AND archived_at IS NULL
         LIMIT 1;`,
        [id, session.user.clinic_id, session.user.branch_id],
      );
      const row = patRes.rows[0];
      if (!row) {
        throw new AuthRouteError(404, "PATIENT_NOT_FOUND", "Patient record not found.");
      }

      const decrypted = row.national_id_ciphertext ? decryptPatientNationalId(row.national_id_ciphertext) : null;

      // 3. Record audit event
      if (decrypted) {
        await client.query("SELECT public.record_patient_identifier_access($1::uuid);", [row.id]);
      }

      return { patient: row, nationalId: decrypted };
    });

    const result = jsonResponse({ ok: true, patient: { id: patient.id, nationalId } });
    return session.rotatedTokens ? setSessionCookies(result, session.rotatedTokens) : result;
  } catch (error) {
    return errorResponse(error);
  }
}
