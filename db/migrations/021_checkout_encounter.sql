-- Optional visit checkout association; legacy and standalone receipts remain valid.
ALTER TABLE invoices
  ADD COLUMN encounter_id BIGINT UNSIGNED NULL,
  ADD UNIQUE KEY invoices_encounter_unique (encounter_id),
  ADD CONSTRAINT invoices_encounter_scope FOREIGN KEY (tenant_id,branch_id,encounter_id)
    REFERENCES encounters(tenant_id,branch_id,id);
