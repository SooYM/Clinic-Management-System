# MySQL database schema and evolution

## Final schema

MySQL 8.4 with InnoDB is the supported database. Run every numbered migration from `001_initial.sql` through `025_public_registration.sql`.
The final schema is their combined result, including the numeric conversion helper; the initial migration alone is historical schema.
Do not edit applied migrations. The runner checks migration content and the numeric helper checksum.

Migration 017 adds nullable `appointments.deleted_at` for audited removal without deleting booking/notification history. Active lists and conflict checks exclude removed appointments. Existing entity IDs and rows remain unchanged. Clinic name customization updates the existing `tenants.name`; receipt snapshots preserve previously recorded names.

Migration 016 adds nullable `patients.country_code` for ISO country of nationality. Only explicitly Malaysian historical records receive MY. Unknown foreign countries remain NULL; recognized-country validation is centralized in the application. No extra entity or ID is introduced.

There are 27 entity tables with `BIGINT UNSIGNED AUTO_INCREMENT` primary keys.
Entity foreign keys are matching unsigned BIGINT values, including audit actor/entity references and generated queue references.
API IDs are positive JavaScript-safe integers. Sequences are independent per table and may contain gaps.
`tenantNumber`, `branchNumber` and `patientNumber` are response aliases for actual IDs, not extra stored counters.

Membership, policy and role-grant tables use existing relationship/composite keys. Sessions use hashed secret keys; resource locks use named keys.
Migration bookkeeping is infrastructure, not a clinical entity. See the [ERD](ERD.md) for relationships and composite constraints.

## Data dictionary

The [complete column dictionary](DATA_DICTIONARY.md) lists every column in all 33 tables. A [schema-only SQL snapshot](schema.mysql.sql) records final types, indexes and constraints without data or allocated sequence values. These are references; install through migrations, not the snapshot.

Migration025 adds branch registration availability/version and `pending_registrations`: numeric ID, tenant/branch foreign keys, unique reference, branch/submission idempotency key, request hash, hashed receipt capability, reserved ticket/service date, nullable demographic JSON, status, expiry, patient/queue/reviewer links and optimistic version. Unique branch/date/ticket reservations share application allocation locks with normal arrivals. CHECKs require pending payloads and clear them for every terminal status; accepted rows require patient, queue and reviewer links. Rejection/expiry clears personal data while preserving number history. Reset removes reservations before queue/patient/staff dependencies.

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
| patient_deposits          | Numeric id, patient_id, signed amount_cents, reference                                                                                                                             | Historical ledger retained; deposit creation/spending retired                   |
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
Overlaps, FEFO and payment sums require locked service transactions; MySQL does not provide row-level security here.

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
| 013       | Patient medication-taking reports with numeric IDs, scoped references and retry keys  |
| 014       | Branch reference catalogs and versioned active inventory metadata                     |
| 015       | Versioned active branches and immutable new receipt metadata                          |

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
It binds `127.0.0.1:3102`, uses Basic authentication and permits allowlisted table reads/pagination only.
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

Prescription activity history projects these reservation rows together with encounter prescriptions, dispenses and stock movements.
Document previews project immutable clinical-document snapshots; these read projections add no tables.
Migration 013 adds `prescription_dose_logs`, a separate append-only clinical ledger for taken or missed patient doses.
It snapshots medicine name/unit and records source, occurrence time, amount, notes, actor and entry time, with a scoped unique retry key and request hash.
Scoped encounter/item/user foreign keys and outcome/amount checks constrain persisted reports. Reading returns the newest 500 entries for an encounter.
Patient-taking records do not mutate inventory batches, holds or stock movements.
Existing signed encounters and business records are not rewritten or backfilled. New signing creates holds; legacy signed prescriptions allocate free stock when dispensed.
Reservations subtract from eligible availability but not physical batch quantity. Dispensing closes own holds and atomically records physical depletion; shortages roll back both ledger and quantity changes.

## Managed branch catalogs

Migration 024 extends `reference_catalogs.kind` with BILLING_CATEGORY and adds nullable `billing_default`. Existing branches receive editable SERVICE/PRODUCT master choices; new branches and administrator bootstrap/reset create the same defaults. This initializes configuration only, without clinical fixtures. A CHECK restricts the immutable default marker to SERVICE/PRODUCT on billing entries; a unique branch/kind/marker key prevents duplicate defaults. Renaming labels preserves automatic charge classification. Invoice JSON and receipt snapshots retain historical labels. Configured lists with every entry archived reject new invoice categories; only unconfigured legacy branches retain the SERVICE/PRODUCT API fallback.

Migration 014 adds numeric-ID reference_catalogs with tenant/branch scope, kind, label, active status, ordering and optimistic version. Scoped kind/label uniqueness prevents duplicate choices. Inventory items gain active status, version and update time. Existing items remain active; no local choices or business fixtures are inserted.

Administrator edits are audited. Archival preserves history. New prescription writes capture database-authoritative item names, ingredients and units; signed clinical JSON remains immutable. Category/unit/ingredient changes are rejected after item history. Legacy prescriptions without metadata use catalog fallback.

Migration 015 adds branch active/version/update time and nullable invoices.receipt_snapshot. Existing branches stay active and existing invoice snapshots remain null; no user rows or samples are rewritten. New checkout snapshots capture clinic/branch/address, patient name/identity and receiving cashier atomically. Financial lines and payment ledgers remain unchanged.


## Migration 018 queue lifetime

Operational check-ins last at most 12 hours from created_at or until Malaysia midnight, whichever comes first. The live queue shows only today's service-date records, including completed, skipped and expired visits; it starts fresh at midnight without deleting history. Before queue reads, check-in, room transitions and GP suggestions, scoped lifecycle cleanup marks old unfinished tickets expired_at, increments version and audits QUEUE_EXPIRED. Original status and chart references remain preserved. Active patient and occupied-room uniqueness excludes expired tickets. A fresh duplicate check-in returns a specific existing-ticket 409; an expired patient can check in again. Completed/skipped visits retain their existing terminal behavior. Estimates, room occupancy and queue-near notifications exclude expired visits. The expiry column is nullable to retain original data; generated active_patient_id and occupied_room_id include expired_at IS NULL. No patient, encounter or payment row is deleted. Existing applied migrations remain immutable.


## Migrations 019 and 020

019 adds nullable encounters.deleted_at and an active-history index; original rows and dependencies remain. 020 adds users.is_super_admin default FALSE with a constraint requiring ADMIN for elevated capability. Existing admins are not automatically elevated. Initial bootstrap/reset creates an explicit privileged default administrator; operator CLI can grant the configured existing bootstrap owner. No extra entity ID table is added. DatabaseResetService validates live capability/password and bootstrap configuration, verifies the reviewed schema and InnoDB storage, takes SERIALIZABLE tenant/user range locks, then executes child-first DELETE and reusable bootstrap creation in one transaction. Foreign-key checks remain enabled; no TRUNCATE, schema drop or sequence reset occurs. Failed recreation rolls back all data changes. Ordinary service transactions retain their prior isolation. Newly allocated IDs ensure requests holding old actor/tenant IDs cannot act as recreated accounts. Extra/unknown tables block reset until the reviewed table list is updated. Existing encrypted files/backups outside the database are outside this database-only operation.

## Migration 021: consultation-linked checkout
`invoices.encounter_id` is nullable unsigned BIGINT, uniquely indexed, with scoped `(tenant_id,branch_id,encounter_id)` foreign key to encounters. Existing invoices remain unchanged with NULL linkage. No new table or entity ID is introduced. One consultation may have at most one linked invoice. Deployment must run migration 021 before serving this version.

## Migration 022: appointment-linked arrival

queue_tickets.appointment_id is nullable unsigned BIGINT with a tenant/branch-scoped foreign key to appointments and a unique index. One scheduled appointment can create at most one linked ticket. Existing tickets retain NULL linkage; existing appointment room_id values remain historical, and new bookings use NULL. Reset deletion order removes queue_tickets before appointments after dependent encounters. The 32-table/26-numeric-entity layout remains. patient_deposits and DEPOSIT payment enum values remain historical storage only.

Daily queue reset uses existing service_date/expired_at fields and lifecycle auditing; no migration, deletion or sequence reset is required. Vitals temperature validation changes application rules only; existing JSON histories remain stored unchanged.

## Migration 023: custom nationality country

023_patient_custom_country.sql widens patients.country_code from CHAR(2) to VARCHAR(5) and adds nullable country_name VARCHAR(100). The format check accepts uppercase ISO-shaped codes or OTHER. A second check requires a nonblank custom name for OTHER and NULL name for every other/unknown code, with explicit NULL handling. Existing ISO/null values are retained, existing names start NULL, and entity IDs/relationships remain unchanged. Application validation recognizes actual ISO codes and bounds trimmed names. Apply the new migration after backup; applied migrations remain immutable.
