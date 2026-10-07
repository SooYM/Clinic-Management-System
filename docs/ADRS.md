# Architecture decisions

## ADR 001 — Modular monolith

Status: accepted. One TypeScript application and MySQL database serve clinic operations. Domain rules remain separate from HTTP and SQL adapters. This avoids distributed transactions while keeping modules replaceable. Split services only when measured load or organizational ownership warrants it.

## ADR 002 — MySQL owns persistent invariants

Status: accepted. Foreign keys, uniqueness, transactional scope locks and transactions protect references, overlapping schedules, certificate periods and balances. Application validation supplies understandable errors. MySQL has no PostgreSQL-style exclusion constraint. Lock stable scope rows before querying conflicts and writing appointments or MCs. Direct SQL writers must obey the same protocol. [MySQL locking reads](https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html).

## ADR 003 — Integer minor units

Status: accepted. Money travels as integer sen. Floating-point currency calculations are excluded. Payment parts must equal invoice balance. Commission is retired. Financial records require reversal entries rather than silent historical edits.

## ADR 004 — Server-side sessions

Status: accepted. Browser receives an opaque cookie, not a clinical-data-bearing token. Server stores session digest and expires sessions. State changes require CSRF protection. HTTPS and secure cookies are deployment requirements. [OWASP sessions](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

## ADR 005 — Outbox before provider delivery

Status: accepted. Clinical transactions enqueue notifications in MySQL. Provider failures cannot roll back completed clinic operations. External providers require credentials and explicit operational enablement; queued messages alone do not establish successful delivery.

## ADR 006 — Reference reuse

Status: accepted. Car Loan code informs reusable patterns only where reviewed and compatible. Loan domain logic, credentials and customer data must not enter this clinic project. No database migration from that project is assumed.

## ADR 007 — Numeric identifiers

Status: accepted. Entity keys are MySQL `BIGINT UNSIGNED AUTO_INCREMENT` with matching foreign keys. Each table allocates its own sequence; gaps are valid. Application IDs are positive safe integers. Authorization never relies on unguessable IDs. Security, verification and idempotency tokens remain random.

## ADR 008 — Separate free demonstration

Status: accepted. Render's free web service hosts the same interface with per-tab session storage and simulated clinic operations. Local/full-system installations keep persistent MySQL and real server controls. A compile-time demo build selects the simulation; normal builds use the API. Demo identity, documents and notifications establish no clinical or security validity.
