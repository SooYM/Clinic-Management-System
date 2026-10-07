# Complete column dictionary

Schema-only reference after migrations001–015. No records or credentials are included.
Install with `npm run db:migrate`; executable migrations remain authoritative.
See [schema SQL snapshot](schema.mysql.sql), [database design](DATABASE.md) and [ERD](ERD.md).

## appointments

| Column          | Type            | Nullable | Default              | Extra / generated expression |
| --------------- | --------------- | -------- | -------------------- | ---------------------------- |
| id              | bigint unsigned | NO       | NULL                 | auto_increment               |
| tenant_id       | bigint unsigned | NO       | NULL                 |                              |
| branch_id       | bigint unsigned | NO       | NULL                 |                              |
| patient_id      | bigint unsigned | NO       | NULL                 |                              |
| practitioner_id | bigint unsigned | NO       | NULL                 |                              |
| room_id         | bigint unsigned | YES      | NULL                 |                              |
| starts_at       | datetime(3)     | NO       | NULL                 |                              |
| ends_at         | datetime(3)     | NO       | NULL                 |                              |
| reason          | varchar(2000)   | NO       |                      |                              |
| status          | varchar(30)     | NO       | BOOKED               |                              |
| version         | int             | NO       | 1                    |                              |
| created_at      | datetime(3)     | NO       | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED            |

## audit_logs

| Column      | Type            | Nullable | Default              | Extra / generated expression |
| ----------- | --------------- | -------- | -------------------- | ---------------------------- |
| id          | bigint unsigned | NO       | NULL                 | auto_increment               |
| tenant_id   | bigint unsigned | NO       | NULL                 |                              |
| branch_id   | bigint unsigned | NO       | NULL                 |                              |
| actor_id    | bigint unsigned | NO       | NULL                 |                              |
| action      | varchar(30)     | NO       | NULL                 |                              |
| entity_type | varchar(30)     | NO       | NULL                 |                              |
| entity_id   | bigint unsigned | YES      | NULL                 |                              |
| request_id  | varchar(100)    | NO       | NULL                 |                              |
| metadata    | json            | NO       | _utf8mb4\'{}\'       | DEFAULT_GENERATED            |
| created_at  | datetime(3)     | NO       | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED            |

## branches

| Column     | Type            | Nullable | Default              | Extra / generated expression |
| ---------- | --------------- | -------- | -------------------- | ---------------------------- |
| id         | bigint unsigned | NO       | NULL                 | auto_increment               |
| tenant_id  | bigint unsigned | NO       | NULL                 |                              |
| name       | varchar(200)    | NO       | NULL                 |                              |
| address    | varchar(2000)   | NO       |                      |                              |
| active     | tinyint(1)      | NO       | 1                    |                              |
| version    | int             | NO       | 1                    |                              |
| updated_at | datetime(3)     | NO       | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED            |

## clinical_documents

| Column             | Type            | Nullable | Default              | Extra / generated expression |
| ------------------ | --------------- | -------- | -------------------- | ---------------------------- |
| id                 | bigint unsigned | NO       | NULL                 | auto_increment               |
| tenant_id          | bigint unsigned | NO       | NULL                 |                              |
| branch_id          | bigint unsigned | NO       | NULL                 |                              |
| encounter_id       | bigint unsigned | NO       | NULL                 |                              |
| patient_id         | bigint unsigned | NO       | NULL                 |                              |
| practitioner_id    | bigint unsigned | NO       | NULL                 |                              |
| kind               | varchar(10)     | NO       | NULL                 |                              |
| document_number    | varchar(200)    | NO       | NULL                 |                              |
| payload            | json            | NO       | NULL                 |                              |
| start_date         | date            | YES      | NULL                 |                              |
| end_date           | date            | YES      | NULL                 |                              |
| diagnosis_redacted | tinyint(1)      | NO       | 1                    |                              |
| verification_hash  | varchar(200)    | NO       | NULL                 |                              |
| signature_hash     | varchar(200)    | NO       | NULL                 |                              |
| revoked_at         | datetime(3)     | YES      | NULL                 |                              |
| revoke_reason      | text            | YES      | NULL                 |                              |
| created_at         | datetime(3)     | NO       | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED            |

## clinical_photos

| Column           | Type            | Nullable | Default              | Extra / generated expression |
| ---------------- | --------------- | -------- | -------------------- | ---------------------------- |
| id               | bigint unsigned | NO       | NULL                 | auto_increment               |
| tenant_id        | bigint unsigned | NO       | NULL                 |                              |
| branch_id        | bigint unsigned | NO       | NULL                 |                              |
| encounter_id     | bigint unsigned | NO       | NULL                 |                              |
| patient_id       | bigint unsigned | NO       | NULL                 |                              |
| actor_id         | bigint unsigned | NO       | NULL                 |                              |
| stage            | varchar(10)     | NO       | NULL                 |                              |
| caption          | varchar(500)    | NO       |                      |                              |
| mime_type        | varchar(30)     | NO       | NULL                 |                              |
| encrypted_data   | mediumblob      | NO       | NULL                 |                              |
| iv               | binary(12)      | NO       | NULL                 |                              |
| auth_tag         | binary(16)      | NO       | NULL                 |                              |
| consent_recorded | tinyint(1)      | NO       | NULL                 |                              |
| created_at       | datetime(3)     | NO       | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED            |

## commission_ledger

| Column            | Type            | Nullable | Default              | Extra / generated expression |
| ----------------- | --------------- | -------- | -------------------- | ---------------------------- |
| id                | bigint unsigned | NO       | NULL                 | auto_increment               |
| tenant_id         | bigint unsigned | NO       | NULL                 |                              |
| branch_id         | bigint unsigned | NO       | NULL                 |                              |
| invoice_id        | bigint unsigned | NO       | NULL                 |                              |
| practitioner_id   | bigint unsigned | NO       | NULL                 |                              |
| base_cents        | int             | NO       | NULL                 |                              |
| rate_basis_points | int             | NO       | NULL                 |                              |
| amount_cents      | int             | NO       | NULL                 |                              |
| category          | varchar(30)     | NO       | NULL                 |                              |
| created_at        | datetime(3)     | NO       | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED            |

## commission_policies

| Column                  | Type            | Nullable | Default              | Extra / generated expression |
| ----------------------- | --------------- | -------- | -------------------- | ---------------------------- |
| tenant_id               | bigint unsigned | NO       | NULL                 |                              |
| branch_id               | bigint unsigned | NO       | NULL                 |                              |
| service_base_bps        | int             | NO       | 1000                 |                              |
| service_threshold_cents | int             | NO       | 50000                |                              |
| service_high_bps        | int             | NO       | 1500                 |                              |
| product_bps             | int             | NO       | 500                  |                              |
| updated_at              | datetime(3)     | NO       | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED            |

## dispenses

| Column          | Type            | Nullable | Default              | Extra / generated expression |
| --------------- | --------------- | -------- | -------------------- | ---------------------------- |
| id              | bigint unsigned | NO       | NULL                 | auto_increment               |
| tenant_id       | bigint unsigned | NO       | NULL                 |                              |
| branch_id       | bigint unsigned | NO       | NULL                 |                              |
| patient_id      | bigint unsigned | NO       | NULL                 |                              |
| encounter_id    | bigint unsigned | NO       | NULL                 |                              |
| actor_id        | bigint unsigned | NO       | NULL                 |                              |
| idempotency_key | varchar(200)    | NO       | NULL                 |                              |
| created_at      | datetime(3)     | NO       | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED            |

## encounters

| Column          | Type            | Nullable | Default              | Extra / generated expression |
| --------------- | --------------- | -------- | -------------------- | ---------------------------- |
| id              | bigint unsigned | NO       | NULL                 | auto_increment               |
| tenant_id       | bigint unsigned | NO       | NULL                 |                              |
| branch_id       | bigint unsigned | NO       | NULL                 |                              |
| patient_id      | bigint unsigned | NO       | NULL                 |                              |
| practitioner_id | bigint unsigned | NO       | NULL                 |                              |
| queue_ticket_id | bigint unsigned | YES      | NULL                 |                              |
| specialty       | varchar(20)     | NO       | GP                   |                              |
| subjective      | text            | NO       | NULL                 |                              |
| objective       | text            | NO       | NULL                 |                              |
| assessment      | text            | NO       | NULL                 |                              |
| plan            | text            | NO       | NULL                 |                              |
| vitals          | json            | NO       | _utf8mb4\'{}\'       | DEFAULT_GENERATED            |
| prescriptions   | json            | NO       | _utf8mb4\'[]\'       | DEFAULT_GENERATED            |
| procedure_notes | text            | NO       | NULL                 |                              |
| status          | varchar(30)     | NO       | DRAFT                |                              |
| version         | int             | NO       | 1                    |                              |
| signed_at       | datetime(3)     | YES      | NULL                 |                              |
| created_at      | datetime(3)     | NO       | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED            |
| updated_at      | datetime(3)     | NO       | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED            |

## inventory_batches

| Column       | Type            | Nullable | Default              | Extra / generated expression |
| ------------ | --------------- | -------- | -------------------- | ---------------------------- |
| id           | bigint unsigned | NO       | NULL                 | auto_increment               |
| tenant_id    | bigint unsigned | NO       | NULL                 |                              |
| branch_id    | bigint unsigned | NO       | NULL                 |                              |
| item_id      | bigint unsigned | NO       | NULL                 |                              |
| batch_number | varchar(100)    | NO       | NULL                 |                              |
| expires_on   | date            | YES      | NULL                 |                              |
| quantity     | int             | NO       | NULL                 |                              |
| received_at  | datetime(3)     | NO       | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED            |

## inventory_items

| Column        | Type            | Nullable | Default              | Extra / generated expression |
| ------------- | --------------- | -------- | -------------------- | ---------------------------- |
| id            | bigint unsigned | NO       | NULL                 | auto_increment               |
| tenant_id     | bigint unsigned | NO       | NULL                 |                              |
| branch_id     | bigint unsigned | NO       | NULL                 |                              |
| name          | varchar(200)    | NO       | NULL                 |                              |
| sku           | varchar(200)    | NO       | NULL                 |                              |
| ingredient    | varchar(2000)   | NO       |                      |                              |
| category      | varchar(30)     | NO       | MEDICATION           |                              |
| unit          | varchar(50)     | NO       | unit                 |                              |
| price_cents   | int             | NO       | NULL                 |                              |
| reorder_level | int             | NO       | 10                   |                              |
| active        | tinyint(1)      | NO       | 1                    |                              |
| version       | int             | NO       | 1                    |                              |
| updated_at    | datetime(3)     | NO       | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED            |

## inventory_usages

| Column          | Type            | Nullable | Default              | Extra / generated expression |
| --------------- | --------------- | -------- | -------------------- | ---------------------------- |
| id              | bigint unsigned | NO       | NULL                 | auto_increment               |
| tenant_id       | bigint unsigned | NO       | NULL                 |                              |
| branch_id       | bigint unsigned | NO       | NULL                 |                              |
| item_id         | bigint unsigned | NO       | NULL                 |                              |
| quantity        | int             | NO       | NULL                 |                              |
| reason          | varchar(500)    | NO       | NULL                 |                              |
| actor_id        | bigint unsigned | NO       | NULL                 |                              |
| idempotency_key | varchar(100)    | NO       | NULL                 |                              |
| created_at      | datetime(3)     | NO       | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED            |

## invoices

| Column           | Type            | Nullable | Default              | Extra / generated expression |
| ---------------- | --------------- | -------- | -------------------- | ---------------------------- |
| id               | bigint unsigned | NO       | NULL                 | auto_increment               |
| tenant_id        | bigint unsigned | NO       | NULL                 |                              |
| branch_id        | bigint unsigned | NO       | NULL                 |                              |
| patient_id       | bigint unsigned | NO       | NULL                 |                              |
| practitioner_id  | bigint unsigned | NO       | NULL                 |                              |
| invoice_number   | varchar(200)    | NO       | NULL                 |                              |
| lines            | json            | NO       | NULL                 |                              |
| total_cents      | int             | NO       | NULL                 |                              |
| status           | varchar(30)     | NO       | PAID                 |                              |
| idempotency_key  | varchar(200)    | NO       | NULL                 |                              |
| request_hash     | varchar(2000)   | NO       | NULL                 |                              |
| created_at       | datetime(3)     | NO       | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED            |
| receipt_snapshot | json            | YES      | NULL                 |                              |

## notification_outbox

| Column             | Type            | Nullable | Default              | Extra / generated expression |
| ------------------ | --------------- | -------- | -------------------- | ---------------------------- |
| id                 | bigint unsigned | NO       | NULL                 | auto_increment               |
| tenant_id          | bigint unsigned | NO       | NULL                 |                              |
| branch_id          | bigint unsigned | NO       | NULL                 |                              |
| patient_id         | bigint unsigned | NO       | NULL                 |                              |
| channel            | varchar(20)     | NO       | NULL                 |                              |
| template           | varchar(50)     | NO       | NULL                 |                              |
| recipient          | varchar(254)    | NO       | NULL                 |                              |
| payload            | json            | NO       | NULL                 |                              |
| status             | varchar(30)     | NO       | PENDING              |                              |
| attempts           | int             | NO       | 0                    |                              |
| available_at       | datetime(3)     | NO       | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED            |
| last_error         | varchar(2000)   | YES      | NULL                 |                              |
| provider_reference | varchar(2000)   | YES      | NULL                 |                              |
| deduplication_key  | varchar(200)    | NO       | NULL                 |                              |
| created_at         | datetime(3)     | NO       | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED            |

## package_redemptions

| Column          | Type            | Nullable | Default              | Extra / generated expression |
| --------------- | --------------- | -------- | -------------------- | ---------------------------- |
| id              | bigint unsigned | NO       | NULL                 | auto_increment               |
| tenant_id       | bigint unsigned | NO       | NULL                 |                              |
| branch_id       | bigint unsigned | NO       | NULL                 |                              |
| package_id      | bigint unsigned | NO       | NULL                 |                              |
| practitioner_id | bigint unsigned | NO       | NULL                 |                              |
| encounter_id    | bigint unsigned | NO       | NULL                 |                              |
| notes           | text            | NO       | NULL                 |                              |
| created_at      | datetime(3)     | NO       | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED            |

## patient_deposits

| Column       | Type            | Nullable | Default              | Extra / generated expression |
| ------------ | --------------- | -------- | -------------------- | ---------------------------- |
| id           | bigint unsigned | NO       | NULL                 | auto_increment               |
| tenant_id    | bigint unsigned | NO       | NULL                 |                              |
| branch_id    | bigint unsigned | NO       | NULL                 |                              |
| patient_id   | bigint unsigned | NO       | NULL                 |                              |
| amount_cents | int             | NO       | NULL                 |                              |
| reference    | varchar(200)    | NO       | NULL                 |                              |
| created_at   | datetime(3)     | NO       | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED            |

## patients

| Column               | Type            | Nullable | Default              | Extra / generated expression |
| -------------------- | --------------- | -------- | -------------------- | ---------------------------- |
| id                   | bigint unsigned | NO       | NULL                 | auto_increment               |
| tenant_id            | bigint unsigned | NO       | NULL                 |                              |
| branch_id            | bigint unsigned | NO       | NULL                 |                              |
| name                 | varchar(200)    | NO       | NULL                 |                              |
| national_id          | varchar(200)    | NO       | NULL                 |                              |
| date_of_birth        | date            | NO       | NULL                 |                              |
| sex                  | varchar(10)     | NO       | NULL                 |                              |
| phone                | varchar(50)     | NO       |                      |                              |
| email                | varchar(254)    | NO       |                      |                              |
| blood_group          | varchar(10)     | NO       |                      |                              |
| allergies            | json            | NO       | _utf8mb4\'[]\'       | DEFAULT_GENERATED            |
| conditions           | json            | NO       | _utf8mb4\'[]\'       | DEFAULT_GENERATED            |
| notification_consent | tinyint(1)      | NO       | 0                    |                              |
| version              | int             | NO       | 1                    |                              |
| created_at           | datetime(3)     | NO       | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED            |
| updated_at           | datetime(3)     | NO       | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED            |
| first_name           | varchar(150)    | NO       |                      |                              |
| last_name            | varchar(150)    | NO       |                      |                              |
| nationality          | varchar(20)     | YES      | NULL                 |                              |
| address_line1        | varchar(500)    | NO       |                      |                              |
| address_line2        | varchar(500)    | NO       |                      |                              |
| postcode             | varchar(20)     | NO       |                      |                              |
| state                | varchar(100)    | NO       |                      |                              |
| city                 | varchar(100)    | NO       |                      |                              |

## payments

| Column       | Type            | Nullable | Default              | Extra / generated expression |
| ------------ | --------------- | -------- | -------------------- | ---------------------------- |
| id           | bigint unsigned | NO       | NULL                 | auto_increment               |
| tenant_id    | bigint unsigned | NO       | NULL                 |                              |
| branch_id    | bigint unsigned | NO       | NULL                 |                              |
| invoice_id   | bigint unsigned | NO       | NULL                 |                              |
| method       | varchar(20)     | NO       | NULL                 |                              |
| amount_cents | int             | NO       | NULL                 |                              |
| reference    | varchar(200)    | NO       |                      |                              |
| created_at   | datetime(3)     | NO       | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED            |

## prescription_dose_logs

| Column          | Type            | Nullable | Default              | Extra / generated expression |
| --------------- | --------------- | -------- | -------------------- | ---------------------------- |
| id              | bigint unsigned | NO       | NULL                 | auto_increment               |
| tenant_id       | bigint unsigned | NO       | NULL                 |                              |
| branch_id       | bigint unsigned | NO       | NULL                 |                              |
| encounter_id    | bigint unsigned | NO       | NULL                 |                              |
| item_id         | bigint unsigned | NO       | NULL                 |                              |
| medicine_name   | varchar(200)    | NO       | NULL                 |                              |
| unit            | varchar(50)     | NO       | NULL                 |                              |
| outcome         | varchar(10)     | NO       | NULL                 |                              |
| source          | varchar(30)     | NO       | NULL                 |                              |
| occurred_at     | datetime(3)     | NO       | NULL                 |                              |
| amount          | decimal(12,3)   | YES      | NULL                 |                              |
| notes           | text            | NO       | NULL                 |                              |
| actor_id        | bigint unsigned | NO       | NULL                 |                              |
| idempotency_key | varchar(100)    | NO       | NULL                 |                              |
| request_hash    | char(64)        | NO       | NULL                 |                              |
| created_at      | datetime(3)     | NO       | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED            |

## prescription_reservations

| Column       | Type            | Nullable | Default              | Extra / generated expression |
| ------------ | --------------- | -------- | -------------------- | ---------------------------- |
| id           | bigint unsigned | NO       | NULL                 | auto_increment               |
| tenant_id    | bigint unsigned | NO       | NULL                 |                              |
| branch_id    | bigint unsigned | NO       | NULL                 |                              |
| encounter_id | bigint unsigned | NO       | NULL                 |                              |
| item_id      | bigint unsigned | NO       | NULL                 |                              |
| batch_id     | bigint unsigned | NO       | NULL                 |                              |
| quantity     | int             | NO       | NULL                 |                              |
| status       | varchar(20)     | NO       | RESERVED             |                              |
| consumed_at  | datetime(3)     | YES      | NULL                 |                              |
| created_at   | datetime(3)     | NO       | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED            |

## queue_tickets

| Column            | Type            | Nullable | Default              | Extra / generated expression                                                                                                      |
| ----------------- | --------------- | -------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| id                | bigint unsigned | NO       | NULL                 | auto_increment                                                                                                                    |
| tenant_id         | bigint unsigned | NO       | NULL                 |                                                                                                                                   |
| branch_id         | bigint unsigned | NO       | NULL                 |                                                                                                                                   |
| patient_id        | bigint unsigned | NO       | NULL                 |                                                                                                                                   |
| ticket_number     | varchar(20)     | NO       | NULL                 |                                                                                                                                   |
| service_date      | date            | NO       | NULL                 |                                                                                                                                   |
| status            | varchar(30)     | NO       | REGISTERED           |                                                                                                                                   |
| room_id           | bigint unsigned | YES      | NULL                 |                                                                                                                                   |
| practitioner_id   | bigint unsigned | YES      | NULL                 |                                                                                                                                   |
| priority          | varchar(10)     | NO       | NORMAL               |                                                                                                                                   |
| version           | int             | NO       | 1                    |                                                                                                                                   |
| called_at         | datetime(3)     | YES      | NULL                 |                                                                                                                                   |
| completed_at      | datetime(3)     | YES      | NULL                 |                                                                                                                                   |
| created_at        | datetime(3)     | NO       | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED                                                                                                                 |
| active_patient_id | bigint unsigned | YES      | NULL                 | STORED GENERATED; (case when (`status` not in (_utf8mb4\'COMPLETED\',_utf8mb4\'SKIPPED\')) then `patient_id` else NULL end)       |
| occupied_room_id  | bigint unsigned | YES      | NULL                 | STORED GENERATED; (case when (`status` in (_utf8mb4\'CALLED_TO_ROOM\',_utf8mb4\'IN_CONSULTATION\')) then `room_id` else NULL end) |

## reference_catalogs

| Column     | Type            | Nullable | Default              | Extra / generated expression |
| ---------- | --------------- | -------- | -------------------- | ---------------------------- |
| id         | bigint unsigned | NO       | NULL                 | auto_increment               |
| tenant_id  | bigint unsigned | NO       | NULL                 |                              |
| branch_id  | bigint unsigned | NO       | NULL                 |                              |
| kind       | varchar(30)     | NO       | NULL                 |                              |
| label      | varchar(200)    | NO       | NULL                 |                              |
| active     | tinyint(1)      | NO       | 1                    |                              |
| sort_order | int             | NO       | 0                    |                              |
| version    | int             | NO       | 1                    |                              |
| created_at | datetime(3)     | NO       | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED            |
| updated_at | datetime(3)     | NO       | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED            |

## resource_locks

| Column   | Type         | Nullable | Default | Extra / generated expression |
| -------- | ------------ | -------- | ------- | ---------------------------- |
| lock_key | varchar(200) | NO       | NULL    |                              |

## role_module_permissions

| Column     | Type            | Nullable | Default              | Extra / generated expression |
| ---------- | --------------- | -------- | -------------------- | ---------------------------- |
| tenant_id  | bigint unsigned | NO       | NULL                 |                              |
| role       | varchar(20)     | NO       | NULL                 |                              |
| modules    | json            | NO       | NULL                 |                              |
| updated_at | datetime(3)     | NO       | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED            |

## rooms

| Column    | Type            | Nullable | Default | Extra / generated expression |
| --------- | --------------- | -------- | ------- | ---------------------------- |
| id        | bigint unsigned | NO       | NULL    | auto_increment               |
| tenant_id | bigint unsigned | NO       | NULL    |                              |
| branch_id | bigint unsigned | NO       | NULL    |                              |
| name      | varchar(200)    | NO       | NULL    |                              |
| active    | tinyint(1)      | NO       | 1       |                              |

## schema_migrations

| Column     | Type         | Nullable | Default           | Extra / generated expression |
| ---------- | ------------ | -------- | ----------------- | ---------------------------- |
| name       | varchar(200) | NO       | NULL              |                              |
| checksum   | char(64)     | NO       | NULL              |                              |
| applied_at | timestamp    | NO       | CURRENT_TIMESTAMP | DEFAULT_GENERATED            |

## sessions

| Column     | Type            | Nullable | Default              | Extra / generated expression |
| ---------- | --------------- | -------- | -------------------- | ---------------------------- |
| token_hash | varchar(200)    | NO       | NULL                 |                              |
| user_id    | bigint unsigned | NO       | NULL                 |                              |
| csrf_token | varchar(200)    | NO       | NULL                 |                              |
| expires_at | datetime(3)     | NO       | NULL                 |                              |
| created_at | datetime(3)     | NO       | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED            |

## stock_movements

| Column         | Type            | Nullable | Default              | Extra / generated expression |
| -------------- | --------------- | -------- | -------------------- | ---------------------------- |
| id             | bigint unsigned | NO       | NULL                 | auto_increment               |
| tenant_id      | bigint unsigned | NO       | NULL                 |                              |
| branch_id      | bigint unsigned | NO       | NULL                 |                              |
| batch_id       | bigint unsigned | NO       | NULL                 |                              |
| dispense_id    | bigint unsigned | YES      | NULL                 |                              |
| quantity_delta | int             | NO       | NULL                 |                              |
| reason         | varchar(2000)   | NO       | NULL                 |                              |
| actor_id       | bigint unsigned | NO       | NULL                 |                              |
| created_at     | datetime(3)     | NO       | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED            |
| usage_id       | bigint unsigned | YES      | NULL                 |                              |

## tenants

| Column     | Type            | Nullable | Default              | Extra / generated expression |
| ---------- | --------------- | -------- | -------------------- | ---------------------------- |
| id         | bigint unsigned | NO       | NULL                 | auto_increment               |
| name       | varchar(200)    | NO       | NULL                 |                              |
| created_at | datetime(3)     | NO       | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED            |

## treatment_packages

| Column          | Type            | Nullable | Default              | Extra / generated expression |
| --------------- | --------------- | -------- | -------------------- | ---------------------------- |
| id              | bigint unsigned | NO       | NULL                 | auto_increment               |
| tenant_id       | bigint unsigned | NO       | NULL                 |                              |
| branch_id       | bigint unsigned | NO       | NULL                 |                              |
| patient_id      | bigint unsigned | NO       | NULL                 |                              |
| name            | varchar(200)    | NO       | NULL                 |                              |
| total_sessions  | int             | NO       | NULL                 |                              |
| used_sessions   | int             | NO       | 0                    |                              |
| price_cents     | int             | NO       | NULL                 |                              |
| expires_on      | date            | NO       | NULL                 |                              |
| version         | int             | NO       | 1                    |                              |
| created_at      | datetime(3)     | NO       | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED            |
| sale_invoice_id | bigint unsigned | YES      | NULL                 |                              |

## user_branches

| Column    | Type            | Nullable | Default | Extra / generated expression |
| --------- | --------------- | -------- | ------- | ---------------------------- |
| user_id   | bigint unsigned | NO       | NULL    |                              |
| branch_id | bigint unsigned | NO       | NULL    |                              |

## users

| Column         | Type            | Nullable | Default              | Extra / generated expression |
| -------------- | --------------- | -------- | -------------------- | ---------------------------- |
| id             | bigint unsigned | NO       | NULL                 | auto_increment               |
| tenant_id      | bigint unsigned | NO       | NULL                 |                              |
| branch_id      | bigint unsigned | NO       | NULL                 |                              |
| email          | varchar(254)    | NO       | NULL                 |                              |
| name           | varchar(200)    | NO       | NULL                 |                              |
| password_hash  | varchar(300)    | NO       | NULL                 |                              |
| role           | varchar(20)     | NO       | NULL                 |                              |
| license_number | varchar(100)    | YES      | NULL                 |                              |
| active         | tinyint(1)      | NO       | 1                    |                              |
| created_at     | datetime(3)     | NO       | CURRENT_TIMESTAMP(3) | DEFAULT_GENERATED            |
