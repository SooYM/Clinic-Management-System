# Clinic operations

## Patient groups and custom role rollout

Back up MySQL and verify a restore into a guarded disposable database before deploying migrations 030–031. Run `npm run db:migrate`, then build/restart through the configured hosting process; local startup remains `webapp clinic`. Check `/api/health` and staff/group workflows. These migrations add nullable assignments, group defaults and a custom-role table without modifying applied migrations or assigning existing patients automatically. Preserve the schema during application rollback; use a compatible release. Restoring an older backup requires a maintenance window and a plan to retain records written since that backup.

Administrators manage patient groups under Administration → Catalog choices and custom policies under Role access. Staff accounts assigns policies. Professional roles continue to enforce clinical authority; custom policies replace module grants. Empty module policies revoke ordinary workflow access. Removing an assignment restores professional-role module defaults. Keep administrators unrestricted. Group names classify patients without changing insurer verification, coverage or billing.

On 27 October 2026, local backup `.local/pre-groups-roles-20261027-backup.sql` was restored into a generated disposable database and checked against recorded table counts. Existing live row counts were preserved after migrations through 031. Backups and browser artifacts stay outside Git. Hosted migration, backup retention and deployment checks remain operator responsibilities.

## QR registration operations

Enable the selected branch's QR registration only after verifying its reachable HTTPS `APP_ORIGIN`. Print/display the generated QR and test it from a phone. Patients receive a reserved ticket immediately and must proceed to the counter. Reception verifies IC/passport, reviews existing identity matches, and confirms the same ticket into the active queue. Reject duplicate/incorrect submissions explicitly. The API clears expired pending demographics at startup, every five minutes and during registration operations. Expiry is the earlier of 12 hours and Malaysia midnight; daily reserved numbers are not reused. Keep number/reference and audit records for reconciliation; do not include receipt capabilities in support logs. Monitor cleanup failures and investigate failed confirmation transactions without manually editing clinical rows.

1. Sign in using assigned account. Select authorized branch before creating or editing records.
2. Search patient by name or national identifier. Check existing record before creating another. Record known allergies explicitly.
3. Book practitioner and room within available interval, or check patient into today's queue. Resolve conflict prompts before retrying.
4. Move queue through triage and call patient into selected room. Waiting-room display must show ticket numbers only.
5. Doctor records SOAP assessment, vitals and medication instructions. Review recorded allergies; sign encounter when complete.
6. Issue MC, referral or lab document from signed encounter. Choose employer diagnosis privacy. Revoke incorrect document with reason.
7. Dispensary staff dispense signed prescription. FEFO uses unexpired batches. Stock shortage leaves transaction unchanged.
8. Administrator configures staff module access and active rooms. GP accounts become practitioners in their assigned branch. Commission, packages and before/after photos are retired.
9. Checkout invoice with exact split tender. Deposit tender cannot exceed recorded balance. Retry interrupted checkout using same idempotency key.
10. Review notification status. Pending or unconfigured means delivery has not occurred. Follow approved manual patient-contact procedures when needed.

Refresh after stale-version conflict and review current record before editing again. Do not work around allergy or stock refusal by changing recorded facts. Escalate incorrect clinical records to attending practitioner; signed notes require controlled addenda rather than silent editing.

Public verification only establishes certificate status and integrity. Staff must authenticate for patient clinical details. Public waiting-room displays must not expose chart data.

## Upgrade existing UUID keys to numeric IDs

Migration `009_numeric_identifiers.sql` runs through `npm run db:migrate`; its implementation is `src/server/db/numeric-ids.ts`. Do not execute this SQL marker directly. MySQL DDL commits implicitly, so this upgrade cannot roll back as one transaction.

1. Resolve pending checkout requests, then stop every API instance and notification worker. Prevent writes throughout maintenance.
2. Back up the complete database and private encryption/signing keys. Restore the backup into an isolated database and rehearse this migration before upgrading production.
3. Supply the original `DOCUMENT_SIGNING_KEY` when documents exist. Supply the original `PHOTO_ENCRYPTION_KEY` when historical photos exist. The upgrade verifies document signatures and decrypts photos before changing schema.
4. Run `npm run db:migrate` using the migration account. All primary/foreign keys, prescription references and notification payload references convert together. Existing tenant, branch and patient display numbers become their actual primary keys.
5. Verify record counts, references, document verification and historical photo decryption. Restart the application and workers only after checks pass. Sessions are cleared; staff sign in again.

The migration preserves clinical text, verification tokens and encrypted photo content. It updates document identifier snapshots and signs their new representation with the original key. Audit metadata retains original entity references; references to deleted entities become null. Resource locks are cleared while application writes are stopped. Historical invoice idempotency hashes retain the original request representation: do not replay pre-upgrade UUID checkout requests against the numeric API.

If migration fails after schema changes begin, keep the application stopped and restore the pre-upgrade backup. Mapping tables retained after failure aid diagnosis; do not rerun against a partially converted database. Entity IDs are predictable, so authorization must always enforce tenant, branch and module access independently.
## Fixed local startup

Run `webapp clinic management` from PowerShell after installing the global harness, or run `.\start.ps1` inside this repository. Both use the existing portable MySQL data directory and verify authenticated `@@port`/`@@datadir` before starting the API/frontend. `webapp check clinic management` performs configuration/ownership checks without starting services. The global command replaces verified existing Clinic web/API workers before starting one instance on3100/3101; MySQL stays running. An unverified listener aborts before cleanup. Direct `.\start.ps1` refuses occupied ports. Neither path selects fallback ports.

Clinic owns frontend 3100, API 3101, MySQL 3310, read-only viewer 3102 and local demo 3103. Progress Tracker exclusively owns 3001. Keep private `.env` and portable `.local/mysql.ini` synchronized with the global reservation registry. Never initialize or replace the data directory to change a port. The Docker service uses API 3101; hosted environments may explicitly supply their infrastructure-assigned `PORT`.

To stop only the portable database, first stop Clinic API/frontend, then use `scripts/start-local-mysql.ps1 -Stop`. This checks the exact executable/defaults file, loopback port and authenticated data directory before requesting administrative `SHUTDOWN`. It refuses shutdown while API/frontend ports remain active. Use `-Stop -Check` to validate without stopping anything. No unrelated process is terminated.


## Clinical pricing and letterhead update — 23 October 2026

See [clinical pricing, prescribing, minor surgery and letterhead](CLINICAL_PRICING_AND_LETTERHEAD.md) for current behavior, API fields, storage, permissions and operating instructions. This update supersedes earlier clinical range limits and pill-only dose labels.
