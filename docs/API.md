# HTTP API contract

Browser and API share an origin. JSON requests use `Content-Type: application/json`. After `POST /api/auth/login`, keep returned `cms_session` cookie and `csrfToken`. Send `X-CSRF-Token` on state changes and optionally `X-Branch-ID` to select an authorized branch. Unauthorized requests return 401; role, origin or CSRF rejection returns 403. Mutation bodies reject unknown fields.

Successful collection reads return `{ "data": [] }`; single-resource and mutation responses return resource objects. Mutation requests normally return 201; edits return 200. Logout returns 204. Failure response contains `error`, `code` and request identifier; validation failures also include field details. Never treat a 500 response as proof the transaction succeeded; reuse original idempotency key for financial retry.

| Endpoint                            | Method     | Role / operation                                                                                         |
| ----------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| `/api/health`                       | GET        | Database availability                                                                                    |
| `/api/auth/login`                   | POST       | Email/password; session and CSRF token                                                                   |
| `/api/auth/me`                      | GET        | Current authenticated actor                                                                              |
| `/api/auth/logout`                  | POST       | Delete current session                                                                                   |
| `/api/bootstrap`                    | GET        | User, authorized branches, rooms and practitioners                                                       |
| `/api/dashboard`                    | GET        | Selected branch counts and revenue                                                                       |
| `/api/patients`                     | GET / POST | Search / registry write                                                                                  |
| `/api/patients/:id`                 | GET / PUT  | Selected branch patient; edit requires version                                                           |
| `/api/patients/:id/encounters`      | GET        | Protected patient history; 50-row cursor pages ordered by timestamp and numeric ID                       |
| `/api/appointments`                 | GET / POST | Calendar / booking                                                                                       |
| `/api/appointments/:id/cancel`      | POST       | Cancel booked appointment with version                                                                   |
| `/api/queue`                        | GET / POST | Today's queue / check-in                                                                                 |
| `/api/queue/:id/transition`         | POST       | Status change with version and optional room/practitioner                                                |
| `/api/queue/display`                | GET        | Authenticated display projection without patient details                                                 |
| `/api/queue/events`                 | GET        | Authenticated server-sent queue refresh events                                                           |
| `/api/queue/estimate`               | GET        | Approximate selected-branch clearance; unknown below five qualifying observations                        |
| `/api/encounters`                   | GET / POST | Clinical module read / doctor-only GP chart creation                                                     |
| `/api/encounters/:id`               | PUT        | Author edit before signing; version required                                                             |
| `/api/inventory`                    | GET / POST | Stock catalog / authorized item creation                                                                 |
| `/api/inventory/batches`            | POST       | Stock receipt and movement ledger                                                                        |
| `/api/dispenses`                    | POST       | Signed encounter dispensing; consumes physical stock once and closes own holds; idempotency key required |
| `/api/inventory/usage`              | POST       | Non-medication supply usage with `{itemId,quantity,reason,idempotencyKey}`; audited and idempotent       |
| `/api/invoices`                     | GET / POST | Billing module financial ledger / split checkout                                                         |
| `/api/invoices/:id/receipt`         | GET        | Authenticated receipt rendering                                                                          |
| `/api/deposits`                     | POST       | Billing module deposit record                                                                            |
| `/api/patients/:id/deposit-balance` | GET        | Billing module scoped deposit balance                                                                    |
| `/api/documents`                    | GET / POST | Protected clinical documents / attending doctor issuance                                                 |
| `/api/documents/:id/revoke`         | POST       | Issuing GP revocation with reason                                                                        |
| `/api/documents/:id/pdf`            | GET        | Authenticated clinical PDF                                                                               |
| `/api/verify/:token`                | GET        | Minimal public validity response                                                                         |
| `/api/notifications`                | GET        | Reports module delivery status                                                                           |
| `/api/admin/users`                  | GET / POST | Admin staff listing / account creation                                                                   |
| `/api/admin/users/:id`              | PUT        | Admin activation; protects self and final administrator                                                  |
| `/api/auth/change-password`         | POST       | Current password verification; invalidates sessions                                                      |
| `/api/admin/branches`               | GET / POST | Admin clinic branches                                                                                    |
| `/api/admin/rooms`                  | GET / POST | Admin rooms; tenant scope validated                                                                      |
| `/api/admin/rooms/:id`              | PUT        | Rename/archive selected-branch room; busy room returns 409                                               |
| `/api/admin/role-modules`           | GET / PUT  | Admin tenant-wide role grants; ADMIN always retains every module                                         |
| `/api/dispensary/encounters`        | GET        | Inventory module: signed, prescription-bearing, undispensed work; excludes SOAP                          |
| `/api/admin/audit`                  | GET        | Admin branch audit trail                                                                                 |
| `/api/notifications/:id/retry`      | POST       | Admin retry failed/unconfigured delivery                                                                 |

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

SSE is process-local in this initial implementation. Multiple API replicas require shared event fanout or periodic client refresh. Waiting-room display still requires an authenticated clinic session.

Patient history returns `{data, nextCursor}`. Supply both `before` (ISO UTC timestamp) and `beforeId` (positive integer) from the returned cursor for the next page. Timestamp/ID ordering retains encounters sharing the same timestamp without duplicates. A null cursor marks the final page. The clinical module is required; a patient outside the selected branch returns 404.

Module grants authorize routes on every request. Administrator overrides apply clinic-wide by role; branch membership still constrains resources. Clinical write/sign and document issuance require DOCTOR even when another role receives clinical module access. Retired package, commission, policy, payroll and photo paths return `410 FEATURE_RETIRED`. Historical test adapters are not mounted by the deployed app.

Patient registration supports `firstName`, optional `lastName`, `nationality`, `addressLine1`, `addressLine2`, `postcode`, `city` and `state`. Malaysian IC accepts 12 digits or 6-2-4 hyphens, persists canonical format, derives birth date/gender and rejects invalid calendar dates or conflicting demographics. An older-century birth date matching the IC date digits is accepted. Passport registrations require explicit date of birth and gender. Prescription entries accept `frequencyPerDay` (1–24) and `mealTiming` (`BEFORE_MEAL`, `AFTER_MEAL`, `ANY_TIME`); omitted values default to 1 and ANY_TIME.

Workflow references: `GET /api/references/patients?search=...` returns only id/patientNumber/name/nationalId/phone for queue, patient, appointment, clinical or billing modules. `GET /api/references/medications` serves clinical or inventory modules with medication identity/ingredient/unit/category/price, without stock batches. `GET /api/clinical/patients/:id` requires clinical access and returns selected-patient demographics/allergies/conditions without full registry contact/address fields or SOAP. Every projection remains branch scoped; these routes do not grant access to `/patients` or `/inventory`.

`GET /api/references/postcodes/:postcode` requires the patients module and exactly five digits. It returns `{data:[{postcode,city,state}]}` from a bundled offline Malaysian postcode table. Unknown codes return an empty array; malformed codes return 400. State labels are human-readable. A postcode can have multiple localities; callers must preserve the user’s chosen city. Patient payloads now accept `city` (maximum 100 characters). Registration fills missing city/state only for one matching locality; explicit manual values are preserved.

Human-facing sequential references are `tenantNumber`, `branchNumber` and `patientNumber`. Bootstrap includes `{tenant:{id,tenantNumber,name}}` and each authorized branch number. Patient reads, registry writes, minimal patient references, clinical banners and pending dispensing projections include patientNumber. These fields alias the actual positive numeric `id` after migration 009. Requests and foreign keys now use positive numeric identifiers. Sequences are table-wide and may contain gaps. Session secrets, verification tokens and client idempotency keys remain opaque strings. Identifier inputs must be positive safe integers; malformed, fractional or unsafe values are rejected.

The separate browser demo does not expose or call this server API. Its client adapter simulates compatible payloads in sessionStorage.
Demo credentials are sample-only; session cookies, CSRF enforcement, MySQL transactions and clinical signatures described here apply to the real server.
Demo PDF/receipt links open `/demo-unavailable`; they do not generate signed clinical documents.
Fictional workflow fixtures exist only in the demo store and reset to their initial state. The real bootstrap does not create patient/business fixtures.

## Search, reservations and general inventory

`GET /api/patients?search=...`, `/api/encounters?search=...` and `/api/dispensary/encounters?search=...` search scoped records before their 200-row limit. Prescription search matches patient/identity, patient or encounter ID, practitioner and medicine name. Inventory accepts `search` and optional `category=MEDICATION|CONSUMABLE|RETAIL`.

Inventory responses include `stockQuantity` (free available units), `onHandQuantity` (eligible unexpired physical units) and `reservedQuantity` (eligible active prescription holds). Expiry on or before Malaysia's current date remains ineligible. Non-expiring non-medication supplies are eligible; medication requires expiry.

Saving an encounter as `SIGNED` reserves every prescribed quantity in the same transaction; insufficient available stock rejects the entire sign operation. `DRAFT` creates no hold. Dispensing closes its own holds, reallocates eligible FEFO stock excluding other holds and decrements physical batches once. Failed allocation restores holds and quantities. Historical unreserved signed encounters retain legacy dispensing support.

`POST /api/inventory/batches` accepts omitted/null `expiresOn` only for non-medication items. Supply usage rejects medication items, insufficient stock and changed payloads reusing an idempotency key.

Encounter `vitals.bloodPressure`, when present, must contain positive whole-number `SYS/DIA` with SYS>DIA. Unusual numeric readings remain accepted; browser warnings use the documented monitor limits, without diagnostic classification. Other vital keys retain their existing contracts.

MC date defaults are browser assistance, not an API override: Malaysia time before 17:00 selects today, from 17:00 selects tomorrow. Explicit `startDate` remains required and editable. Attending-GP ownership, signed encounter and non-overlap checks remain enforced by the real service; demo issuance is unsigned simulation.
