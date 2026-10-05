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
- Current database definition: [`supabase/migrations/20261005010000_clinic_foundation.sql`](../supabase/migrations/20261005010000_clinic_foundation.sql), [`supabase/migrations/20261005020000_queue_transitions.sql`](../supabase/migrations/20261005020000_queue_transitions.sql), and [`supabase/migrations/20261005030000_clinical_document_lifecycle.sql`](../supabase/migrations/20261005030000_clinical_document_lifecycle.sql)
- Supabase setup notes: [`SUPABASE_SETUP.md`](../SUPABASE_SETUP.md)
- UI demo data/state: [`lib/data/clinic-store.ts`](../lib/data/clinic-store.ts), [`app/page.tsx`](../app/page.tsx)
- Authentication implementation: [`lib/server/supabase-auth.ts`](../lib/server/supabase-auth.ts), [`app/api/auth`](../app/api/auth)
- Document preview implementation: [`components/documents`](../components/documents)

The migration, not the older aspirational DDL in the requirements document, is authoritative for the current PostgreSQL column names and policies. No live database project was inspected as part of this documentation.
