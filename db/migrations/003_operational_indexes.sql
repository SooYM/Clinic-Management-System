-- Cover history, resource-conflict scans, outbox workers, and financial reporting as branch data grows.
CREATE INDEX patients_branch_search ON patients(tenant_id,branch_id,name);
CREATE INDEX appointments_practitioner_overlap ON appointments(practitioner_id,status,starts_at,ends_at);
CREATE INDEX appointments_room_overlap ON appointments(room_id,status,starts_at,ends_at);
CREATE INDEX clinical_documents_mc_overlap ON clinical_documents(patient_id,kind,revoked_at,start_date,end_date);
CREATE INDEX invoices_branch_history ON invoices(tenant_id,branch_id,created_at);
CREATE INDEX commissions_branch_history ON commission_ledger(tenant_id,branch_id,created_at);
CREATE INDEX deposits_patient_balance ON patient_deposits(tenant_id,branch_id,patient_id);
CREATE INDEX stock_movements_batch_history ON stock_movements(batch_id,created_at);
