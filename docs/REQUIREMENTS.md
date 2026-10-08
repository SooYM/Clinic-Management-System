# V2 requirement traceability

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
| Split checkout and deposits              | Invoice/payment/deposit tables and transaction services                               | Integer cents, exact tender total, locks and idempotency; gateway integration excluded                                   |
| Receipts                                 | Authenticated invoice PDF route                                                       | Persisted ledger rendering                                                                                               |
| MC/referral/lab documents                | Document service and PDF/verification routes                                          | Attending GP; signed snapshot integrity; public metadata is minimal                                                      |
| Letter preview and explicit PDF download | Shared document view, client preview and server letter renderer                       | Redaction/status retained; inline PDF default; explicit attachment download; demo unsigned                               |
| Prescription frequency and activity log  | Clinical controls and scoped encounter/reservation/movement projections               | Prescribed directions, quantities, batches, actors and times; does not establish patient dose-taking                     |
| Revocation                               | Deployed DOCTOR-only route and issuer check                                           | Reason required; replacement is separate issuance                                                                        |
| Notifications                            | Outbox and worker, provider adapters, reports UI                                      | Consent/configuration required; provider acceptance does not prove delivery                                              |
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
