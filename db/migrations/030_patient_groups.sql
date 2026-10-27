ALTER TABLE reference_catalogs DROP CHECK reference_catalog_kind;
ALTER TABLE reference_catalogs ADD CONSTRAINT reference_catalog_kind CHECK (kind IN ('LAB_PANEL','SPECIMEN_TYPE','INVENTORY_UNIT','REFERRAL_DESTINATION','BILLING_CATEGORY','PATIENT_GROUP'));
ALTER TABLE reference_catalogs ADD UNIQUE KEY catalog_scope_id(tenant_id,branch_id,id);
ALTER TABLE patients ADD COLUMN patient_group_id BIGINT UNSIGNED NULL,
  ADD CONSTRAINT patient_group_scope FOREIGN KEY (tenant_id,branch_id,patient_group_id) REFERENCES reference_catalogs(tenant_id,branch_id,id);
INSERT INTO reference_catalogs(tenant_id,branch_id,kind,label,sort_order) SELECT b.tenant_id,b.id,'PATIENT_GROUP',d.label,d.sort_order FROM branches b CROSS JOIN (SELECT 'Self-pay' label,0 sort_order UNION ALL SELECT 'Insurance',1 UNION ALL SELECT 'Company',2) d;
