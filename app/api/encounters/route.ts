import { NextRequest } from "next/server";
import { AuthRouteError, errorResponse, getAuthenticatedClinicStaff, jsonResponse, setSessionCookies } from "../../../lib/server/supabase-auth";
import { assertClinicalPermission, isUuid, nullableText } from "../../../lib/server/clinical-care";
import { withSessionClient, callRpc } from "../../../lib/server/db";

export const runtime = "nodejs";

type EncounterBody = {
  encounterId?: unknown;
  patientId?: unknown;
  queueTicketId?: unknown;
  appointmentId?: unknown;
  chiefComplaint?: unknown;
  subjective?: unknown;
  objective?: unknown;
  assessment?: unknown;
  plan?: unknown;
  diagnosisCodes?: unknown;
  sign?: unknown;
};

function parseEncounterBody(value: unknown, requireId: boolean) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AuthRouteError(400, "CLINICAL_DATA_INVALID", "Encounter data is required.");
  }
  const body = value as EncounterBody;
  if ((requireId && !isUuid(body.encounterId)) || (!requireId && body.encounterId != null && !isUuid(body.encounterId))) {
    throw new AuthRouteError(400, "CLINICAL_DATA_INVALID", "Select a valid encounter.");
  }
  if (!isUuid(body.patientId)) throw new AuthRouteError(400, "CLINICAL_DATA_INVALID", "Select a valid patient.");
  if (body.queueTicketId != null && !isUuid(body.queueTicketId)) throw new AuthRouteError(400, "CLINICAL_DATA_INVALID", "Select a valid queue ticket.");
  if (body.appointmentId != null && !isUuid(body.appointmentId)) throw new AuthRouteError(400, "CLINICAL_DATA_INVALID", "Select a valid appointment.");
  const objective = body.objective ?? {};
  const diagnosisCodes = body.diagnosisCodes ?? [];
  if (!objective || typeof objective !== "object" || Array.isArray(objective) || Object.keys(objective).length > 100) {
    throw new AuthRouteError(400, "CLINICAL_DATA_INVALID", "Objective findings must be a JSON object.");
  }
  if (!Array.isArray(diagnosisCodes) || diagnosisCodes.length > 50 || diagnosisCodes.some((item) => typeof item !== "string" || item.length > 80)) {
    throw new AuthRouteError(400, "CLINICAL_DATA_INVALID", "Diagnosis codes must be a list of at most 50 text values.");
  }
  return {
    encounterId: isUuid(body.encounterId) ? body.encounterId : null,
    patientId: body.patientId,
    queueTicketId: isUuid(body.queueTicketId) ? body.queueTicketId : null,
    appointmentId: isUuid(body.appointmentId) ? body.appointmentId : null,
    chiefComplaint: nullableText(body.chiefComplaint, 2000, "the chief complaint"),
    subjective: nullableText(body.subjective, 12000, "the subjective note"),
    objective,
    assessment: nullableText(body.assessment, 8000, "the assessment"),
    plan: nullableText(body.plan, 12000, "the treatment plan"),
    diagnosisCodes,
    sign: body.sign === true,
  };
}

async function save(request: NextRequest, requireId: boolean) {
  const session = await getAuthenticatedClinicStaff(request);
  await assertClinicalPermission(session, "encounters.write");
  const input = parseEncounterBody(await request.json(), requireId);

  const encounter = await callRpc(session.user.auth_user_id, "save_outpatient_encounter", [
    input.encounterId,
    input.patientId,
    input.queueTicketId,
    input.appointmentId,
    input.chiefComplaint,
    input.subjective,
    input.objective,
    input.assessment,
    input.plan,
    JSON.stringify(input.diagnosisCodes),
    input.sign,
  ]);

  const result = jsonResponse({ ok: true, encounter }, requireId ? 200 : 201);
  return session.rotatedTokens ? setSessionCookies(result, session.rotatedTokens) : result;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthenticatedClinicStaff(request);
    await assertClinicalPermission(session, "encounters.read");
    const params = request.nextUrl.searchParams;
    const encounterId = params.get("encounterId");
    const patientId = params.get("patientId");
    if ((encounterId && !isUuid(encounterId)) || (patientId && !isUuid(patientId))) {
      throw new AuthRouteError(400, "CLINICAL_DATA_INVALID", "Select a valid patient or encounter.");
    }

    const { encounters, versions } = await withSessionClient(session.user.auth_user_id, async (client) => {
      let sql = `SELECT id, patient_id, queue_ticket_id, appointment_id, practitioner_id, status,
                        chief_complaint, subjective, objective, assessment, plan, diagnosis_codes,
                        revision, signed_at, signed_by, created_at, updated_at
                 FROM public.encounters
                 WHERE clinic_id = $1 AND branch_id = $2`;
      const queryParams: unknown[] = [session.user.clinic_id, session.user.branch_id];

      if (encounterId) {
        queryParams.push(encounterId);
        sql += ` AND id = $${queryParams.length}`;
      }
      if (patientId) {
        queryParams.push(patientId);
        sql += ` AND patient_id = $${queryParams.length}`;
      }

      sql += ` ORDER BY created_at DESC LIMIT ${encounterId ? "1" : "200"};`;
      const res = await client.query(sql, queryParams);
      const rows = res.rows as Array<Record<string, unknown> & { id: string }>;

      if (encounterId && rows.length === 0) {
        throw new AuthRouteError(404, "CLINICAL_RECORD_NOT_FOUND", "The requested encounter was not found in this branch.");
      }

      let historyRows: unknown[] = [];
      if (encounterId) {
        const histRes = await client.query(
          `SELECT id, revision, note_snapshot, snapshot_sha256, changed_by, signed, created_at
           FROM public.encounter_note_versions
           WHERE clinic_id = $1 AND branch_id = $2 AND encounter_id = $3
           ORDER BY revision DESC LIMIT 100;`,
          [session.user.clinic_id, session.user.branch_id, encounterId],
        );
        historyRows = histRes.rows;
      }

      return { encounters: rows, versions: historyRows };
    });

    const result = jsonResponse({ ok: true, encounters, ...(encounterId ? { versions } : {}) });
    return session.rotatedTokens ? setSessionCookies(result, session.rotatedTokens) : result;
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    return await save(request, false);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    return await save(request, true);
  } catch (error) {
    return errorResponse(error);
  }
}
