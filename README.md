# Clinic Management System

Malaysia-focused clinic management system with a Supabase/PostgreSQL foundation. Authentication, patient registration/directory, queue operations, and clinical document issue/revision/print logs use server APIs backed by PostgreSQL. Scheduling, encounters/prescriptions, rooms, packages, inventory, billing/payments, notifications, commissions, and complete administration are not yet operational.

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

- Next.js App Router, React, and TypeScript web client/server routes.
- PostgreSQL is the intended system of record. The supplied migrations target Supabase-hosted PostgreSQL and use Supabase Auth JWT identity in row-level security policies.
- Malaysia defaults in the schema: `MY`, `MYR`, and `Asia/Kuala_Lumpur`.

## Current operating boundary

Implemented routes cover `/api/auth/*`, patient registration/directory and permissioned NRIC retrieval, atomic queue operations, and versioned MC/referral/lab-document issue, regeneration, status verification, and print logging. Patient/queue/document changes persist with PostgreSQL when configured. Receipts remain unavailable until invoices and confirmed payments exist. `NEXT_PUBLIC_CLINIC_DEMO_MODE=true` enables seeded browser data and local-only demo workflows; it does not disable server API routes. See [architecture](docs/architecture.md) and [known gaps](docs/operations-security.md#known-gaps-and-roadmap).

## Local development

See [setup and deployment](docs/operations-security.md#setup-and-deployment) and [Supabase setup](SUPABASE_SETUP.md). Patient and document routes require server-only encryption, HMAC, and QR signing secrets. Database migrations must be applied and clinic roles provisioned before use. Several high-impact workflows are still missing, so do not use the current release as a complete clinic system or load live operational data before qualified security, privacy, clinical, and accounting review.
