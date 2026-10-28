import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import type { PoolClient } from "pg";

// Route tests use a new working directory, never the user's clinic database.
const workspace = process.cwd();
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "clinic-audit-"));
process.chdir(sandbox);
Object.assign(process.env, {
  NODE_ENV: "test", NEXT_PUBLIC_CLINIC_DEMO_MODE: "true",
  PATIENT_NRIC_ENCRYPTION_KEY: "11".repeat(32),
  PATIENT_NRIC_HASH_KEY: "22".repeat(32),
  DOCUMENT_QR_SIGNING_KEY: "33".repeat(32),
});
delete process.env.APP_BASE_URL;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_ANON_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const auth = await import("../lib/server/supabase-auth");
const storage = await import("../lib/server/storage");
const database = await import("../lib/server/db");
const identifiers = await import("../lib/server/patient-identifiers");
const verification = await import("../lib/server/document-verification");
const clinicData = await import("../app/api/clinic-data/route");
const admin = await import("../app/api/admin/database/route");
const staff = await import("../app/api/staff/route");
const patientRoutes = await import("../app/api/patients/route");
const patientDetail = await import("../app/api/patients/[id]/route");
const queueRoutes = await import("../app/api/queue/route");
const login = await import("../app/api/auth/login/route");
const scheduling = await import("../lib/server/scheduling-api");

after(async () => {
  mock.restoreAll();
  await database.getDbPool().end();
  process.chdir(workspace);
  fs.rmSync(sandbox, { recursive: true, force: true });
});

const origin = "http://localhost:3000";
function request(route: string, token = "", method = "GET", body?: unknown) {
  return new NextRequest(origin + route, {
    method,
    headers: { origin, "Content-Type": "application/json", cookie: `${auth.ACCESS_COOKIE}=${token}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function token(username = "admin", password = "admin123") {
  return (await auth.signInWithPassword(username, password)).access_token;
}

test("forged known-account cookies cannot authenticate, even in demo mode", async () => {
  for (const prefix of ["cms_mock_", "kumo_mock_"]) {
    await assert.rejects(auth.getAuthenticatedClinicStaff(request("/api/queue", prefix + "10000000-0000-4000-8000-000000000001")), { status: 401 });
  }
});

test("demo sessions survive authentication module reloads and revoke across module instances", async () => {
  const access = await token();
  const reloaded = await import(new URL("../lib/server/supabase-auth.ts?session-reload", import.meta.url).href) as typeof auth;
  assert.equal((await reloaded.getAuthenticatedClinicStaff(request("/api/clinic-data", access))).user.role, "manager");
  await reloaded.revokeSession(access);
  await assert.rejects(auth.getAuthenticatedClinicStaff(request("/api/clinic-data", access)), { status: 401 });
});

test("demo tokens are random, expire, revoke, and cannot run in production", async () => {
  const access = await token();
  assert.notEqual(access, await token());
  assert.equal((await auth.getAuthenticatedClinicStaff(request("/api/queue", access))).user.role, "manager");
  Object.assign(process.env, { NODE_ENV: "production" });
  await assert.rejects(auth.getAuthenticatedClinicStaff(request("/api/queue", access)), { status: 401 });
  Object.assign(process.env, { NODE_ENV: "test" });
  const now = Date.now();
  const clock = mock.method(Date, "now", () => now + 16 * 60 * 1000);
  await assert.rejects(auth.getAuthenticatedClinicStaff(request("/api/queue", access)), { status: 401 });
  clock.mock.restore();
  const logoutToken = await token();
  await auth.revokeSession(logoutToken);
  await assert.rejects(auth.getAuthenticatedClinicStaff(request("/api/queue", logoutToken)), { status: 401 });
});

test("demo account login requires explicit opt-in", async () => {
  process.env.NEXT_PUBLIC_CLINIC_DEMO_MODE = "false";
  await assert.rejects(auth.signInWithPassword("admin", "admin123"), { status: 401 });
  process.env.NEXT_PUBLIC_CLINIC_DEMO_MODE = "true";
});

test("inactive staff cannot reuse an existing session", async () => {
  const access = await token();
  const user = (await auth.getAuthenticatedClinicStaff(request("/api/queue", access))).user;
  storage.toggleStaffActive(user.id, false);
  await assert.rejects(auth.getAuthenticatedClinicStaff(request("/api/queue", access)), { status: 403 });
  storage.toggleStaffActive(user.id, true);
});

test("CSRF checks compare exact origin including protocol and port", () => {
  for (const forbidden of ["http://localhost:3001", "https://localhost:3000", "https://elsewhere.onrender.com", "http://localhost.evil.test:3000"]) {
    assert.throws(() => auth.assertSameOrigin(new NextRequest(origin + "/api/queue", { method: "POST", headers: { origin: forbidden } })), { status: 403 });
  }
});

test("data and staff endpoints require sessions; role checks deny privilege changes", async () => {
  assert.equal((await clinicData.GET(request("/api/clinic-data"))).status, 401);
  assert.equal((await clinicData.PATCH(request("/api/clinic-data", "", "PATCH", { patients: [] }))).status, 401);
  assert.equal((await staff.GET(request("/api/staff"))).status, 401);
  const manager = await token();
  assert.equal((await clinicData.PATCH(request("/api/clinic-data", manager, "PATCH", { staff: [] }))).status, 403);
  const nurse = await token("nurse", "nurse123");
  assert.equal((await staff.GET(request("/api/staff", nurse))).status, 403);
  assert.equal((await clinicData.PATCH(request("/api/clinic-data", nurse, "PATCH", { rolePermissions: {} }))).status, 403);
  const data = await (await clinicData.GET(request("/api/clinic-data", manager))).json();
  assert.ok(data.data.staff.every((row: Record<string, unknown>) => !("password" in row)));
  assert.ok(data.data.patients.every((row: { nric: string }) => row.nric === ""));
});

test("admin SQL cannot execute; staff browser removes credentials", async () => {
  const manager = await token();
  assert.equal((await admin.POST(request("/api/admin/database", manager, "POST", { sql: "SELECT 1" }))).status, 403);
  const result = await (await admin.GET(request("/api/admin/database?table=staff", manager))).json();
  assert.ok(result.rows.every((row: Record<string, unknown>) => !("password" in row)));
  const patients = await (await admin.GET(request("/api/admin/database?table=patients", manager))).json();
  assert.ok(patients.rows.every((row: { nric: string }) => row.nric === ""));
  assert.equal((await admin.GET(request("/api/admin/database?table=staff&limit=bad", manager))).status, 400);
});

test("malformed JSON returns a client error", async () => {
  const response = await login.POST(new NextRequest(origin + "/api/auth/login", { method: "POST", headers: { origin }, body: "{" }));
  assert.equal(response.status, 400);
});

test("scheduling rejects normalized impossible dates and accepts offset instants", () => {
  assert.equal(scheduling.parseInstant("2026-02-30T10:00:00Z"), null);
  assert.equal(scheduling.parseInstant("2026-10-07T10:00:00+08:00"), "2026-10-07T02:00:00.000Z");
});

test("live database permission errors never return demo patients or queue records", async () => {
  process.env.NEXT_PUBLIC_CLINIC_DEMO_MODE = "false";
  process.env.SUPABASE_URL = "https://auth.fixture.invalid";
  process.env.SUPABASE_ANON_KEY = "fixture-public-key";
  const user = auth.BUILT_IN_STAFF_ACCOUNTS[0].profile;
  const fetchMock = mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
    return Response.json(String(url).includes("/auth/v1/user") ? { id: user.auth_user_id } : [{ ...user, active: true }]);
  });
  const connect = mock.method(database.getDbPool(), "connect", async () => {
    throw new auth.AuthRouteError(403, "PERMISSION_DENIED", "Fixture permission denial");
  });
  try {
    assert.equal((await patientRoutes.GET(request("/api/patients", "fixture-live-access"))).status, 403);
    assert.equal((await queueRoutes.GET(request("/api/queue", "fixture-live-access"))).status, 403);
  } finally {
    fetchMock.mock.restore(); connect.mock.restore();
    process.env.NEXT_PUBLIC_CLINIC_DEMO_MODE = "true";
    delete process.env.SUPABASE_URL; delete process.env.SUPABASE_ANON_KEY;
  }
});

test("patient identifiers encrypt with authenticated tamper detection and stable hashes", () => {
  const value = "990101-14-5566";
  const encrypted = identifiers.encryptPatientNationalId(value);
  assert.equal(identifiers.decryptPatientNationalId(encrypted), value);
  assert.notEqual(identifiers.encryptPatientNationalId(value), encrypted);
  const parts = encrypted.split(".");
  parts[1] = Buffer.alloc(16).toString("base64url");
  assert.throws(() => identifiers.decryptPatientNationalId(parts.join(".")));
  assert.equal(identifiers.hashPatientNationalId(value), identifiers.hashPatientNationalId(value));
  assert.notEqual(verification.documentVerificationToken("doc", 1), verification.documentVerificationToken("doc", 2));
});

let patientId = "";
test("patient registration validates DOB, conceals identifiers, and rejects equivalent duplicates", async () => {
  const manager = await token();
  const input = { name: "Audit Fixture", nric: "990101145566", dob: "1999-01-01", phone: "+60129988776", pdpaConsent: true };
  const invalid = await patientRoutes.POST(request("/api/patients", manager, "POST", { ...input, dob: "1999-02-30" }));
  assert.equal(invalid.status, 400);
  const created = await patientRoutes.POST(request("/api/patients", manager, "POST", input));
  const payload = await created.json();
  assert.equal(created.status, 201, JSON.stringify(payload));
  patientId = payload.patient.id;
  assert.equal(payload.patient.nric, "");
  assert.equal((await patientRoutes.POST(request("/api/patients", manager, "POST", { ...input, nric: "990101-14-5566" }))).status, 409);
  const list = await (await patientRoutes.GET(request("/api/patients", manager))).json();
  assert.ok(list.patients.every((row: { nric: string }) => row.nric === ""));
  const detail = await patientDetail.GET(request(`/api/patients/${patientId}`, manager), { params: Promise.resolve({ id: patientId }) });
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).patient.nationalId.replace(/-/g, ""), input.nric);
});

test("queue enforces patient existence, uniqueness, stale writes, room occupancy, and legal transitions", async () => {
  const manager = await token();
  assert.equal((await queueRoutes.POST(request("/api/queue", manager, "POST", { patientId: "99999999-0000-4000-8000-000000000001" }))).status, 404);
  const create = await queueRoutes.POST(request("/api/queue", manager, "POST", { patientId }));
  assert.equal(create.status, 201);
  const ticket = (await create.json()).ticket;
  assert.equal((await queueRoutes.POST(request("/api/queue", manager, "POST", { patientId }))).status, 409);
  const patch = (status: string, expectedStatus: string, roomId?: string) => queueRoutes.PATCH(request("/api/queue", manager, "PATCH", { ticketId: ticket.id, status, expectedStatus, roomId }));
  assert.equal((await patch("COMPLETED", "registered")).status, 400);
  assert.equal((await patch("CALLED_TO_ROOM", "payment_waiting")).status, 409);
  const occupied = storage.getDatabase().rooms.find((room) => room.isOccupied);
  if (occupied) assert.equal((await patch("CALLED_TO_ROOM", "registered", occupied.id)).status, 409);
  const room = storage.getDatabase().rooms.find((item) => !item.isOccupied)!;
  assert.equal((await patch("CALLED_TO_ROOM", "registered", room.id)).status, 200);
  assert.equal(storage.getDatabase().rooms.find((item) => item.id === room.id)?.isOccupied, true);
  assert.equal((await patch("IN_CONSULTATION", "called_to_room")).status, 200);
  assert.equal((await patch("DISPENSARY", "in_consultation")).status, 200);
  assert.equal(storage.getDatabase().rooms.find((item) => item.id === room.id)?.isOccupied, false);
});

test("database sessions assume restricted roles; rollback and release on error", async () => {
  const queries: string[] = [];
  let released = 0;
  const client = { query: async (sql: string) => { queries.push(sql); return { rows: [] }; }, release: () => { released++; } };
  const connect = mock.method(database.getDbPool(), "connect", async () => client as unknown as PoolClient);
  try {
    await database.withSessionClient("00000000-0000-4000-8000-000000000001", async () => "ok");
    assert.ok(queries.includes("SET LOCAL ROLE authenticated;"));
    assert.equal(queries.at(-1), "COMMIT;");
    await assert.rejects(database.withSessionClient(null, async () => { throw { code: "42501", message: "secret SQL details" }; }), { status: 403 });
    assert.ok(queries.includes("SET LOCAL ROLE anon;"));
    assert.equal(queries.at(-1), "ROLLBACK;");
    assert.equal(released, 2);
    assert.ok(!database.mapDbError({ code: "23505", message: "private NRIC" }).message.includes("private NRIC"));
  } finally { connect.mock.restore(); }
});

test("failed disk write does not accept in-memory changes", () => {
  const before = storage.getDatabase();
  const write = mock.method(fs, "writeFileSync", () => { throw new Error("fixture disk full"); });
  try {
    assert.throws(() => storage.saveDatabase({ patients: [] }), /No changes were accepted/);
    assert.equal(storage.getDatabase(), before);
  } finally { write.mock.restore(); }
});
