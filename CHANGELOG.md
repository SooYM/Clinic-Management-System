# Changelog

## Unreleased

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
