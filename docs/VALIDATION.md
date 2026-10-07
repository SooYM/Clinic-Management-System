# Implementation validation

Checked on 2026-10-07 against isolated MySQL 8.4.11 on Windows, Node.js 22.14.0.

## Automated evidence

- `npm test`: 202 tests passed with zero skips. Database integration ran against actual MySQL, using guarded disposable databases. See `TESTING.md` for scenario coverage.
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
