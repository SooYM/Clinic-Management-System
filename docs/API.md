# HTTP API contract

## Printed clinic branding

`GET /api/encounters/:id/medicine-labels` additionally returns flat `clinicName`, `branchName`, `clinicAddress`, `logoDataUrl`, `header`, `address` and `footer` fields. A successful new dispense captures these fields in `dispenses.label_snapshot` within its transaction. Reads preserve that snapshot; legacy null snapshots use current tenant/branch branding without writing a backfill. `clinicAddress` uses the configured letterhead address, falling back to the selected branch address. Existing inventory permission and tenant/branch checks apply.

Receipt views and PDFs preserve issued receipt snapshots. Legacy snapshots receive current scoped defaults only beneath existing fields; explicit empty branding values stay empty. Receipts without a snapshot use current scoped branding and the configured letterhead address or branch fallback. These read fallbacks never update stored receipts. Newly issued clinical document payloads include the tenant's `clinicName`; old signed payloads retain their existing branch-name fallback without being rewritten. Receipt/document previews and PDFs and every medicine sticker render their available saved logo, header, address and footer.

## Administrative reporting and paid expenses

All routes below require an authenticated ADMIN and the current authorized tenant/branch. Mutations also require CSRF protection. `GET /api/admin/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD` returns `{from,to,collectedCents,stockPurchaseCents,operatingExpenseCents,totalExpenseCents,netCashIncomeCents,paidInvoiceCount,patientGroups,topUsage}`. Dates default to the current Malaysia month through today; ranges must be valid, ordered and at most 366 days. Revenue is CASH/CARD/QR payment collections joined to paid invoices, using Malaysia payment dates. DEPOSIT allocations are excluded. Patient group counts cover all registered patients in the selected branch. Usage counts actual negative stock movements linked to dispensing or inventory usage, excluding receipts and reservations.

`GET /api/admin/expenses?from=...&to=...&beforeId=...` returns up to 200 active rows in descending ID order; optional beforeId retrieves older rows. `POST /api/admin/expenses` accepts `{paidOn,category,description,amountCents,reference,idempotencyKey}`. Categories are STOCK_PURCHASE, RENT, SALARY, UTILITIES and OTHER. Paid dates cannot be future dates; amounts are positive integer cents up to 2,000,000,000. Keys are 8–100 characters and unique per branch. Same-key identical creates replay the existing record; changed input returns 409. `PUT /api/admin/expenses/:id` accepts the expense fields plus current version; `DELETE /api/admin/expenses/:id` accepts `{version}` and voids the record. Concurrent changes return 409. Creation, changes and voids audit stored before/after values. Responses omit request hashes and keys.

Patient references and billing suggestions now include nullable `patientGroupId` and `patientGroupLabel`. New invoice receipt snapshots include both fields, including an explicit No group assigned label. Receipt views retain the stored label; older snapshots return null and display Not recorded.

`POST /api/invoices` accepts optional nullable numeric `patientGroupId`. Omit it to use the patient's registered group at checkout; null explicitly records No group assigned; a numeric ID selects a group for this receipt only. Selected IDs must belong to the current tenant/branch and PATIENT_GROUP catalog, and must be active unless they match the patient's existing registered group. Invalid selections return `INVALID_PATIENT_GROUP` without saving an invoice or payment. The override participates in the existing idempotency hash. Registration is never changed by checkout, and the receipt snapshot retains the chosen ID/label after later changes.

## Public registration and reception review

- `GET /api/public/registration/branches/:branchId` returns active branch branding and registration availability.
- `GET /api/public/registration/branches/:branchId/postcodes/:postcode` returns public postcode localities only when branch registration is enabled.
- `POST /api/public/registration/branches/:branchId` accepts `{submissionKey, patient, consent:true}`. Patient fields are a strict demographic/notification-consent allowlist validated by the shared patient rules. It returns 202 with `reference`, `receiptToken`, `ticketNumber`, `status`, `expiresAt` and `branchName`. The initial status is PENDING. Matching retries return the same reservation; changed payloads with the same key return 409.
- `GET /api/public/registration/receipts/:token` returns reference, ticket, registration status, reservation expiry, branch, `visitStatus` and `roomName`. Accepted receipts project the exact linked queue visit using tenant/branch/patient scope. Visit status follows waiting, room call, consultation, dispensary, payment, completion, skip and expiry; registration status remains ACCEPTED. Room name appears only while called or in consultation. Unconfirmed receipts have null visit fields; missing accepted links show status unavailable. Invalid/unknown capabilities expose no patient data or internal IDs.
- `GET /api/registrations` returns pending submissions and private identity-match hints to staff with both patients and queue access.
- `POST /api/registrations/:id/confirm` requires `{version,identityVerified:true,existingPatientId?}`. Staff must explicitly select a matching existing branch profile; confirmation never overwrites it. The operation creates/links the profile and activates the same ticket in one transaction. Exact accepted retries return the prior result.
- `POST /api/registrations/:id/reject` requires version, with optional reason, and clears submitted demographics.
- `GET/PUT /api/admin/registration-settings` reads/updates branch availability with optimistic version. GET includes the registration URL and QR data URL. Only ADMIN may change settings.

Authenticated writes retain CSRF and origin checks. Public writes retain origin validation, body limits and dedicated rate limits. Reservations expire after 12 hours or Malaysia midnight and do not join callable queues before reception confirmation.

Usability update: appointments reject start dates before today in Malaysia time (today remains allowed). `DELETE /api/appointments/:id` accepts `{version}` under existing scoped appointment permissions and CSRF. It marks BOOKED/CANCELLED rows cancelled with `deleted_at`, hides them from active reads/conflicts, and audits REMOVE; attended/status-changed bookings reject with 409. Historical rows remain stored.

`GET /api/encounters/:id` returns a scoped full consultation for clinical history review. `GET /api/admin/clinic` returns `{id,name}`; `PUT` accepts `{name,expectedName}` for administrators, audits the change and returns 409 on stale names. Future receipt snapshots use the saved name; previous snapshots remain unchanged.

Patient registry and minimal references return ascending patient IDs by default; inventory uses ascending item IDs. New MEDICATION ingredients are required; CONSUMABLE/RETAIL ingredients are optional. Unchanged legacy medicine records with missing ingredients retain archival compatibility. Reports navigation is retired; existing backend notification APIs and historical grants remain retained.

Browser and API share an origin. JSON requests use `Content-Type: application/json`. After `POST /api/auth/login`, keep returned `cms_session` cookie and `csrfToken`. Send `X-CSRF-Token` on state changes and optionally `X-Branch-ID` to select an authorized branch. Unauthorized requests return 401; role, origin or CSRF rejection returns 403. Mutation bodies reject unknown fields.

Successful collection reads return `{ "data": [] }`; single-resource and mutation responses return resource objects. Mutation requests normally return 201; edits return 200. Logout returns 204. Failure response contains `error`, `code` and request identifier; validation failures also include field details. Never treat a 500 response as proof the transaction succeeded; reuse original idempotency key for financial retry.

| Endpoint                               | Method     | Role / operation                                                                                         |
| -------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| `/api/health`                          | GET        | Database availability                                                                                    |
| `/api/auth/login`                      | POST       | Email/password; session and CSRF token                                                                   |
| `/api/auth/me`                         | GET        | Current authenticated actor                                                                              |
| `/api/auth/logout`                     | POST       | Delete current session                                                                                   |
| `/api/bootstrap`                       | GET        | User, tenant name/logo, authorized branches, rooms and practitioners                                     |
| `/api/dashboard`                       | GET        | Selected branch counts and revenue                                                                       |
| `/api/patients`                        | GET / POST | Search / registry write                                                                                  |
| `/api/patients/:id`                    | GET / PUT  | Selected branch patient; edit requires version                                                           |
| `/api/patients/:id/encounters`         | GET        | Protected patient history; 50-row cursor pages ordered by timestamp and numeric ID                       |
| `/api/appointments`                    | GET / POST | Calendar / booking                                                                                       |
| `/api/appointments/:id/cancel`         | POST       | Cancel booked appointment with version                                                                   |
| `/api/queue`                           | GET / POST | Today's queue / check-in                                                                                 |
| `/api/queue/:id/transition`            | POST       | Status change with version and optional room/practitioner                                                |
| `/api/queue/display`                   | GET        | Authenticated display projection without patient details                                                 |
| `/api/queue/events`                    | GET        | Authenticated server-sent queue refresh events                                                           |
| `/api/queue/estimate`                  | GET        | Approximate selected-branch clearance; unknown below five qualifying observations                        |
| `/api/encounters`                      | GET / POST | Clinical module read / doctor-only GP chart creation                                                     |
| `/api/encounters/:id`                  | PUT        | Author edit before signing; version required                                                             |
| `/api/encounters/:id/prescription-log` | GET        | Clinical or inventory module: scoped clinic prescription events; excludes SOAP                           |
| `/api/encounters/:id/medication-doses` | GET / POST | Clinical-only patient medication-taking reports; GP/nurse records against signed prescriptions           |
| `/api/inventory`                       | GET / POST | Stock catalog / authorized item creation                                                                 |
| `/api/inventory/batches`               | POST       | Stock receipt and movement ledger                                                                        |
| `/api/dispenses`                       | POST       | Signed encounter dispensing; consumes physical stock once and closes own holds; idempotency key required |
| `/api/inventory/usage`                 | POST       | Non-medication supply usage with `{itemId,quantity,reason,idempotencyKey}`; audited and idempotent       |
| `/api/invoices`                        | GET / POST | Billing module financial ledger / split checkout                                                         |
| `/api/invoices/:id/receipt`            | GET        | Authenticated receipt rendering                                                                          |
| `/api/deposits`                        | POST       | Retired: 410 FEATURE_RETIRED; historical ledger retained                                                 |
| `/api/patients/:id/deposit-balance`    | GET        | Retired: 410 FEATURE_RETIRED                                                                             |
| `/api/documents`                       | GET / POST | Protected clinical documents / attending doctor issuance                                                 |
| `/api/documents/:id`                   | GET        | Authenticated, integrity-checked, redacted letter preview projection                                     |
| `/api/documents/:id/revoke`            | POST       | Issuing GP revocation with reason                                                                        |
| `/api/documents/:id/pdf`               | GET        | Authenticated inline clinical PDF; `?download=1` requests an attachment                                  |
| `/api/verify/:token`                   | GET        | Minimal public validity response                                                                         |
| `/api/notifications`                   | GET        | Reports module delivery status                                                                           |
| `/api/admin/users`                     | GET / POST | Admin staff listing / account creation                                                                   |
| `/api/admin/users/:id`                 | PUT        | Admin activation; protects self and final administrator                                                  |
| `/api/auth/change-password`            | POST       | Current password verification; invalidates sessions                                                      |
| `/api/admin/branches`                  | GET / POST | Admin clinic branches                                                                                    |
| `/api/admin/rooms`                     | GET / POST | Admin rooms; tenant scope validated                                                                      |
| `/api/admin/rooms/:id`                 | PUT        | Rename/archive selected-branch room; busy room returns 409                                               |
| `/api/admin/role-modules`              | GET / PUT  | Admin tenant-wide role grants; ADMIN always retains every module                                         |
| `/api/dispensary/encounters`           | GET        | Inventory module: signed, prescription-bearing, undispensed work; excludes SOAP                          |
| `/api/dispensary/history`              | GET        | Clinical or inventory module: searchable signed prescription history, including completed dispenses      |
| `/api/admin/audit`                     | GET        | Admin branch audit trail                                                                                 |
| `/api/notifications/:id/retry`         | POST       | Admin retry failed/unconfigured delivery                                                                 |

Role details and validation bounds are executable in `src/server/app.ts` and `src/server/validation.ts`. Clinical writes accept identifiers from the same branch, signed encounter references where required, and safe integer quantities. Amounts use integer minor units named `priceCents`, `unitPriceCents` or `amountCents`.

Example split checkout:

```json
{
  "patientId": 1,
  "practitionerId": 1,
  "idempotencyKey": "stable-client-generated-request-key",
  "lines": [
    { "description": "Consultation", "quantity": 1, "unitPriceCents": 8000, "category": "SERVICE" }
  ],
  "payments": [
    { "method": "CASH", "amountCents": 3000, "reference": "" },
    { "method": "QR", "amountCents": 5000, "reference": "provider-reference" }
  ]
}
```

Replace example identifiers with existing positive integer IDs. Tender sum must equal invoice total. Reusing same key and payload returns prior invoice. Changed payload with same key returns conflict. Card/QR entries are recorded tender declarations; payment processor authorization is separate integration work.

SSE is process-local in this initial implementation. Multiple API replicas require shared event fanout or periodic client refresh. The public waiting-room screen polls separate anonymous display endpoints; staff queue SSE still requires authentication.

Patient history returns `{data, nextCursor}`. Supply both `before` (ISO UTC timestamp) and `beforeId` (positive integer) from the returned cursor for the next page. Timestamp/ID ordering retains encounters sharing the same timestamp without duplicates. A null cursor marks the final page. The clinical module is required; a patient outside the selected branch returns 404.

Module grants authorize routes on every request. Administrator overrides apply clinic-wide by role; branch membership still constrains resources. Chart write/sign and document issuance require DOCTOR even when another role receives clinical module access. Retired package, commission, policy, payroll and photo paths return `410 FEATURE_RETIRED`. Historical test adapters are not mounted by the deployed app.

Patient registration supports `firstName`, optional `lastName`, `nationality`, `addressLine1`, `addressLine2`, `postcode`, `city` and `state`. Malaysian IC accepts 12 digits or 6-2-4 hyphens, persists canonical format, derives birth date/gender and rejects invalid calendar dates or conflicting demographics. An older-century birth date matching the IC date digits is accepted. Passport registrations require explicit date of birth and gender. Prescription entries accept `frequencyPerDay` (1–24) and `mealTiming` (`BEFORE_MEAL`, `AFTER_MEAL`, `ANY_TIME`); omitted values default to 1 and ANY_TIME.

Workflow references: `GET /api/references/patients?search=...` returns only id/patientNumber/name/nationalId/phone for queue, patient, appointment, clinical or billing modules. `GET /api/references/medications` serves clinical or inventory modules with medication identity/ingredient/unit/category/price, without stock batches. `GET /api/clinical/patients/:id` requires clinical access and returns selected-patient demographics/allergies/conditions without full registry contact/address fields or SOAP. Every projection remains branch scoped; these routes do not grant access to `/patients` or `/inventory`.

`GET /api/references/postcodes/:postcode` requires the patients module and exactly five digits. It returns `{data:[{postcode,city,state}]}` from a bundled offline Malaysian postcode table. Unknown codes return an empty array; malformed codes return 400. State labels are human-readable. A postcode can have multiple localities; callers must preserve the user’s chosen city. Patient payloads now accept `city` (maximum 100 characters). Registration fills missing city/state only for one matching locality; explicit manual values are preserved.

Human-facing sequential references are `tenantNumber`, `branchNumber` and `patientNumber`. Bootstrap includes `{tenant:{id,tenantNumber,name}}` and each authorized branch number. Patient reads, registry writes, minimal patient references, clinical banners and pending dispensing projections include patientNumber. These fields alias the actual positive numeric `id` after migration 009. Requests and foreign keys now use positive numeric identifiers. Sequences are table-wide and may contain gaps. Session secrets, verification tokens and client idempotency keys remain opaque strings. Identifier inputs must be positive safe integers; malformed, fractional or unsafe values are rejected.

The separate browser demo does not expose or call this server API. Its client adapter simulates compatible payloads in sessionStorage.
Demo credentials are sample-only; session cookies, CSRF enforcement, MySQL transactions and clinical signatures described here apply to the real server.
Demo supports in-page receipt samples; PDF downloads and signed clinical documents remain unavailable.
Fictional workflow fixtures exist only in the demo store and reset to their initial state. The real bootstrap does not create patient/business fixtures.

## Search, reservations and general inventory

`GET /api/patients?search=...`, `/api/encounters?search=...` and `/api/dispensary/encounters?search=...` search scoped records before their 200-row limit. Prescription search matches patient/identity, patient or encounter ID, practitioner and medicine name. Inventory accepts `search` and optional `category=MEDICATION|CONSUMABLE|RETAIL`.

Inventory responses include `stockQuantity` (free available units), `onHandQuantity` (eligible unexpired physical units) and `reservedQuantity` (eligible active prescription holds). Expiry on or before Malaysia's current date remains ineligible. Non-expiring non-medication supplies are eligible; medication requires expiry.

Saving an encounter as `SIGNED` reserves every prescribed quantity in the same transaction; insufficient available stock rejects the entire sign operation. `DRAFT` creates no hold. Dispensing closes its own holds, reallocates eligible FEFO stock excluding other holds and decrements physical batches once. Failed allocation restores holds and quantities. Historical unreserved signed encounters retain legacy dispensing support.

`POST /api/inventory/batches` accepts omitted/null `expiresOn` only for non-medication items. Supply usage rejects medication items, insufficient stock and changed payloads reusing an idempotency key.

Encounter `vitals.bloodPressure`, when present, must contain positive whole-number `SYS/DIA` with SYS>DIA. Unusual numeric readings remain accepted; browser warnings use the documented monitor limits, without diagnostic classification. Other vital keys retain their existing contracts.

MC date defaults are browser assistance, not an API override: Malaysia time before 17:00 selects today, from 17:00 selects tomorrow. Explicit `startDate` remains required and editable. Attending-GP ownership, signed encounter and non-overlap checks remain enforced by the real service; demo issuance is unsigned simulation.

## Letter preview and prescription activity

Patient `phone` accepts local and international text up to 50 characters, including a leading `+` country code and display separators. The application preserves the supplied phone text; it does not infer a country from nationality or verify ownership.

The patient form offers a country-code dropdown (Malaysia by default) and composes the existing `phone` string before submission. Unlisted codes use full international entry. Unedited stored numbers are preserved. No country-code column or separate API property is introduced.

Patient `countryCode` is a separate optional ISO 3166-1 alpha-2 country of nationality or the OTHER sentinel, unrelated to phone/address. Malaysian records derive `MY`. Non-Malaysian registration/editing requires country selection in the UI; supplied API codes must be recognized and cannot be `MY`. Legacy callers may omit it; old foreign countries remain unknown until explicitly updated. Ordinary updates preserve an omitted country when nationality remains unchanged.

List controls search, filter and sort already loaded records. Existing server searches/cursor loading remain available. Counts identify this boundary. Views do not change permissions, action choices, queue priority, stock or financial totals. Sorting defaults to original order and never mutates the source array.

`GET /documents/:id` returns a `DocumentView`, including clinic/patient/practitioner display details, Malaysia issue date/time, status, `fields` as `{label,value}` pairs, and `diagnosis` as text or `null` when withheld. It excludes the raw signed payload, signing hash and verification token. Preview and PDF reads reject altered snapshots or metadata with `409 DOCUMENT_INTEGRITY_FAILED`; revocation remains visibly marked.

`GET /documents/:id/pdf` streams an inline PDF by default. Only `?download=1` sets attachment disposition. The browser opens a letter preview first and offers a separate download action. Both outputs use the same snapshot projection and diagnosis-redaction policy.

`GET /encounters/:id/prescription-log` accepts clinical or inventory module access and validates selected-branch scope. The response contains `encounterId`, `patientId`, `patientName` and `events`; each event includes type (`PRESCRIBED`, `RESERVED`, `RELEASED`, `DISPENSED`), medicine, quantity, staff, timestamp, prescribed frequency/meal timing/duration/dosage and batch details when applicable. The projection excludes SOAP and does not represent patient dose-taking. Reading it does not consume stock; existing encounter, reservation, dispense and movement rows remain authoritative.

`GET /encounters/:id/medication-doses` requires clinical access and returns `{encounterId,patientId,patientName,entries}` with the newest 500 reports ordered by occurrence time and numeric ID. Inventory access alone is insufficient. Each entry includes medicine/unit snapshots, outcome, source, amount, occurrence time, notes, recording actor and creation time.

`POST` on that path additionally requires DOCTOR or NURSE and a medicine from the signed encounter. Send `{itemId,outcome,source,occurredAt,amount,notes,idempotencyKey}`. Outcomes are `TAKEN` or `MISSED`; sources are `PATIENT_REPORTED` or `STAFF_OBSERVED`. `TAKEN` requires a positive amount of at most 1,000,000, with up to three decimal places; `MISSED` requires `amount:null`. An offset-bearing ISO occurrence timestamp is normalized to UTC and may not exceed current time by more than five minutes. Notes permit 2,000 characters. Retry keys permit 8–100 characters; a changed payload returns `409 IDEMPOTENCY_CONFLICT`.

Reports are append-only clinical records. They do not change inventory or confirm adherence beyond the source recorded by staff. Existing prescription-frequency input remains unchanged.

## Administrator catalogs

ADMIN reads/creates `/api/admin/catalogs` and edits `/api/admin/catalogs/:id` with label, active, sortOrder and version. Creation also requires kind: LAB_PANEL, SPECIMEN_TYPE, INVENTORY_UNIT or REFERRAL_DESTINATION. Label limits respectively are 200, 100, 50 and 200 characters. Stale versions return 409. `/api/references/catalogs?kind=...` supplies active choices to authorized modules. Configured kinds require active matches; completely empty kinds preserve legacy API free text.

ADMIN edits `/api/admin/inventory/:id` with complete item metadata plus active/version. Category, ingredient and unit cannot change after stock or prescription history. `/api/references/medications?search=...` searches active items before the 200-result cap; explicit includeInactive=1 supports historical lookup. New prescriptions reject archived medications. Existing signed prescriptions remain dispensable. New writes capture server-authoritative medicine metadata; legacy records without snapshots retain catalog fallback.

## Settings lifecycle and receipt preview

ADMIN PUT /api/admin/users/:id accepts optional name and/or active, requiring at least one field. Name length is 1–150; existing self/final-admin protections and session revocation remain. ADMIN PUT /api/admin/branches/:id accepts name, address, active and version (150/1000 character limits). Branches expose active/version; stale updates return 409. Archive rejects current/final active branch or active home staff. Membership and authentication require active branches. Staff reactivation checks the home branch.

ADMIN DELETE /api/admin/rooms/:id returns `{id,removed:"deleted"}` for unused rooms or `{id,removed:"archived"}` when history exists. Busy/upcoming-booked rooms return 409. Mutations remain scoped, CSRF protected and audited.

Billing-module GET /api/invoices/:id/receipt-view returns safe ReceiptView metadata, line amounts, total and payments, without raw request hashes. GET /api/invoices/:id/receipt defaults to inline PDF; ?download=1 explicitly downloads. Both require authenticated tenant/branch scope. New invoice receiptSnapshot metadata wins over later renamed master records; legacy invoices use current metadata and historical checkout actor, with Not recorded when unavailable. Demo supports sample receipt-view, not real PDF.

## Direct registered patient call

POST /api/queue/:id/transition accepts status CALLED_TO_ROOM directly from REGISTERED, with version, roomId and practitionerId. Existing room scope/active/occupancy, practitioner, concurrency and audit rules remain. TRIAGE_WAITING paths remain compatible. No new endpoint or schema.

## Queue expiry and assigned suggestions

GET /api/clinical/queue-suggestions requires clinical module and DOCTOR role. Returns {data:[queueTicketId,patientId,patientNumber,patientName,ticketNumber,roomId,roomName,status,version,createdAt,calledAt,expiresAt,encounterId]}; encounterId is nullable. Scope is current tenant/branch and assigned GP. POST /api/queue returns PATIENT_ALREADY_CHECKED_IN 409 for an active duplicate. Expired transitions return QUEUE_EXPIRED 409. POST /api/encounters may link an assigned CALLED_TO_ROOM or IN_CONSULTATION ticket; creates/starts atomically and returns ENCOUNTER_EXISTS 409 if already linked. Existing clinical edits keep their original association and are permitted after operational expiry.

## Signing handoff and multiple prescriptions

POST /api/encounters and PUT /api/encounters/:id retain prescriptions:[{itemId,quantity,durationDays,frequencyPerDay,mealTiming,dosage}] with a maximum of 50. SIGNED saves now atomically advance a scoped linked active visit to DISPENSARY_WAITING after all reservations succeed. Stored queue association is authoritative when draft updates omit queueTicketId. No new endpoint/schema or weaker permission rule is introduced.

## Draft removal and privileged reset

DELETE /api/encounters/:id requires clinical module, attending DOCTOR, {version}, CSRF and DRAFT status. Signed/protected dependencies reject 409; foreign/removed records return 404 and stale versions reject 409. GET /api/admin/database-reset/preview requires ADMIN with live is_super_admin; returns scope ENTIRE_DATABASE, confirmationPhrase, counts[{table,rowCount}], defaults and preserves metadata. POST /api/admin/database-reset strictly accepts {confirmationPhrase:"RESET ALL CLINIC DATA",currentPassword,acknowledge:true}; reauthentication, capability and schema guards are enforced server-side. Successful reset returns {requiresLogin:true,bootstrapEmail}, clears sessions and cookie, and never returns passwords/hashes. Incorrect current password is 403 PASSWORD_INCORRECT.

## Live stock and checkout suggestions

`GET /api/references/medications` returns `stockQuantity` (available), `onHandQuantity` (eligible physical stock), and `reservedQuantity`, with existing medicine identity fields. Clinical permission allows these minimal references without granting stock mutation access.
`GET /api/billing/suggestions?search=...` requires billing permission and returns scoped signed, nondeleted, unpaid consultations with no medicines or a completed dispense. Rows include `id/encounterId`, `patientId/patientNumber/patientName`, `practitionerId/practitionerName`, `queueTicketId`, `signedAt`, `dispensedAt`, and `prescriptions` with `itemName`, `quantity` and `unitPriceCents`. Catalogue prices are editable checkout suggestions, not historical price guarantees.
`POST /api/invoices` additionally accepts optional numeric `encounterId`. It must identify a signed consultation for the submitted patient/GP; medicine visits must already be dispensed. Duplicate linked checkout returns 409; idempotent retries return the original invoice. Successful linked checkout completes only an active, unexpired PAYMENT_WAITING visit. Standalone invoices retain compatibility.
Signing/dispensing transitions and billing readiness are committed with their clinical/stock transaction. Expired visits are never revived.

## Appointment arrivals and retired deposit APIs

POST /api/appointments accepts patientId, practitionerId, startsAt, endsAt and reason. roomId is rejected; existing historical room associations remain stored. GP time conflicts remain enforced.
GET /api/queue/appointment-arrivals requires queue permission and returns {data:[{id,patientId,patientName,practitionerId,practitionerName,startsAt,reason,version}]}. Results are branch/tenant-scoped, BOOKED, not removed, due today in Asia/Kuala_Lumpur with startsAt <= now, and exclude patients already actively checked in.
POST /api/queue optionally accepts appointmentId and appointmentVersion together, alongside patientId/priority. It validates patient, scope, due status and optimistic version, then inserts the linked waiting ticket and changes the appointment to CHECKED_IN in one transaction. Duplicate or changed arrivals return409; premature arrivals return409. Room remains null until called.
Deposit and deposit-balance routes return410 FEATURE_RETIRED for authenticated callers. New invoice validation allows only CASH/CARD/QR. Existing historical receipt reads still recognize DEPOSIT; no migration erases old balances or payment rows.

## Daily queue and temperature validation

GET /api/queue returns only the current Malaysia service date, retaining today's completed/skipped/expired records. Operational display/suggestions/actions exclude expired and prior-day rows. Queue expiry is the earlier of createdAt+12h and next Malaysia midnight; expiry metadata records SERVICE_DAY_ENDED or LIFETIME_ELAPSED. GET /api/queue/estimate adds visitsToday, counting all current branch/day rows independently of list pagination. No queue record is deleted merely because the day changes.
POST/PUT /api/encounters accepts optional vitals.temperature as numeric or numeric text, range28..40 inclusive. Nonfinite/out-of-range values return validation400 at vitals.temperature. The API stores previously issued histories unchanged.

## Anonymous waiting-room display

The `/display` browser route needs no login. Its read-only endpoints run after the common API security headers and rate limit, before staff authentication:

| Endpoint                                   | Result                                                                                                          |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `GET /api/public/display/branches`         | `{data:[{id,name,clinicName}]}` for active branches, ordered by branch ID                                       |
| `GET /api/public/display/queue?branchId=1` | `{branch:{id,name,clinicName},data:[{ticketNumber,status,roomName}]}` for the explicitly selected active branch |

`branchId` must be a positive safe integer. Missing/malformed IDs return 400; unknown or inactive branches return 404. The query selects the chosen branch's tenant directly; staff cookies and `X-Branch-ID` do not override selection. Responses use `Cache-Control: no-store`. Public queue data includes only today's Asia/Kuala_Lumpur service date, unexpired visits younger than 12 hours, and statuses `REGISTERED`, `TRIAGE_WAITING`, `CALLED_TO_ROOM`, `IN_CONSULTATION`. It excludes internal ticket IDs, patient identifiers/names, practitioner names, contacts, clinical fields, configuration secrets and authentication tokens.

Clients poll every 15 seconds; no public SSE session is created. Existing `/api/queue`, `/api/queue/display` and `/api/queue/events` remain authenticated and permission-controlled. POST requests do not create a public queue mutation route.

## Billing category catalog contract

`GET /api/references/catalogs?kind=BILLING_CATEGORY` returns active branch choices to billing-authorized users. Administrator catalog reads include archived entries. Existing `POST /api/admin/catalogs` and `PUT /api/admin/catalogs/:id` manage label (trimmed 1–200 characters), active state, display order and optimistic version. Management requires ADMIN, branch scope and CSRF. Responses expose nullable `billingDefault` (SERVICE/PRODUCT), which clients cannot assign or change. Labels may change while the marker stays fixed.

`POST /api/invoices` accepts category labels up to 200 characters and validates them against active tenant/branch billing choices inside its transaction. Unknown or archived choices fail with `INACTIVE_CATALOG_CHOICE`. An unconfigured legacy branch accepts SERVICE/PRODUCT only; a configured list with every choice archived accepts neither. Existing invoice retries with the same request and idempotency key are resolved before current catalog validation. No paid invoice lines or receipt snapshots change when catalog labels change.

## Custom nationality country contract

POST/PUT /api/patients accepts countryCode=OTHER with countryName (trimmed 1–100 characters) for NON_MALAYSIAN. Missing/blank/oversized custom names return validation400 at countryName; OTHER without foreign nationality rejects. Read/list payloads include nullable countryName. Explicit ISO selection or MALAYSIAN/MY clears countryName. Legacy edit payloads omitting both country fields preserve a previous OTHER/name pair; switching away from Malaysian nationality without a country retains the existing unknown-country fallback. Phone calling-code choices retain their existing behavior.

## Cashier, dose quantities and unnumbered stock receipts

`GET /api/encounters/:id/medicine-labels` requires inventory module access, including inventory-only staff. Clinical access alone is insufficient. It returns `{id, patientId, patientName, practitionerName, dispensedAt, prescriptions}` only for a signed, nonremoved encounter with a successful dispense in the caller's tenant and branch. `id` is the encounter ID. `dispensedAt` is the original `dispenses.created_at` ISO timestamp, never the reprint time. Directions use the saved encounter prescription snapshot: itemId, itemName, optional unit, quantity, optional quantityPerDose/indication, dosage, durationDays, frequencyPerDay and mealTiming. Linked patient/GP names reflect current identity records; historical identity-name snapshots were not stored. Saved medicine names and units remain authoritative. Missing legacy name/unit snapshots fall back only to the current catalog item in the same tenant and branch, including archived items; absent names still show `Medication ID <id>` when no scoped catalog record exists. Responses omit SOAP and internal dispense keys. Missing, unsigned, removed, undispensed or foreign-scope records return404. Repeated GETs do not create dispenses, update stock/reservations or create invoices. Browser demo implements the same label projection and permission semantics using simulated records.

Staff creation and role-module configuration accept `CASHIER`. Defaults grant `queue`, `patients`, `clinical` and `billing`. Receptionist, nurse and therapist defaults also include clinical chart access; existing administrator-configured module overrides remain authoritative. Clinical creation/signing and clinical document issuance retain their GP-only server gates. Cashiers cannot receive administrator or dispensary access through the default role.

Each POST/PUT `/api/encounters` prescription optionally accepts positive integer `quantityPerDose` and trimmed `indication` (0–500 characters). `quantity` remains the positive integer total supply used for stock reservations, dispensing and billing. When `quantityPerDose` is supplied, the server requires `quantity = quantityPerDose * frequencyPerDay * durationDays`. Historical prescriptions without per-dose quantities remain readable and editable as historical drafts; no migration invents dose values. Signed snapshots retain both new fields. Prescription-log events include these optional fields.

POST `/api/inventory/batches` accepts `batchNumber: null` or an omitted batch number. A supplied number must contain 1–100 trimmed characters. SQL NULL represents missing manufacturer numbering; repeated unnumbered receipts create distinct tracked rows and movements. Named batch numbers remain unique per item. `expiresOn: null` remains accepted only for CONSUMABLE/RETAIL categories; MEDICATION still requires a future expiry date. Tenant/branch checks, stock transactions and audit records apply to every receipt.

## Clinical pricing and letterhead update — 23 October 2026

See [clinical pricing, prescribing, minor surgery and letterhead](CLINICAL_PRICING_AND_LETTERHEAD.md) for current behavior, API fields, storage, permissions and operating instructions. This update supersedes earlier clinical range limits and pill-only dose labels.

## Custom module roles

Administrator-only endpoints: `GET /admin/custom-roles` returns `{data:[{id,name,modules,version}]}`. `POST /admin/custom-roles` accepts `{name,modules}` and returns the created role. `PUT /admin/custom-roles/:id` accepts `{name,modules,version}` and returns the next version. Names are trimmed, 1–100 characters, unique within the tenant. Modules must be known module IDs; an empty list denies all modules. Stale updates and duplicate names return 409.

`POST /admin/users` and `PUT /admin/users/:id` accept optional nullable `customRoleId`. Assignments require a role in the same tenant. Administrators cannot receive custom role assignments. A null assignment restores professional role defaults. Every request reevaluates module permissions without changing professional action restrictions.

### Patient group catalog and assignment

The existing administrator catalog endpoints accept kind `PATIENT_GROUP`. `GET /api/references/catalogs?kind=PATIENT_GROUP` requires patient module access and returns active branch choices. Admin catalog edits preserve optimistic versions, auditing and administrator-only writes. Patient POST/PUT accepts optional nullable numeric `patientGroupId`; null clears assignment, omission preserves it during updates. Responses include `patientGroupId` and `patientGroupLabel`. Newly selected groups must be active PATIENT_GROUP entries from the current tenant/branch. Unchanged archived assignments are permitted. Invalid, foreign and newly archived assignments return `INVALID_PATIENT_GROUP`. Public registration rejects group assignment fields.
