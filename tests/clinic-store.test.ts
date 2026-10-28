import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { PatientRecord, QueueTicketData, ConsultationRoomData, InventoryItemData, StaffUserRecord, ClinicPortalConfig, useClinicStore } from "../lib/data/clinic-store";

const source = ts.transpileModule(
  readFileSync(new URL("../lib/data/clinic-store.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

type TestResponse = { ok: boolean; json(): Promise<unknown> };

// Exercise hook effects and actions with isolated state, transport, and notifications.
function mount(
  demo: boolean,
  authenticated: boolean,
  responder: (url: string, options: RequestInit) => TestResponse,
  initial: Record<number, unknown> = {},
) {
  const state: unknown[] = [];
  const messages: Array<[string, string]> = [];
  const requests: Array<[string, RequestInit]> = [];
  const effects: Array<() => void | (() => void)> = [];
  let index = 0;
  const exports = {} as { useClinicStore: typeof useClinicStore };
  runInNewContext(source, {
    exports,
    process: { env: { NEXT_PUBLIC_CLINIC_DEMO_MODE: String(demo) } },
    crypto: webcrypto,
    require(name: string) {
      if (name === "react") return {
        useState<T>(value: T): [T, (update: T | ((previous: T) => T)) => void] {
          const slot = index++;
          state[slot] = slot in initial ? initial[slot] : value;
          return [state[slot] as T, update => {
            state[slot] = typeof update === "function"
              ? (update as (previous: T) => T)(state[slot] as T) : update;
          }];
        },
        useEffect(effect: () => void | (() => void)) { effects.push(effect); },
      };
      if (name.includes("toast")) return { notify(message: string, kind: string) { messages.push([message, kind]); } };
      if (name.includes("MalaysianIc")) return { genderFromMalaysianIc() { return undefined; } };
      throw new Error(`Unexpected store dependency: ${name}`);
    },
    async fetch(url: string, options: RequestInit = {}) {
      requests.push([url, options]);
      return responder(url, options);
    },
  });
  return { store: exports.useClinicStore(authenticated, "manager"), state, messages, requests, effects };
}

const response = (ok: boolean, data: unknown): TestResponse => ({ ok, async json() { return data; } });
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const patient: PatientRecord = {
  id: "patient-1", name: "Patient", nric: "", dob: "2000-01-01", age: 26,
  gender: "Other", email: "", phone: "", bloodGroup: "", allergies: [], chronicConditions: [],
};

test("unauthenticated store loads no records and contains no seeded inventory or rooms", async () => {
  const hook = mount(true, false, () => { throw new Error("No request expected"); });
  hook.effects[0]();
  await tick();
  assert.equal(hook.requests.length, 0);
  assert.equal(hook.store.inventory.length, 0);
  assert.equal(hook.store.rooms.length, 0);
  assert.equal(hook.store.staffList.length, 0);
  assert.equal(hook.store.role, "manager");
  assert.equal("setRole" in hook.store, false);
});

test("live store loads patients, queue, rooms, and staff through dedicated APIs", async () => {
  const rooms: ConsultationRoomData[] = [{ id: "room-1", name: "Room 01", practitionerName: "Doctor", specialty: "", isOccupied: true }];
  const staff = [{ id: "staff-1", fullName: "Doctor", role: "doctor", isActive: true }];
  const fixtures: Record<string, unknown> = {
    "/api/patients": { ok: true, patients: [patient] },
    "/api/queue": { ok: true, queue: [{ id: "q", patient_id: patient.id, ticket_number: "Q1", status: "in_consultation", registered_at: "2026-01-01" }] },
    "/api/rooms": { ok: true, rooms },
    "/api/staff": { ok: true, staff },
  };
  const hook = mount(false, true, url => {
    assert.ok(url in fixtures, `Unexpected live data route: ${url}`);
    return response(true, fixtures[url]);
  });
  hook.effects[0]();
  await tick();
  assert.deepEqual(hook.requests.map(([url]) => url), ["/api/patients", "/api/queue", "/api/rooms", "/api/staff"]);
  assert.deepEqual(hook.state[2], rooms);
  assert.deepEqual(hook.state[0], staff);
  const queue = hook.state[3] as QueueTicketData[];
  assert.equal(queue[0].status, "IN_CONSULTATION");
  assert.equal(queue[0].databaseStatus, "in_consultation");
  assert.equal(queue[0].patientName, patient.name);
});

test("failed live metadata load surfaces error without JSON fallback or partially accepting records", async () => {
  const hook = mount(false, true, url => {
    if (url === "/api/patients") return response(true, { ok: true, patients: [patient] });
    if (url === "/api/queue") return response(true, { ok: true, queue: [] });
    if (url === "/api/rooms") return response(false, { ok: false, error: { message: "Rooms permission denied" } });
    if (url === "/api/staff") return response(true, { ok: true, staff: [] });
    throw new Error(`Unexpected live data route: ${url}`);
  });
  hook.effects[0]();
  await tick();
  assert.equal((hook.state[1] as PatientRecord[]).length, 0);
  assert.equal((hook.state[2] as ConsultationRoomData[]).length, 0);
  assert.equal(hook.state.includes("Rooms permission denied"), true);
  assert.equal(hook.requests.some(([url]) => url === "/api/clinic-data"), false);
});

test("rejected patient registration surfaces validation error without creating a local record", async () => {
  const hook = mount(true, true, () => response(false, { ok: false, error: { message: "Consent required" } }));
  const result = await hook.store.registerPatient({
    ...patient, enqueueNow: true, pdpaConsent: false, gender: "Other",
  });
  assert.equal(result, undefined);
  assert.equal((hook.state[1] as PatientRecord[]).length, 0);
  assert.equal((hook.state[3] as QueueTicketData[]).length, 0);
  assert.equal(hook.requests.length, 1);
  assert.deepEqual(hook.messages.at(-1), ["Consent required", "error"]);
});

test("rejected staff registration creates neither a local staff user nor a room", async () => {
  const hook = mount(true, true, () => response(false, { ok: false, error: { message: "Forbidden" } }));
  const result = await hook.store.registerStaffUser({ fullName: "Doctor", email: "doctor@example.com", role: "doctor" });
  assert.equal(result, undefined);
  assert.equal((hook.state[0] as StaffUserRecord[]).length, 0);
  assert.equal((hook.state[2] as ConsultationRoomData[]).length, 0);
  assert.equal(hook.requests.length, 1);
  assert.deepEqual(hook.messages.at(-1), ["Forbidden", "error"]);
});

test("rejected queue room allocation preserves waiting ticket and does not bypass API validation", async () => {
  const hook = mount(true, true, () => response(false, { ok: false, error: { message: "Room occupied" } }), {
    3: [{ id: "q", status: "WAITING", patientId: patient.id, ticketNumber: "Q1" }],
    2: [{ id: "room", name: "Room", isOccupied: true }],
  });
  await hook.store.callPatientToRoom("q", "room");
  assert.equal((hook.state[3] as QueueTicketData[])[0].status, "WAITING");
  assert.equal((hook.state[2] as ConsultationRoomData[])[0].isOccupied, true);
  assert.equal(hook.requests.length, 1);
  assert.equal(hook.requests[0][0], "/api/queue");
  assert.deepEqual(hook.messages.at(-1), ["Room occupied", "error"]);
});

test("rejected clinic-data save does not add inventory or report success", async () => {
  const hook = mount(true, true, () => response(false, { ok: false, error: { message: "Forbidden" } }));
  const result = await hook.store.addInventoryItem({
    name: "Drug", sku: "DRUG", category: "MEDICATION", batches: [], minimumParLevel: 1, sellingPrice: 10,
  });
  assert.equal(result, undefined);
  assert.equal((hook.state[5] as InventoryItemData[]).length, 0);
  assert.deepEqual(hook.messages.at(-1), ["Forbidden", "error"]);
  assert.equal(hook.messages.some(([, kind]) => kind === "success"), false);
});

test("unsupported live writes issue no demo persistence request and preserve portal settings", async () => {
  const hook = mount(false, true, () => { throw new Error("No request expected"); });
  await hook.store.updatePortalConfig({ portalName: "Unsaved" });
  assert.equal(hook.requests.length, 0);
  assert.notEqual((hook.state[11] as ClinicPortalConfig).portalName, "Unsaved");
  assert.equal(hook.messages.at(-1)?.[1], "error");
});
