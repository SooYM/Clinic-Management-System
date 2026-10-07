# Documentation index — V2

These documents replace V1 Next.js/Supabase documentation. Git history retains the earlier design. Full-system documents describe MySQL operation; free-demo differences are documented separately.

| Document                                                             | Purpose                                                           |
| -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [System specification](../CLINIC_MANAGEMENT_SYSTEM_SPECIFICATION.md) | Functional/nonfunctional scope and acceptance requirements        |
| [Product scope](../PRODUCT.md)                                       | Users and operating boundaries                                    |
| [Prerequisites](PREREQUISITES.md)                                    | Software, configuration, accounts and hosting preparation         |
| [Architecture](ARCHITECTURE.md)                                      | Components, boundaries, authentication and transactions           |
| [Architecture decisions](ADRS.md)                                    | Reasons for major design choices                                  |
| [System flows](SYSTEM_FLOW.md)                                       | Patient, scheduling, clinical, dispensary and billing diagrams    |
| [ERD](ERD.md)                                                        | Entity relationships and retained legacy tables                   |
| [Database schema](DATABASE.md)                                       | Tables, keys, constraints, indexes and migrations                 |
| [Complete column dictionary](DATA_DICTIONARY.md)                     | Every column, type, nullability, default and generated expression |
| [Final schema SQL](schema.mysql.sql)                                 | Schema-only reference snapshot after migration 009; no records    |
| [API contracts](API.md)                                              | Routes, authorization, errors and payloads                        |
| [Requirements traceability](REQUIREMENTS.md)                         | Scope mapped to implementation and evidence                       |
| [Test cases](TEST_CASES.md)                                          | Preconditions, actions, expected results and coverage             |
| [Testing](TESTING.md)                                                | Reproducible automated and browser verification                   |
| [Validation](VALIDATION.md)                                          | Actual evidence and unverified deployment boundaries              |
| [Security](SECURITY.md)                                              | Implemented controls and operator obligations                     |
| [User guide](USER_GUIDE.md)                                          | Staff workflows and troubleshooting                               |
| [Operations](OPERATIONS.md)                                          | Daily use and numeric-ID maintenance upgrade                      |
| [Database access](DATABASE_ACCESS.md)                                | Local read-only table inspection                                  |
| [Deployment](DEPLOYMENT.md)                                          | Full-system installation, backup and workers                      |
| [Render upgrade](RENDER_UPGRADE.md)                                  | V1 replacement with free browser-session demo                     |
| [Third-party notices](THIRD_PARTY_NOTICES.md)                        | Reused data and licenses                                          |
| [Changelog](../CHANGELOG.md)                                         | Release changes and compatibility notes                           |
| [Contributing](../CONTRIBUTING.md)                                   | Development and publication expectations                          |

SQL under [`db/migrations`](../db/migrations) and implementation are authoritative for diagnosis. Migration 009 executes through its versioned TypeScript helper; never execute its SQL marker alone.
