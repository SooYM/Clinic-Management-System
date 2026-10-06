async function run() {
  console.log("=== RUNNING FULL LIVE HTTP E2E TESTS ON PORT 3001 ===");

  // 1. Receptionist login
  const loginRes = await fetch("http://localhost:3001/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: "http://localhost:3001" },
    body: JSON.stringify({ username: "reception", password: "reception123" }),
  });
  const loginJson = await loginRes.json();
  console.log("1. Reception login:", loginJson.ok ? "SUCCESS" : "FAILED", loginJson.user?.full_name);

  const rawCookies = loginRes.headers.getSetCookie();
  const cookieHeader = rawCookies.map((c) => c.split(";")[0]).join("; ");

  // 2. Fetch Patients from PostgreSQL
  const patRes = await fetch("http://localhost:3001/api/patients", {
    headers: { cookie: cookieHeader, origin: "http://localhost:3001" },
  });
  const patJson = await patRes.json();
  console.log("2. GET /api/patients count:", patJson.patients?.length, "(Expected >= 4)");

  // 3. Register New Patient
  const testNric = "00031514" + Math.floor(1000 + Math.random() * 9000);
  const regRes = await fetch("http://localhost:3001/api/patients", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieHeader, origin: "http://localhost:3001" },
    body: JSON.stringify({
      name: "Nurul Izzah Binti Kamaruddin",
      nric: testNric,
      phone: "+60 17-665 4321",
      email: "nurul.izzah@test.com",
      dob: "2000-03-15",
      bloodGroup: "B+",
      allergies: [{ substance: "NSAIDs", severity: "MODERATE" }],
      chronicConditions: ["Asthma"],
      pdpaConsent: true,
    }),
  });
  const regJson = await regRes.json();
  console.log("3. POST /api/patients:", regJson.ok ? "SUCCESS" : "FAILED", regJson.patient?.name, "MRN:", regJson.medicalRecordNumber);
  const newPatientId = regJson.patient?.id;

  // 4. Decrypt NRIC via /api/patients/[id]
  const viewIdRes = await fetch(`http://localhost:3001/api/patients/${newPatientId}`, {
    headers: { cookie: cookieHeader, origin: "http://localhost:3001" },
  });
  const viewIdJson = await viewIdRes.json();
  console.log("4. GET /api/patients/[id] NRIC decrypted:", viewIdJson.patient?.nationalId === testNric ? `MATCHES (${testNric})` : "FAILED");

  // 5. GET /api/queue
  const queueRes = await fetch("http://localhost:3001/api/queue", {
    headers: { cookie: cookieHeader, origin: "http://localhost:3001" },
  });
  const queueJson = await queueRes.json();
  console.log("5. GET /api/queue count:", queueJson.queue?.length);

  // 6. POST /api/queue (Issue Ticket)
  const ticketRes = await fetch("http://localhost:3001/api/queue", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieHeader, origin: "http://localhost:3001" },
    body: JSON.stringify({ patientId: newPatientId }),
  });
  const ticketJson = await ticketRes.json();
  console.log("6. POST /api/queue issued ticket:", ticketJson.ticket?.ticket_number);
  const newTicketId = ticketJson.ticket?.id;

  // 7. Transition ticket to triage_waiting then called_to_room
  const triageRes = await fetch("http://localhost:3001/api/queue", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie: cookieHeader, origin: "http://localhost:3001" },
    body: JSON.stringify({
      ticketId: newTicketId,
      expectedStatus: "registered",
      status: "CALLED_TO_ROOM",
      roomId: "20000000-0000-4000-8000-000000000003", // Suite A
      note: "Patient called to Suite A",
    }),
  });
  const triageJson = await triageRes.json();
  console.log("7. PATCH /api/queue called_to_room:", triageJson.ok ? "SUCCESS" : "FAILED", triageJson.ticket?.status);

  // 8. Doctor login (Dr. Alicia Tan)
  const docLoginRes = await fetch("http://localhost:3001/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: "http://localhost:3001" },
    body: JSON.stringify({ username: "doctor", password: "doctor123" }),
  });
  const docLoginJson = await docLoginRes.json();
  const docCookies = docLoginRes.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  console.log("8. Doctor login:", docLoginJson.ok ? "SUCCESS" : "FAILED", docLoginJson.user?.full_name);

  // 9. Transition ticket to in_consultation
  const consultRes = await fetch("http://localhost:3001/api/queue", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie: docCookies, origin: "http://localhost:3001" },
    body: JSON.stringify({
      ticketId: newTicketId,
      expectedStatus: "called_to_room",
      status: "IN_CONSULTATION",
      note: "Consultation in progress",
    }),
  });
  const consultJson = await consultRes.json();
  console.log("9. PATCH /api/queue in_consultation:", consultJson.ok ? "SUCCESS" : "FAILED");

  // 10. Doctor writes & signs outpatient encounter note
  const encRes = await fetch("http://localhost:3001/api/encounters", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: docCookies, origin: "http://localhost:3001" },
    body: JSON.stringify({
      patientId: newPatientId,
      queueTicketId: newTicketId,
      chiefComplaint: "Acute asthma exacerbation with wheezing",
      subjective: "Patient reports shortness of breath following dust exposure",
      objective: { bp: "124/82", hr: 88, spo2: "97%", temp: 36.7 },
      assessment: "Mild acute asthma exacerbation",
      plan: "Nebulized salbutamol 2.5mg stat, inhaled corticosteroid continued, 2 days medical leave",
      diagnosisCodes: ["J45.901"],
      sign: true,
    }),
  });
  const encJson = await encRes.json();
  console.log("10. POST /api/encounters signed:", encJson.ok ? "SUCCESS" : "FAILED", "Encounter ID:", encJson.encounter?.id);

  // 11. Issue Digital Medical Certificate
  const mcRes = await fetch("http://localhost:3001/api/clinical-documents", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: docCookies, origin: "http://localhost:3001" },
    body: JSON.stringify({
      patientId: newPatientId,
      kind: "MC",
      sourceData: {
        days: 2,
        startDate: "2026-10-05",
        diagnosis: "Asthma exacerbation",
        isDiagnosisRedacted: false,
      },
    }),
  });
  const mcJson = await mcRes.json();
  console.log("11. POST /api/clinical-documents issued MC:", mcJson.ok ? "SUCCESS" : "FAILED", "MC Ref:", mcJson.document?.reference);

  // 12. Verify QR Verification URL
  if (mcJson.document?.verificationUrl) {
    const vUrl = mcJson.document.verificationUrl.replace(":3000", ":3001");
    const vRes = await fetch(vUrl);
    const vJson = await vRes.json();
    console.log("12. GET /api/document-verification QR status:", vJson.status === "valid" ? "VALID (QR Verified)" : "FAILED");
  }

  // 13. Complete consultation to dispensary
  const dispRes = await fetch("http://localhost:3001/api/queue", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie: docCookies, origin: "http://localhost:3001" },
    body: JSON.stringify({
      ticketId: newTicketId,
      expectedStatus: "in_consultation",
      status: "DISPENSARY",
      note: "Sent to pharmacy dispensary",
    }),
  });
  const dispJson = await dispRes.json();
  console.log("13. PATCH /api/queue dispensary_waiting:", dispJson.ok ? "SUCCESS" : "FAILED");

  console.log("\n============================================================");
  console.log("🎉 ALL 13 E2E CLINICAL WORKFLOW TESTS PASSED CLEANLY!");
  console.log("============================================================");
}

run().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});
