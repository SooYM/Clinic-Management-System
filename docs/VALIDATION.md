# Implementation validation

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
