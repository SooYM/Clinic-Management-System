# V2 requirement traceability

Patient country of nationality is stored separately as nullable ISO `countryCode` or OTHER with custom `countryName` (migration 016). Malaysian records derive MY; non-Malaysian forms require a country selection. API compatibility preserves omitted historical foreign countries as unknown. Shared list controls provide view search, relevant filters and ascending/descending sorting across operational record lists, with loaded-record counts and original-order defaults.

This matrix documents active delivered behavior and explicit gaps. It supersedes specialty, PostgreSQL and UUID proposals from the earlier specification.
The [system specification](../CLINIC_MANAGEMENT_SYSTEM_SPECIFICATION.md) defines scope; source paths provide executable evidence.
Patient medication-taking extends clinic stock history with a separate clinical-only report ledger; prescription-frequency controls retain their existing numeric behavior.

| Requirement                              | Delivery and evidence                                                                 | Boundary                                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| MySQL 8.4 persistence                    | `db/migrations/001_initial.sql` through `015_branch_settings.sql`; `src/server/db.ts` | Apply every migration; initial SQL alone is not the final schema                                                         |
| Incremental IDs for all entities         | `src/server/db/numeric-ids.ts`, `src/shared/identifiers.ts`, migrations 009, 011–014  | 26 numeric entity PKs, matching FKs; secret tokens and composite keys are separate                                       |
| Branch isolation                         | `src/server/security.ts`, scoped service queries and composite FKs                    | Numeric IDs do not authorize access                                                                                      |
| Staff and automatic GP selection         | `src/server/administration.ts`, service bootstrap                                     | DOCTOR requires registration number; only active branch-assigned accounts appear                                         |
| Editable role module access              | `src/shared/module-permissions.ts`, `src/server/module-access.ts`                     | Clinical writes retain DOCTOR restriction; administration retains ADMIN restriction                                      |
| Room management                          | Administration router; `006_patient_rooms_access.sql`                                 | Rename/archive/restore; occupied or future-booked rooms reject changes                                                   |
| Patient names, IC/passport and addresses | Shared patient identity helper; patient validation/service/form                       | Last name optional; IC structural checks are not registry verification                                                   |
| Postcode city/state                      | `007_patient_city.sql`, reference router and bundled postcode data                    | Ambiguous/unknown codes need manual review; preserve overrides                                                           |
| Patient search and history               | Reference router; `record-router.ts`                                                  | Minimal references support independent modules; clinical history uses 50-row cursor pages                                |
| Scheduling                               | Appointment service and domain overlap locks                                          | API cancellation exists; current booking UI lacks cancellation control                                                   |
| Queue operations                         | Queue domain/service, SSE and dashboard                                               | Versions, room occupancy, skip/restore; fanout is process local                                                          |
| Private waiting-room display             | `/queue/display`, client display screen                                               | Authenticated screen; ticket/room only                                                                                   |
| Queue estimate                           | Administration router estimate query                                                  | Approximate clearance; insufficient history returns unknown                                                              |
| GP SOAP and prescriptions                | Encounter service, validation, clinical page                                          | Immutable signed notes; quantity, dosage, frequency, meal timing and supply days                                         |
| Search and readable charting             | Patient, clinical and dispensary list controls and scoped queries                     | Search applies before server limits; SOAP fields use separate full-width rows                                            |
| Blood-pressure input checks              | `src/shared/blood-pressure.ts`, encounter validation and clinical form                | Positive integer SYS/DIA, SYS>DIA; monitor-range warning permits unusual readings                                        |
| MC default date and eligibility          | Clinical form and `src/shared/clinic-dates.ts`, document service                      | Malaysia 17:00 cutoff; manual override; signed attending-GP encounter required                                           |
| FEFO dispensing                          | `FefoAllocator`, service transactions, `/dispensary/encounters`                       | Signed undispensed medication work only; insufficient stock rolls back                                                   |
| Automatic prescription stock hold        | Encounter signing, `prescription_reservations`, shared FEFO allocator                 | Signed prescriptions reduce available stock; physical stock deducts once at dispensing                                   |
| General inventory and supply usage       | Item categories, migrations 010–011, `/inventory/usage`                               | Non-medication expiry optional; usage audited/idempotent; no medication bypass                                           |
| Split checkout              | Invoice/payment tables and transaction services                               | Integer cents, exact tender total, locks and idempotency; gateway integration excluded                                   |
| Receipts                                 | Authenticated invoice PDF route                                                       | Persisted ledger rendering                                                                                               |
| MC/referral/lab documents                | Document service and PDF/verification routes                                          | Attending GP; signed snapshot integrity; public metadata is minimal                                                      |
| Letter preview and explicit PDF download | Shared document view, client preview and server letter renderer                       | Redaction/status retained; inline PDF default; explicit attachment download; demo unsigned                               |
| Prescription frequency and activity log  | Clinical controls and scoped encounter/reservation/movement projections               | Prescribed directions, quantities, batches, actors and times; does not establish patient dose-taking                     |
| Revocation                               | Deployed DOCTOR-only route and issuer check                                           | Reason required; replacement is separate issuance                                                                        |
| Notifications                            | Outbox and worker, provider adapters; Reports UI retired                                      | Consent/configuration required; provider acceptance does not prove delivery                                              |
| Account security                         | Security/administration, shared password policy                                       | 14–128 characters; current password required; sessions invalidated                                                       |
| Audit                                    | `audit_logs`, administration audit read                                               | Not a database-level tamper-proof archive                                                                                |
| Reusable modular/OOP design              | Domain objects, shared contracts, services, client forms                              | Modular monolith; not a claim that every SOLID pattern or repository interface exists                                    |
| In-app guide and phone access            | `src/client/pages/Guide.tsx`, staff guide, responsive workspace                       | Interactive control highlights, permission-aware tours and current workflow instructions; no automatic record submission |
| Packages/commissions/photos              | Module retirement guard                                                               | Removed from active application; historical tables retained                                                              |
| Free-hosted browser demo                 | Demo-only browser transport and tab-scoped sessionStorage                             | Sample data only; no MySQL, real authentication, provider delivery or signed PDFs                                        |

## Acceptance evidence

Fictional business fixtures exist only in `DemoClinic`; Reset demo restores them. Normal MySQL bootstrap never preloads patient/business records.
The guarded development seed command is separate and is not invoked by normal bootstrap or demo startup.

Tests must demonstrate real MySQL transactions, authorization and failure handling, rather than only mocked UI behavior.
The [testing document](TESTING.md) owns commands, test cases and actual execution evidence.
[System flow](SYSTEM_FLOW.md) captures happy paths and failure branches; [ERD](ERD.md) captures relationships.

## Remaining operator or integration decisions

Deployment host, HTTPS domain, backup schedule, retention policy, provider credentials and approved message templates require operator configuration.
Payment gateway authorization, e-invoicing, refund workflows, external EMR exchange and historical V1 import are not implemented integrations.
Availability targets, disaster-recovery objectives and external compliance assessments require deployment-specific acceptance criteria.
The application must not be presented as certified or load-benchmarked solely because these documents exist.

Administrator-managed choices cover drugs, supplies, rooms, lab panels, specimens, inventory units and referral destinations. Role codes and workflow statuses remain fixed. Archival preserves signed records; new selections use active branch choices. Patient registration and editing include a phone country-code dropdown, defaulting to Malaysia; unlisted countries support full international entry. Foreign phone numbers retain country codes and formatting, with a 50-character limit. Existing unedited phone values remain unchanged; no schema or API payload change is needed.

Administrator name/removal controls cover staff, branches, rooms and managed catalog/inventory choices. Removed settings stay restorable when history requires retention. Receipt layout follows the supplied clinic reference using actual data, explicit preview/download and future immutable identity/cashier snapshots.

Billing category choices must be administrator-editable, ordered and branch-scoped. Rename/archive/restore requires confirmation and preserves historical invoices. Defaults remain tied to automatic consultation/medicine charges after renaming. Billing-only roles can read choices; unauthorized roles cannot manage them. Stale checkout labels require explicit reselection while retaining other draft fields.


## Interaction acceptance

Tasks use one section-tab entry point: Clinic overview → Check in patient; Patients → Patient registration; Billing → Patient checkout. Header duplicates are removed; submit buttons still commit the entered form. Clinical workspace starts at Choose patient: search/select → Patient history → Open consultation, or New consultation for the selected patient. Changing patient clears previous record tools. Catalogue rows show concise stock summaries; View details expands metadata, batches and administrator actions. Filter and sort loaded stock reveals advanced controls; Default: Item ID supports both directions. Practitioner registration number is shown and required only for GP/DOCTOR creation; other roles submit null. User guide remains in the header and is removed from the sidebar. Popup consent is required before persistent form saves and direct workflow mutations. Cancellation sends no mutation; native validation and server domain checks remain in effect.


## Queue lifetime and handoff acceptance

Operational check-ins last at most 12 hours from created_at or until Malaysia midnight, whichever comes first. The live queue shows only today's service-date records, including completed, skipped and expired visits; it starts fresh at midnight without deleting history. Before queue reads, check-in, room transitions and GP suggestions, scoped lifecycle cleanup marks old unfinished tickets expired_at, increments version and audits QUEUE_EXPIRED. Original status and chart references remain preserved. Active patient and occupied-room uniqueness excludes expired tickets. A fresh duplicate check-in returns a specific existing-ticket 409; an expired patient can check in again. Completed/skipped visits retain their existing terminal behavior. Estimates, room occupancy and queue-near notifications exclude expired visits. Clinical workspace offers Assigned patients to GPs for unexpired CALLED_TO_ROOM or IN_CONSULTATION visits assigned to that GP in the selected branch. Suggestions refresh every 15 seconds while visible and on focus. Start consultation prefills patient and queue reference without writing; Open consultation resumes an associated encounter. Saving a new queue-linked note validates patient, GP, branch and expiry, prevents duplicate encounters, and atomically starts a called visit. Failed saves roll back the start. Existing linked drafts remain editable after queue expiry under ordinary author/version rules. Clinical-only GP grants suffice; queue module access is not required. Manual patient choice remains available. Edited drafts require consent before switching contexts.


## Multiple-medicine prescribing acceptance

A consultation form supports multiple independent medicine rows. Add prescription adds another row; removing a selected unsaved medicine requires consent and preserves neighboring rows. Each row has medicine search/selection, quantity, duration, frequency, meal timing and dosage instructions. Blank rows are ignored and cannot block medicine-free notes. New rows append to recorded prescriptions; successful draft saves reset additions so subsequent saves do not duplicate them. Signed records remain immutable and the existing 50-medicine limit applies. Creating a SIGNED consultation or signing a saved draft reserves every medicine and moves its linked, assigned, unexpired IN_CONSULTATION queue visit to DISPENSARY_WAITING in the same transaction. Creation from CALLED_TO_ROOM starts consultation first. The transition increments version, records its audit and releases room occupancy. Insufficient stock in any medicine rolls back note, holds and queue changes together. Visits without medicines move directly to PAYMENT_WAITING and billing suggestions; they have no medicine dispense entry. Expired or already-advanced visits are not revived or regressed. Manual consultations without a linked ticket retain ordinary signed-prescription eligibility without changing an unrelated queue visit.


## Draft removal and Super Admin reset acceptance

Clinical patient history uses collapsed search/filter/sort controls, concise assessment previews and a bounded list; Open consultation still loads the complete unchanged note. Attending GPs can Delete draft from history or the selected note after popup consent. Removal checks tenant/branch, author, DRAFT status and optimistic version under a row lock, records REMOVE, and sets encounters.deleted_at rather than deleting clinical references. Signed notes and drafts with protected historical dependencies cannot be individually removed. Deleted drafts are excluded from active history/details/suggestions and cannot be modified; deleting a linked draft does not change stock or queue state and permits a replacement encounter for that active visit. Super Admin is an explicit is_super_admin capability on ADMIN accounts. Ordinary admins cannot grant it through web account creation or edit and cannot access database reset. Administration → Danger zone previews every business table across the ENTIRE DATABASE. Reset requires exact RESET ALL CLINIC DATA, current-password verification, explicit acknowledgment and the final erase action. Cancel/Escape clears consent without posting; Enter in input fields cannot submit erasure. Wrong reauthentication passwords return 403 so valid sessions remain open. This reset explicitly erases signed records as well as every tenant/branch/staff/stock/payment/clinical/audit row, then creates one configured default Super Admin, main branch, three consultation rooms and one DATABASE_RESET audit. Catalogs start empty as in fresh bootstrap. All sessions end. Schema migrations and monotonically increasing auto-increment sequences remain; IDs are never reused. This is the explicit global-reset exception to individual signed-record protection.

## Visit handoff acceptance
- Called-room patients are suggested only to their assigned GP, within the authorized branch.
- Signing reserves medicines and hands off to dispensary; no-medicine visits hand off to billing.
- Dispensing hands off to billing once. Billing suggests patient/GP/medicine lines and requires explicit checkout consent.
- One linked paid invoice per consultation; retries with the same idempotency key reuse the result.
- Prescription history stays compact on phones. Dispense medicines and Patient checkout open first by default.
- Live counts exclude expired/ineligible batches and reserved units; periodic refresh preserves unsaved clinical and payment inputs.

Active deposit UI/APIs/tender removed without erasing historical money records. Appointments book without rooms; due current-Malaysia-day suggestions support confirmed queue-only check-in, one appointment-linked ticket, booked GP preselection, active-patient exclusion and optimistic/concurrent guards. Country of nationality is a visible disabled Malaysia box in Malaysian registration/editing, and becomes selectable for NON_MALAYSIAN. Profiles show country only for NON_MALAYSIAN; MY remains stored internally.

Registration has prominent primary and check-in entry points; patient-module permissions still control new registration. Every search box displays matching suggestions or explicit loading/error/empty feedback, supports keyboard selection and Escape, and prevents accidental form submission. Selected references retain numeric IDs; stale server matches are suppressed.

Daily live queue shows all current Malaysia-day visits and an uncapped total; it starts fresh at midnight while retaining history. Operational ticket lifetime is min12h/day-end. Consultation temperatures are optional but, when entered, constrained to28°C–40°C inclusively in client and API/demo validation.

## Public waiting-room requirement

The waiting-room display opens at `/display` without authentication and offers an active branch selector. Show anonymous ticket numbers, stages and room names only. Refresh every 15 seconds. Scope each branch to its own tenant; exclude expired/prior-day/completed/skipped tickets and private data. Staff queue APIs and events retain existing access checks.

Non-Malaysian nationality selection includes Others plus required free-text countryName (trimmed1–100 characters). Store it with countryCode=OTHER, show it on profiles, retain it during edits, and clear it when selecting ISO/Malaysian nationality. Existing missing-country compatibility and phone/address separation remain unchanged.
