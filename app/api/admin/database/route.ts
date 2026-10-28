import { NextRequest } from "next/server";
import { AuthRouteError, getAuthenticatedClinicStaff, errorResponse, isLocalDemoEnabled, jsonResponse } from "../../../../lib/server/supabase-auth";
import { getDatabase } from "../../../../lib/server/storage";
import { withSessionClient } from "../../../../lib/server/db";
import { sessionResponse } from "../../../../lib/server/scheduling-api";

export const runtime = "nodejs";

// Explicit metadata projections omit credentials, identifiers, signing tokens and clinical content.
const liveTables: Record<string, readonly string[]> = {
  staff_members: ["id", "full_name", "role", "active", "license_number", "created_at"],
  patients: ["id", "medical_record_number", "full_name", "date_of_birth", "gender", "phone", "email", "created_at", "archived_at"],
  consultation_rooms: ["id", "room_number", "attending_practitioner_id", "is_active", "created_at"],
  appointments: ["id", "patient_id", "practitioner_id", "room_id", "starts_at", "ends_at", "status", "created_at"],
  queue_tickets: ["id", "patient_id", "ticket_number", "status", "priority", "room_id", "practitioner_id", "registered_at", "called_at", "completed_at"],
  inventory_items: ["id", "name", "sku", "is_active", "created_at"],
  clinical_documents: ["id", "patient_id", "document_number", "document_type", "status", "issued_at", "current_version"],
  role_permissions: ["id", "role", "permission_key", "is_allowed", "updated_at"],
};

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthenticatedClinicStaff(request);
    if (session.user.role !== "manager") {
      throw new AuthRouteError(403, "FORBIDDEN", "Database browsing is available only to clinic administrators.");
    }
    const { searchParams } = new URL(request.url);
    const tableName = searchParams.get("table");
    const limit = Number(searchParams.get("limit") ?? 50);
    const offset = Number(searchParams.get("offset") ?? 0);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200 || !Number.isInteger(offset) || offset < 0) {
      throw new AuthRouteError(400, "INVALID_INPUT", "Provide a limit from 1 to 200 and a non-negative integer offset.");
    }
    if (!isLocalDemoEnabled()) {
      if (tableName && !Object.hasOwn(liveTables, tableName)) {
        throw new AuthRouteError(400, "INVALID_TABLE", "Select an available clinic table.");
      }
      const data = await withSessionClient(session.user.auth_user_id, async (client) => {
        const scope = [session.user.clinic_id, session.user.branch_id];
        if (!tableName) {
          const tables = [];
          for (const name of Object.keys(liveTables)) {
            const count = await client.query<{ count: number }>(
              `SELECT count(*)::int AS count FROM public.${name} WHERE clinic_id = $1 AND branch_id = $2;`, scope,
            );
            tables.push({ name, count: count.rows[0]?.count ?? 0 });
          }
          return { ok: true, mode: "postgresql", database: "clinic_db", tables };
        }
        const count = await client.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM public.${tableName} WHERE clinic_id = $1 AND branch_id = $2;`, scope,
        );
        const result = await client.query(
          `SELECT ${liveTables[tableName].join(", ")} FROM public.${tableName}
           WHERE clinic_id = $1 AND branch_id = $2 ORDER BY id LIMIT $3 OFFSET $4;`, [...scope, limit, offset],
        );
        return {
          ok: true, mode: "postgresql", table: tableName, total: count.rows[0]?.count ?? 0, limit, offset,
          columns: liveTables[tableName].map((name) => ({ name, type: result.rows[0] ? typeof result.rows[0][name] : "unknown", nullable: true })),
          rows: result.rows,
        };
      });
      return sessionResponse(session, data);
    }
    const db = getDatabase();
    const tables = {
      staff: db.staff.map((staff) => Object.fromEntries(Object.entries(staff).filter(([key]) => key !== "password"))),
      patients: db.patients.map((patient) => ({ ...patient, nric: "" })),
      queue: db.queue,
      rooms: db.rooms,
      inventory: db.inventory,
      digitalMcs: db.digitalMcs,
      referrals: db.referrals,
      labOrders: db.labOrders,
    };
    if (!tableName) {
      return jsonResponse({ ok: true, mode: "local_storage", database: "clinic_database.json", tables: Object.entries(tables).map(([name, rows]) => ({ name, count: rows.length })) });
    }
    if (!Object.hasOwn(tables, tableName)) {
      throw new AuthRouteError(400, "INVALID_TABLE", "Select an available demo table.");
    }
    const list = tables[tableName as keyof typeof tables];
    const sample = list[0];
    return jsonResponse({
      ok: true,
      mode: "local_storage",
      table: tableName,
      total: list.length,
      limit,
      offset,
      columns: sample ? Object.entries(sample).map(([name, value]) => ({ name, type: typeof value, nullable: true })) : [],
      rows: list.slice(offset, offset + limit),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthenticatedClinicStaff(request);
    if (session.user.role !== "manager") {
      throw new AuthRouteError(403, "FORBIDDEN", "Only clinic administrators can access database administration.");
    }
    throw new AuthRouteError(403, "SQL_EXECUTION_DISABLED", "Use trusted database administration tools to execute SQL.");
  } catch (error) {
    return errorResponse(error);
  }
}
