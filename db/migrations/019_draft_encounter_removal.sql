-- Retain original drafts and all foreign-key references; signed records cannot be removed through the application.
ALTER TABLE encounters ADD COLUMN deleted_at DATETIME(3) NULL;
CREATE INDEX encounters_active_history ON encounters (tenant_id,branch_id,deleted_at,patient_id,created_at);
