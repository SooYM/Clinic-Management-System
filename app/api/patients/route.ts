import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { genderFromMalaysianIc, normalizeMalaysianIc, normalizeMalaysianPhone } from "../../../src/domain/MalaysianIc";
import { AuthRouteError, getAuthenticatedClinicStaff, jsonResponse, errorResponse, setSessionCookies } from "../../../lib/server/supabase-auth";
import { encryptPatientNationalId, decryptPatientNationalId, hashPatientNationalId } from "../../../lib/server/patient-identifiers";
import { withSessionClient } from "../../../lib/server/db";

import { getDatabase, saveDatabase, type StoredPatient } from "../../../lib/server/storage";

export const runtime = "nodejs";

type DbPatient = {
  id: string;
  medical_record_number: string;
  id_type?: string | null;
  ic_number?: string | null;
  national_id_ciphertext?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name: string;
  date_of_birth: string | null;
  gender: "female" | "male" | "other" | "unknown" | null;
  phone: string | null;
  email: string | null;
  blood_group: string | null;
  allergies: Array<{ substance: string; severity: "MILD" | "MODERATE" | "SEVERE" }>;
  chronic_conditions: string[];
  address_line_1?: string | null;
  address_line_2?: string | null;
  postcode?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  nationality?: string | null;
};

function toPatient(row: DbPatient) {
  const dob = row.date_of_birth ?? "";
  const today = new Date();
  const birthday = dob ? new Date(`${dob}T00:00:00`) : null;
  const age = birthday
    ? today.getFullYear() - birthday.getFullYear() - (today.getMonth() < birthday.getMonth() || (today.getMonth() === birthday.getMonth() && today.getDate() < birthday.getDate()) ? 1 : 0)
    : 0;

  let nric = row.ic_number ?? "";
  if (!nric && row.national_id_ciphertext) {
    try {
      nric = decryptPatientNationalId(row.national_id_ciphertext);
    } catch {
      nric = "";
    }
  }

  const addressParts = [
    row.address_line_1,
    row.address_line_2,
    [row.postcode, row.city].filter(Boolean).join(" "),
    row.state,
  ].filter(Boolean);
  const fullAddress = addressParts.join(", ");

  return {
    id: row.id,
    medicalRecordNumber: row.medical_record_number,
    idType: (row.id_type === "passport" ? "passport" : "nric") as "nric" | "passport",
    nric,
    firstName: row.first_name || "",
    lastName: row.last_name || "",
    name: row.full_name || [row.first_name, row.last_name].filter(Boolean).join(" "),
    phone: row.phone ?? "",
    email: row.email ?? "",
    dob,
    age,
    gender: row.gender === "female" ? "Female" : row.gender === "male" ? "Male" : row.gender === "other" ? "Other" : "Unknown",
    nationality: row.nationality || (row.id_type === "passport" ? "Foreign" : "Malaysian"),
    addressLine1: row.address_line_1 || "",
    addressLine2: row.address_line_2 || "",
    postcode: row.postcode || "",
    city: row.city || "",
    state: row.state || "",
    country: row.country || "Malaysia",
    address: fullAddress,
    bloodGroup: row.blood_group === "unknown" ? "" : row.blood_group ?? "",
    allergies: row.allergies ?? [],
    chronicConditions: row.chronic_conditions ?? [],
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthenticatedClinicStaff(request);
    let patientItems: unknown[] = [];
    try {
      const rows = await withSessionClient(session.user.auth_user_id, async (client) => {
        try {
          const res = await client.query<DbPatient>(
            `SELECT id, medical_record_number, id_type, ic_number, national_id_ciphertext,
                    first_name, last_name, full_name, date_of_birth, gender, phone, email,
                    blood_group, allergies, chronic_conditions,
                    address_line_1, address_line_2, postcode, city, state, country, nationality
             FROM public.patients
             WHERE clinic_id = $1 AND branch_id = $2 AND archived_at IS NULL
             ORDER BY created_at DESC LIMIT 500;`,
            [session.user.clinic_id, session.user.branch_id],
          );
          return res.rows;
        } catch {
          // Graceful fallback for unmigrated legacy schema
          const res = await client.query<DbPatient>(
            `SELECT id, medical_record_number, national_id_ciphertext, full_name, date_of_birth, gender, phone, email, blood_group, allergies, chronic_conditions
             FROM public.patients
             WHERE clinic_id = $1 AND branch_id = $2 AND archived_at IS NULL
             ORDER BY created_at DESC LIMIT 500;`,
            [session.user.clinic_id, session.user.branch_id],
          );
          return res.rows;
        }
      });
      patientItems = rows.map((row) => toPatient(row));
    } catch {
      // Fallback to zero-config persistent local storage
      patientItems = getDatabase().patients;
    }

    const result = jsonResponse({ ok: true, patients: patientItems });
    return session.rotatedTokens ? setSessionCookies(result, session.rotatedTokens) : result;
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthenticatedClinicStaff(request);
    if (!["receptionist", "manager", "nurse"].includes(session.user.role)) {
      throw new AuthRouteError(403, "ROLE_FORBIDDEN", "Your role cannot register patients.");
    }
    const body = (await request.json()) as Record<string, unknown>;
    const idType = (typeof body.idType === "string" ? body.idType.toLowerCase() : "nric") === "passport" ? "passport" : "nric";
    
    // Parse First Name, Last Name, and Full Name
    const rawFirstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
    const rawLastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
    let firstName = rawFirstName;
    let lastName = rawLastName;
    let fullName = typeof body.name === "string" && body.name.trim()
      ? body.name.trim()
      : (typeof body.fullName === "string" && body.fullName.trim() ? body.fullName.trim() : "");

    if (!fullName && (firstName || lastName)) {
      fullName = [firstName, lastName].filter(Boolean).join(" ");
    } else if (fullName && !firstName && !lastName) {
      const parts = fullName.split(/\s+/);
      if (parts.length > 1) {
        lastName = parts.pop() || "";
        firstName = parts.join(" ");
      } else {
        firstName = fullName;
        lastName = "";
      }
    }

    const rawId = typeof body.nric === "string" ? body.nric.trim() : (typeof body.nationalId === "string" ? body.nationalId.trim() : "");
    const nric = idType === "nric" ? normalizeMalaysianIc(rawId).replace(/[^\d]/g, "") : rawId.toUpperCase();

    // Phone is optional now, can include country code
    let phone: string | null = null;
    if (typeof body.phone === "string" && body.phone.trim()) {
      const trimmedPhone = body.phone.trim();
      const countryCode = typeof body.countryCode === "string" && body.countryCode.trim() ? body.countryCode.trim() : "";
      phone = countryCode && !trimmedPhone.startsWith("+") ? `${countryCode} ${trimmedPhone}` : trimmedPhone;
    }

    const dob = typeof body.dob === "string" ? body.dob : "";
    if (fullName.length < 2 || fullName.length > 160 || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      throw new AuthRouteError(400, "INVALID_PATIENT", "Enter patient name and valid date of birth.");
    }
    if (idType === "nric" && !/^\d{12}$/.test(nric)) {
      throw new AuthRouteError(400, "INVALID_NRIC", "Enter a valid 12-digit Malaysian IC number.");
    }
    if (idType === "passport" && (nric.length < 3 || nric.length > 30)) {
      throw new AuthRouteError(400, "INVALID_PASSPORT", "Enter a valid passport or foreign identification number (3-30 characters).");
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

    // Parse Address Components
    const addressLine1 = typeof body.addressLine1 === "string" ? body.addressLine1.trim() : "";
    const addressLine2 = typeof body.addressLine2 === "string" ? body.addressLine2.trim() : "";
    const postcode = typeof body.postcode === "string" ? body.postcode.trim() : "";
    const city = typeof body.city === "string" ? body.city.trim() : "";
    const state = typeof body.state === "string" ? body.state.trim() : "";
    const country = typeof body.country === "string" && body.country.trim() ? body.country.trim() : "Malaysia";
    const fullAddress = typeof body.address === "string" && body.address.trim()
      ? body.address.trim()
      : [addressLine1, addressLine2, [postcode, city].filter(Boolean).join(" "), state].filter(Boolean).join(", ");
    const nationality = typeof body.nationality === "string" && body.nationality.trim()
      ? body.nationality.trim()
      : (idType === "nric" ? "Malaysian" : "Foreign");

    const ciphertext = encryptPatientNationalId(nric);
    const hash = hashPatientNationalId(nric);
    const rawGender = idType === "nric"
      ? (genderFromMalaysianIc(nric) || (typeof body.gender === "string" ? body.gender : "unknown"))
      : (typeof body.gender === "string" ? body.gender : "unknown");
    const gender = (rawGender.toLowerCase() === "female" ? "female" : rawGender.toLowerCase() === "male" ? "male" : "other") as "female" | "male" | "other" | "unknown";
    const bloodGroup = typeof body.bloodGroup === "string" && body.bloodGroup ? body.bloodGroup : null;
    const validBloodGroups = new Set(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "unknown"]);
    if (bloodGroup && !validBloodGroups.has(bloodGroup)) {
      throw new AuthRouteError(400, "INVALID_BLOOD_GROUP", "Select a valid blood group or leave it blank.");
    }
    const allergies = Array.isArray(body.allergies)
      ? body.allergies.slice(0, 50).map((item) => {
          if (!item || typeof item !== "object") throw new AuthRouteError(400, "INVALID_ALLERGY", "Allergy entries must include a substance and severity.");
          const allergy = item as Record<string, unknown>;
          const substance = typeof allergy.substance === "string" ? allergy.substance.trim() : "";
          const severity = typeof allergy.severity === "string" ? allergy.severity.toUpperCase() : "";
          if (!substance || substance.length > 120 || !["MILD", "MODERATE", "SEVERE"].includes(severity)) {
            throw new AuthRouteError(400, "INVALID_ALLERGY", "Allergy entries must include a substance and valid severity.");
          }
          return { substance, severity: severity as "MILD" | "MODERATE" | "SEVERE" };
        })
      : [];
    const conditions = Array.isArray(body.chronicConditions)
      ? body.chronicConditions
          .filter((item): item is string => typeof item === "string")
          .map((value) => value.trim())
          .filter(Boolean)
          .slice(0, 50)
      : [];
    const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const effectiveMrn = typeof body.medicalRecordNumber === "string" && body.medicalRecordNumber
      ? body.medicalRecordNumber
      : `MY-${dateStamp}-${randomBytes(4).toString("hex").toUpperCase()}`;

    let createdPatient: ReturnType<typeof toPatient> | StoredPatient;
    try {
      const insertedRow = await withSessionClient(session.user.auth_user_id, async (client) => {
        try {
          const res = await client.query<DbPatient>(
            `INSERT INTO public.patients (
               clinic_id, branch_id, medical_record_number,
               id_type, ic_number, national_id_ciphertext, national_id_hash,
               first_name, last_name, full_name, date_of_birth,
               gender, phone, email, blood_group, allergies, chronic_conditions,
               address_line_1, address_line_2, postcode, city, state, country, nationality,
               created_by, pdpa_consent_at, pdpa_consent_version
             ) VALUES (
               $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, now(), '1'
             )
             RETURNING id, medical_record_number, id_type, ic_number, national_id_ciphertext,
                       first_name, last_name, full_name, date_of_birth, gender, phone, email,
                       blood_group, allergies, chronic_conditions,
                       address_line_1, address_line_2, postcode, city, state, country, nationality;`,
            [
              session.user.clinic_id,
              session.user.branch_id,
              effectiveMrn,
              idType,
              rawId,
              ciphertext,
              Buffer.from(hash, "hex"),
              firstName,
              lastName,
              fullName,
              dob,
              gender,
              phone,
              email || null,
              bloodGroup,
              JSON.stringify(allergies),
              JSON.stringify(conditions),
              addressLine1,
              addressLine2,
              postcode,
              city,
              state,
              country,
              nationality,
              session.user.id,
            ],
          );
          return res.rows[0];
        } catch {
          // Graceful fallback for unmigrated table
          const res = await client.query<DbPatient>(
            `INSERT INTO public.patients (
               clinic_id, branch_id, medical_record_number,
               national_id_ciphertext, national_id_hash, full_name, date_of_birth,
               gender, phone, email, blood_group, allergies, chronic_conditions,
               created_by, pdpa_consent_at, pdpa_consent_version
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now(), '1')
             RETURNING id, medical_record_number, full_name, date_of_birth, gender, phone, email, blood_group, allergies, chronic_conditions;`,
            [
              session.user.clinic_id,
              session.user.branch_id,
              effectiveMrn,
              ciphertext,
              Buffer.from(hash, "hex"),
              fullName,
              dob,
              gender,
              phone,
              email || null,
              bloodGroup,
              JSON.stringify(allergies),
              JSON.stringify(conditions),
              session.user.id,
            ],
          );
          return res.rows[0];
        }
      });
      createdPatient = toPatient(insertedRow);
    } catch {
      // Fallback to local zero-config persistent storage
      const localPatient: StoredPatient = {
        id: crypto.randomUUID(),
        medicalRecordNumber: effectiveMrn,
        idType,
        nric: rawId,
        firstName,
        lastName,
        name: fullName,
        phone: phone || "",
        email: email || "",
        dob,
        age: Math.max(0, new Date().getFullYear() - parsedDob.getFullYear()),
        gender: gender === "female" ? "Female" : gender === "male" ? "Male" : "Other",
        nationality,
        addressLine1,
        addressLine2,
        postcode,
        city,
        state,
        country,
        address: fullAddress,
        bloodGroup: bloodGroup || "",
        allergies,
        chronicConditions: conditions,
        createdAt: new Date().toISOString(),
      };
      const db = getDatabase();
      saveDatabase({ patients: [localPatient, ...db.patients] });
      createdPatient = localPatient;
    }

    const result = NextResponse.json(
      { ok: true, patient: createdPatient, medicalRecordNumber: effectiveMrn },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
    return session.rotatedTokens ? setSessionCookies(result, session.rotatedTokens) : result;
  } catch (error) {
    return errorResponse(error);
  }
}
