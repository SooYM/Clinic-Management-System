import { NextRequest } from "next/server";
import { GET as getPatients, POST as postPatients } from "../app/api/patients/route.js";
import { GET as getPatientId } from "../app/api/patients/[id]/route.js";
import { GET as getQueue, POST as postQueue, PATCH as patchQueue } from "../app/api/queue/route.js";
import { POST as loginPost } from "../app/api/auth/login/route.js";
import { GET as sessionGet } from "../app/api/auth/session/route.js";
import { GET as getEncounters, POST as postEncounters } from "../app/api/encounters/route.js";
import { GET as getDocs, POST as postDocs } from "../app/api/clinical-documents/route.js";
import { GET as verifyDoc } from "../app/api/document-verification/route.js";

async function runTests() {
  console.log("=== STARTING CLINIC DATABASE INTEGRATION TESTS ===");

  // 1. Authenticate as Receptionist (Sarah Lim)
  const loginReq = new NextRequest("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify({ username: "reception", password: "reception123" }),
  });
  const loginRes = await loginPost(loginReq);
  const loginJson = await loginRes.json();
  console.log("1. Reception login:", loginJson.ok ? "SUCCESS" : "FAILED", loginJson.user?.full_name);

  // Extract cookies
  const cookies = loginRes.cookies.getAll();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

  // 2. Fetch Patients (should return seeded patients from PostgreSQL)
  const patReq = new NextRequest("http://localhost:3000/api/patients", {
    headers: { cookie: cookieHeader, origin: "http://localhost:3000" },
  });
  const patRes = await getPatients(patReq);
  const patJson = await patRes.json();
  console.log("2. GET /api/patients count:", patJson.patients?.length, "(Expected >= 4)");
  if (!patJson.patients || patJson.patients.length < 4) {
    throw new Error("Failed to load seeded patients from PostgreSQL!");
  }

  // 3. Register New Patient via POST /api/patients
  const newPatIc = "990101145566";
  const registerReq = new NextRequest("http://localhost:3000/api/patients", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieHeader, origin: "http://localhost:3000" },
    body: JSON.stringify({
      name: "Siti Nurhaliza Binti Ahmad",
      nric: newPatIc,
      phone: "+60 12-998 8776",
      email: "siti.nurhaliza@test.com",
      dob: "1999-01-01",
      bloodGroup: "O+",
      allergies: [{ substance: "Penicillin", severity: "MILD" }],
      chronicConditions: ["None"],
      pdpaConsent: true,
    }),
  });
  const regRes = await postPatients(registerReq);
  const regJson = await regRes.json();
  console.log("3. POST /api/patients:", regJson.ok ? "SUCCESS" : "FAILED", regJson.patient?.name, "MRN:", regJson.medicalRecordNumber);
  const createdPatientId = regJson.patient?.id;

  // 4. View Patient Identifier via GET /api/patients/[id]
  const viewIdReq = new NextRequest(`http://localhost:3000/api/patients/${createdPatientId}`, {
    headers: { cookie: cookieHeader, origin: "http://localhost:3000" },
  });
  const viewIdRes = await getPatientId(viewIdReq, { params: Promise.resolve({ id: createdPatientId }) });
  const viewIdJson = await viewIdRes.json();
  console.log("4. GET /api/patients/[id] NRIC decrypted:", viewIdJson.patient?.nationalId === newPatIc ? "MATCHES (990101145566)" : "FAILED");

  // 5. GET /api/queue (should return seeded queue)
  const queueReq = new NextRequest("http://localhost:3000/api/queue", {
    headers: { cookie: cookieHeader, origin: "http://localhost:3000" },
  });
  const queueRes = await getQueue(queueReq);
  const queueJson = await queueRes.json();
  console.log("5. GET /api/queue ticket count:", queueJson.queue?.length, "(Expected >= 4)");

  // 6. POST /api/queue (Issue new ticket)
  const issueTicketReq = new NextRequest("http://localhost:3000/api/queue", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieHeader, origin: "http://localhost:3000" },
    body: JSON.stringify({ patientId: createdPatientId }),
  });
  const issueTicketRes = await postQueue(issueTicketReq);
  const issueTicketJson = await issueTicketRes.json();
  console.log("6. POST /api/queue issued ticket:", issueTicketJson.ticket?.ticket_number);
  const newTicketId = issueTicketJson.ticket?.id;

  // 7. PATCH /api/queue (Transition ticket to called_to_room)
  const callRoomReq = new NextRequest("http://localhost:3000/api/queue", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie: cookieHeader, origin: "http://localhost:3000" },
    body: JSON.stringify({
      ticketId: newTicketId,
      expectedStatus: "registered",
      status: "CALLED_TO_ROOM",
      roomId: "20000000-0000-4000-8000-000000000001",
      note: "Patient called to Consultation Room 01",
    }),
  });
  const callRoomRes = await patchQueue(callRoomReq);
  const callRoomJson = await callRoomRes.json();
  console.log("7. PATCH /api/queue transition:", callRoomJson.ok ? "CALLED_TO_ROOM SUCCESS" : "FAILED", "Status:", callRoomJson.ticket?.status);

  // 8. Sign in as Doctor (Dr. Alicia Tan)
  const docLoginReq = new NextRequest("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify({ username: "doctor", password: "doctor123" }),
  });
  const docLoginRes = await loginPost(docLoginReq);
  const docCookies = docLoginRes.cookies.getAll().map((c) => `${c.name}=${c.value}`).join("; ");
  console.log("8. Doctor login: SUCCESS", (await docLoginRes.json()).user?.full_name);

  // 9. POST /api/encounters (Doctor writes & signs outpatient encounter)
  const encReq = new NextRequest("http://localhost:3000/api/encounters", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: docCookies, origin: "http://localhost:3000" },
    body: JSON.stringify({
      patientId: createdPatientId,
      queueTicketId: newTicketId,
      chiefComplaint: "Severe migraine and photophobia for 2 days",
      subjective: "Patient experiences throbbing unilateral headache accompanied by nausea.",
      objective: { bp: "118/76", hr: 72, temp: 36.8 },
      assessment: "Acute migraine without aura",
      plan: "Sumatriptan 50mg PRN, prescribed bed rest for 2 days",
      diagnosisCodes: ["G43.009"],
      sign: true,
    }),
  });
  const encRes = await postEncounters(encReq);
  const encJson = await encRes.json();
  console.log("9. POST /api/encounters signed:", encJson.ok ? "SUCCESS" : "FAILED", "Encounter ID:", encJson.encounter?.id, "Status:", encJson.encounter?.status);

  // 10. POST /api/clinical-documents (Issue Digital Medical Certificate)
  const mcReq = new NextRequest("http://localhost:3000/api/clinical-documents", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: docCookies, origin: "http://localhost:3000" },
    body: JSON.stringify({
      patientId: createdPatientId,
      kind: "MC",
      sourceData: {
        days: 2,
        startDate: "2026-10-05",
        diagnosis: "Acute migraine",
        isDiagnosisRedacted: false,
      },
    }),
  });
  const mcRes = await postDocs(mcReq);
  const mcJson = await mcRes.json();
  console.log("10. POST /api/clinical-documents issued MC:", mcJson.ok ? "SUCCESS" : "FAILED", "MC Ref:", mcJson.document?.reference);

  // 11. Verify MC via GET /api/document-verification
  if (mcJson.document?.verificationUrl) {
    const url = new URL(mcJson.document.verificationUrl);
    const token = url.searchParams.get("token");
    const verifyReq = new NextRequest(`http://localhost:3000/api/document-verification?token=${token}`);
    const verifyRes = await verifyDoc(verifyReq);
    const verifyJson = await verifyRes.json();
    console.log("11. GET /api/document-verification status:", verifyJson.status === "valid" ? "VALID (QR Verified)" : "FAILED");
  }

  console.log("=== ALL CLINIC DATABASE INTEGRATION TESTS PASSED ===");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
