# Clinic Management System

Malaysia-focused clinic management system with a Supabase/PostgreSQL foundation. Implemented routes include authentication, patient registration/directory, permissioned NRIC reveal, queue operations, clinical document issue/revision/print logs, appointment scheduling, and outpatient SOAP encounters. Full schema migrations (1 to 7) cover foundation, queue, documents, appointments/rooms, encounters/prescriptions, inventory/packages, and billing lifecycles.

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

- Next.js 16 App Router, React 19, and TypeScript web client and server routes.
- PostgreSQL database engine with row-level security (RLS), connection pooling via `pg`, and Supabase Auth integration.
- Malaysia defaults in the schema: `MY`, `MYR`, and `Asia/Kuala_Lumpur`.

## Current operating boundary

Implemented server API routes cover:
- `/api/auth/*`: password-grant sign in, session resolution/cookie refresh, and sign out with built-in mock accounts fallback.
- `/api/patients` & `/api/patients/[id]`: registration with AES-256-GCM NRIC encryption, HMAC duplicate detection, and permission-gated audit-logged reveal.
- `/api/queue`: queue ticket registration, room dispatch, and atomic status transitions.
- `/api/appointments` & `/api/appointments/[id]`: booking, doctor scheduling, and status updates.
- `/api/encounters`: clinical SOAP encounter recordings with practitioner linkage.
- `/api/clinical-documents/*` & `/api/document-verification`: versioned MC, referral, and lab documents with QR signing, status verification, and print logging.

`NEXT_PUBLIC_CLINIC_DEMO_MODE=true` enables local standalone operation with pre-seeded demo fixtures without requiring an external PostgreSQL instance.

## Local development

See [setup and deployment](docs/operations-security.md#setup-and-deployment) and [Supabase setup](SUPABASE_SETUP.md). Patient and document routes require server-only encryption, HMAC, and QR signing secrets. To seed initial clinic entities and role permissions into PostgreSQL, run `supabase/seed.sql` or `scripts/seed-data.cjs`.
