# Clinic Management System

Malaysia-focused clinic management system with a PostgreSQL / Supabase foundation and Next.js 16 App Router. Implemented routes include dual authentication (native PostgreSQL or Supabase Auth), patient registration/directory with AES-256-GCM NRIC encryption and audit logging, queue ticketing and atomic room dispatch, live consultation rooms, staff roster management, clinical document issue/versioning/print logging with QR verification, multi-doctor appointment scheduling, outpatient SOAP encounters, and a sanitized manager database explorer. Full schema migrations (01 to 10) cover foundation, queue transitions, clinical documents, scheduling/rooms, encounters/prescriptions, inventory/packages, billing lifecycles, structured patient/queue audit columns, access audit RPCs, and native PostgreSQL authentication schemas.

## Documentation

- [Documentation index](docs/README.md)
- [System overview and design](docs/system-design.md)
- [Architecture and current implementation](docs/architecture.md)
- [PostgreSQL schema and data dictionary](docs/database.md)
- [Authentication, documents, and API contracts](docs/api-and-documents.md)
- [Setup, operations, security, and roadmap](docs/operations-security.md)
- [Supabase/PostgreSQL setup notes](SUPABASE_SETUP.md)
- [Original requirements specification](CLINIC_MANAGEMENT_SYSTEM_SPECIFICATION.md)

## Technology at a glance

- Next.js 16 App Router, React 19, Tailwind CSS, and TypeScript web client and server routes.
- Dual authentication providers: native PostgreSQL (`clinic_auth` schema with salted scrypt hashing and expiring session tokens) or hosted Supabase Auth REST.
- PostgreSQL database engine with connection pooling via `pg`, row-level security (RLS), security-definer RPCs, and transaction-local role switching.
- Malaysia defaults in the schema: `MY`, `MYR`, and `Asia/Kuala_Lumpur`.

## Current operating boundary

Implemented server API routes cover:
- `/api/auth/*`: password-grant sign in, session resolution/cookie refresh, and sign out with native PostgreSQL (`CLINIC_AUTH_PROVIDER=postgresql`), Supabase (`CLINIC_AUTH_PROVIDER=supabase`), or explicit development demo authentication.
- `/api/patients` & `/api/patients/[id]`: registration with AES-256-GCM NRIC encryption, keyed HMAC duplicate detection, and permission-gated audit-logged NRIC reveal.
- `/api/queue`: queue ticket registration, consultation room dispatch, and atomic status transitions with optimistic lock enforcement (`40001`).
- `/api/rooms`: live consultation rooms with active practitioner and queue ticket occupancy joined via RLS.
- `/api/staff`, `/api/staff/[id]`, `/api/staff/[id]/reset-password`: live staff roster listing, credential updates, and role-gated administration.
- `/api/appointments` & `/api/appointments/[id]`: booking, doctor scheduling conflicts, and status updates.
- `/api/encounters`: clinical SOAP encounter recordings with practitioner linkage.
- `/api/clinical-documents/*` & `/api/document-verification`: versioned MC, referral, and lab documents with QR signing, status-only public verification, and print logging.
- `/api/admin/database`: phpMyAdmin-style manager table browser with strict table allowlisting and masked credential projections.
- `/api/clinic-data`: field-allowlisted store endpoint for settings and demo persistence.

`NEXT_PUBLIC_CLINIC_DEMO_MODE=true` enables local standalone operation with pre-seeded demo fixtures without requiring an external PostgreSQL instance.

Demo authentication is available only with `npm run dev` and explicit demo mode. Production requires PostgreSQL or Supabase authentication. Live database errors never fall back to local demo records.

## Quality checks

Run `npm run check` for TypeScript, zero-warning ESLint, and automated Node test suites (47 passing automated tests). Run `npm run build` for production compilation. Tests use isolated fixtures and mocked dependencies; they do not validate a live PostgreSQL deployment. See the [audit findings and remaining limits](docs/operations-security.md#audit-fixes--7-october-2026).

## Local development

See [setup and deployment](docs/operations-security.md#setup-and-deployment) and [Supabase setup](SUPABASE_SETUP.md). Patient and document routes require server-only encryption, HMAC, and QR signing secrets. To seed initial clinic entities and role permissions into PostgreSQL, run `supabase/seed.sql` or `scripts/seed-data.cjs`.

## Native PostgreSQL

Set `DATABASE_URL` and `CLINIC_AUTH_PROVIDER=postgresql` in `.env.local`; keep `NEXT_PUBLIC_CLINIC_DEMO_MODE=false`. Supabase Auth keys are unnecessary for this mode. Back up the database before running `node scripts/complete-postgresql-schema.cjs`; the runner completes existing schemas without resetting records and tracks ordered migrations (01 through 10). Validate a restored copy first using `--database COPY_DATABASE_NAME`.

For an existing standalone installation, `npx tsx --conditions=react-server scripts/provision-postgresql-login.ts --import-local-staff` imports only local credentials matching existing database staff identities. It hashes passwords with scrypt and never overwrites existing login credentials. Native sessions persist in PostgreSQL across server reloads. Sign out and sign in again after switching authentication providers.

Patient and queue records, staff roster, rooms, and sanitized manager database browsing use PostgreSQL. Inventory, settings, and staff management writes still need live endpoints.
