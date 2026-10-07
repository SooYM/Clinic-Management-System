# Repository rules — V2

Active stack: React/Vite, Express, TypeScript, MySQL 8.4. V1 Next.js/Supabase remains only in Git history.

- Follow current specification and `docs/`.
- Reuse domain rules, shared validators and modular adapters.
- Preserve tenant/branch scope, permissions, sessions, CSRF, auditing and transactions.
- Entity IDs are numeric; security and verification tokens remain random.
- Never modify applied migrations; 009 also checksums `numeric-ids.ts`.
- Retired commission/package/photo storage is historical compatibility only.
- Commit no secrets, real clinical records, local databases, dependency/build folders or browser artifacts.
- Use guarded disposable databases for tests and distinguish demo simulation from full backend validation.
- Update specification, schema/ERD, flows, API and test docs with behavior changes.
- Keep free Render demo and full MySQL production modes separate. Demo builds cannot be used for real clinical operation.
- Git publication does not prove successful Render deployment; validate Blueprint sync, health and browser operation separately.
