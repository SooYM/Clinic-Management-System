# Operations, security, and roadmap

## Setup and deployment

### Prerequisites

- Node.js supported by the deployed Next.js 16 runtime and npm.
- A Supabase project (managed PostgreSQL and Auth) or compatible PostgreSQL/Auth design; current auth helper specifically calls Supabase Auth REST.
- Supabase CLI for applying migrations, configured against the intended project.

### Local app

1. Install repository dependencies with `npm install` in a clean clone.
2. Copy `.env.example` to `.env.local`. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Patient routes require independent 32-byte `PATIENT_NRIC_ENCRYPTION_KEY` and `PATIENT_NRIC_HASH_KEY` secrets. Clinical document issue and QR verification also require a separate 32-byte `DOCUMENT_QR_SIGNING_KEY` and production `APP_BASE_URL`; generate each key independently with `openssl rand -hex 32`. Keep secrets and any service-role/database connection credentials server-side only. Rotating the QR key invalidates previously printed links unless old verification tokens are retained through an explicit migration design.
3. Start with `npm run dev`. `npm run build` makes a production build; `npm run lint` invokes ESLint.
4. Without valid Supabase Auth configuration and a provisioned active `staff_members` row, login is unavailable. `NEXT_PUBLIC_CLINIC_DEMO_MODE` defaults off. Setting it to `true` seeds client demo records, skips PostgreSQL-backed patient/queue/document loads, and keeps those demo workflows in memory. This is client behavior: server API routes are not disabled by this flag, so authenticated direct API calls can still write if the database is configured.

### PostgreSQL migration and initial provisioning

Follow [`SUPABASE_SETUP.md`](../SUPABASE_SETUP.md). Review all ordered migrations in a non-production project first. The app connects patient, queue, and clinical-document workflows; most other domain tables still have no application routes. Do not assume workflows are operational just because the schema applies.

Initial establishment requires (through trusted administration, not public signup):

1. Insert clinic and branch rows with correct legal/operator information.
2. Create Auth identities and matching active `staff_members` rows for each clinic/branch membership.
3. Assign manager membership and review permissions/RLS behavior.
4. Verify authenticated staff queries are branch-limited and anonymous access is restricted.
5. Configure and test provider integrations only after server-side workflows and secret handling exist.

No credentials or provider accounts are included in the repository.

## Database maintenance, backup, and restore

Backups are not configured by this repository. Enable and review backup/PITR options available for the selected PostgreSQL hosting plan, retention window, region, encryption, access policy, and recovery objectives. Record the responsible operator and escalation path.

Minimum operational procedure to establish before production:

1. Record migration version and database environment for each deployment.
2. Take a protected backup before schema changes; use reviewed forward migrations rather than editing an applied migration.
3. Restrict backup access and avoid downloading unencrypted patient data to developer machines.
4. Restore a backup into an isolated environment on a scheduled cadence; validate row counts, key relations, access policies, and application startup.
5. Record restore duration and compare with clinic-approved recovery point/time objectives.
6. Document incident response, breach escalation, and backup disposal/retention with the clinic's privacy/legal advisers.

Do not call backups operationally verified until a restore drill succeeds.

## Monitoring and operations checklist

The codebase has no configured production telemetry, worker health checks, or alerting. Before go-live establish:

- Web/API availability and latency monitoring, especially auth and database connectivity.
- PostgreSQL storage, connection, slow-query, lock, failed-login, and backup/restore monitoring.
- Alerting for migration failures, auth profile/permission provisioning, patient writes, queue writes/transitions, payment webhook failures, and notification outbox backlog once those workflows exist.
- Request IDs and structured logs with secrets, passwords, tokens, NRIC, clinical notes, and message contents redacted.
- Incident log, maintenance owner, access review cadence, dependency/security patch cadence, and recovery contacts.

## Security and Malaysian privacy considerations

This project contains health and identity-related data fields. Before handling real data, the clinic/operator must obtain qualified advice on the Malaysian Personal Data Protection Act and current regulatory obligations, define controller/processor roles, lawful basis/notice and consent where applicable, data subject request process, retention schedule, breach response, processor contracts, cross-border transfer considerations, and professional clinical record requirements. This document is operational engineering guidance, not legal advice or a claim of PDPA compliance.

Controls in the schema/code foundation:

- Branch-scoped row-level policies for authenticated app users.
- Composite tenant keys and foreign keys.
- Append-only triggers for selected history tables.
- No anonymous grants on tables and token table revoked from normal roles.
- Token verification response is minimized to status only.
- Sensitive national ID fields are separated into ciphertext and matching hash slots.
- Auth session cookies are HttpOnly and no-store responses are used.

Required before real PHI:

- Review and test every RLS policy with distinct clinic/branch user fixtures, anonymous role, and privileged role; verify writes and joins cannot cross tenant boundaries.
- Complete and test the multi-branch account selector and membership lifecycle; patient/queue handlers currently use the end-user JWT for RLS, and this must remain the pattern for ordinary staff data access.
- Implement application encryption/key rotation and HMAC key management for identity data; define a rotation/recovery procedure. Do not log values or secrets.
- Add shared rate limiting and body-size limits to auth, patient, queue, document, and public verification endpoints; add proxy-aware origin configuration only if the deployment topology requires it. Same-origin checks now guard cookie-authenticated mutations. Add secure headers/CSP, dependency scanning, and security incident controls.
- Limit access and retention of audit metadata; do not put clinical content or identity values in generic audit JSON.
- Provision and review least-privilege `role_permissions` rows for every branch and role. The migration denies operational table access if a permission row is absent; UI role/module visibility does not seed or grant database access.
- Validate auth route error logging and session behavior; user enumeration is reduced for password rejection but operational alerting is absent.
- Review document templates, QR signing/legal requirements, receipt validity, and authorization to issue/reissue with qualified clinical/accounting stakeholders. QR verification is status-only and has no shared rate limiter.

## Test strategy and quality gates

No application test suite is present in `package.json`. `npm run lint` and `npm run build` are available scripts; the latest TypeScript check and production build passed. Database-specific validation remains unavailable here and must be added before production:

1. Migration applies cleanly to an empty local PostgreSQL/Supabase database and is repeatably deployable through migration tooling.
2. Schema tests cover enum/check constraints, composite FK branch isolation, overlapping practitioner/room booking exclusion, and append-only trigger rejection.
3. RLS tests use multiple tenants/branches and roles; test SELECT/INSERT/UPDATE/DELETE and public verification function grants.
4. Auth API tests cover invalid input, invalid credentials, missing configuration, active/inactive staff mapping, cookie properties, token refresh and revoke failure.
5. Workflow integration tests cover patient registration and identity duplicates; queue create/transition RPC atomicity, state edges, stale-write conflicts, permissions and event history; encounter/document issue and immutable versions; receipt/payment idempotency; FEFO inventory quantities; notification delivery retry semantics.
6. Browser accessibility/usability checks with clinic staff validate modal scroll lock, keyboard paths, print output, and mobile/tablet layouts.
7. Security testing covers authorization bypass, CSRF, rate abuse, encryption, logging, token verification leakage, secrets, and dependency vulnerabilities.

## Known gaps and roadmap

### P0 — required before operational clinic use

- Expand the authenticated server data-access layer beyond patient, queue, and clinical-document operations; add remaining workflow APIs and remove seeded sample records from real environments.
- Complete and test multi-branch identity selection. The server returns `staff_members.id` and `auth_user_id` separately and returns `409 BRANCH_SELECTION_REQUIRED` for multiple active memberships; the client selector is pending.
- Extend server-side authorization and `role_permissions` provisioning to every operational workflow; never trust the UI role module map. Current patient/queue/document routes use authenticated PostgreSQL/RLS calls, but migrations start with no permission rows and further workflows are absent.
- Complete persistence and transactional workflows beyond current patient list/create, permissioned/audited identifier retrieval, queue list/create/transition, clinical documents, appointments, and outpatient encounters: room assignment, prescriptions, invoices/payments, stock, packages, notifications, and full audit coverage.
- Establish clinical approval for official templates, signatures, and legal validity. Document revocation and status-only QR verification are implemented; the public verification endpoint has no shared rate limiter.
- Add actual payment provider integration/webhook verification and notification outbox worker/provider adapters; remove any path that marks a payment received without provider/cashier reconciliation.
- Define clinician identity, consent/privacy notices, retention, legal document templates, backup/restore, monitoring, and incident controls.

### P1 — reliability and full scope

- Add commission ledger and configuration; it is mentioned in the spec but absent from the migration.
- Implement real-time queue updates and branch waiting-room display.
- Add clinical templates, allergy/drug checks, document overlap prevention, and signed-note correction workflow.
- Implement atomic FEFO dispense and reconciliation; the current migration has a batch index but no enforced depletion procedure.
- Add secure file storage and access audit if before/after photos or attachments are required by the spec.
- Add CI, automated unit/integration/E2E/RLS tests, deployment manifests, observability, and disaster-recovery drills.
