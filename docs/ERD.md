# Entity relationship diagrams

These diagrams describe the final MySQL 8.4 schema after migrations 001–026, including numeric conversion, general supplies and prescription reservations.

```mermaid
erDiagram
  tenants ||--o{ pending_registrations : owns
  branches ||--o{ pending_registrations : reserves
  patients o|--o{ pending_registrations : confirmed_profile
  queue_tickets o|--o{ pending_registrations : activated_ticket
  users o|--o{ pending_registrations : reviews
  pending_registrations {
    bigint id PK
    bigint tenant_id FK
    bigint branch_id FK
    varchar reference UK
    char submission_key "unique per branch"
    char request_hash
    char receipt_token_hash UK
    varchar ticket_number "unique per branch and service date"
    date service_date
    json payload "pending demographics only"
    varchar status "PENDING ACCEPTED REJECTED EXPIRED"
    datetime expires_at
    bigint patient_id FK "nullable until confirmed"
    bigint queue_ticket_id FK "nullable until confirmed"
    bigint reviewed_by FK "nullable until reviewed"
    int version
  }
```

Every displayed entity `id` is `BIGINT UNSIGNED AUTO_INCREMENT`; referenced IDs are unsigned BIGINT.
Mermaid `bigint` labels omit unsigned/auto-increment syntax for readability. Exact SQL remains authoritative.
Letter previews reuse `clinical_documents.payload`; prescription activity joins encounters, reservations, dispenses and stock movements. Neither read projection adds an entity.

## Organization, registry and clinical operations

```mermaid
erDiagram
  tenants ||--o{ branches : contains
  tenants ||--o{ role_module_permissions : grants
  tenants ||--o{ custom_roles : defines
  custom_roles o|--o{ users : module_policy
  custom_roles {
    bigint id PK
    bigint tenant_id FK
    varchar name "unique per tenant"
    json modules
    int version
  }
  branches ||--o{ users : primary_branch
  users ||--o{ user_branches : membership
  branches ||--o{ user_branches : permits
  users ||--o{ sessions : authenticates
  branches ||--o{ patients : registers
  branches ||--o{ rooms : contains
  patients ||--o{ appointments : books
  users ||--o{ appointments : practitioner
  rooms o|--o{ appointments : historical_room
  appointments o|--o| queue_tickets : optional_arrival
  patients ||--o{ queue_tickets : visits
  rooms o|--o{ queue_tickets : assigned
  users o|--o{ queue_tickets : practitioner
  patients ||--o{ encounters : history
  users ||--o{ encounters : attends
  queue_tickets o|--o{ encounters : optional_visit
  encounters ||--o{ clinical_documents : documents
  encounters ||--o{ prescription_dose_logs : taking_reports
  inventory_items ||--o{ prescription_dose_logs : medicine
  users ||--o{ prescription_dose_logs : recorded_by
  patients ||--o{ clinical_documents : identifies
  users ||--o{ clinical_documents : issues
  patients ||--o{ notification_outbox : recipient
  users ||--o{ audit_logs : actor
  branches ||--o{ audit_logs : scope
  tenants {
    bigint id PK
    varchar name
    datetime created_at
  }
  branches {
    bigint id PK
    bigint tenant_id FK
    varchar name
    varchar address
  }
  users {
    boolean is_super_admin "ADMIN capability"
    bigint id PK
    bigint tenant_id FK
    bigint branch_id FK
    varchar email UK
    varchar role
    varchar license_number
    boolean active
    varchar password_hash
  }
  user_branches {
    bigint user_id PK,FK
    bigint branch_id PK,FK
  }
  sessions {
    varchar token_hash PK
    bigint user_id FK
    varchar csrf_token
    datetime expires_at
  }
  role_module_permissions {
    bigint tenant_id PK,FK
    varchar role PK
    json modules
    datetime updated_at
  }
  patients {
    bigint id PK
    bigint tenant_id FK
    bigint branch_id FK
    varchar first_name
    varchar last_name
    varchar name
    varchar nationality
    varchar country_code
    varchar country_name
    varchar national_id
    date date_of_birth
    varchar sex
    varchar address_line1
    varchar address_line2
    varchar postcode
    varchar city
    varchar state
    json allergies
    json conditions
    boolean notification_consent
    int version
  }
  rooms {
    bigint id PK
    bigint tenant_id FK
    bigint branch_id FK
    varchar name
    boolean active
  }
  appointments {
    bigint id PK
    bigint tenant_id FK
    bigint branch_id FK
    bigint patient_id FK
    bigint practitioner_id FK
    bigint room_id FK
    datetime starts_at
    datetime ends_at
    datetime deleted_at
    varchar status
    int version
  }
  queue_tickets {
    bigint id PK
    bigint appointment_id FK,UK
    bigint tenant_id FK
    bigint branch_id FK
    bigint patient_id FK
    bigint room_id FK
    bigint practitioner_id FK
    varchar ticket_number
    date service_date
    varchar status
    datetime expired_at "nullable; history retained"
    bigint active_patient_id "generated"
    bigint occupied_room_id "generated"
    int version
  }
  encounters {
    datetime deleted_at "draft soft removal"
    bigint id PK
    bigint tenant_id FK
    bigint branch_id FK
    bigint patient_id FK
    bigint practitioner_id FK
    bigint queue_ticket_id FK
    text subjective
    text objective
    text assessment
    text plan
    json vitals
    json prescriptions "total quantity; optional quantityPerDose and indication"
    varchar status
    int version
    datetime signed_at
  }
  prescription_dose_logs {
    bigint id PK
    bigint tenant_id FK
    bigint branch_id FK
    bigint encounter_id FK
    bigint item_id FK
    varchar medicine_name
    varchar unit
    varchar outcome
    varchar source
    datetime occurred_at
    decimal amount "nullable for missed dose"
    text notes
    bigint actor_id FK
    varchar idempotency_key
    varchar request_hash
    datetime created_at
  }
  clinical_documents {
    bigint id PK
    bigint tenant_id FK
    bigint branch_id FK
    bigint encounter_id FK
    bigint patient_id FK
    bigint practitioner_id FK
    varchar kind
    varchar document_number UK
    json payload
    varchar verification_hash UK
    varchar signature_hash
    datetime revoked_at
  }
  notification_outbox {
    bigint id PK
    bigint tenant_id FK
    bigint branch_id FK
    bigint patient_id FK
    varchar deduplication_key UK
    varchar channel
    varchar status
    json payload
    int attempts
  }
  audit_logs {
    bigint id PK
    bigint tenant_id FK
    bigint branch_id FK
    bigint actor_id FK
    varchar entity_type
    bigint entity_id "polymorphic, no FK"
    varchar request_id
    json metadata
  }
```

## Inventory and finance

```mermaid
erDiagram
  branches ||--o{ inventory_items : catalogs
  inventory_items ||--o{ inventory_batches : receives
  inventory_items ||--o{ inventory_usages : used
  users ||--o{ inventory_usages : records
  inventory_usages o|--o{ stock_movements : supply_allocation
  encounters ||--o{ prescription_reservations : reserves
  inventory_items ||--o{ prescription_reservations : prescribed
  inventory_batches ||--o{ prescription_reservations : holds
  encounters ||--o| dispenses : dispensed_once
  patients ||--o{ dispenses : receives
  users ||--o{ dispenses : actor
  inventory_batches ||--o{ stock_movements : ledger
  dispenses o|--o{ stock_movements : allocation
  users ||--o{ stock_movements : actor
  encounters o|--o| invoices : optional_checkout
  patients ||--o{ invoices : billed
  users ||--o{ invoices : practitioner
  invoices ||--o{ payments : tender
  patients ||--o{ patient_deposits : balance_ledger
  inventory_items {
    bigint id PK
    bigint tenant_id FK
    bigint branch_id FK
    varchar sku
    varchar name
    varchar ingredient
    varchar category
    varchar unit
    int price_cents
    int reorder_level
  }
  inventory_batches {
    bigint id PK
    bigint tenant_id FK
    bigint branch_id FK
    bigint item_id FK
    varchar batch_number "nullable when manufacturer has no number"
    date expires_on "nullable for general supplies"
    int quantity
  }
  dispenses {
    bigint id PK
    bigint tenant_id FK
    bigint branch_id FK
    bigint encounter_id FK,UK
    bigint patient_id FK
    bigint actor_id FK
    varchar idempotency_key
  }
  inventory_usages {
    bigint id PK
    bigint tenant_id FK
    bigint branch_id FK
    bigint item_id FK
    bigint actor_id FK
    int quantity
    varchar reason
    varchar idempotency_key
    datetime created_at
  }
  prescription_reservations {
    bigint id PK
    bigint tenant_id FK
    bigint branch_id FK
    bigint encounter_id FK
    bigint item_id FK
    bigint batch_id FK
    int quantity
    varchar status
    datetime consumed_at "nullable while active"
  }
  stock_movements {
    bigint id PK
    bigint tenant_id FK
    bigint branch_id FK
    bigint batch_id FK
    bigint dispense_id FK
    bigint usage_id FK
    bigint actor_id FK
    int quantity_delta
    varchar reason
  }
  invoices {
    bigint id PK
    bigint encounter_id FK,UK
    bigint tenant_id FK
    bigint branch_id FK
    bigint patient_id FK
    bigint practitioner_id FK
    varchar invoice_number UK
    json lines
    int total_cents
    varchar status
    varchar idempotency_key
    varchar request_hash
  }
  payments {
    bigint id PK
    bigint tenant_id FK
    bigint branch_id FK
    bigint invoice_id FK
    varchar method
    int amount_cents
    varchar reference
  }
  patient_deposits {
    bigint id PK
    bigint tenant_id FK
    bigint branch_id FK
    bigint patient_id FK
    int amount_cents
    varchar reference
  }
```

Prescription `itemId` values reside inside encounter JSON, not a normalized prescription FK table.
Service validation enforces medication ownership. Payment sum, deposit balance and FEFO ordering require transactions.

## Historical features, not active workflows

```mermaid
erDiagram
  patients ||--o{ treatment_packages : historical_purchase
  invoices o|--o| treatment_packages : optional_sale
  treatment_packages ||--o{ package_redemptions : historical_use
  encounters ||--o{ package_redemptions : encounter
  users ||--o{ package_redemptions : practitioner
  invoices ||--o{ commission_ledger : historical_entry
  users ||--o{ commission_ledger : practitioner
  branches ||--o| commission_policies : historical_policy
  encounters ||--o{ clinical_photos : historical_attachment
  patients ||--o{ clinical_photos : patient
  users ||--o{ clinical_photos : actor
  treatment_packages {
    bigint id PK
    bigint tenant_id FK
    bigint branch_id FK
    bigint patient_id FK
    bigint sale_invoice_id FK,UK
    int total_sessions
    int used_sessions
    int price_cents
    date expires_on
    int version
  }
  package_redemptions {
    bigint id PK
    bigint tenant_id FK
    bigint branch_id FK
    bigint package_id FK
    bigint encounter_id FK
    bigint practitioner_id FK
  }
  commission_ledger {
    bigint id PK
    bigint tenant_id FK
    bigint branch_id FK
    bigint invoice_id FK
    bigint practitioner_id FK
    int base_cents
    int rate_basis_points
    int amount_cents
  }
  commission_policies {
    bigint branch_id PK,FK
    bigint tenant_id FK
    int service_base_bps
    int service_threshold_cents
    int service_high_bps
    int product_bps
  }
  clinical_photos {
    bigint id PK
    bigint tenant_id FK
    bigint branch_id FK
    bigint encounter_id FK
    bigint patient_id FK
    bigint actor_id FK
    varchar stage
    varchar mime_type
    boolean consent_recorded
    mediumblob encrypted_data
    binary iv
    binary auth_tag
  }
```

## Composite keys and constraint detail

Diagrams omit repeated organization edges to remain readable. These SQL constraints carry scope across the relationships:

| Constraint family                                                                                               | Meaning                                                           |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| branches `(tenant_id,id)` unique                                                                                | Scoped branch FK target                                           |
| patients/users `(tenant_id,id)` unique                                                                          | Tenant-bound person/account FK targets                            |
| rooms/appointments/queue/encounters/items/batches/dispenses/invoices/packages `(tenant_id,branch_id,id)` unique | Branch-bound FK targets                                           |
| user_branches `(user_id,branch_id)` PK                                                                          | Membership pair, not another entity ID                            |
| role_module_permissions `(tenant_id,role)` PK                                                                   | One override per tenant/role                                      |
| patients `(tenant_id,national_id)` unique                                                                       | Prevent duplicate tenant identity number                          |
| rooms `(branch_id,name)` unique                                                                                 | Branch room naming                                                |
| queue `(branch_id,active_patient_id)` unique                                                                    | One active patient visit per branch; nullable terminal projection |
| queue `occupied_room_id` unique                                                                                 | One called/in-consultation visit per room                         |
| queue `(branch_id,service_date,ticket_number)` unique                                                           | Ticket numbering within clinic day                                |
| inventory item `(branch_id,sku)` and batch `(item_id,batch_number)` unique                                      | Catalog and batch identity                                        |
| dispense `encounter_id` and `(branch_id,idempotency_key)` unique                                                | Single dispense and safe retries                                  |
| invoice `(branch_id,idempotency_key)` unique                                                                    | Retry-safe checkout                                               |
| historical redemption `(package_id,encounter_id)` unique                                                        | Prevent duplicate historical redemption                           |

`resource_locks(lock_key varchar(200) PRIMARY KEY)` has no entity FK and is omitted from relationship diagrams.
Sessions retain secret-keyed identities. Migration bookkeeping is likewise not an operational entity.
Checks enforce permitted status values, positive/nonnegative quantities, appointment ordering and MC dates.
Cross-row overlaps, selected-branch patient ownership and JSON-contained references remain application invariants.

See [database dictionary and upgrades](DATABASE.md) and [system flow](SYSTEM_FLOW.md).

These relationships describe the real MySQL application. Browser demo records are sessionStorage objects without database FK enforcement.
Preloaded fictional business records belong only to the browser demo; normal MySQL bootstrap does not insert them into these tables.

## Managed reference choices

```mermaid
erDiagram
  tenants ||--o{ reference_catalogs : owns
  branches ||--o{ reference_catalogs : configures
  reference_catalogs {
    bigint id PK
    bigint tenant_id FK
    bigint branch_id FK
    varchar kind
    varchar label
    varchar billing_default "nullable immutable SERVICE/PRODUCT marker"
    boolean active
    int sort_order
    int version
    datetime created_at
    datetime updated_at
  }
```

Inventory items also carry active status, optimistic version and update time after migration 014.

Migration 015 adds branches.active/version/updated_at and invoices.receipt_snapshot (nullable JSON). Entity IDs, table counts and FK relationships stay unchanged. The snapshot copies issued receipt metadata; it creates no new live relationship or entity ID.

Queue tickets now retain nullable expired_at. Generated active-patient and occupied-room uniqueness ignore expired rows; linked encounter foreign keys remain intact.


Medicine-sticker reprints read the existing `dispenses.encounter_id` relationship with the signed encounter's prescription JSON and linked patient/practitioner identities. The original timestamp is `dispenses.created_at`. No print table or schema migration is introduced; printing does not create dispensing, stock movement, reservation or billing records.


## Clinical pricing and letterhead update — 23 October 2026

See [clinical pricing, prescribing, minor surgery and letterhead](CLINICAL_PRICING_AND_LETTERHEAD.md) for current behavior, API fields, storage, permissions and operating instructions. This update supersedes earlier clinical range limits and pill-only dose labels.


Patient group relationship: `patients(tenant_id, branch_id, patient_group_id)` optionally references `reference_catalogs(tenant_id, branch_id, id)`. Catalog kind must be `PATIENT_GROUP`, enforced by patient writes. Composite foreign key prevents cross-scope assignment. Group rows are archived instead of deleted; renames resolve through stable numeric IDs. Migration: `030_patient_groups.sql`.
