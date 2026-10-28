import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import { NextRequest } from "next/server";
import type { PoolClient } from "pg";
import * as database from "../lib/server/db";
import * as auth from "../lib/server/supabase-auth";
import * as rooms from "../app/api/rooms/route";
import * as staff from "../app/api/staff/route";
import * as admin from "../app/api/admin/database/route";

process.env.CLINIC_AUTH_PROVIDER = "supabase";
process.env.NEXT_PUBLIC_CLINIC_DEMO_MODE = "false";
process.env.SUPABASE_URL = "https://auth.fixture.invalid";
process.env.SUPABASE_ANON_KEY = "fixture-key";
delete process.env.APP_BASE_URL;

const profile = { ...auth.BUILT_IN_STAFF_ACCOUNTS[0].profile, active: true };
let role = "manager";
let resultRows: object[] = [];
const queries: Array<{ sql: string; params?: unknown[] }> = [];
let fail = false;
mock.method(globalThis, "fetch", async (url: string | URL | Request) => Response.json(
  String(url).includes("/auth/v1/user") ? { id: profile.auth_user_id } : [{ ...profile, role }],
));
mock.method(database.getDbPool(), "connect", async () => ({
  query: async (sql: string, params?: unknown[]) => {
    queries.push({ sql, params });
    if (sql.includes("FROM public.")) {
      if (fail) throw { code: "42501" };
      return { rows: sql.includes("count(*)") ? [{ count: 1 }] : resultRows };
    }
    return { rows: [] };
  },
  release() {},
}) as unknown as PoolClient);

after(async () => { mock.restoreAll(); await database.getDbPool().end(); });
function request(path: string, method = "GET") {
  return new NextRequest("http://localhost:3000" + path, { method, headers: {
    origin: "http://localhost:3000", cookie: `${auth.ACCESS_COOKIE}=fixture-token`,
  } });
}

test("live rooms return occupied room metadata through branch-scoped RLS joins", async () => {
  queries.length = 0;
  resultRows = [{ id: "room-id", name: "Room 1", practitionerName: "Doctor", specialty: "General Practice", isOccupied: true, currentTicketNumber: "Q001" }];
  const response = await rooms.GET(request("/api/rooms"));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).rooms, resultRows);
  const select = queries.find(({ sql }) => sql.includes("FROM public.consultation_rooms"))!;
  assert.deepEqual(select.params, [profile.clinic_id, profile.branch_id]);
  assert.match(select.sql, /called_to_room.*in_consultation/);
  assert.match(select.sql, /q.branch_id = r.branch_id/);
  assert.ok(queries.some(({ sql }) => sql === "SET LOCAL ROLE authenticated;"));
});

test("live staff metadata is available to authenticated clinical roles without credential columns", async () => {
  role = "doctor";
  queries.length = 0;
  resultRows = [{ id: "staff-id", fullName: "Doctor", role: "doctor", isActive: true }];
  const response = await staff.GET(request("/api/staff"));
  assert.equal(response.status, 200);
  const select = queries.find(({ sql }) => sql.includes("FROM public.staff_members"))!;
  assert.deepEqual(select.params, [profile.clinic_id, profile.branch_id]);
  assert.doesNotMatch(select.sql, /password|auth\.users|SELECT \*/i);
  role = "manager";
});

test("live admin browsing rejects secret tables and projects patient metadata only", async () => {
  queries.length = 0;
  assert.equal((await admin.GET(request("/api/admin/database?table=document_verification_tokens"))).status, 400);
  assert.equal(queries.length, 0);
  resultRows = [{ id: "patient-id", full_name: "Patient" }];
  assert.equal((await admin.GET(request("/api/admin/database?table=patients"))).status, 200);
  const select = queries.find(({ sql }) => sql.includes("FROM public.patients") && !sql.includes("count(*)"))!;
  assert.doesNotMatch(select.sql, /national_id|ic_number|SELECT \*/i);
  assert.deepEqual(select.params, [profile.clinic_id, profile.branch_id, 50, 0]);
  assert.equal((await admin.POST(request("/api/admin/database", "POST"))).status, 403);
});

test("live roster database errors propagate without local fallback", async () => {
  fail = true;
  try {
    assert.equal((await rooms.GET(request("/api/rooms"))).status, 403);
    assert.equal((await staff.GET(request("/api/staff"))).status, 403);
  } finally { fail = false; }
});
