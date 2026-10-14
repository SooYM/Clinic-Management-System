# Version 2 test cases

Latest country/list gate: 322 passing tests across eighteen files, zero skips (8 October 2026, 09:06 MYT).
Country cases cover recognized/invalid/MY-conflicting codes, legacy omission, scoped MySQL roundtrip, migration preservation and demo parity (`tests/patient-country.test.ts`, `tests/patient-country-migration.test.ts`, `tests/mysql.test.ts`).
List cases cover combined filters/search, stable numeric/case-insensitive sorting, blanks last, original order and immutable arrays (`tests/list-controls.test.ts`). Browser `countrylistqa` checks country selection and desktop/320px record controls without changing local business data.

Run `npm ci`, then `npm run format:check`, `npm run build` and `npm test`. Real database cases require a guarded `TEST_DATABASE_URL` with an explicit test database name and create/drop privileges. Never point it at clinic data. Suites create separate `qa_<uuid>_test` databases and remove only their exact generated names. Missing TEST_DATABASE_URL skips integration cases and is not a passing database gate.

The latest Version 2 baseline is **267 passing cases across twelve test files, zero skips** (7 October 2026, 14:55 MYT). Rows below group related cases; they do not claim one table row equals one executed test. Exact executable assertions remain in the linked test files. See [verification evidence](TESTING.md) and [browser/deployment evidence](VALIDATION.md).

| Case ID    | Mode / executable source                                                                                                            | Setup and action                                                                                                                         | Expected result                                                                                                             |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| ID-01      | Automated: [identifiers.test.ts](../tests/identifiers.test.ts)                                                                      | Parse positive decimal route IDs and safe numeric IDs; try zero, negative, fractional, hex/scientific, whitespace, booleans and overflow | Valid IDs normalize to numbers; malformed/unsafe IDs reject                                                                 |
| ID-02      | Real MySQL: [mysql.test.ts](../tests/mysql.test.ts)                                                                                 | Inspect every entity primary/FK column, create related patient/chart/invoice, rename records                                             | Unsigned BIGINT auto-increment primary keys; numeric relationships intact; identities remain stable                         |
| DB-01      | Automated: [database-safety.test.ts](../tests/database-safety.test.ts)                                                              | Pass ordinary/absent database URLs                                                                                                       | Reject unsafe names and never fall back to DATABASE_URL                                                                     |
| CFG-01     | Automated: [deployment-config.test.ts](../tests/deployment-config.test.ts)                                                          | Validate production origins, keys, credentials, proxy/port bounds and TLS flags                                                          | Exact matching HTTPS origins and non-root credentials required; insecure transport needs explicit private-network exception |
| DOM-01     | Automated: [domain.test.ts](../tests/domain.test.ts)                                                                                | Add/multiply money and test invalid quantities/overflow                                                                                  | Exact integer minor units; invalid values reject                                                                            |
| DOM-02     | Automated: [domain.test.ts](../tests/domain.test.ts)                                                                                | Traverse queue states, restore skipped ticket and try invalid jumps                                                                      | Valid lifecycle succeeds; forbidden transitions reject; completed state remains terminal                                    |
| DOM-03     | Automated + real MySQL: [domain.test.ts](../tests/domain.test.ts), [mysql.test.ts](../tests/mysql.test.ts)                          | Match normalized allergies and prescribe known conflicting ingredients                                                                   | Conflict rejects before chart commit; unrelated medications remain allowed                                                  |
| AUTH-01    | Real MySQL/HTTP: [mysql.test.ts](../tests/mysql.test.ts)                                                                            | Anonymous/expired session, wrong branch, missing CSRF, wrong origin and unauthorized chart/document requests                             | 401/403 as appropriate; no protected data or writes                                                                         |
| AUTH-02    | Real MySQL/HTTP: [mysql.test.ts](../tests/mysql.test.ts)                                                                            | Admin changes role modules, removes all ordinary modules and attempts changing ADMIN grants                                              | Immediate server denial; ADMIN retains access; branch membership remains independent                                        |
| AUTH-03    | Real MySQL/HTTP: [mysql.test.ts](../tests/mysql.test.ts)                                                                            | Appointments-only/billing-only/clinical-only staff load dependency references                                                            | Minimal allowed projections work; full patient/inventory routes remain denied; non-doctors cannot sign                      |
| STAFF-01   | Real MySQL/HTTP: [mysql.test.ts](../tests/mysql.test.ts)                                                                            | Create doctor/staff; omit doctor license; deactivate account/self/final administrator                                                    | Valid GP appears immediately; invalid provisioning and unsafe deactivation reject; sessions revoke                          |
| PAT-01     | Automated + real MySQL/HTTP: [patient-identity.test.ts](../tests/patient-identity.test.ts), [mysql.test.ts](../tests/mysql.test.ts) | Register raw/formatted IC; invalid calendar/gender/date, alternate century and passport demographics                                     | Canonical IC/DOB/gender; invalid conflicts reject; explicit passport demographics/address persist                           |
| PAT-02     | Real MySQL/HTTP: [mysql.test.ts](../tests/mysql.test.ts)                                                                            | Lookup 43000, 50000, leading-zero and multi-locality codes; unknown/malformed code and denied module                                     | Correct bundled city/state suggestions; every locality returned; unknown empty; invalid/unauthorized reject                 |
| PAT-03     | Real MySQL/HTTP: [mysql.test.ts](../tests/mysql.test.ts)                                                                            | Register/edit city/address and stale patient version                                                                                     | Unique locality fills missing matching fields; manual values persist; stale edit conflicts                                  |
| ROOM-01    | Real MySQL/HTTP: [mysql.test.ts](../tests/mysql.test.ts)                                                                            | Rename/archive room; attempt during call, consultation or future booking                                                                 | Busy operation conflicts; archive hides room and prevents future assignment; cross-branch edit rejects                      |
| APT-01     | Real MySQL: [mysql.test.ts](../tests/mysql.test.ts)                                                                                 | Submit simultaneous overlapping appointments; cancel with version; rebook                                                                | One conflicting booking succeeds; stale cancellation rejects; cancelled slot becomes reusable                               |
| QUEUE-01   | Real MySQL/HTTP: [mysql.test.ts](../tests/mysql.test.ts)                                                                            | Concurrent check-ins, duplicate patient, room occupancy and display projection                                                           | Distinct ticket numbers; duplicate/occupied conflict; display omits patient identifiers                                     |
| EMR-01     | Real MySQL/HTTP: [mysql.test.ts](../tests/mysql.test.ts)                                                                            | Sign SOAP/Rx, try editing signed chart; roundtrip date-like text/arbitrary vitals                                                        | Signed chart immutable; structured frequency/meal instructions and free text remain intact                                  |
| EMR-02     | Real MySQL/HTTP: [mysql.test.ts](../tests/mysql.test.ts)                                                                            | Read 51 encounters sharing timestamp through paired cursor pages                                                                         | All records exactly once, descending numeric ID ties; role/patient/branch isolation                                         |
| STOCK-01   | Real MySQL: [mysql.test.ts](../tests/mysql.test.ts)                                                                                 | Receive stock; dispense signed Rx across lots concurrently and retry                                                                     | Stock total refreshes; FEFO allocation; no double depletion; expired/insufficient stock rejects                             |
| STOCK-02   | Real MySQL/HTTP: [mysql.test.ts](../tests/mysql.test.ts)                                                                            | Read pending work with draft, signed empty, signed Rx and dispensed encounters                                                           | Only signed nonempty undispensed Rx shown; no SOAP; completion removes work entry                                           |
| STOCK-03   | Real MySQL: [mysql.test.ts](../tests/mysql.test.ts)                                                                                 | Multiple prescriptions with one unavailable medicine; direct negative-stock write                                                        | Whole dispensing rolls back; SQL nonnegative constraint rejects                                                             |
| FIN-01     | Real MySQL: [mysql.test.ts](../tests/mysql.test.ts)                                                                                 | Split tender, mismatched sums, duplicate/changed request keys and concurrent deposit spending                                            | Exact sums; atomic rollback; matching retries reused; changed payload/overspending conflicts                                |
| DOC-01     | Real MySQL/HTTP: [mysql.test.ts](../tests/mysql.test.ts)                                                                            | Issue overlapping MCs, tamper JSON/date columns, verify redaction and revoke                                                             | Protected issuance; overlap conflicts; tamper invalid; redaction/minimal public verification; revoked invalid               |
| NOTIFY-01  | Real MySQL with controlled providers: [mysql.test.ts](../tests/mysql.test.ts)                                                       | Withdraw consent/change contact, enqueue approaching queue twice, leave providers unconfigured                                           | Current consent/contact rechecked; dedup maintained; unconfigured never claimed sent                                        |
| NOTIFY-02  | Automated + real MySQL: [mysql.test.ts](../tests/mysql.test.ts)                                                                     | Render booking ICS/maps and queue estimate below/above five observations                                                                 | Escaped UTC calendar; booking snapshots; insufficient estimate unknown and branch isolated                                  |
| RETIRE-01  | Real deployed-app HTTP: [mysql.test.ts](../tests/mysql.test.ts)                                                                     | Request packages, commissions/policies/payroll and photos; create ordinary GP invoice                                                    | 410 FEATURE_RETIRED; no commission ledger generated                                                                         |
| LEGACY-01  | Isolated historical adapters: [mysql.test.ts](../tests/mysql.test.ts), [domain.test.ts](../tests/domain.test.ts)                    | Exercise retained packages, photo crypto and commission policy/CSV in test harness                                                       | Retained data rules/crypto/branch protection tested; adapters remain absent from deployed GP app                            |
| UPGRADE-01 | Real MySQL: [numeric-migration.test.ts](../tests/numeric-migration.test.ts)                                                         | Apply 001–008, insert historical UUID rows/documents/photos, execute actual 009 helper                                                   | Numeric relationships, Rx/outbox/dedup/audit preserved; HMAC renewed and photos decrypt; sessions/locks cleared             |
| UPGRADE-02 | Real MySQL: [numeric-migration.test.ts](../tests/numeric-migration.test.ts)                                                         | Tamper signature/date column or use wrong photo key before conversion                                                                    | Abort before schema mutation; historical IDs/sessions remain intact                                                         |

Browser cases use fictional records in a disposable browser database. They are recorded manual/CLI evidence, not automated CI tests.

| Case ID  | Mode / action                                                                                | Expected acceptance                                                                  | Recorded boundary                                                                          |
| -------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| UI-01    | Browser: sign in, visit desktop/mobile, scroll sidebar and open guide                        | No runtime errors, no horizontal overflow, visible navigation/account controls       | Local Windows/browser evidence only                                                        |
| UI-02    | Browser: create GP/room, register IC/postcode patient and book appointment                   | New practitioner/room immediately selectable; identity/locality correct; IDs numeric | Fictional disposable fixtures                                                              |
| UI-03    | Browser: receive 20 units, sign twice-daily after-meals Rx and dispense six                  | Stock changes 20→14; instructions retained; pending work completes                   | Real local API/MySQL; no external pharmacy integration                                     |
| UI-04    | Browser: issue MC/PDF, verify certificate, complete split payment and receipt                | Valid PDF and minimal verification; receipt accessible to permitted staff            | Local rendering and declared tender; no bank settlement proof                              |
| SMOKE-01 | Local production mode using non-root DML account: health/index/JS and anonymous patient read | 200 for health/assets; 401 for anonymous patient request                             | Passed locally; HTTPS cookie login and remote DB TLS not established                       |
| HOST-01  | Render free demo: health, HTTPS sign-in simulation, tab refresh/reset and workflow checks    | Fictional fixtures work per tab; reset restores seed; no hosted clinical database    | Not established by local tests; verify after deployment                                    |
| HOST-02  | Live provider delivery and backup restoration                                                | Approved provider acceptance/receipt, consent and successful isolated restore        | Provider delivery remains unverified; local backup/migration rehearsal recorded separately |

The suite does not certify healthcare regulation, formal penetration testing, arbitrary drug interactions, bank settlement, live WhatsApp/email delivery, hosted TLS or production disaster recovery. Retired modules are retained historical test targets only. Offline postcode coverage is a bundled reference, not live postal verification.

## Free demo and migration checksum cases

Guided-tour browser cases (fictional demo only):

| Case ID | Mode / action                                                                                 | Expected acceptance                                                                                                             | Recorded boundary                                                              |
| ------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| TOUR-01 | Browser: advance all six patient steps at 1440×900, 390×844 and 320×844; Back and Escape      | Actual anchors visible; card stays within viewport without target overlap or horizontal overflow; close restores launcher focus | Local Chromium demo evidence                                                   |
| TOUR-02 | Browser: fill an unsaved name, navigate tour steps and close; inspect simulated business rows | Draft retained; no record created or saved by tour                                                                              | Simulation only; no real MySQL writes                                          |
| TOUR-03 | Browser: follow remaining workflows, GP clinical steps and nurse/GP guide topic lists         | Appropriate anchors available; unauthorized administration tour cannot launch                                                   | UI filtering supplements real server permissions, does not prove authorization |
| TOUR-04 | Browser: focus highlighted search and switch branch                                           | Focus moves to actual control; branch switch closes tour                                                                        | Browser lifecycle checks                                                       |

These demo cases exercise browser simulation only. They do not replace MySQL, authentication, certificate or provider evidence above.

| Case ID     | Executable source                  | Acceptance                                                                                                                                                                                                            | Limit                                                                               |
| ----------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| DEMO-01     | `tests/demo.test.ts`               | Independent session stores isolate edits; tab refresh retains its state; reset restores fictional fixtures and clears simulated sign-in                                                                               | Browser-session storage only; no durable/shared clinical database                   |
| DEMO-02     | `tests/demo.test.ts`               | Malformed JSON and incomplete state recover to the seed; bad simulated login and denied modules reject                                                                                                                | Workflow demonstration, not server authentication/authorization                     |
| DEMO-03     | `tests/demo.test.ts`               | Numeric patient/appointment CRUD, branch projection, stale versions, overlaps and IC/postcode behavior match the simulated contract                                                                                   | Does not establish real transaction isolation                                       |
| DEMO-04     | `tests/demo.test.ts`               | Structured Rx remains immutable; failed dispensing restores every stock change; successful retry does not deplete twice                                                                                               | Simulated memory rollback; real MySQL concurrency is tested separately              |
| DEMO-05     | `tests/demo.test.ts`               | Mismatched tender commits no invoice; matching repeated key reuses simulated invoice                                                                                                                                  | No bank settlement                                                                  |
| DEMO-06     | `tests/demo.test.ts`               | Normal API mode uses fetch; static demo health reports database=false; clinical API/PDF requests return unavailable                                                                                                   | No clinical API, real PDFs, QR signatures or provider delivery in demo              |
| DEMO-07     | `tests/demo.test.ts`               | Every default account accepts exactly `demo`, rejects the former fourteen-zero password, and upgrades unchanged stored defaults without losing records                                                                | Public fictional accounts only; changed passwords remain untouched                  |
| DEMO-08     | `tests/demo.test.ts`               | Four plausible fictional patient names retain consistent first/last names, IC-derived birth date/sex, synthetic identity markers, reserved contacts, future booking times, and linked signed prescription/payment IDs | Browser fixtures only; no real identities, licences, payments or treatment guidance |
| CHECKSUM-01 | `tests/migration-checksum.test.ts` | LF/CRLF SQL/helper combinations share canonical identity and accept legacy checksums                                                                                                                                  | Only newline conversion is compatible                                               |
| CHECKSUM-02 | `tests/migration-checksum.test.ts` | SQL/helper content edits never match applied checksums                                                                                                                                                                | Applied content must remain immutable                                               |

## Reservation, supply and clinical-search cases

| Case ID   | Executable source                                                                   | Acceptance                                                                                                                                                       | Limit                                                                |
| --------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| HOLD-01   | `tests/mysql.test.ts`                                                               | Signing three units from 100 preserves physical 100, holds three and exposes available 97; concurrent same-key dispensing consumes once                          | Real isolated MySQL transactions                                     |
| HOLD-02   | `tests/mysql.test.ts`                                                               | Drafts hold nothing; failed multi-item signing leaves draft, notifications and all holds unchanged; competing signing has one winner                             | New signing requires free eligible medication stock                  |
| HOLD-03   | `tests/mysql.test.ts`, `tests/demo.test.ts`, `tests/demo-workflows.test.ts`         | Failed expiry dispensing restores holds; fresh batch fulfills Rx while expired physical stock stays intact; imported no-hold prescriptions still dispense safely | Historical no-hold fixtures are explicitly marked                    |
| SUPPLY-01 | `tests/mysql.test.ts`, `tests/demo-workflows.test.ts`                               | Non-medication may have no expiry; scoped usage decrements once, rejects changed retry payload and prevents medication bypass                                    | Medication requires expiry and signed dispensing                     |
| SEARCH-01 | `tests/mysql.test.ts`                                                               | Exact patient/reference and consultation search finds an older target behind 201 newer records; medicine-name pending search excludes SOAP and other branches    | Blank/broad lists remain bounded to 200; no claim of full pagination |
| SEARCH-02 | `tests/mysql.test.ts`, `tests/demo-workflows.test.ts`                               | Inventory search/category execute before list limit, invalid category rejects, other branch stays isolated                                                       | Server-side filters; does not establish database-scale performance   |
| MC-02     | `tests/mysql.test.ts`, `tests/demo-workflows.test.ts`, `tests/clinic-dates.test.ts` | Unsigned MC rejected; signed MC end date inclusive; simulated overlap rejects; new-form Malaysia 17:00 cutoff selects date correctly                             | Demo document remains unsigned and cannot issue a real PDF/QR        |
| BP-01     | `tests/blood-pressure.test.ts`, `tests/mysql.test.ts`                               | BP syntax and positive whole-number SYS greater than DIA enforced; unusual ordered readings roundtrip with arbitrary vital keys                                  | Range warning is not diagnosis; no clinical validity claim           |

| Case ID      | Executable source                                            | Acceptance                                                                                                                                                                                           | Limit                                                                                                |
| ------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| DOC-03       | `tests/mysql.test.ts`, `tests/document-renderer.test.ts`     | Safe preview omits raw payload/hash/token; redaction applies to preview and actual PDF; tamper rejects; inline/default and explicit attachment headers; branch/role isolation                        | Real guarded database; does not establish hosted certificate delivery                                |
| DOC-04       | Manual Poppler inspection, `tests/document-renderer.test.ts` | One-page MC plus five-page long-word referral render without clipping; continuation headers and doctor/QR footer readable                                                                            | Fictional ASCII fixtures; no copied logo/signature                                                   |
| RX-LOG-01    | `tests/mysql.test.ts`, `tests/demo.test.ts`                  | Actual prescribed/reserved/released/dispensed quantities, actor/time/batch; numeric frequency retained; historical unreserved and expired-hold paths; completed history remains accessible           | Clinic activity is separate from patient-taking reports                                              |
| DOSE-01      | `tests/mysql.test.ts`, `tests/demo.test.ts`                  | Fractional TAKEN and null MISSED require explicit source; normalize offset time; reject invalid/future/non-Rx/unsigned records; retry replays and mismatch conflicts; newest first; no stock effects | Reported/observed events do not prove adherence; latest 500 records                                  |
| DOSE-02      | `tests/mysql.test.ts`                                        | Clinical-only read; anonymous/inventory/foreign branch denied; ADMIN cannot write; nurse needs clinical grant, then can record/read                                                                  | Server permission evidence, not UI-only filtering                                                    |
| DEMO-09      | `tests/demo.test.ts`                                         | Redacted unsigned preview preserves issuance identity after edits, revocation visible, prior-session missing fields upgraded without reset; taking reports survive reload                            | Session simulation only, no PDF/signature                                                            |
| LETTER-UI-01 | Named Chromium `letterdoseqa`                                | In-page sample preview before any download, DD/MM/YYYY/employer/Withheld, 390/320px fit; Taken0.5/Missed visible after reload; dispensing refreshes same selected activity log                       | Local fictional demo; initial equal-ID history and duplicate-key defects resolved by focused recheck |

| Case ID  | Executable source                                                 | Acceptance                                                                                                                                                                     | Limit                                                                         |
| -------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| CAT-01   | `tests/mysql.test.ts`, `tests/demo.test.ts`                       | ADMIN edits catalog; CSRF/branch/role denied; full PUT required; label bounds enforced; stale version rejects; active references exclude archived entries                      | Empty catalogs retain legacy free text; configured lists constrain new labels |
| CAT-02   | `tests/mysql.test.ts`, `tests/demo.test.ts`                       | Active lab/specimen choices govern issuance; renamed/archived choices cannot rewrite prior document snapshots                                                                  | Clinical records remain practitioner-controlled                               |
| CAT-03   | `tests/mysql.test.ts`, `tests/demo.test.ts`                       | Client medicine metadata overwritten by actual catalog; used unit/category/ingredient immutable; archived items block new Rx but signed work dispenses with recorded name/unit | Archiving does not discard existing physical stock                            |
| CAT-04   | `tests/mysql.test.ts`                                             | Medication search finds target behind 201 alphabetically earlier items; default choices active-only; explicit historical lookup includes archived; branch stays isolated       | Broad list capped at 200; no scale/performance claim                          |
| PHONE-01 | `tests/mysql.test.ts`, `tests/demo.test.ts`, Chromium `catalogqa` | Passport foreign address/postcode and formatted +44/+64 phone roundtrip unchanged; more than 50 characters rejected; 320px registration saves and reloads complete +44 contact | String support and UI behavior, not external telephone reachability           |
| PHONE-02 | `tests/phone-input.test.ts`, Chromium `phoneqa` | Malaysia default, optional blank contact, country-code composition, pasted prefix detection, Other country entry, formatting retention and 320px layout | Existing schema and API phone contract retained; no telephone ownership check |

SECTION-UI-01: Named Chromium sectionqa verifies every section in eight multi-task modules shows exactly one region; admin/patient/appointment/checkout drafts survive section changes. At 320px all section controls meet 44px height and pages have no horizontal overflow. Inventory walkthrough opens Receive stock from another section. Evidence covers fictional browser simulation; real API/database regressions remain in the 290-case suite.

SETTINGS-02: Real/admin-demo cases verify branch/staff renames, optimistic versions, current/home/final-branch guards, active branch authentication, staff restoration constraints, unused-room deletion, historical-room archival, upcoming/busy room conflicts, scopes, CSRF and audit. Browser verifies branch rename/remove/restore and unused-room removal with visible list changes.

RECEIPT-01: Real HTTP tests verify billing/auth/branch access, safe DTO, original snapshot after master edits, exact payments, inline PDF and explicit attachment. Renderer tests verify MYT date rollover, snapshot metadata precedence, one-page ordinary PDF and bounded long-item pagination. Demo tests verify labeled preview, stable new snapshots and legacy fallback. Browser verifies in-page preview, no demo PDF link/download and 320px fit.


## Workflow refinement cases

| Case | Expected result | Evidence |
| --- | --- | --- |
| Patient ID defaults/profile | Ascending numeric IDs; row opens full identity, contacts and address | Fictional browser |
| Nationality/phone | Country cell stays fixed; calling prefix visible and submitted once | Desktop/320px browser |
| Booking date/removal | Today/future MYT only; scoped version check; attended protected; soft removal audited | Actual MySQL/shared/demo tests and browser |
| Clinical grouping/selection | One loaded patient group; paginated full history; explicit record unlock; fresh creation | Fictional GP browser and scoped API tests |
| Inventory ingredient/ID | Medication required; supplies/retail optional; ID defaults; historical archive allowed | Actual MySQL/demo tests and browser |
| Clinic name | Admin-only optimistic update; new receipt identity; old snapshots preserved | Actual MySQL/demo tests |
| Guide/navigation | Reports UI absent; real tabs/functions circled; disabled tools stay locked | Desktop/320px browser |


## HCI acceptance cases

| Case | Expected | Verification |
| --- | --- | --- |
| Entry controls | One task tab; contextual submit remains | Admin browser |
| Patient-first consultation | No records before selection; selected history; switching clears tools | Admin/GP browser |
| Stock catalogue | Secondary metadata collapsed; Default ID direction editable | Browser/list-controls tests |
| GP registration | Required only for DOCTOR; other payloads null | Browser/source contract |
| Popup consent | Cancel/Escape no write, drafts retained; Confirm commits; focus stays modal | Desktop/320px browser |
| Help | Header launcher present; sidebar guide absent | Browser |


## Simplified queue and tab cases

| Case | Expected | Evidence |
| --- | --- | --- |
| Waiting patient room call | Enabled entry; targeted required room/doctor choices; no extra triage click | Domain/MySQL/demo/browser |
| Invalid room call | Scope, occupancy and version guards; no partial change | Actual MySQL and demo |
| Permission-limited receptionist | No appointment navigation/help; direct route restricted | Fictional browser |
| Section switching | Single visible area; no forced scrolling; drafts mounted | Browser/source |
| Phone call form | No page overflow; available/occupied options explicit | 320px browser |


## Queue expiry and handoff cases

| Case | Expected | Proof |
| --- | --- | --- |
| Exact 12h boundary | At cutoff mark/audit once; 1ms before still active | Guarded MySQL/demo fake clocks |
| Recheck-in | Active duplicate clear 409; stale visit permits new ticket; concurrent one winner | Actual MySQL/demo |
| Expired occupancy | Old room released; other branch untouched; old status/chart retained | Actual MySQL/demo |
| Midnight | Recent prior-date visit remains active until cutoff | Actual MySQL/demo |
| GP suggestions | Assigned branch/doctor only; clinical-only GP permitted | Actual API/demo |
| Linked save | Patient/GP/expiry checks; failed save does not start; concurrent one encounter | Actual MySQL/demo |
| Existing draft | Resume linked encounter; edits after operational expiry; association immutable | Actual MySQL/demo |
| Nurse handoff UI | GP prefilled suggestion, no manual reentry; popup consent; context cancel preserves SOAP | Fictional desktop/320px browser |


## Multiple prescription and signing cases

| Case | Expected | Evidence |
| --- | --- | --- |
| Multiple medicine rows | Independent values and stable neighbors; blank rows skipped | Desktop/320px browser |
| Draft resave | Recorded list remains unchanged without new selections | Browser/demo/MySQL |
| Create or save SIGNED | All holds reserved and linked queue advances atomically | Actual MySQL/demo/browser |
| Second medicine unavailable | No chart/hold/queue partial commit | Actual MySQL/demo |
| Zero medicines | Linked queue advances; no dispense work without medicine | Actual MySQL/demo |
| Expired/advanced/unlinked | No queue resurrection, regression or unrelated visit change | Actual MySQL/demo |
| Signed note | Row editing/addition disabled | Browser |


## Draft and reset cases

| Case | Expected | Evidence |
| --- | --- | --- |
| Compact history | Collapsed controls, bounded list; full note unchanged | Desktop/320px browser |
| Draft removal | Author/version/scope/CSRF checks, retained row/audit; no queue/stock change | Actual MySQL/demo/browser |
| Signed removal | No UI action; API refuses, dispensing remains valid | Actual MySQL/demo/browser |
| Reset privilege | Ordinary Admin cannot reset/grant; live explicit capability required | Actual API/demo/browser |
| Reset consent | Exact phrase+current password+ack; no Enter/cancel submission | Actual API/demo/browser |
| Reset failure | Wrong credentials/unknown schema/non-InnoDB/failing defaults leave data | Guarded MySQL/demo |
| Global reset | All tenants cleared; only defaults/audit restored; old sessions invalid | Disposable MySQL/demo only |
| Identifier continuity | New entities use larger IDs; migrations retained | Actual MySQL/demo |

## Synchronized handoff regression cases
| Case | Expected result |
| --- | --- |
| Clinical-only GP reads medication reference | Live available/on-hand/reserved counts; stock mutations and billing remain unauthorized |
| Signed linked multi-medicine consultation | All reservations succeed atomically; DISPENSARY_WAITING and pending prescription suggestion |
| Signed linked no-medicine consultation | PAYMENT_WAITING and billing suggestion without a dispense |
| Dispense and retry | Physical stock deducted once, reservation fulfilled/released, PAYMENT_WAITING once |
| Linked invoice and retry | Matching signed patient/GP only; medicines already dispensed; one invoice, COMPLETED once |
| Duplicate invoice with another key | 409; no second payment/invoice |
| Expired queue handoff | Historical dispensing/billing available; expired visit stays expired |
| Browser default sections | Dispense medicines and Patient checkout first/default |
| Prefilled checkout / change visit | Authoritative patient and GP; suggested editable medicine prices; consent before discarding edited charges |
| Phone prescription history | Bounded compact list, expandable filters, no page overflow |
| Live refresh during editing | New reference/suggestion data; unsaved form inputs preserved |

Checkout scroll: Prepare checkout positions the form below sticky navigation on desktop and phone; repeat selection preserves edits and scrolls again; reduced-motion uses immediate scrolling.

Full payment: disabled for zero invoice; exact cent total filled; chosen method/reference retained; split replacement cancel preserves all entries, confirm leaves one full allocation; no invoice issued before checkout; usable at 320px.

## Deposit retirement and appointment arrival cases

| Case | Expected result |
| --- | --- |
| New deposit or balance request | 410 FEATURE_RETIRED, no money mutation |
| New DEPOSIT checkout | Rejected, old balances unchanged |
| Historical deposit receipt | Preview/PDF still readable |
| Booking | No room input; roomId rejected; GP conflicts retained |
| Due Malaysia appointment | Suggested under queue permission; future/previous-day/canceled/checked-in excluded |
| Confirm scheduled arrival | One waiting ticket with booked GP and null room; appointment CHECKED_IN |
| Cancel arrival consent | No ticket/status mutation |
| Concurrent/stale/foreign arrival | One success at most; guarded failure with no duplicate ticket |
| Malaysian patient forms/profile | Country box visible/grey/disabled with Malaysia; MY retained; stable field positions; profile country omitted |
| Non-Malaysian forms/profile | Country selection/value shown |

## Registration/search acceptance

| Case | Expected result |
| --- | --- |
| Patients primary Register patient | Opens registration and scrolls; current new draft remains |
| Check-in Register patient shortcut | Authorized staff open registration directly; no link for queue-only staff |
| Malaysian/foreign country switch | Visible disabled Malaysia box versus enabled foreign selection; nationality toggle stays editable |
| Search John in patient directory | Matching name/ID/identity/phone choices; selecting opens correct profile |
| Search patient in appointment/check-in | Selected numeric patient ID populated |
| Search medicine/prescription/stock | Relevant authorized choices shown and selected |
| No match or pending/error response | Explicit feedback; stale choices hidden |
| Arrow keys/Enter/Escape | Select/dismiss; never submit the surrounding form |
| Phone dropdown | Bounded choices; no horizontal page overflow |

## Daily queue and temperature regressions

| Case | Expected result |
| --- | --- |
| Ten tickets today including final/expired | Ten visible and visitsToday=10; expired rows read-only |
| Malaysia midnight | Previous day's live list/count zero, history retained, room/patient locks released |
| Repeat expiry cleanup | One expiry audit/version change, no deletion |
| Previous signed dispense/checkout | Still allowed; expired queue never revived |
| New day first ticket | Q-001, new increasing numeric ID |
| Temperature28 or40 | Accepted by form/API |
| Temperature27.9/40.1/nonfinite/nonnumeric | Save rejected; no new consultation mutation |
| Temperature omitted/blank | Accepted |

## Anonymous waiting-room display cases

| Case | Expected result | Evidence |
| --- | --- | --- |
| Read branch listing without cookie | Only active `{id,name,clinicName}` branches | Guarded real MySQL/HTTP |
| Supply conflicting staff branch header | Explicit query branch wins; no other branch tickets | Guarded real MySQL/HTTP |
| Inspect anonymous queue | Exact `{ticketNumber,status,roomName}` fields; no private data | Guarded real MySQL/HTTP |
| Prior-day/completed/expired tickets | Absent from public waiting projection | Guarded real MySQL/HTTP |
| Missing/malformed or unavailable branch | 400 for malformed input; 404 for unavailable branch | Guarded real MySQL/HTTP |
| Read staff queue/display/events without cookie | 401; staff APIs remain protected | Guarded real MySQL/HTTP |
| POST to public queue URL | No public write route; request rejects | Guarded real MySQL/HTTP |
| Open `/display`, select branch, wait | No login prompt; refresh every 15 seconds | Browser acceptance |

## Custom nationality country cases

| Case | Expected result | Evidence |
| --- | --- | --- |
| Choose Others and enter padded label | Trimmed countryName saved with OTHER and rendered on profile | Shared/demo + MySQL/HTTP |
| Missing/blank/over100 custom name | Validation failure; no patient write | Shared/demo + MySQL/HTTP |
| Edit/reload custom-country patient | Name retained; legacy payload omitting both country fields preserves it | Demo + MySQL/HTTP |
| Replace Others with ISO country or Malaysian/MY | countryName becomes NULL | Shared/demo + MySQL/HTTP |
| Set SQL NULL country with nonnull name | Database consistency check rejects | Guarded MySQL |
| Existing foreign record without country | Unknown remains supported for legacy input; no inferred country | Shared/MySQL regression |
