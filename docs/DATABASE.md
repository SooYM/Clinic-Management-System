# MySQL database schema and evolution

## Final schema

MySQL 8.4 with InnoDB is the supported database. Run every numbered migration from `001_initial.sql` through `012_prescription_reservations.sql`.
The final schema is their combined result, including the numeric conversion helper; the initial migration alone is historical schema.
Do not edit applied migrations. The runner checks migration content and the numeric helper checksum.

There are 24 entity tables with `BIGINT UNSIGNED AUTO_INCREMENT` primary keys.
Entity foreign keys are matching unsigned BIGINT values, including audit actor/entity references and generated queue references.
API IDs are positive JavaScript-safe integers. Sequences are independent per table and may contain gaps.
`tenantNumber`, `branchNumber` and `patientNumber` are response aliases for actual IDs, not extra stored counters.

Membership, policy and role-grant tables use existing relationship/composite keys. Sessions use hashed secret keys; resource locks use named keys.
Migration bookkeeping is infrastructure, not a clinical entity. See the [ERD](ERD.md) for relationships and composite constraints.

## Data dictionary

The [complete column dictionary](DATA_DICTIONARY.md) lists every column in all 30 tables. A [schema-only SQL snapshot](schema.mysql.sql) records final types, indexes and constraints without data or allocated sequence values. These are references; install through migrations, not the snapshot.

All active clinical/operational entity tables carry organization scope where required. Exact defaults, indexes and bounds remain executable in migrations.

| Table                     | Key and important data                                                                                                                                                             | Invariant / use                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| tenants                   | Numeric id, name, created_at                                                                                                                                                       | Organization root                                                                  |
| branches                  | Numeric id, tenant_id, name, address                                                                                                                                               | Unique `(tenant_id,id)` supports scoped FKs                                        |
| users                     | Numeric id, tenant_id, branch_id, email, name, password_hash, role, license_number, active                                                                                         | Globally unique email; GP is DOCTOR account                                        |
| user_branches             | Composite `(user_id,branch_id)` PK                                                                                                                                                 | Authorized branch membership                                                       |
| sessions                  | token_hash PK, user_id, csrf_token, expires_at                                                                                                                                     | Hashed session lookup; expiry and active user checked                              |
| role_module_permissions   | Composite `(tenant_id,role)` PK, modules JSON, updated_at                                                                                                                          | Non-admin tenant role overrides; server validates module IDs                       |
| patients                  | Numeric id, tenant_id, branch_id, first/last/display name, nationality, national_id, date_of_birth, sex, contact, address, city/state, allergies/conditions JSON, consent, version | Unique `(tenant_id,national_id)`; optimistic updates                               |
| rooms                     | Numeric id, tenant_id, branch_id, name, active                                                                                                                                     | Unique `(branch_id,name)`; archive retains historical references                   |
| appointments              | Numeric id, patient/practitioner/optional room IDs, starts_at, ends_at, reason, status, version                                                                                    | End after start; transactional overlap protection                                  |
| queue_tickets             | Numeric id, scoped patient/room/practitioner IDs, ticket_number, service_date, priority, status, version, call/completion timestamps                                               | Unique branch/date/ticket and generated active-patient/occupied-room constraints   |
| encounters                | Numeric id, patient/practitioner/optional queue IDs, specialty, SOAP text, vitals/prescriptions JSON, procedure_notes, status, version, signed_at                                  | GP workflow; author-owned drafts; signed immutability enforced by service          |
| inventory_items           | Numeric id, scoped SKU, name, ingredient, category, unit, price_cents, reorder_level                                                                                               | Unique branch/SKU; nonnegative prices/thresholds                                   |
| inventory_batches         | Numeric id, item_id, batch_number, expires_on, quantity, received_at                                                                                                               | Unique item/batch; nonnegative quantity                                            |
| inventory_usages          | Numeric id, scoped item/actor IDs, quantity, reason, idempotency_key, created_at                                                                                                   | General supply usage only; unique branch/retry key and transactional allocation    |
| prescription_reservations | Numeric id, scoped encounter/item/batch IDs, quantity, status, consumed_at                                                                                                         | Unique encounter/batch; positive quantity; RESERVED/FULFILLED/RELEASED ledger      |
| dispenses                 | Numeric id, encounter_id, patient_id, actor_id, idempotency_key                                                                                                                    | Unique encounter and branch/retry key                                              |
| stock_movements           | Numeric id, batch_id, optional dispense_id or usage_id, actor_id, signed quantity_delta, reason                                                                                    | Nonzero movement, transactional receipt/dispense/usage ledger                      |
| invoices                  | Numeric id, patient_id, practitioner_id, invoice_number, lines JSON, total_cents, status, idempotency_key, request_hash                                                            | Unique number and branch/retry key; positive total; current checkout creates PAID  |
| payments                  | Numeric id, invoice_id, method, amount_cents, reference                                                                                                                            | Positive integer amount; CASH/CARD/QR/DEPOSIT                                      |
| patient_deposits          | Numeric id, patient_id, signed amount_cents, reference                                                                                                                             | Nonzero ledger amount; spending validated under transaction lock                   |
| clinical_documents        | Numeric id, encounter/patient/practitioner IDs, kind, document_number, payload JSON, dates, redaction, verification_hash, signature_hash, revoke data                              | Unique document/verification keys; MC date consistency; snapshot integrity checked |
| notification_outbox       | Numeric id, patient_id, channel, template, recipient, payload JSON, state, attempts, available_at, errors/provider reference, deduplication_key                                    | Unique dedup key; explicit asynchronous state                                      |
| audit_logs                | Numeric id, tenant/branch/actor IDs, action, entity_type, optional entity_id, request_id, metadata JSON, created_at                                                                | Polymorphic entity reference has no universal entity FK                            |
| resource_locks            | lock_key varchar PK                                                                                                                                                                | Transaction scope serialization for cross-row checks                               |

## Historical tables retained, features retired

These tables remain migrated and readable to authorized database operators. The deployed product rejects their feature endpoints with 410.

| Table               | Structure and retained relationship                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| treatment_packages  | Numeric id; scoped patient, purchased/used sessions, price, expiry, version; optional unique sale_invoice_id and purchase request hashes |
| package_redemptions | Numeric id; package, encounter and practitioner FKs; unique package/encounter pair                                                       |
| commission_ledger   | Numeric id; invoice/practitioner FKs; base/amount cents and rate basis points                                                            |
| commission_policies | branch_id PK with tenant/branch FK; bounded basis-point rates and threshold cents                                                        |
| clinical_photos     | Numeric id; encounter/patient/actor FKs; consent, stage, MIME, encrypted data, nonce and authentication tag                              |

Current GP invoices create no commissions. No active package, payroll or clinical-photo UI is provided.
Historical specialty enum values remain in schema/API contracts; the delivered operational clinical UI is GP.

## Integrity, dates and money

Composite FKs include tenant and branch for branch-bound relationships, preserving scoped references after numeric conversion.
Tenant-wide patient/user FKs do not alone enforce selected branch; application queries perform that check too.
Membership FKs do not alone guarantee tenant membership consistency; administration/authentication validate it.

Generated queue columns equal patient ID for active statuses and room ID for called/in-consultation statuses.
Their unique indexes prevent duplicate active branch visits and simultaneous room occupation.
`CHECK` constraints validate row-local quantities, enum values, dates and amounts.
Overlaps, FEFO, deposit balances and payment sums require locked service transactions; MySQL does not provide row-level security here.

Timestamps use `datetime(3)` and API UTC ISO representation. Civil dates use `date`; clinic service dates follow Asia/Kuala_Lumpur.
MC periods are inclusive. Appointment intervals are half-open, permitting adjacent slots.
Monetary columns store integer cents. Prescription, invoice and document snapshots use JSON.
JSON item references are validated by application code because SQL FKs cannot constrain array-contained identifiers.

## Migration history

| Migration | Purpose                                                                               |
| --------- | ------------------------------------------------------------------------------------- |
| 001       | Initial organization, patient, operational, financial, document and historical tables |
| 002       | Historical authenticated/encrypted photo storage                                      |
| 003       | Operational indexes                                                                   |
| 004       | Historical package-to-invoice sale linkage and retry hashes                           |
| 005       | Historical commission policies                                                        |
| 006       | Names/nationality/address fields, room activation and role module grants              |
| 007       | Patient city; bundled postcode lookup stays application reference data                |
| 008       | Intermediate visible-number columns on tenant/branch/patient records                  |
| 009       | Actual numeric entity PK/FK conversion; supersedes intermediate display columns       |
| 010       | Optional expiry for general supplies; medication expiry remains required              |
| 011       | Audited supply usage with movement links and scoped idempotency                       |
| 012       | Prescription reservations with scoped encounter/item/batch consistency                |

Migration 009 delegates to `src/server/db/numeric-ids.ts`; executing its SQL marker alone does not perform conversion.
It maps IDs and FKs, rewrites typed JSON references and preserves arbitrary vitals/allergy/condition values.
Historical document signatures and FKs are checked before schema mutation. Converted document snapshots are re-signed with the original signing key.
Historical photos require their original encryption key and receive new numeric authenticated context during re-encryption.
Document numbers and verification hashes remain unchanged. Audit metadata preserves legacy entity references; existing sessions/resource locks are cleared.

Stop API and worker before conversion. Keep verified backups and original cryptographic keys, then rehearse restoration.
MySQL DDL commits implicitly. Restore the pre-upgrade backup after interruption; never blindly rerun against partial conversion.
Mapping tables remain after failure for diagnosis.

## Operations and access

Use separate migration and application credentials; restrict routine credentials to required DML.
Encrypted backups, restore access and clinical/financial retention need explicit operator policy.
Audit table presence does not make database administrators unable to tamper with it.

The optional localhost viewer uses a separate SELECT-only account and explicit `DB_VIEWER_DATABASE_URL`/`DB_VIEWER_PASSWORD`.
It binds `127.0.0.1:3002`, uses Basic authentication and permits allowlisted table reads/pagination only.
Never mount it in the production API or expose its credentials. See [database access](DATABASE_ACCESS.md).

Offline postcode data is application JSON, not a mutable database table or live postal verification service.
The upstream MIT license is retained in `src/server/data/postcodes.LICENSE` and third-party notices.
See [operations](OPERATIONS.md), [prerequisites](PREREQUISITES.md) and [testing](TESTING.md) for deployment and verification.

The separate browser demo build does not connect to this schema. Its sample records live in tab-scoped sessionStorage.
Demo resets cannot modify local MySQL data; local/production database backup and retention remain separate operational duties.
Demo business fixtures live only in `DemoClinic`. Normal MySQL bootstrap creates clinic/staff/room setup, without fictional patients or transactions.
`db:seed` is an explicitly guarded development operation, not an automatic bootstrap or demo dependency.

## Stock extensions after numeric migration

Migration 010 makes batch expiry nullable without changing existing dates. Category-aware receiving requires medication expiry; non-medication supplies may omit it.
Migration 011 creates numeric `inventory_usages` and links supply allocations through nullable `stock_movements.usage_id`.
Migration 012 creates numeric `prescription_reservations`, with scoped encounter/item/batch foreign keys and a composite batch/item consistency constraint.
Existing signed encounters and business records are not rewritten or backfilled. New signing creates holds; legacy signed prescriptions allocate free stock when dispensed.
Reservations subtract from eligible availability but not physical batch quantity. Dispensing closes own holds and atomically records physical depletion; shortages roll back both ledger and quantity changes.
