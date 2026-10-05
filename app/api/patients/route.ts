import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { genderFromMalaysianIc, normalizeMalaysianIc, normalizeMalaysianPhone } from "../../../src/domain/MalaysianIc";
import { AuthRouteError, getAuthenticatedClinicStaff, jsonResponse, errorResponse, setSessionCookies } from "../../../lib/server/supabase-auth";
import { encryptPatientNationalId, hashPatientNationalId } from "../../../lib/server/patient-identifiers";

export const runtime = "nodejs";

type DbPatient = {
  id: string; medical_record_number: string; national_id_ciphertext?: string | null; full_name: string;
  date_of_birth: string | null; gender: "female" | "male" | "other" | "unknown" | null; phone: string | null;
  email: string | null; blood_group: string | null; allergies: Array<{ substance: string; severity: "MILD" | "MODERATE" | "SEVERE" }>;
  chronic_conditions: string[];
};

function toPatient(row: DbPatient) {
  const dob = row.date_of_birth ?? "";
  const today = new Date();
  const birthday = dob ? new Date(`${dob}T00:00:00`) : null;
  const age = birthday ? today.getFullYear() - birthday.getFullYear() - (today.getMonth() < birthday.getMonth() || (today.getMonth() === birthday.getMonth() && today.getDate() < birthday.getDate()) ? 1 : 0) : 0;
  return {
    id: row.id, medicalRecordNumber: row.medical_record_number, nric: "", name: row.full_name, phone: row.phone ?? "", email: row.email ?? "", dob, age,
    gender: row.gender === "female" ? "Female" : row.gender === "male" ? "Male" : row.gender === "other" ? "Other" : "Unknown",
    bloodGroup: row.blood_group === "unknown" ? "" : row.blood_group ?? "",
    allergies: row.allergies ?? [], chronicConditions: row.chronic_conditions ?? [],
  };
}

async function rest(token: string, path: string, init: RequestInit = {}) {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
  const anon = process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) throw new AuthRouteError(503, "DATABASE_NOT_CONFIGURED", "PostgreSQL is not configured.");
  try {
    const response = await fetch(`${url}/rest/v1/${path}`, {
      ...init, cache: "no-store", headers: {
        apikey: anon, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}),
      },
    });
    return response;
  } catch {
    throw new AuthRouteError(503, "DATABASE_UNAVAILABLE", "The clinic database is unavailable.");
  }
}

async function readError(response: Response) {
  try {
    const data = await response.json() as { code?: string; message?: string; details?: string };
    if (data.code === "23505") return new AuthRouteError(409, "DUPLICATE_PATIENT", "This patient identifier or record number is already registered.");
    if (data.code === "42501") return new AuthRouteError(403, "DATABASE_FORBIDDEN", "Your clinic role cannot perform this action.");
  } catch { /* use generic message */ }
  return new AuthRouteError(502, "DATABASE_REQUEST_FAILED", "The database could not complete the request.");
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthenticatedClinicStaff(request);
    const query = new URLSearchParams({
      select: "id,medical_record_number,full_name,date_of_birth,gender,phone,email,blood_group,allergies,chronic_conditions",
      order: "created_at.desc", limit: "500",
    });
    const response = await rest(session.accessToken, `patients?${query}`);
    if (!response.ok) throw await readError(response);
    const rows = await response.json() as DbPatient[];
    const result = jsonResponse({ ok: true, patients: rows.map((row) => toPatient(row)) });
    return session.rotatedTokens ? setSessionCookies(result, session.rotatedTokens) : result;
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthenticatedClinicStaff(request);
    if (!["receptionist", "manager", "nurse"].includes(session.user.role)) {
      throw new AuthRouteError(403, "ROLE_FORBIDDEN", "Your role cannot register patients.");
    }
    const body = await request.json() as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const nric = typeof body.nric === "string" ? normalizeMalaysianIc(body.nric).replace(/[^\d]/g, "") : "";
    const phone = typeof body.phone === "string" ? normalizeMalaysianPhone(body.phone) : null;
    const dob = typeof body.dob === "string" ? body.dob : "";
    if (name.length < 2 || name.length > 160 || !/^\d{12}$/.test(nric) || !phone || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      throw new AuthRouteError(400, "INVALID_PATIENT", "Enter a name, valid 12-digit Malaysian IC, Malaysian phone, and date of birth.");
    }
    const parsedDob = new Date(`${dob}T00:00:00.000Z`);
    if (Number.isNaN(parsedDob.getTime()) || parsedDob.toISOString().slice(0, 10) !== dob || parsedDob > new Date()) {
      throw new AuthRouteError(400, "INVALID_DATE_OF_BIRTH", "Enter a real date of birth that is not in the future.");
    }
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      throw new AuthRouteError(400, "INVALID_EMAIL", "Enter a valid email address or leave it blank.");
    }
    if (body.pdpaConsent !== true) throw new AuthRouteError(400, "CONSENT_REQUIRED", "Record the patient's PDPA consent before registration.");
    // Keys are checked before contacting the database; NRIC is never stored in plaintext.
    const ciphertext = encryptPatientNationalId(nric);
    const hash = hashPatientNationalId(nric);
    const gender = genderFromMalaysianIc(nric);
    const bloodGroup = typeof body.bloodGroup === "string" && body.bloodGroup ? body.bloodGroup : null;
    const validBloodGroups = new Set(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "unknown"]);
    if (bloodGroup && !validBloodGroups.has(bloodGroup)) throw new AuthRouteError(400, "INVALID_BLOOD_GROUP", "Select a valid blood group or leave it blank.");
    const allergies = Array.isArray(body.allergies) ? body.allergies.slice(0, 50).map((item) => {
      if (!item || typeof item !== "object") throw new AuthRouteError(400, "INVALID_ALLERGY", "Allergy entries must include a substance and severity.");
      const allergy = item as Record<string, unknown>;
      const substance = typeof allergy.substance === "string" ? allergy.substance.trim() : "";
      const severity = typeof allergy.severity === "string" ? allergy.severity.toUpperCase() : "";
      if (!substance || substance.length > 120 || !["MILD", "MODERATE", "SEVERE"].includes(severity)) throw new AuthRouteError(400, "INVALID_ALLERGY", "Allergy entries must include a substance and valid severity.");
      return { substance, severity: severity as "MILD" | "MODERATE" | "SEVERE" };
    }) : [];
    const conditions = Array.isArray(body.chronicConditions) ? body.chronicConditions.filter((item): item is string => typeof item === "string").map((value) => value.trim()).filter(Boolean).slice(0, 50) : [];
    const malaysiaDate = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10).replaceAll("-", "");
    const mrn = `MY-${malaysiaDate}-${randomBytes(4).toString("hex").toUpperCase()}`;
    const row = {
      clinic_id: session.user.clinic_id, branch_id: session.user.branch_id, medical_record_number: mrn,
      national_id_ciphertext: ciphertext, national_id_hash: `\\x${hash}`, full_name: name, date_of_birth: dob,
      gender, phone, email: email || null,
      blood_group: bloodGroup, allergies, chronic_conditions: conditions, created_by: session.user.id,
      pdpa_consent_at: new Date().toISOString(), pdpa_consent_version: "1",
    };
    const response = await rest(session.accessToken, "patients?select=id,medical_record_number,full_name,date_of_birth,gender,phone,email,blood_group,allergies,chronic_conditions", {
      method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row),
    });
    if (!response.ok) throw await readError(response);
    const rows = await response.json() as DbPatient[];
    const result = NextResponse.json({ ok: true, patient: toPatient(rows[0]), medicalRecordNumber: rows[0].medical_record_number }, { status: 201, headers: { "Cache-Control": "no-store" } });
    return session.rotatedTokens ? setSessionCookies(result, session.rotatedTokens) : result;
  } catch (error) { return errorResponse(error); }
}
