# System design

## Purpose and scope

The product brief describes a multi-branch outpatient clinic system for Malaysian clinics, including patient intake, appointments, queue/room dispatch, outpatient encounters, clinical documents, packages, stock, POS billing, notification delivery, and practitioner commission reporting. The target includes GP, dental, and aesthetic clinic variants and excludes diagnostic scanner/OCR integration.

The current repository is an early web application plus a PostgreSQL foundation. It does not yet satisfy the complete operational scope. See [current architecture and implementation state](architecture.md#current-implementation-status) and [roadmap](operations-security.md#known-gaps-and-roadmap).

## Malaysian context

- Clinic and branch records default to country `MY`, currency `MYR`, and time zone `Asia/Kuala_Lumpur`; clinic rows constrain country and currency to these values in the initial migration.
- UI demo amounts use RM and dates are rendered in Malaysia time.
- New-patient UI derives gender from a normalized 12-digit MyKad number: an even final digit means female and odd means male. Non-MyKad identity handling and exceptions require clinic policy; this UI rule is not a substitute for identity verification.
- Blood group is optional in patient registration and nullable in the database.
- Patient creation validates Malaysian IC, phone, date of birth, email, and consent in the current server route. This does not independently verify identity; other workflows still need server-side validation.
- Malaysian legal, tax, medical-record retention, consent, and professional-practice requirements must be confirmed by the clinic's qualified advisers. This repository is not a compliance certification.

## Personas and target workflows

| Persona | Intended responsibilities | Current state |
| --- | --- | --- |
| Receptionist | Patient registration, booking, check-in, queue, invoice and receipt | Patient list/create and queue list/create/transitions are API-backed; booking, rooms, invoices and receipts remain demo/local |
| Doctor/practitioner | Consult, SOAP notes, prescriptions, MC/referral/lab forms | UI demo; no encounter/document write API |
| Nurse/dispensary | Queue triage, package session, stock dispense | UI demo; no inventory/dispense API |
| Manager | Branch setup, staff, permissions, operations reports | Basic role-aware UI and schema manager policies; provisioning/data integration incomplete |
| Patient/employer/lab recipient | Receive clinic documents and check authenticity | Browser print preview; live clinical-document QR returns status only, while demo QR is explicitly non-verifying |

Target flow: register/book → arrive/check-in → queue → triage/consultation → prescribe/issue documents → dispense/package redemption → invoice and record payment → optional notifications → append audit/history. Each state transition must eventually be a server-side transaction with tenant/branch authorization and audit evidence. The current UI only simulates parts of this flow.

## Design principles and key decisions

1. **PostgreSQL as system of record.** Relational constraints, transactions, indexes, and row-level security are the integrity and isolation layer for patient/queue API operations and the intended basis for all workflows. Clinical, financial, inventory, package and document page state is not yet persisted.
2. **Clinic and branch isolation.** Operational rows carry `clinic_id` and `branch_id`. Composite foreign keys prevent a record from linking to a patient, practitioner, room, or invoice in a different branch/clinic.
3. **Append-only evidence.** Queue events, document revisions, print logs, inventory movements, package redemptions, delivery logs, and audit events reject UPDATE/DELETE in the foundation migration. Corrections should be represented as a new event/version or an explicit revocation where supported.
4. **Private document verification.** Verification tokens are stored as SHA-256 digests; the public database function returns only `valid` or `revoked`. Token creation/delivery and a public web verification endpoint are not implemented in the app.
5. **Sensitive identity handling.** The patient create route encrypts the normalized national ID with AES-256-GCM and stores a keyed HMAC for duplicate matching. Two 32-byte keys are required. Operational key management and rotation still need to be established.
6. **No invented statutory calculations.** The schema provides tax amount/rate fields but does not encode Malaysian tax law. Tax and statutory settings require clinic/accounting configuration.

## Requirement-to-implementation map

| Requirement | Database foundation | Application status |
| --- | --- | --- |
| Patient demographics and allergies | `patients` | Patient list/create API writes PostgreSQL; non-demo load errors clear the list and show an error; opt-in demo mode seeds sample data |
| Scheduling and room allocation | `appointments`, `consultation_rooms` | Not persistent; UI coverage incomplete |
| Queue and history | `queue_tickets`, `queue_events` | In live mode list/create and supported transitions persist; PostgreSQL functions atomically write history. Client demo mode keeps patient/check-in/queue operations local. No realtime service |
| SOAP encounter and prescriptions | `encounters`, `medication_orders` | Browser demo; no saved clinical record |
| MC/referral/lab records, versioning, print history | `clinical_documents`, versions, verification tokens, print logs | Live mode issues versioned records to PostgreSQL, allows reception to regenerate from the log, records print attempts before browser print, and displays a status-only verification QR |
| Inventory and FEFO | items, batches, movements | No database-backed stock operations or atomic FEFO depletion |
| Packages | packages and redemptions | Browser demo; no persisted session ledger |
| POS/payments/receipts | invoices, invoice items, payments | Billing is demo/local; non-demo receipts are intentionally unavailable until invoices and confirmed payments are persisted |
| WhatsApp/email | encrypted outbox and delivery log | Preview only; no provider integration |
| Commission ledger | Not present in migration | UI estimate only; ledger rules not implemented |

## Non-functional requirements for production completion

- Enforce tenant and branch authorization in server-side data access and PostgreSQL RLS; never trust client-supplied clinic/branch IDs or role claims.
- Make clinical and financial writes transactional and idempotent where retries are possible.
- Preserve versioned clinical documents and tamper-evident operational audit history; define retention/archiving and lawful correction workflows.
- Use a tested backup and restore plan with documented recovery objectives, access controls, and periodic restore drills.
- Keep service credentials, encryption keys, and provider secrets on trusted server/worker runtimes only.
- Provide accessibility, localization, and clinical workflow validation with clinic users before go-live.
