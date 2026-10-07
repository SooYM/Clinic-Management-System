-- Stable UUID primary/foreign keys remain intact. Numeric public references are global, monotonic, and may contain gaps.
ALTER TABLE tenants ADD COLUMN tenant_number bigint unsigned NOT NULL AUTO_INCREMENT, ADD UNIQUE INDEX tenants_number_unique(tenant_number);
ALTER TABLE branches ADD COLUMN branch_number bigint unsigned NOT NULL AUTO_INCREMENT, ADD UNIQUE INDEX branches_number_unique(branch_number);
ALTER TABLE patients ADD COLUMN patient_number bigint unsigned NOT NULL AUTO_INCREMENT, ADD UNIQUE INDEX patients_number_unique(patient_number);
