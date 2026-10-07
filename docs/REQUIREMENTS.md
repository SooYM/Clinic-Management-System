# V2 requirement traceability

This matrix documents active delivered behavior and explicit gaps. It supersedes specialty, PostgreSQL and UUID proposals from the earlier specification.
The [system specification](../CLINIC_MANAGEMENT_SYSTEM_SPECIFICATION.md) defines scope; source paths provide executable evidence.

| Requirement                              | Delivery and evidence                                                                     | Boundary                                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| MySQL 8.4 persistence                    | `db/migrations/001_initial.sql` through `009_numeric_identifiers.sql`; `src/server/db.ts` | Apply every migration; initial SQL alone is not the final schema                          |
| Incremental IDs for all entities         | `src/server/db/numeric-ids.ts`, `src/shared/identifiers.ts`                               | 22 numeric entity PKs, matching FKs; secret tokens and composite keys are separate        |
| Branch isolation                         | `src/server/security.ts`, scoped service queries and composite FKs                        | Numeric IDs do not authorize access                                                       |
| Staff and automatic GP selection         | `src/server/administration.ts`, service bootstrap                                         | DOCTOR requires registration number; only active branch-assigned accounts appear          |
| Editable role module access              | `src/shared/module-permissions.ts`, `src/server/module-access.ts`                         | Clinical writes retain DOCTOR restriction; administration retains ADMIN restriction       |
| Room management                          | Administration router; `006_patient_rooms_access.sql`                                     | Rename/archive/restore; occupied or future-booked rooms reject changes                    |
| Patient names, IC/passport and addresses | Shared patient identity helper; patient validation/service/form                           | Last name optional; IC structural checks are not registry verification                    |
| Postcode city/state                      | `007_patient_city.sql`, reference router and bundled postcode data                        | Ambiguous/unknown codes need manual review; preserve overrides                            |
| Patient search and history               | Reference router; `record-router.ts`                                                      | Minimal references support independent modules; clinical history uses 50-row cursor pages |
| Scheduling                               | Appointment service and domain overlap locks                                              | API cancellation exists; current booking UI lacks cancellation control                    |
| Queue operations                         | Queue domain/service, SSE and dashboard                                                   | Versions, room occupancy, skip/restore; fanout is process local                           |
| Private waiting-room display             | `/queue/display`, client display screen                                                   | Authenticated screen; ticket/room only                                                    |
| Queue estimate                           | Administration router estimate query                                                      | Approximate clearance; insufficient history returns unknown                               |
| GP SOAP and prescriptions                | Encounter service, validation, clinical page                                              | Immutable signed notes; quantity, dosage, frequency, meal timing and supply days          |
| FEFO dispensing                          | `FefoAllocator`, service transactions, `/dispensary/encounters`                           | Signed undispensed medication work only; insufficient stock rolls back                    |
| Split checkout and deposits              | Invoice/payment/deposit tables and transaction services                                   | Integer cents, exact tender total, locks and idempotency; gateway integration excluded    |
| Receipts                                 | Authenticated invoice PDF route                                                           | Persisted ledger rendering                                                                |
| MC/referral/lab documents                | Document service and PDF/verification routes                                              | Attending GP; signed snapshot integrity; public metadata is minimal                       |
| Revocation                               | Deployed DOCTOR-only route and issuer check                                               | Reason required; replacement is separate issuance                                         |
| Notifications                            | Outbox and worker, provider adapters, reports UI                                          | Consent/configuration required; provider acceptance does not prove delivery               |
| Account security                         | Security/administration, shared password policy                                           | 14–128 characters; current password required; sessions invalidated                        |
| Audit                                    | `audit_logs`, administration audit read                                                   | Not a database-level tamper-proof archive                                                 |
| Reusable modular/OOP design              | Domain objects, shared contracts, services, client forms                                  | Modular monolith; not a claim that every SOLID pattern or repository interface exists     |
| In-app guide                             | `src/client/pages/Guide.tsx`, staff guide                                                 | Current workflows and access troubleshooting                                              |
| Packages/commissions/photos              | Module retirement guard                                                                   | Removed from active application; historical tables retained                               |
| Free-hosted browser demo                 | Demo-only browser transport and tab-scoped sessionStorage                                 | Sample data only; no MySQL, real authentication, provider delivery or signed PDFs         |

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
