# Clinical pricing, prescriptions and letterhead

## Administration

Administration → Document letterhead sets a clinic-wide embedded PNG/JPEG logo, header/contact text, address and footer. Logos are limited to 160 KB and 2000 × 2000 pixels. Blank address uses the issuing branch address. Only administrators may read or update these settings; optimistic version conflicts return 409. New medical certificates, referrals, lab requests and receipts retain immutable snapshots. Later branding edits do not rewrite issued documents.

## GP workflow

Each medicine appears once per consultation. Choose Pill, Paste, Syrup or Other, enter quantity per serving, frequency, duration and instructions. Pills require whole servings and calculate total stock supply as serving × frequency × days. Other forms permit three decimal places per serving and require a separate whole stock quantity, such as bottles or tubes. Stock quantity and serving quantity are distinct; no bottle-volume conversion is inferred.

Inventory intake records the default selling price per stock unit, with optimistic item-version checking. Prescriptions snapshot that price. The attending GP can change each medicine's unit price and set consultation and procedure fees before signing. A live itemized summary shows medication subtotals and the final amount. Signing freezes prices. Checkout imports consultation fee, procedure fee and each medicine as separate lines; the server rejects changed GP-approved quantities, prices, descriptions or category semantics. Historical consultations without both fee fields retain their earlier cashier-pricing workflow. HTTP and demo signatures require explicit consultation and procedure fees. Payments must match the invoice total. GP-approved zero-charge visits complete with an empty payments array and a zero-value receipt; manual zero-charge checkout remains blocked.

Minor surgery uses the consultation's procedure notes for consent, findings, treatment and aftercare. Add actual consumable items, whole quantities and reasons. Signing deducts eligible consumable batches in the same transaction as prescription reservation and signature. Insufficient supplies roll back signing. Supplies are included in the GP's procedure fee; they do not create an additional automatic charge.

Blood pressure retains positive whole-number SYS/DIA formatting and safe-integer storage checks. Clinical range and systolic/diastolic ordering no longer block entry. Temperature accepts finite numbers without clinical range bounds. Unusual blood pressure remains flagged for review without blocking save.

## API and persistence

- `GET /api/admin/letterhead`: `{ logoDataUrl, header, address, footer, version }`.
- `PUT /api/admin/letterhead`: all four fields and current positive integer `version`; administrator only.
- Encounter create/update accepts paired `consultationFeeCents` and `procedureFeeCents`; money is nonnegative integer cents.
- Prescription rows retain `quantity` as stock supply and `quantityPerDose` as quantity per serving. New fields: `form` (`PILL`, `PASTE`, `SYRUP`, `OTHER`), `instructions`, `unitPriceCents`.
- Encounter `consumables`: `[{ itemId, quantity, reason }]`; duplicate item IDs are rejected.
- `GET /api/references/consumables`: scoped active consumables for clinical selection.
- Stock receipt accepts optional `priceCents` and `itemVersion`. Price updates and batch receipt are atomic.
- Billing suggestions return paired fees and prescription price snapshots. Invoice creation validates exact signed itemized charges using configured SERVICE/PRODUCT category defaults.

Migration 027 adds nullable encounter fee columns and non-null consumables JSON. Migration 028 adds tenant letterhead JSON and its version. Migration 029 permits zero-value invoices; application rules require an explicitly priced signed encounter and no payment records. Prescriptions, document payloads and receipt snapshots retain their existing JSON storage; no additional entity relationships are introduced. Supply usage rows identify the signing actor and include the encounter in their reason and idempotency key. Encounter JSON retains the selected supplies alongside the patient and practitioner references.

## Operation and rollback

Back up the configured MySQL database and verify the backup before applying migrations 027–029 through `npm run db:migrate`. Applied migrations must never be edited. Normal app startup does not migrate automatically. Existing deployment runtime requirements remain unchanged. Restore application code only with a schema-compatible release; removing nullable/new columns is unnecessary for code rollback. Retain issued document snapshots and inventory usage history.

The Render Blueprint continues to deploy the browser demo with `npm run build:demo` and `npm run start:demo`. Demo settings and workflows live only in the browser session. This deployment is for fictional testing and does not establish durable storage or production authentication.

## Verification

Regression coverage includes duplicate rejection, fractional non-pill servings, finite vitals, stock-price conflicts and snapshots, exact checkout enforcement, consumable deduction/rollback, administrator authorization, letterhead conflicts and immutable printed/PDF snapshots. Actual MySQL tests use guarded generated disposable databases. Browser checks must additionally verify staff actions and desktop/narrow layouts. Record completed checks separately from planned checks in TESTING.md.
