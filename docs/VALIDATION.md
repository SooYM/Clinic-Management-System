# Implementation validation

## QR receipt follows live visit progress — 2026-10-15

The receipt previously returned registration approval only, so ACCEPTED always rendered as waiting even after room calls and later transitions. Accepted receipts now project the exact scoped linked queue's current stage and call/consultation room. The client distinguishes approval from visit progress, clears old room labels after consultation, and permits confirmed new registration after completion/expiry. No schema migration or live clinical mutation is required.

All 492 tests across 33 files passed, including scoped real MySQL lifecycle/privacy cases and 29 focused presentation/renewal cases. Production and demo builds, TypeScript and formatting passed. Automated checks cover every queue stage, changed rooms, skip/undo, read-derived expiry without queue mutation, completed-history retention, repeated ticket numbers, mismatched patient linkage and exact public response fields.

Real MySQL browser acceptance verified an actual staff UI room call appearing on the anonymous 390px ticket page through normal 10-second polling, without manual refresh. Subsequent real queue-transition API calls automatically rendered consultation with room, dispensary, payment and completion; these later checks did not repeat the full clinical/dispensing/invoicing workflow. Old room details disappeared after consultation. Completed-visit new-registration cancel/confirm, skip/undo and a 13-hour-old visit's derived expiry passed. Layout fitted 390px and 1440px. SQL verified unchanged ACCEPTED registration state, durable linked queue history, exact seven-field public responses without patient identifiers, cleared terminal room labels and completed-history retention. The owned browser/server closed, guarded disposable database removal was verified, and port3110 was released with lifecycle logging. Live user data was not used for workflow testing; the configured frontend-proxied health endpoint remained healthy. Physical phone networking and Render deployment were not verified.

## Environment loading before MySQL pool creation — 2026-10-15

The QR cleanup import preceded `dotenv/config` in the API entrypoint, causing `db.ts` to create its pool from the localhost3306 fallback before `.env` supplied MySQL3310. An isolated process reproduced the wrong pool port through the API entrypoint, transitive registration service and direct database import. The database module now loads configuration before pool creation, and the entrypoint loads it first. Explicit environment database URLs retain precedence.

All 459 tests across 32 files passed, including four isolated process regressions and guarded real MySQL workflows. TypeScript and changed-source formatting passed. The existing user watcher recovered API3101 automatically; both direct and frontend-proxied health requests returned200 with live MySQL connectivity. A fresh anonymous browser rendered the login page, received expected401 from auth/me, and observed no API5xx/proxy errors. No sign-in or live clinical data mutation was performed. The owned browser closed; user processes remained running. Readiness was recorded in the shared port lifecycle log. No port, credential, migration or database content change was required.

## QR registration and reception confirmation — 2026-10-15

All 455 tests across 31 files passed. Production/demo builds, TypeScript, formatting, migration checksums and documentation links passed. Guarded real MySQL cases cover simultaneous QR/counter allocation, exact retry, scope/module/CSRF checks, explicit existing-patient linkage, no profile overwrite, expiry/payload clearing and midnight insertion rollback. The demo adapter is tested separately as simulation.

Real backend browser acceptance enabled branch QR settings, opened an anonymous 390px registration form, submitted fictional demographics, and immediately displayed reserved Q-001 while excluding it from operational queues. Reception identity verification activated that same Q-001; the patient receipt updated to accepted, and staff called it into Room 1 with a GP. Rejection, explicit new-submission cancel/confirm, expired receipts, phone-width layout and unauthorized-review 403 checks passed. SQL assertions verified durable reservation/patient/queue linkage and clearing of accepted/rejected/expired payloads; existing-profile confirmation required explicit linkage and retained the profile unchanged. Browser selectors needed adjustment; no product bug was found. The disposable database was removed, browser closed, owned server stopped and port3110 released with lifecycle logging.

Migration025 followed a guarded local backup and preserved every pre-existing table's row count. The schema now has 33 tables, 27 numeric entity IDs and 25 applied migrations. No synthetic clinical rows were added to the live clinic database. Local MySQL and the existing Vite process were running, but the user's existing API watcher had no 3101 listener; restart that dev terminal with Ctrl+C then `webapp clinic`. The user-owned watcher was not replaced. Physical phone camera scanning, external HTTPS routing and Render deployment remain unverified. The browser demo cannot coordinate registrations across devices.

## Editable billing categories — 2026-10-15

All 442 tests across 30 files passed, including guarded MySQL category permissions, scope, archival, default-marker rename and historical idempotency cases. Production and demo builds passed. Real MySQL browser acceptance created/renamed/reordered/archived/restored a category, selected it during an actual fictional MYR25 checkout, previewed the receipt, verified the stored historical category after rename, and confirmed five audited catalogue changes. A billing-only account could read choices and received 403 on admin writes. The 390px layout fitted without horizontal overflow. Product default-marker autocharges were covered by code/API checks, not browser acceptance. Disposable browser databases, sessions and owned server were cleaned up. Migration024 followed a local backup; all prior rows remained across 32 tables and 26 numeric entity IDs, with 24 migrations applied. Render deployment was not verified.

## Fixed ports and global startup harness — 2026-10-15

The full suite passed 436 tests across28 files. After adding registry checks and asynchronous lifecycle logging, all178 affected MySQL/reset/demo tests passed again. Startup/deployment focused checks, typecheck, production/demo builds, formatting and PowerShell parsing passed. Tests use fixed3110–3114 listeners and guarded disposable MySQL databases; no random application/test port remains.

Actual `webapp clinic` started the existing MySQL data on3310, Express3101 and Vite3100. Authenticated readiness checked server port and real data-directory identity. Real browser actions loaded staff sign-in, proxied healthy API responses and anonymous display branches from MySQL; branch selection survived refresh. Clinic made no requests to Progress3001. Duplicate Clinic launch and occupied Progress3001 were refused without fallback or process termination. Existing Progress3001 browser access and MySQL3307 connectivity were verified without restarting its user-owned app.

A stopped-database cold backup retained configuration and the complete data directory outside Git. Existing Clinic storage has32 tables and23 migrations; the patient data file's SHA-256 matched its pre-change backup. No reset or seed occurred. Verification application processes were stopped; MySQL3310 remained ready. Other applications remained untouched.

Global instructions and `ENGINEERING.md`, a fixed registry, append-only port events, generic launcher and locked atomic registry writer are installed outside the repository. Registry validation permanently protects Progress3001, preserves history and rejects duplicate ownership. Status works with unregistered system listeners. The owner confirmed legacy PHP/MySQL hosting: new-project defaults reflect that target, while existing Node apps require compatible hosting or a separately authorized migration. Docker, actual Exabytes deployment and Render deployment remain unverified.

## Country and list controls — 2026-10-08

- Full suite passed 322 tests across eighteen files with zero skips; actual MySQL used guarded disposable databases.
- TypeScript, normal/demo builds and source formatting passed. Database health remained OK after migration 016.
- A guarded local backup preceded migration 016. Today's baseline confirmed all existing row counts preserved, 32 tables, 26 numeric entity ID tables and sixteen migrations. An initial check mistakenly used the older settings baseline; the current country baseline corrected that verification input.
- Country UI requires selection for foreign patients and keeps phone calling code independent. Chromium inspected the 320px form and verified desktop/phone list search, descending direction and clear/original ordering across eight modules. Populated demo lists were checked separately; no local business records were submitted or changed.
- Schema SQL and dictionary contain no records or allocated sequence values. Render deployment itself is not established by local build/browser checks.

## Phone country dropdown — 2026-10-08

- TypeScript, normal build, demo build and changed-source formatting passed.
- Focused phone-composition and demo regression suites passed 37 tests across two files. This focused gate does not replace the previous full backend suite.
- Chromium `phoneqa` checked Malaysia default, Singapore composition, pasted UK prefix, unlisted Finland entry, missing-plus validation, optional blank phone and desktop/320px page fit. No patient was submitted or changed.
- Impeccable found one pre-existing letter border warning outside the modified phone styles; no unrelated visual changes were made.
- No migration or API property was added. Existing numbers are retained until phone controls change.

Checked on 2026-10-07 against isolated MySQL 8.4.11 on Windows, Node.js 22.14.0.

## Automated evidence

- Latest full gate at 15:53 MYT: `npm test` passed 290 tests across thirteen files with zero skips. Database integration used actual MySQL and guarded disposable databases through migration 014, including nurse-grant and catalog cases. See `TESTING.md` for coverage and dated earlier gates.
- `npm run build`: strict TypeScript checking and production Vite build passed.
- `npm audit`: zero reported dependency vulnerabilities at validation time; this is not a security certification.
- Source formatting uses Prettier; `npm run format:check` is the reproducible check.

Concurrency and isolation coverage includes appointment conflicts, FEFO stock allocation, deposit spending, retained historical package redemption, duplicate checkout, document issuance, branch and role boundaries, signed-record immutability, retained historical photo consent/encryption, notification leases, clinical JSON/text roundtrips, and patient-history cursor pagination.

## Browser evidence

Playwright CLI exercised actual browser forms against the local API/database with fictional records:

- Staff sign-in; desktop and mobile layouts.
- Queue call into a practitioner room; waiting-room projection excluded patient identity.
- Patient registration and appointment booking.
- Signed SOAP encounter and prescription creation.
- MC issuance, `%PDF` document generation and minimal public verification.
- Split cash/card invoice creation and authenticated receipt retrieval.
- FEFO dispensing of the signed prescription and patient-specific encounter history display.
- Patient demographic editing with version checks; browser response 200 and no JavaScript runtime errors.

Screenshots are local development evidence under `.local`; they contain synthetic patient records and are excluded from source control.

## Earlier reset, table viewer and sidebar evidence

At the earlier reset checkpoint, all 17 clinical/business tables were checked empty. That checkpoint retained one administrator, one clinic, one branch, three rooms and five migration records; subsequent migrations and entered records supersede these historical counts. Fresh sign-in and read audit/session rows are expected. Sample staff accounts were removed.

The local viewer inspected all 27 table counts against MySQL. Anonymous/incorrect-password requests returned 401, invalid table names returned 404, and invalid page bounds returned 400. Pagination and column metadata matched the database. An actual INSERT attempt by its SELECT-only account was denied; it created no data. Browser rendering was verified using the empty patients table.

Desktop sidebar remained at y=0 before/after scrolling. Account footer stayed visible at 1100×550; mobile drawer worked at 390×844 without horizontal overflow.

Production mode was started locally with a dedicated non-root account granted only SELECT/INSERT/UPDATE/DELETE. Database health, built frontend and JavaScript asset returned 200; anonymous patient access returned 401. This exercises the production application on local HTTP for smoke checks; it does not verify HTTPS ingress, secure-cookie browser login or a remote TLS handshake.

Automatic approval review blocked recursive deletion of unused legacy PostgreSQL files and old sample artifacts under `.local`. These remain outside the active MySQL database and deployment image. See `DATABASE_ACCESS.md` for reset scope and inspection instructions.

## Operational boundaries

SMTP and WhatsApp adapters were tested using controlled provider boundaries, not live credentialed delivery. Configure provider credentials, approved templates, sender identity and patient consent before testing actual acceptance/delivery. Commission and payroll workflows are retired.

Docker/Compose artifacts were not executed because Docker was unavailable on this host. Production HTTPS, database TLS, deployed database grants, remote backup recovery, monitoring, retention policy and clinic acceptance require deployment validation. Local backup restore and migration rehearsal passed. The requirement ledger in `REQUIREMENTS.md` records implementation boundaries and remaining benchmark enhancements.

## Numeric upgrade and final browser checks — 2026-10-07

All 202 tests passed with zero skips, including four real MySQL historical-migration cases. Typecheck, production build, formatting and production-dependency audit passed; audit reported zero vulnerabilities.

The active database was backed up to ignored `.local/pre-numeric-backup.sql`, restored into an isolated database, and upgraded successfully before applying migration 009 to the active database. All 22 entity `id` columns now use `BIGINT UNSIGNED AUTO_INCREMENT`; nine migrations are recorded. Existing records entered after the earlier reset remain intact. Health and authenticated read-only table viewer returned 200. Sessions were invalidated for fresh sign-in.

Production-mode smoke checks were repeated after numeric migration with a non-root DML-only database account: health, built frontend and JavaScript asset returned 200; anonymous patient access returned 401. Existing clinic records were preserved.

Fresh disposable browser fixtures confirmed numeric staff IDs 2–4, room ID 4, patient ID 1 and medication ID 1. Room customization, role module access, GP auto-registration, IC formatting/gender/birth date, postcode 43000 → Kajang/Selangor and searchable appointment booking passed. Receiving stock refreshed quantity to 20; signing a prescription and dispensing six units refreshed it to 14. Medication instructions retained twice daily and after meals. Disabled-module access returned 403; guide/mobile rendering passed without JavaScript runtime errors. Synthetic fixtures were created only in the disposable browser database.

## Version 2 publication review

Release source review found no private-key or provider/cloud/GitHub credential-token candidates in the scanned source/configuration/documentation. Environment files, `.local` database backups, local browser artifacts, dependencies and build outputs were excluded. Synthetic test credentials and CI MySQL service credentials are separate from deployment credentials. Initial source review preceded Git metadata setup. Final staged review inspected 121 added/modified source files and all 121 tracked paths: no private environment files, local databases/backups, built bundles, dependencies, browser artifacts or binary exports were tracked. No credential-token/private-key or personal workstation-path candidates were found. The generated schema reference contains no row INSERT/REPLACE statements or current auto-increment counters. Repository history was not certified by this source-tree review.

CI provisions MySQL 8.4, sets guarded TEST_DATABASE_URL and runs formatting, strict TypeScript/normal/demo builds, demo artifact isolation, all tests and the production dependency audit. Both clinical and migration suites use real disposable MySQL databases. Migration 009 invokes the numeric helper; the migration runner checksum includes helper source. Final Version 2 automated baseline is 223 passing tests across nine files, zero skips. Historical package/commission/photo adapter coverage does not enable their retired deployed endpoints.

The release gate establishes local source, test and build evidence; it does not establish hosted deployment. The free Render blueprint serves a browser-session simulation with fictional fixtures, without hosted MySQL or real clinical API/security/PDF/provider functionality. Hosted startup and HTTPS behavior still require deployment checks. Local MySQL evidence remains separate from the demo.

The local MySQL database was not preloaded by demo work. Only the separate demo build bundles fictional walkthrough fixtures; each browser session stores its own simulated state. Reset restores those fixtures. LF/CRLF migration checksum compatibility preserves legacy Windows/Linux checksums while still rejecting SQL/helper content edits.

Final local release gate at 12:36 MYT passed 223/223 tests across nine files with zero skips, formatting, both builds and production dependency audit (zero vulnerabilities). Normal build artifacts exclude the browser-demo fixture store; only the demo build includes it. Sixteen demo simulation tests include preloaded fictional workflows, per-session isolation/reset, malformed storage recovery, simulated transaction rollback and static transport refusal of clinical API/PDF requests. Five migration checksum tests confirm newline portability while retaining content-edit rejection. This remains local evidence, not a completed hosted deployment.

Browser checks against the separately built demo visited patients, appointments, clinical workspace, dispensary, billing, reports, administration and guide without runtime errors or backend API calls. Four fictional patients and sample operational records loaded. Refresh retained state; an independent tab started signed out. Browser registration persisted through refresh; dispensing the preloaded prescription reduced stock by its three-unit quantity. Mobile layout had no horizontal overflow. Reset discarded changes and restored the original four patients and pending prescription. `/healthz` returned demo mode with `database:false`; server `/api/patients` returned 503. Waiting-room display opened within the same demo tab and retained its session. No demo record was inserted into the local MySQL database.

Final staged review excluded private environment files, local database/backup artifacts, dependency/build output and browser evidence. Published schema references contain definitions only, without records or allocated auto-increment counters.

## Demo password follow-up — 2026-10-07

Focused demo checks at 13:10 MYT passed 18/18 tests. All five fictional default accounts accept exactly `00000000000000` (14 zeros) and reject the old `demo` password. Existing browser state upgrades unchanged default passwords while preserving records and user-changed passwords. This changes browser simulation only; local MySQL and production credentials remain unchanged. The root agent also recorded a full-suite pass of 225/225 tests across nine files at 13:10 MYT, with zero skips. Guided-tour browser validation follows separately; this test result does not establish its visual behavior.

## Guided-tour browser follow-up — 2026-10-07

Named Chromium session `tourqa` exercised the built demo on local port 3005. All six patient steps found real controls at 1440×900, 390×844 and 320×844, without card overlap or horizontal overflow. Next, Back, Escape, explicit target focus and launcher focus restoration passed. An unsaved first-name draft survived tour navigation and closing; patient count remained four. Switching branch closed the tour.

The other administrator workflows found 29 step anchors; all five GP clinical anchors were available. Nurse and GP topic lists matched their modules, and an unauthorized administration-tour event did not launch. Serialized simulated business rows remained unchanged through all administrator tours. Console reported no errors or warnings. The initial stock-catalogue step overlapped its tour card. The corrected step highlights its actual panel heading; focused rechecks passed at desktop 1440×900 and mobile 390×844 and 320×844, without overlap, missing targets or horizontal overflow. These checks cover local fictional browser simulation, not hosted mobile-device or real database behavior.

## Fictional fixtures and current demo password — 2026-10-07

The current public demo password is `demo`; the fourteen-zero password above describes an earlier revision. At 13:45 MYT, the root agent recorded 19/19 focused demo tests, formatting and normal/demo builds passing. Artifact checks confirmed the normal build excludes the demo store while the demo build includes it. Source review confirmed that only legacy default passwords on original demo accounts are upgraded; custom passwords and stored records remain intact. Fictional patient names, reserved `example.test` contacts, empty phone numbers and synthetic identity markers remain confined to browser fixtures. No MySQL seed or stock-policy changes were made.

A fresh named browser session signed in with `admin@example.test` / `demo`, displayed all four fictional patient names and confirmed five default demo accounts use `demo`. Reload preserved names and sign-in, with zero page errors. This follow-up did not rerun the full suite; the earlier 225-case full-suite result remains dated evidence. GitHub CI is expected to run the full suite after publication; no CI result is claimed here.

## Reservation and clinical-search gate — 2026-10-07

Strict typecheck and the full suite passed 265/265 tests across twelve files at 14:50 MYT, with zero skips. All database scenarios used guarded disposable MySQL databases through migration 012. Tests confirm signing reserves rather than physically consumes medicine (100 eligible units: 97 available, three reserved), racing prescriptions cannot overreserve, drafts reserve nothing, failures roll back chart/holds, and dispensing or retry consumes once. Expired reservations survive failed dispensing; a fresh batch can fulfill without consuming expired stock. Explicit historical prescriptions without holds retain safe concurrent dispensing behavior.

Non-medication null-expiry receipt and scoped idempotent usage passed; medication cannot bypass prescription dispensing. Real HTTP tests reject unsigned MC issuance and malformed BP, retain unusual ordered BP and arbitrary vitals, and issue an inclusive three-day certificate from a signed chart. Server search/category and branch isolation passed. A strengthened focused search case found an older patient and consultation behind 201 newer records through server queries; broad lists still cap at 200. Demo MC/reservation cases establish simulation only. Later build/browser results must be recorded separately; this gate changed no active clinic records or credentials.

The final category-guard recheck at 14:55 MYT passed 267/267 tests across twelve files with zero skips, after strict typecheck. Source review identified that direct requests could prescribe dated supply/retail items; the backend now checks MEDICATION category before chart commit or reservation. Matching real MySQL and demo regressions reject both categories without saved charts, holds or stock changes. This resolves the review finding and supersedes the earlier 265-case gate.

## Updated clinical and inventory browser verification — 2026-10-07

Named Chromium session `workflowqa` exercised a fresh local demo build on port 3005 using fictional data only. SOAP fields occupied separate full-width rows at 1440×900, 390×844 and 320×844; clinical and inventory pages had no horizontal document overflow. Patient search narrowed to Mei Lin Tan and Clear restored all four patients; the clinical patient selector and medicine-name pending-prescription search also narrowed correctly.

Malformed BP `80/120` blocked saving and left encounter count unchanged. Ordered unusual `270/220` displayed a non-diagnostic warning and remained recordable. A draft disabled document issuance; signing enabled it for the attending GP. The new MC date prefilled the Malaysia date, manual date edits survived a search rerender, and issuing produced only a `DEMO-UNSIGNED` simulated certificate with `/demo-unavailable` printing.

The initial medicine fixture held three units from 100 physical units. Signing another four produced 93 available, 100 physical and seven held. Dispensing four then the original three kept available at 93 while physical changed 100→96→93 and holds changed 7→3→0; completed prescriptions disappeared from pending work. A fictional lab coat received ten units without expiry and usage of two yielded eight available/physical units. Its expiry input was optional while medication expiry remained required. Inventory text/category filtering selected only that item. Console recorded zero errors or warnings.

Screenshots were retained only in ignored local artifacts (`workflowqa-soap-320.png`, `workflowqa-stock-desktop.png`). The QA browser was closed; the preview server was left running. These browser results establish demo interaction behavior, not real MySQL transactions, clinical decisions, signed PDF/QR or hosted-device behavior; the separate 267-test gate covers real isolated database rules.

## Document preview and medication-taking gate — 2026-10-07

At 15:33 MYT, strict typecheck and **283/283 tests across thirteen files passed with zero skips**. The guarded clinical database applied migrations 001–013. Seven additional real HTTP/PDF/activity cases, three document/demo cases, three renderer cases and three patient-taking cases extend the earlier 267-case gate. Frequency remains the existing numeric 1–24 field; no new frequency choices were adopted.

Actual authenticated MySQL-backed document tests verify redacted and disclosed diagnosis choices, safe preview fields without raw signed payload/hash/token, immutable issuance snapshots, HMAC tamper rejection, anonymous/role/branch denial, default inline PDF and explicit `download=1` attachment. Prescription activity records prescribed/reserved/released/dispensed quantities, batches, actor and timestamp, including expired and historical no-hold prescriptions. Patient-taking records are separate append-only TAKEN/MISSED reports with explicit source, fractional amount, timezone normalization, retries/conflicts and unchanged clinic stock. Clinical access is required; administrator reads but cannot write. A subsequent focused case passed nurse denial before a clinical grant and nurse recording/read access after that grant; this does not claim another full-suite run. Reads expose the latest 500 dose records by occurrence time.

Actual fictional HTTP-generated PDFs were rendered with Poppler and all six pages visually inspected: one-page MC and five-page referral with long uninterrupted text. Ruled fields, continuation headers, doctor attribution and QR footer showed no clipping or overlap. No reference logo or handwritten signature was copied. Poppler emitted Symbol/ArialUnicode fallback-font notices; no missing glyph was observed in these ASCII fictional fixtures. PDFs and screenshots remain ignored local evidence, not published patient records.

Named Chromium session `letterdoseqa` verified latest local demo on port 3005. Taken 0.5 tablet / patient reported and Missed / staff observed appeared immediately and survived reload. Stock stayed 97 available, 100 physical and three reserved after reports. Issuing MC showed an in-page UNSIGNED DEMO SAMPLE preview with employer, Withheld diagnosis and DD/MM/YYYY dates, with no automatic download or PDF link. Desktop 1440×900 and phone widths 390/320 showed no horizontal page overflow; preview fields wrapped within the screen. History preview retained the document and displayed REVOKED after revocation. Dispensing updated the already selected activity log with its three-unit batch/actor event and retained a completed history option; physical became 97 and reserved zero while available stayed 97. Browser console contained informational React messages only, with zero errors/warnings.

Initial issuance history was stale when first document ID equalled encounter ID. Review also found a duplicate sibling React key during its first fix. The prefixed-key rebuild passed a focused recheck at 15:43 MYT: document1/encounter1 appeared immediately in history, revoking removed the main issuance preview, and console/page errors and warnings remained zero. The QA browser was closed; preview server was left running. These browser checks establish fictional session simulation, not real document signing or hosted behavior; PDF and transaction claims derive from the separate isolated real-server tests.

The root agent recorded a final 283/283 full-suite pass at 15:38 MYT, including the nurse-grant extension, with zero skips. A subsequent browser-only history key fix passed its focused clean-console recheck at 15:43 MYT; no further full-suite result is claimed for that UI key change.

## Administrator catalogs and international phones — 2026-10-07

At 15:53 MYT, **290/290 tests across thirteen files passed, zero skips**, after strict typecheck. Guarded clinical fixtures applied migrations 001–014. Four additional real catalog cases cover administrator/CSRF/branch gates, required full-update fields, bounded labels, optimistic stale versions, archived active references, controlled lab selections, immutable issued documents, medication snapshots, historical dispensing, and search before the 200-choice cap. Two demo catalog cases mirror these workflows; one new demo phone case and the extended real passport case preserve formatted international contacts and foreign addresses. The intentionally changed item-creation permission required ADMIN fixture creation; existing receiving/usage assertions remain executed as GP.

Named Chromium session `catalogqa` exercised the latest built demo. Administrator added, renamed, archived and reactivated a lab panel. GP native investigation choices followed the active list, while an already issued lab preview retained the original archived label. Administrator renamed and archived a medicine; new prescription choices excluded it, existing signed notes retained the recorded medicine name, and dispensing remained available with the original name and batch in activity history. No browser console errors or warnings occurred.

At 320px, a fictional passport patient registered with formatted +44 contact and an overseas postcode/city/state. The tel input exposes maxLength 50 and Malaysian/international guidance; the complete contact saved unchanged and survived reload. No horizontal page overflow occurred. The screenshot was visually inspected and remains only in ignored `.local/catalogqa-phone-320.png`. Browser was closed; preview server remained running. Browser changes stayed within fictional session data.

Root separately reported applying migration 014 locally after backup, retaining existing row counts: 32 tables, 26 numeric entity identifiers and 14 recorded migrations. QA neither changed active clinic data nor applied that migration. Archived stock receipt and supply usage remain permitted for existing physical stock; archiving controls future catalog choices, while recorded work remains usable. These checks establish local behavior, not successful hosted deployment.

## Task sections UI gate — 2026-10-07

The 16:16 MYT regression run passed 290/290 tests across thirteen files, zero skips. Strict typecheck, normal/demo production builds and formatting passed. A later queue UI key preserves the prior successful check-in reset behavior; subsequent builds and formatting passed. No server, API or migration changed.

Named Chromium sectionqa checked all sections across eight modules: exactly one content region visible per selection. Unsaved staff, patient, appointment, checkout and GP note values survived in-module section changes. Clinical selection opened notes and retained patient/allergy context outside sections. Native button/region semantics expose current section; inactive regions use hidden and stay mounted. Inventory walkthrough opened Receive stock automatically from another section. Desktop navigation stayed near the top while scrolling; 320px pages had no horizontal overflow and all section controls measured at least 44px tall. Desktop administration and phone administration/clinical/inventory screenshots were visually inspected. An inherited global nav column style was found and corrected by explicitly setting the shared section navigation direction to row.

Impeccable detector found no changed-page issues. Its full CSS scan flagged an existing prescription-history timeline border outside this layout change; that retained styling was not counted as a new finding. Demo console contained informational/verbose messages only, with no errors or warnings. Browser evidence uses fictional session data. Local live administrator login was checked without changing clinic business records. Draft retention applies within the currently mounted module, not reload or leaving the module. Schema and API remain unchanged; hosted Render behavior is not established by these local checks.

## Settings removal and official receipt gate — 2026-10-07

The final 16:43 MYT full gate passed 305/305 tests across fourteen files, zero skips; strict typecheck passed. Five actual MySQL scenarios cover staff/branch name changes, branch versions and archival protection, active-branch selection/authentication, scoped/CSRF room deletion and busy/upcoming/historical handling, plus receipt projection/PDF/snapshot rules. Seven demo cases cover settings parity, preserved old sessions and receipt metadata. Three renderer cases verify snapshot precedence, MYT midnight rollover, ordinary single-page and long-description PDF completion/pagination.

An earlier combined run had an obsolete demo transition method; the test was corrected to the actual POST transition contract and later full gate passed. One backend direct-service fixture lacked queue priority; the corrected fixture passed its focused new cases. No production/data assertion was removed.

Migration015 was applied locally after a guarded schema/data backup. All baseline table row counts were retained:32 tables,26 auto-increment numeric entity IDs,15 recorded migrations. It adds active/version/update fields for branches and nullable receipt snapshots; old invoices and branch rows remain intact. Local health and actual administrator authentication returned200 afterward.

Named Chromium settingsqa verified fictional branch create/rename/remove/Show removed/restore, and creation/removal of an unused room. Receipt preview showed OFFICIAL RECEIPT from actual demo values, did not download automatically, and exposed no PDF link in demo. Desktop and320px preview layouts were inspected, with no horizontal page overflow. Initial mobile amounts wrapped within digits; a bounded CSS fix keeps amounts unbroken. Preview activation now scrolls into view below sticky controls. Console contained informational/verbose messages only, zero errors/warnings.

Actual PDFs were generated from fictional renderer inputs and converted/rendered for inspection: one normal page and seven long-description pages. All eight pages were inspected; rows, totals and cashier footer remained visible with no clipping. Continuation-row font inheritance and a redundant fee heading on the totals-only page were corrected; affected continuation/last pages were inspected again. No source clinic logo, company-registration data, unmodeled SST/discount or cashier identity was copied. Poppler emitted Symbol/ArialUnicode display-font notices, with no missing glyph observed in these ASCII fixtures. Artifacts remain ignored local evidence.

Final builds and formatting passed after display refinements; demo fixtures remained excluded from normal assets. Browser demo checks do not establish real payment settlement or successful hosted Render deployment. New checkout snapshots preserve receipt identity/cashier metadata; legacy invoices retain current-record/audit fallback.


## Workflow refinements — 2026-10-08

Full regression: 329/329 tests, 19 files, zero skips, including actual disposable MySQL migration 017 workflows. Local migration followed a guarded backup and preserved all baseline table row counts (32 tables, 26 numeric entity IDs, 17 migrations). Fictional Chromium demo verified complete profile fields/row opening, patient/item default ID order, unchanged birth-date/phone coordinates when nationality changes, visible +65 prefix and composed full number, one booking entry, sorted patient choices, past-date rejection, confirmed removal, grouped patient history containing multiple encounters, distinct fresh consultation creation and disabled record tools. Inventory category ingredient rules and 320px guided-tab highlights passed. Desktop and phone screenshots were inspected. Browser evidence is simulation only; live clinical records were not edited by browser QA.

Final confirmation passed strict typecheck, normal/demo builds and formatting. Changed UI targets returned zero Impeccable findings. Refreshed browser assets confirmed sidebar guide stays in the current module and clinic-save success survives refresh. Older saved receipt snapshots retain their recorded clinic name. Artifacts remain ignored; Render hosting remains unverified.


## HCI flow gate — 2026-10-08

Strict typecheck, normal/demo builds and formatting passed. Focused existing list-controls, settings-workflows and demo tests passed 43/43 across three files. Chromium fictional demo verified single task entry controls, preserved registration/SOAP drafts, no history before patient selection, selected patient history, record-lock reset on patient switch, GP creation scoped to selected patient, default ID descending sorting, collapsed catalogue details, GP-only required registration input, Cancel/Escape without committing, explicit confirmation saves, header-only guide, and 320px overflow/consent bounds. Screenshots were inspected at desktop/320px; one modal centering fix was confirmed afterward. Changed-target Impeccable scan returned zero findings. No backend/schema or live clinical data changed; demo evidence does not establish Render deployment or real backend operation. Earlier 329-test backend gate remains historical; this UI revision uses focused tests and browser proof.

Final popup confirmation: native modal background is inert; Cancel starts focused; Tab/Shift+Tab wraps between actions; Escape cancels. Centered 320px bounds and explicit permanent-signing warning passed after the final build. No signing or reset was committed in this check.


## Queue flow gate — 2026-10-14

On 14 October 2026, 185/185 tests across domain, demo, demo-workflows and actual guarded MySQL passed with zero skips. New tests verify direct registered→room transitions, missing/invalid doctor or room, branch/version checks, occupied-room rejection and unchanged ticket on failure. Normal/demo builds, strict typecheck and formatting passed. Fictional Chromium browser verified searchable check-in, enabled patient-specific Call to room entry, required choices, consent cancellation, direct successful call, disabled occupied room, desktop/320px layout, exactly one visible dispensary section and zero forced scroll calls across all five section buttons. Administrator removed appointment access from fictional receptionist role; receptionist navigation/help hid it and direct URL showed restricted access. Browser screenshots were inspected. No live records, schema or migrations changed. This proves local behavior, not hosted Render deployment.


## Queue expiry and clinical handoff gate — 2026-10-14

Full regression passed 339/339 tests across 19 files, zero skips. The actual MySQL file passed 118 cases; focused demo coverage passed 44. Normal/demo builds, strict typecheck and formatting passed. Guarded tests verify exact 12-hour cutoff, prior-day active visits, room release, branch isolation, one expiry audit, concurrent check-in, clinical-only GP suggestions, wrong patient/GP denial, failed-note atomic rollback, concurrent single linked chart and continued edits after queue expiry. Fictional desktop/320px browser checks verified meaningful duplicate error, nurse room/start handoff, GP assignment visibility, prefilled patient/queue context, consent, cancel-preserved SOAP and resuming the existing encounter. Screenshots were inspected; changed UI targets returned no detector findings. Local migration 018 followed backup and preserved baseline rows across 32 tables, 26 numeric entity IDs and 18 migrations; health returned ok. No local demo preload/reset occurred. Browser simulation does not establish hosted Render deployment.


## Multiple prescriptions and signed handoff gate — 2026-10-14

On 14 October 2026, full regression passed 356/356 tests across 19 files, zero skips. Actual MySQL passed 125 cases and focused demo passed 54. Strict typecheck, normal/demo builds and formatting passed. New cases cover direct SIGNED creation, draft signing with preserved queue association, clinical-only GP permission, multiple reservations, insufficient second item complete rollback, zero medicines, manual/unlinked and expired/advanced visits. Fictional desktop/320px browser verified independent two-medicine fields, add/remove consent and neighboring draft retention, blank-row skipping, unchanged draft resave count, signed input locks, automatic queue Waiting for medicines and pending dispense presence. Screenshots were inspected; changed-page detector had zero findings. Schema and API payload remain unchanged; local clinical data was not edited by QA. Browser evidence is simulation, not successful Render deployment.


## Draft removal and reset gate — 2026-10-14

Full regression completed successfully, including 133 actual guarded MySQL cases (129 main integration and four reset cases) and 67 focused demo cases. Strict typecheck, normal/demo builds, formatting and changed-page detector passed. Actual reset tests operate only on a guarded disposable database and verify role/CSRF/phrase/password/acknowledgment denial, stale privilege, strict known-schema/InnoDB rules, rollback on default-creation failure, whole-database two-tenant clearance, new default account and audit, preserved migrations/ID sequences and invalid old sessions. Fictional desktop/320px browser proved compact history/full note preservation, draft deletion cancellation and selected-record lock reset, no signed delete button, ordinary Admin without Danger zone, exact consent guards, input Enter prevention, password-error session retention, Escape clearing, and successful demo erasure/relogin with only default account/branch/rooms. Local migrations 019/020 followed guarded backups; baseline rows across 32 tables and 26 numeric entity IDs were preserved, with 20 migrations. Only configured bootstrap administrator received Super Admin capability. No live database reset was executed. These checks do not establish successful hosted Render deployment.

## Synchronized handoff validation — 2026-10-14

Full regression passed: 385 tests across 22 files, including 136 guarded real MySQL cases. Production/demo builds, typecheck and formatting passed. Fictional browser workflow verified assigned GP suggestions, stock labels, signed prescription reservation, first/default dispensing, automatic payment handoff, prefilled patient/GP/medicine checkout, payment completion, and compact bounded history at 320px. Successful migration021 followed a guarded local backup. Baseline rows remained intact across 32 tables and 26 numeric entity IDs; 21 migrations are applied. Browser QA used fictional session data only. Git publication does not establish Render deployment.

Checkout scroll verified on desktop and 320px phone, including same-patient repeat and reduced-motion. The form appears below sticky navigation without horizontal overflow. Demo build and typecheck passed; fictional browser fixtures only.

Full payment passed fictional desktop/320px browser checks: zero-total guard, MYR100.05 exact allocation, QR/Card/reference preservation, split cancel/confirm and no premature invoice. Demo build and typecheck passed. No backend schema or payment method change.

## Public waiting-room API validation — 2026-10-14

Two guarded disposable MySQL/HTTP regressions passed. Anonymous branch listing returned only active public branding fields. Queue responses contained exactly ticket number, status and room name. Explicit branch scope remained correct despite a conflicting staff branch header. Prior-day, completed and lifetime-expired visits were absent. Missing/malformed IDs returned 400; unavailable branches returned 404. Staff queue/display/events remained 401 without login, and no public POST mutation route was enabled. These checks do not prove Render deployment or replace browser acceptance.

## Arrival, search, daily queue and public display validation — 2026-10-14

All 414 tests across 24 files passed, including 138 guarded MySQL workflow cases and four database-reset cases. Production and demo builds, typecheck and formatting passed. Fictional browser checks covered room-free due-appointment arrival, booked GP suggestion, registration shortcuts, search dropdowns, retained registration drafts and module restrictions. Anonymous local /display opened without auth/bootstrap requests and fit a 390px phone. Demo branch switching and branch selection after reload passed. Public routes expose only clinic/branch labels and anonymous ticket stages/rooms. Migration022 followed a guarded backup: rows remained intact across 32 tables and 26 numeric entity IDs, with 22 migrations applied. No live reset was executed. Render deployment was not verified.

Additional fictional browser proof: ten current-day visits included completed/skipped/expired rows; expired rows had no operational buttons. Advancing Malaysia time past midnight refreshed Visits today to zero while retaining all ten history rows. Temperature native validation accepted blank, 28, 36.8 and 40; rejected 27.9 and 40.1. No consultation was saved during these checks.

## Custom nationality country validation — 2026-10-14

All 423 tests across 25 files passed. Production/demo builds, typecheck and formatting passed. Fictional browser checks verified Others requires a country name, trims the saved value, displays it in the profile and restores it during editing. ISO/Malaysian selection clears the custom name; Malaysian country remains disabled. Layout remained stable and fitted a 320px phone. Migration023 followed a guarded local backup; all existing rows remained across 32 tables and 26 numeric entity IDs, with 23 migrations applied. No real patient records were edited during testing. Render deployment was not verified.

## Search autofill and waiting-room sound — 2026-10-14

All 428 tests across 26 files passed. Production/demo builds, typecheck and formatting passed. Fictional browser checks verified pointer/keyboard suggestion selection autofills full patient/medicine labels, preserves selected IDs, does not submit forms, and restores the original patient/query/unsaved note when clinical replacement is cancelled. Actual browser AudioContext instrumentation verified one context resumed to running, two oscillator starts (sample plus first call from an empty queue), no additional sound for the same call entering consultation or leaving the display, and context closure on disable. Five focused audio regressions cover branch/initial baselines, new tickets/rooms, blocked audio and pending-enable cancellation. These checks verify playback scheduling, not physical speaker audibility. No live records changed; no migration was required. Render deployment was not verified.

## Spoken waiting-room announcements — 2026-10-14

All 432 tests across 27 files passed. Production/demo builds, typecheck and formatting passed. Nine focused sound/speech cases verify leading ticket zeros, numeric/custom room destinations, accumulated pending batches, English voice selection, cancellation/re-enable, unavailable/error recovery and prior chime behavior. Fictional browser instrumentation captured native SpeechSynthesis.speak calls for the gesture sample and Ticket Q zero zero one, please proceed to Room 01. One AudioContext resumed to running and scheduled two chimes; unchanged consultation status and removal did not repeat speech. Disable closed the context and cancelled native speech. Browser/server fixtures were cleaned up. These checks verify speech submissions and audio scheduling, not physical speaker audibility. No live records or database schema changed. Render deployment was not verified.


## Clinical and stock workflow validation — 21 October 2026

Implemented per-dose quantity and purpose, unified medication timeline, default clinical review, CASHIER, stock-catalogue restocking, explicit undated/unnumbered receipt options and modal detail views. Production and browser-demo modes remain separate.

Real Chromium actions used the actual Express backend and a generated disposable MySQL database applying migrations 001–026. A GP created and signed a new prescription with 1 piece per dose, 3 times daily, 2 days and Headache purpose. Persistence contained total6 and the original dose/purpose. Two successful browser dispenses deducted12 and6 from100 physical tablets, leaving82. A browser restock added5 undated, unnumbered supplies to20, leaving25. A CASHIER reviewed readonly notes, could not select New consultation, completed RM6.00 checkout and opened the actual receipt popout. SQL assertions verified stock totals, two dispenses, dose metadata and600 invoice cents. No synthetic records were inserted into the configured local clinic database.

Profiles open in dialogs and Edit details returns to the populated form. Country and DOB use neighboring grid rows with16px separation. Clinical patient selection enables review sections and loads the latest consultation. Medication timeline shows distinct prescribing/reservation/dispensing events. Restock preselects its item. Close/Escape and return to underlying work were checked. Desktop1280px, phone390px and final restock320px screenshots were inspected; final320px document/dialog had no horizontal overflow. Browser errors from replacing built asset hashes during the active QA session disappeared after reloading the finished build; they were not application API failures.

Successful dispensing called browser print only after persistence. Browser printing was intercepted during automation to avoid a physical print job; actual print-to-PDF generated one A6 page per tested single medicine. Final output contained patient, purpose, pieces per dose, frequency/duration/meal timing, instructions, supplied total, GP and MYT date, with a white background and no app chrome or extra blank page. Physical printer margins and label-paper dimensions remain operator configuration and were not hardware-tested.

Before local migration026, a full MySQL schema/data backup and row-count baseline were saved in ignored `.local/pre-workflow-refinement-20261021-*` files. After the normal migration runner completed, row counts remained preserved across33 tables, with27 numeric entity IDs and26 applied migrations. Configured API health returned `ok`. No local clinical fixtures or reset were performed. The migration preserves existing explicit module grants and medication expiry enforcement. Rollback requires the preserved backup or a separately reviewed additive compatibility migration; never edit applied migration files.

The changed-target Impeccable scan found one existing thick timeline border; it was reduced to1px. Final browser confirmation verified printing, named expiry/batch checkboxes and no extra activity modal after label closure. All screenshots, PDFs, browser state, backups and fixture scripts remain ignored. These checks establish local behavior, not hosted deployment or physical printer certification.


Final gate: `npm test -- --reporter=dot` passed **497/497 tests across34 files, zero skips**. The full run includes guarded real MySQL, migration, reset, permission, CSRF, transaction and demo suites. Normal/demo builds and source formatting passed. `npm audit --omit=dev` reported zero vulnerabilities. Disposable browser QA database was removed, its listener closed and lifecycle logged; the normal local clinic remains running on its reserved ports. No hosted deployment was performed.


## Saved sticker reprint and navigation validation — 21 October 2026

Source audit covered every client anchor and hash-navigation action. Real Chromium checked8 modules and24 enabled task sections: Clinic overview, Patients, Appointments, Clinical workspace, Dispensary, Billing, Administration and Account. No obsolete Guide links remained. Skip to main content preserved the route and focused main. An inventory-only staff account saw only Dispensary and Account; the brand returned to its authorized Dispensary home and saved-label requests succeeded. Valid public registration, waiting-room display and document/receipt download links remain; the header User guide still opens its guided tour.

Actual Express/MySQL browser fixtures used a guarded generated database, with a two-medicine prescription dispensed on1 October2026 and another pending prescription. Prescription history offered reprints only for the completed prescription, including after page reload and a new staff sign-in. Saved labels retained the original1 October date, directions and quantities while today's date was21 October. All-sticker PDF output contained2 pages; printing only the second medicine contained1 page with no first-medicine content. Returning to Print all produced2 pages again. Final rendered print pages were white without application controls or extra pages. Desktop1280px and phone320px previews were inspected; the phone document/dialog had no horizontal overflow. Native printing was intercepted during automation to avoid physical print jobs; physical printer/paper calibration remains unverified.

SQL proof after repeated reprints matched the fixture baseline exactly:1 dispense,5 stock movements,4 reservations,2 unconsumed reservations,155 physical stock units,0 invoices and0 payments. A separate fresh browser dispense then saved once, automatically opened saved stickers and produced the expected2 dispenses,7 movements,0 unconsumed reservations and140 stock units, with no invoices. Reprint reads never ran the dispense transaction. The fixture database was removed and its QA3110 listener closed with lifecycle logs; the normal local clinic and its account credentials were untouched. No schema migration was required.

The new read endpoint enforces inventory permission and tenant/branch scope, rejects pending/missing/foreign records, preserves saved snapshots and fills only missing legacy medicine names/units from the scoped catalog, including archived items. Demo parity remains separate from real persistence evidence. The changed-target Impeccable detector returned no findings. Browser scripts, PDFs, screenshots and SQL proofs remain ignored in `.local`.


Final reprint gate: `npm test -- --reporter=dot` passed501/501 tests across36 files with zero skips, including the extended real MySQL legacy-label case. Strict TypeScript, normal/demo builds, source formatting and diff-whitespace checks passed. Local web3100 returned200 and API3101 health returned `ok`; QA3110 was closed. No hosted deployment was performed.


## Clinical pricing and letterhead — 23 October 2026

Real Chromium actions against a generated disposable MySQL 8.4.11 database applied migrations 001–028. GP signed quantity per serving2.5, form SYRUP, two stock units at300 cents each, consultation2500 cents and procedure1000 cents. Blood pressure80/120 and temperature50 persisted. Duplicate medicine selection was absent from the second row. Signing consumed three supplies; dispensing deducted two medication units. Administrator saved a PNG logo, header, address and footer. Browser checkout issued an itemized4100-cent branded receipt. Browser stock intake added five units and changed catalog price to125 cents while the signed prescription retained300 cents. SQL verified medication103, supply17 and the original letterhead snapshot. Desktop1440px and phone390px checks found no horizontal overflow. The generated database and owned QA process were removed after checks. Browser artifacts remain ignored.

Normal and demo builds, strict TypeScript, formatting, production dependency audit (zero vulnerabilities), and changed-interface design detector were checked. Signing fee omissions and approved no-charge checkout have dedicated HTTP/MySQL and demo regressions. Render deployment evidence is recorded separately; local checks alone do not establish hosted operation.

Final local gate: 521/521 tests,39 files, zero skips. Migration029 zero-charge invoice constraint verified against actual MySQL. No configured clinic database records were changed.
