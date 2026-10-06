# Documentation index

This documentation distinguishes the **specified target**, the **database foundation**, and the **implemented application**. It describes PostgreSQL as requested and treats Supabase as the current hosted PostgreSQL/Auth adapter.

| Document | Audience | Contents |
| --- | --- | --- |
| [System design](system-design.md) | Product, clinic operations, engineering | Scope, Malaysia context, user flows, boundaries, design decisions |
| [Architecture](architecture.md) | Engineering and deployment | Components, request/data paths, deployment topology, current state |
| [Database](database.md) | Database, backend, security | Exact migration schema, relations, indexes, constraints, RLS |
| [API and documents](api-and-documents.md) | Frontend/backend integrators | Existing auth API, session contract, print/reissue and QR behavior |
| [Operations and security](operations-security.md) | Operators and maintainers | Setup, migrations, backups, deployment, security, testing, roadmap |

## Source of truth

- Requirements: [`CLINIC_MANAGEMENT_SYSTEM_SPECIFICATION.md`](../CLINIC_MANAGEMENT_SYSTEM_SPECIFICATION.md)
- Current database definition: Ordered migrations in [`supabase/migrations/`](../supabase/migrations) (01 foundation, 02 queue transitions, 03 clinical documents, 04 scheduling & rooms, 05 encounters & prescriptions, 06 inventory & packages, 07 billing lifecycle) and seeds in [`supabase/seed.sql`](../supabase/seed.sql)
- Supabase setup notes: [`SUPABASE_SETUP.md`](../SUPABASE_SETUP.md)
- UI demo data/state: [`lib/data/clinic-store.ts`](../lib/data/clinic-store.ts), [`app/page.tsx`](../app/page.tsx)
- Server backend & database: [`lib/server/db.ts`](../lib/server/db.ts), [`lib/server/supabase-auth.ts`](../lib/server/supabase-auth.ts), [`lib/server/scheduling-api.ts`](../lib/server/scheduling-api.ts), [`lib/server/clinical-care.ts`](../lib/server/clinical-care.ts), and [`app/api/`](../app/api)
- Document preview implementation: [`components/documents`](../components/documents)

The migrations (01 through 07), not the older aspirational DDL in the requirements document, are authoritative for the current PostgreSQL tables, column names, RPCs, and RLS policies.
