# Changelog

## Unreleased

- Add Others nationality country with validated custom label, profile/edit persistence and migration023 consistency checks.

- Open `/display` without sign-in, with active branch selection and anonymous queue polling every 15 seconds.

- Compact clinical history and add audited attending-GP draft removal; signed records remain individually protected.
- Add separate Super Admin capability and typed/password-verified transactional entire-database reset with default restoration.

- Add repeatable prescription rows with independent medicine instructions and safe draft resaves.
- Advance linked active visits to dispensary atomically when GP consultations are signed.

- Expire queue check-ins after 12 hours without deleting history; provide clear active-ticket errors.
- Suggest assigned patients to GPs; prefill linked consultations and resume existing encounters with atomic handoff.

- Simplify waiting-patient room calls with per-patient choices and direct registered-to-room transition.
- Remove forced section scrolling and refresh module navigation; filter restricted written help.

- Simplify task entry tabs; make consultations patient-first; collapse catalogue detail controls; enable default ID direction.
- Add shared modal consent for persistent changes, remove sidebar guide, and request practitioner registration only for doctors.

- Patient rows open full profiles; patient selectors and inventory default to ascending IDs. Country selection has a stable layout and phone inputs show selected prefixes.
- Today/future booking dates, one booking entry, confirmed appointment removal with retained history (migration 017), and editable clinic names.
- Clinical lists group by patient; separate creation and record review, with locked record tools until selection.
- Contextual User guide labels tabs/functions; Reports & delivery navigation retired. Supplies and retail ingredients remain optional.

- Non-Malaysian patient country-of-nationality selection and nullable ISO country storage through migration 016; existing foreign countries remain unknown.
- Reusable loaded-record search, filters and sort direction across operational lists; original workflow order and authoritative totals remain preserved.

- Patient phone country-code dropdown defaults to Malaysia, detects pasted international prefixes and supports Other country entry; unedited contact values remain unchanged.
- Local startup instructions explain starting the existing portable MySQL instance before API/frontend services.

- Clinical letters open a responsive preview before manual PDF download; MCs use centered letterhead and ruled fields.
- Prescription logs show clinic reservations/dispensing and separately recorded patient medication-taking, with staff, source and timestamps.

- Searchable patient, consultation, prescription and categorized inventory lists; SOAP fields use separate full-width rows.
- Signing reserves prescription stock automatically; dispensing deducts physical batches once, with shortages and expired holds handled atomically.
- General supplies support optional expiry and audited idempotent usage; migrations 010–012 extend the numeric schema.
- MC eligibility messages and Malaysia 17:00 leave-date defaults; blood-pressure format validation with nonblocking unusual-reading warnings.

- Interactive staff walkthroughs highlight real controls, respect module access and explain workflows without submitting records.
- Phone layout improvements for navigation, guide instructions, forms and tables.
- Default fictional demo accounts use `demo`; unchanged previous defaults upgrade without losing session records.
- Demo fixtures use realistic fictional patient/staff names, branch addresses and ordinary clinic workflow descriptions.

## 2.0.0 — 2026-10-07

V2 replaces V1 Next.js/Supabase source with React/Vite and an Express modular backend using MySQL 8.4.

- Numeric auto-increment primary/foreign keys across all 22 entity tables, including historical MySQL UUID migration.
- Malaysian/non-Malaysian registration, names, formatted IC, derived gender/birth date, structured address and postcode lookup.
- Administrator-managed rooms and server-enforced role/module access; GP accounts automatically join practitioner selectors.
- Patient search during appointments, stock refresh and pending signed prescriptions in dispensary.
- Medication quantity, dosage, frequency, meal timing and duration.
- Fixed sidebar, consistent 14-character password requirement and staff user guide.
- Retired commissions, packages and before/after photos; preserved historical storage.
- Updated specification, architecture, schema, ERD, flows, test cases, prerequisites, security and deployment documents.
- Free Render demonstration with per-tab session storage; local/full-system operation retains persistent MySQL.

V1 PostgreSQL migrations, API contracts, mock accounts and secrets are incompatible with the full V2 backend. Its local installation uses fresh MySQL or versioned MySQL upgrades. Migration 009 requires maintenance/backups and invalidates sessions. The free demo does not provide clinical security, persistent storage or real certificate/provider operations.

## V1 archive

Last V1 main revision: `b0c9a49cd0cfef239cd2376edafc601c2e44928e`. Its source remains in Git history and `v1-demo-before-v2`. Publication preserves history without force-pushing.

Administrator catalogs support branch-scoped editing, archival and restoration for drugs, supplies and clinical choices. New signed prescriptions preserve authoritative medicine snapshots. Phone fields explain international country codes and accept foreign numbers unchanged. Migration 014 preserves inventory and adds no local sample records.

Long operational pages now use named task sections with persistent section navigation. Patients, appointments, queue, clinical care, inventory, billing, administration and help show one task area at a time. Section switches preserve draft fields; guided walkthroughs reveal the relevant section automatically.

Administrators can rename staff and branches, remove/restore settings, and show removed entries. Unused rooms delete; historical rooms archive and upcoming/busy rooms remain protected. Branch archival is versioned and protected. Stock unit guidance explains tablet/bottle/piece choices. Receipts now preview before download using the supplied official-receipt structure, with immutable new identity/cashier snapshots and actual tender breakdown.

- Consultation history action columns remain aligned across draft and signed records, including phone layouts.

## Synchronized check-in, prescribing, dispensing and checkout

Compact prescription history, live GP stock counts, default dispense/checkout sections, automatic visit-stage handoffs, patient billing suggestions and unique consultation-linked checkout. Migration021 retains existing receipts and data.

- Prepare checkout scrolls its prefilled form below sticky navigation, including reselecting the same patient; reduced-motion uses an immediate scroll.

- Full payment fills the invoice total using the selected row's method/reference; replacing split entries requires consent.

## Retire deposits and simplify appointments

Removed deposit controls/APIs/new tender while preserving historical receipts. Booking defers rooms until call; due appointments suggest confirmed check-in with booked GP and one linked waiting ticket. Country selection is greyed out for Malaysian forms and enabled for non-Malaysians; Malaysian profiles omit the redundant country detail. Migration022 preserves existing records.

Prominent patient-registration entry points and shared matching-result dropdowns added across patient, clinical, stock, prescription and loaded-list searches. Malaysian country fields show a greyed-out Malaysia box; foreign choices remain editable.

Daily live queue resets at Malaysia midnight while retaining all clinical/history data; today's visit count includes terminal and expired rows. Temperature input and API validation now enforce28°C–40°C inclusive.
