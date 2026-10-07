# Contributing

Read [prerequisites](docs/PREREQUISITES.md), [architecture](docs/ARCHITECTURE.md) and [specification](CLINIC_MANAGEMENT_SYSTEM_SPECIFICATION.md). Develop against a separate database with fictional records.

Keep domain rules independent of HTTP/database adapters. Reuse validators and modules. Preserve tenant/branch scope, permissions, transactions, audit behavior and integer sen. Application entity IDs must be positive safe integers.

Never modify applied migrations. Add numbered migrations and test fresh installation plus historical upgrades. Migration 009 includes its TypeScript helper in its checksum; content changes are rejected.

```sh
npm ci
npm run format:check
npm run build
npm run build:demo
npm test
npm audit --omit=dev --audit-level=high
```

Full integration coverage requires guarded `TEST_DATABASE_URL`; never use real clinical databases. Add meaningful regression/isolation/failure tests. Demo tests establish browser simulation behavior, not backend security or transaction guarantees.

Update specification, schema/ERD, API, flows and test cases with behavior changes. Keep secrets, real clinical data, database dumps, dependency/build folders and browser artifacts outside commits. Report suspected vulnerabilities privately to the repository owner.

Root `render.yaml` and Render instructions must change together. The current Blueprint is a free demonstration, not full-system production hosting. Check live health/browser behavior after sync before claiming deployment success.
