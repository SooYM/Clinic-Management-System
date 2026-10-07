# Prerequisites

## Full-system development

| Requirement       | Preparation                                                              |
| ----------------- | ------------------------------------------------------------------------ |
| Node.js           | 22.12 or newer; validated with 22.14.0                                   |
| npm               | Bundled with Node; use committed lockfile and `npm ci`                   |
| MySQL             | 8.4 LTS, InnoDB; validated with 8.4.11                                   |
| Git               | Clone V2; use Git history for V1                                         |
| Browser           | JavaScript and cookies enabled                                           |
| Database accounts | Schema/migration account; separate restricted production runtime account |
| Configuration     | Private `.env` based on `.env.example`; keep credentials outside Git     |

Create an empty database before migrations. `DATABASE_URL` does not create databases. Migration accounts require schema DDL/DML and the named migration lock. Production runtime accounts need SELECT, INSERT, UPDATE and DELETE only; no schema or user-management privileges.

Use `mysql://user:encoded-password@host:port/database`, encoding reserved credential characters. Local origins default to `http://127.0.0.1:5173`. Supply a random `DOCUMENT_SIGNING_KEY` of at least 32 characters. Bootstrap email/password are explicit one-time values; passwords require 14 characters. Remove the bootstrap password afterward. Bootstrap never resets existing accounts.

The repository excludes private `.env`, database files, credentials and `.local` development binaries. `scripts/start-local-mysql.ps1` supports the original Windows installation only. A fresh clone needs its own MySQL server or documented Docker installation.

## Free Render demo

The demo requires Node.js/npm for building, a Render account connected to GitHub, and a browser allowing session storage. It requires no MySQL server, database secrets, paid disk or notification worker. Root `render.yaml` keeps the existing web service on the free plan.

Use fictional data only. Tab session storage survives refresh; closing the tab normally clears it, while browser restoration can retain it. Reset Demo provides explicit cleanup. Demo permissions and financial/clinical workflows are simulations. PDF/certificate verification and actual delivery require the full backend. Read [Render upgrade](RENDER_UPGRADE.md).

## Tests

Use an isolated MySQL test account and `TEST_DATABASE_URL` ending in `_test`. Tests create/drop random disposable databases; the account needs those privileges. Never use production runtime credentials. Without the URL, database suites skip, so the run does not prove full integration coverage.

GitHub Actions supplies MySQL 8.4 and disposable CI credentials. Browser verification must use synthetic fixtures. See [testing](TESTING.md) and [test cases](TEST_CASES.md).

## Full-system production

- Persistent MySQL, reliable backups and a tested restore procedure.
- Exact HTTPS origin in both `APP_ORIGIN` and `PUBLIC_URL`, without path or trailing slash.
- Separate migration and restricted runtime credentials.
- Verified TLS for remote MySQL; private plaintext only under the explicit documented private-network setting.
- Correct trusted-proxy topology and `TRUST_PROXY_HOPS`.
- Stable signing key and original optional photo encryption key for historical photos.
- SMTP/WhatsApp accounts and approved templates when using notifications; controlled recipient consent and acceptance checks.
- Administrator ownership, practitioner registrations, rooms, module permissions, privacy procedures and deployment acceptance.

Docker/Compose is optional for development and used by the supplied full-system container deployment. Keep MySQL private and the local viewer outside public services. V1 Supabase/PostgreSQL data cannot be supplied as a MySQL database; historical imports require a separately validated transformation.
