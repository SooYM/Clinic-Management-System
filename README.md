# Clinic Management System — V2

Malaysia-focused, multi-branch clinic application using MySQL 8.4/InnoDB, React, TypeScript, Vite and Express. V2 fully replaces the V1 Next.js/Supabase implementation while preserving repository history.

Two deployment modes share the interface:

| Mode             | Storage                                               | Intended use                                       |
| ---------------- | ----------------------------------------------------- | -------------------------------------------------- |
| Full system      | Persistent MySQL; authenticated API and worker        | Local operation and properly configured production |
| Free Render demo | Browser `sessionStorage`; simulated clinic operations | Fictional data and demonstrations only             |

Demo records stay in the current tab, survive refresh, and normally disappear when its tab/session closes. Reset Demo clears them immediately. Browser session restoration can retain session storage. Demo identities and permissions simulate workflows; they provide no server security. No real patient data, clinical certificates, payment processing or provider delivery belongs in this mode.

Render preloads fictional patients, staff, appointments, a queue visit, a signed prescription, medicine stock and billing examples. Reset restores these fixtures. This preload runs only in the demo adapter; local MySQL receives no demo business data.

Read the [documentation index](docs/README.md) for system specification, architecture, schema, ERD, workflows, test cases and prerequisites.

## Workflows

- Malaysian/non-Malaysian registration, formatted IC, derived birth date/gender and postcode city/state lookup.
- Searchable appointment booking, queue management, administrator-configured rooms and GP practitioner accounts.
- Signed SOAP consultations, structured medication instructions, stock receipt and pending-prescription dispensing.
- Full-system clinical documents, split payments, deposits, notifications and audit records.
- Role-to-module access and in-app staff guide.

Commission, treatment-package and before/after-photo workflows are retired. Historical MySQL tables remain for migration compatibility. All entity keys are numeric auto-increment IDs; each table has its own sequence and gaps are valid. Security and verification tokens remain random.

## Local full system

Requires Node.js 22.12+ and MySQL 8.4+. Follow [prerequisites](docs/PREREQUISITES.md), create an empty database, and configure private `.env` using [.env.example](.env.example).

```sh
npm ci
npm run db:migrate
npm run db:bootstrap
npm run dev
```

Open http://127.0.0.1:5173. Set explicit bootstrap credentials and a random signing key first. Bootstrap creates the clinic, initial branch, rooms and administrator; it refuses an existing users table. Add staff through Administration. Never run synthetic `db:seed` in production.

The [local database viewer](docs/DATABASE_ACCESS.md) uses a separate SELECT-only account. Set `DB_VIEWER_DATABASE_URL` and `DB_VIEWER_PASSWORD`, then run `npm run db:view` and open http://127.0.0.1:3002. It is excluded from production hosting.

## Free demo and Render Blueprint

```sh
npm ci
npm run build:demo
npm run start:demo
```

Demo builds write `dist-demo`; normal builds write `dist`. Demo hosting requires no database or private credentials. The login screen shows the public fictional accounts; each default demo password is `00000000000000` (14 zeros). This does not change local MySQL credentials. The demo server serves static assets and an explicit unavailable page for features requiring the full backend.

[render.yaml](render.yaml) reconfigures the existing **Clinic Management System** web service in its existing **Production** environment. It retains the service name, region and main branch, and uses the free demo build/start commands. See [Render upgrade](docs/RENDER_UPGRADE.md) before syncing. Git publication and Render Blueprint synchronization are separate operations; remote deployment remains unverified until its health and browser checks pass.

The full local application retains MySQL and server authentication. [Production deployment](docs/DEPLOYMENT.md) covers Docker, migration/runtime accounts, HTTPS, backups and notification workers. Migration 009 converts historical MySQL UUID keys; it does not migrate PostgreSQL/Supabase data.

## Validation

```sh
npm run format:check
npm run build
npm test
npm audit --omit=dev --audit-level=high
```

Set `TEST_DATABASE_URL` to an isolated MySQL database ending in `_test` for full integration coverage. Tests create guarded disposable databases and require matching creation/drop privileges. Never use production credentials. Without this URL, database suites explicitly skip. See [test cases](docs/TEST_CASES.md) and [validation evidence](docs/VALIDATION.md).

## Documentation and contribution

[Specification](CLINIC_MANAGEMENT_SYSTEM_SPECIFICATION.md), [staff guide](docs/USER_GUIDE.md), [security](docs/SECURITY.md), [operations](docs/OPERATIONS.md), [architecture decisions](docs/ADRS.md), [changelog](CHANGELOG.md), [contribution guide](CONTRIBUTING.md), and [third-party notices](docs/THIRD_PARTY_NOTICES.md).
