# API and document behavior

## API routes currently implemented

All current API routes execute in the Next.js Node.js runtime and disable response caching. Error response shape is `{ "ok": false, "error": { "code": "...", "message": "..." } }`.

| Method and path | Request | Success | Notes |
| --- | --- | --- | --- |
| `POST /api/auth/login` | JSON `{ "email": string, "password": string }` | `{ "ok": true, "user": StaffSessionUser }` and HttpOnly session cookies | Uses Supabase Auth password grant and requires an active `staff_members` profile. `400` malformed/missing values; `401` invalid credentials; `403` profile unavailable/inactive/invalid; `409` multiple active branch memberships; `503` missing config or upstream failure. |
| `GET /api/auth/session` | Session cookies | `{ "ok": true, "user": StaffSessionUser }` | Validates auth user, resolves active staff membership, may rotate cookies. Invalid/expired sessions are cleared. |
| `POST /api/auth/logout` | Session cookies | `{ "ok": true }` | Tries Supabase revocation, then clears cookies. A `503` indicates local browser session was cleared but upstream revocation was not confirmed. |
| `GET /api/patients` | Session cookies | `{ "ok": true, "patients": Patient[] }` | Reads up to 500 branch-visible patients; no national ID is included. |
| `POST /api/patients` | Session cookies; JSON body | `{ "ok": true, "patient": Patient, "medicalRecordNumber": string }` (`201`) | Receptionist, manager, or nurse only. Requires name, 12-digit Malaysian IC, Malaysian phone, date of birth, and `pdpaConsent: true`; email/blood group are optional. Derives gender from IC parity, encrypts IC with AES-256-GCM, stores keyed HMAC for duplicates. Patient creation and optional queue-ticket creation are separate calls. |
| `GET /api/patients/{id}` | Session cookies | `{ "ok": true, "patient": { "id": string, "nationalId": string or null } }` | Requires `patients.identifiers.read`, decrypts only after branch-scoped read, and appends a privacy audit event before returning NRIC. Fails closed if audit logging is unavailable. |
| `GET /api/queue` | Session cookies | `{ "ok": true, "queue": QueueTicket[] }` | Reads up to 500 visible tickets, priority descending then registration ascending. |
| `POST /api/queue` | Session cookies; JSON `{ "patientId": string }` | `{ "ok": true, "ticket": QueueTicket }` (`201`) | Receptionist, manager, or nurse only. Calls `create_queue_ticket`; creates a `registered` ticket and initial event atomically under the authenticated user's clinic/branch. Requires `queue.manage`. |
| `PATCH /api/queue` | Session cookies; JSON `{ "ticketId": string, "expectedStatus": ClientStatus, "status": ClientStatus, "roomId"?: string, "note"?: string }` | `{ "ok": true, "ticket": QueueTicket }` | Calls `transition_queue_ticket`, which updates ticket and event atomically. Requires `queue.manage`; compares `expectedStatus` to reject stale updates. `409 QUEUE_STALE`; `400 QUEUE_TRANSITION_NOT_ALLOWED`; `403 QUEUE_PERMISSION_DENIED`; `404 QUEUE_TICKET_NOT_FOUND`; `502` database/RPC failure. |
| `GET /api/appointments` | Session cookies; optional query `date`, `practitionerId` | `{ "ok": true, "appointments": Appointment[] }` | Reads branch appointments; ordered by start time. |
| `POST /api/appointments` | Session cookies; JSON `{ patientId, practitionerId, startTime, endTime, appointmentType, notes? }` | `{ "ok": true, "appointment": Appointment }` (`201`) | Checks practitioner schedule conflicts, verifies patient branch tenancy, inserts booking. |
| `PATCH /api/appointments/{id}` | Session cookies; JSON `{ status, cancellationReason? }` | `{ "ok": true, "appointment": Appointment }` | Updates appointment status (`booked`, `confirmed`, `arrived`, `cancelled`, `no_show`, `completed`). |
| `GET /api/encounters` | Session cookies; optional query `patientId`, `practitionerId` | `{ "ok": true, "encounters": Encounter[] }` | Reads SOAP notes and clinical consult encounters. |
| `POST /api/encounters` | Session cookies; JSON `{ patientId, practitionerId, subjective, objective, assessment, plan, diagnoses? }` | `{ "ok": true, "encounter": Encounter }` (`201`) | Creates signed outpatient consultation record with clinic/branch isolation. |
| `GET /api/clinical-documents` | Session cookies | `{ "ok": true, "documents": ClinicDocumentArtifact[] }` | Returns current versions of branch-visible MC/referral/lab documents with status-only verification URLs and print counts. Requires `documents.read`. |
| `POST /api/clinical-documents` | Session cookies; `{ patientId, kind, sourceData }` | `{ "ok": true, "document": ClinicDocumentArtifact }` (`201`) | Issues an MC, referral, or lab requisition through a transaction/RPC; validates source fields and snapshots clinic, patient, and practitioner. Doctor/manager plus `documents.write`. Requires `DOCUMENT_QR_SIGNING_KEY`. |
| `POST /api/clinical-documents/{id}/versions` | Session cookies; optional `{ sourceData }` | `{ "ok": true, "document": ClinicDocumentArtifact }` | Rebuilds from the persisted current source when omitted, creates an immutable version and new verification token digest, and rejects stale or revoked documents. Requires `documents.write`. |
| `POST /api/clinical-documents/{id}/print` | Session cookies; `{ version, purpose? }` | `{ "ok": true, "record": DocumentPrintRecord }` | Appends a print-attempt record before the browser opens Print / Save PDF. Requires `documents.read`. Printing is blocked when persistence fails. |
| `POST /api/clinical-documents/{id}/revoke` | Session cookies; `{ reason }` | `{ "ok": true, "document": { id, status: "revoked" } }` | Revokes through a permission-checked RPC; old version QR tokens then report revoked. Requires `documents.write`. |
| `GET /api/document-verification?token=…` | Opaque QR token | `{ "status": "valid" | "revoked" }` | Public, privacy-minimal response. Unknown, expired, or revoked tokens return `revoked`. No shared rate limiter is configured yet. |

Session user shape returned by server: `id` (`staff_members.id`), `auth_user_id`, `clinic_id`, `branch_id`, `full_name`, `role`, and `license_number`. Auth roles are `doctor`, `receptionist`, `nurse`, `manager`. In local standalone mode without Supabase Auth, built-in staff accounts (`admin`, `doctor`, `marcus`, `reception`, `nurse`) authenticate with local mock tokens. Accounts with multiple active branch memberships receive `409 BRANCH_SELECTION_REQUIRED`.

### Server configuration

Database routes connect via PostgreSQL pool (`SUPABASE_DB_URL`, `DATABASE_URL`, or `POSTGRES_*` variables) or Supabase Auth. Patient registration/identifier retrieval requires independent 32-byte `PATIENT_NRIC_ENCRYPTION_KEY` and `PATIENT_NRIC_HASH_KEY` secrets. NRIC reveal requires `patients.identifiers.read` and logs an audit event. Clinical document issue and verification QR generation require a 32-byte `DOCUMENT_QR_SIGNING_KEY` and canonical `APP_BASE_URL`. `NEXT_PUBLIC_CLINIC_DEMO_MODE=true` enables fully standalone browser demo operation.

### Patient response and input

Directory patient objects contain `id`, `nric` (empty in list response), `name`, `phone`, `email`, `dob`, `age`, `gender`, `bloodGroup`, `allergies`, and `chronicConditions`. Age is calculated at response time. Database `unknown` blood group is shown as blank. Current registration supports 12-digit Malaysian IC only; it does not independently verify identity or support passport/other identity types. The route requires a consent boolean and stores timestamp/version `1`, but the consent wording/version lifecycle, withdrawal handling, and a full privacy workflow are not implemented.

## Queue status contract

The PATCH route accepts these client-facing statuses: `WAITING` maps to `registered`; `CALLED_TO_ROOM` to `called_to_room`; `IN_CONSULTATION` to `in_consultation`; `DISPENSARY` to `dispensary_waiting`; `PAYMENT` to `payment_waiting`; and `COMPLETED` to `completed`. It requires the caller's expected current status. The database function locks the ticket, rejects stale competing changes with `40001`/HTTP 409, validates the transition graph, and writes the queue status plus event atomically. Repeating a request when the ticket is already at the requested destination is idempotent and does not add a second event. The SQL graph also includes `triage_waiting` and `no_show`, but the current HTTP client mapping does not expose those states. `roomId` is optional; room records are not loaded by the app yet.

Queue routes use the active membership's clinic/branch and end-user JWT. RLS requires `queue.read` for reads; both RPCs require `queue.manage`. No permission rows are seeded, so an administrator must provision these keys for a branch/role before API calls can succeed.

Queue event history is stored atomically in `queue_events`, but the current `GET /api/queue` returns current ticket rows only; there is no event-history read route or history view in the client yet.

## Document types and data model

The schema's clinical document types are medical certificate, referral letter, and lab requisition. A stable issued document is represented by `clinical_documents`; revisions by `clinical_document_versions`; verification token digests by `document_verification_tokens`; and print attempts by `document_print_logs`. Invoice/receipt data belongs to the billing model, not `clinical_documents`.

The current reusable artifact model in `components/documents/types.ts` additionally defines receipt and general letter kinds. It snapshots clinic/patient/practitioner presentation data and sections for reproducible rendering. The print component formats timestamps as Malaysia local time, provides browser **Print / Save PDF**, and has a regenerate callback. The app's callback increments a version from current browser demo data.

### Current persistence limits

- MC/referral/lab issue, current document log, immutable revisions, revocation, verification-token digests, and print attempts use PostgreSQL RPCs and authenticated routes. Historical versions remain in the database; the reception log shows the current version.
- Printing uses the browser print dialog after a durable print-attempt write; no PDF file storage or server-side PDF generation is configured.
- Receipt creation is not operational. It requires a persisted invoice and confirmed payment; demo payment screens do not create a real receipt.

## QR codes and verification

Live clinical documents use a version-scoped HMAC token in a QR URL. Only its SHA-256 digest is stored. `/api/document-verification` returns `valid` or `revoked` only and does not reveal patient, diagnosis, dates, or document content. Revoking a document invalidates its tokens. Demo-mode documents use visibly labeled demo references instead. There is no shared rate limiter or verification abuse monitoring yet; do not use the endpoint as the sole legal or clinical authenticity control until the clinic has approved signing, templates, and operational controls.
