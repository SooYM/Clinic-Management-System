-- Discover the original unnamed kind CHECK without assuming MySQL-generated constraint names.
SET @catalog_kind_check = (SELECT tc.CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS tc JOIN information_schema.CHECK_CONSTRAINTS cc ON cc.CONSTRAINT_SCHEMA=tc.CONSTRAINT_SCHEMA AND cc.CONSTRAINT_NAME=tc.CONSTRAINT_NAME WHERE tc.TABLE_SCHEMA=DATABASE() AND tc.TABLE_NAME='reference_catalogs' AND tc.CONSTRAINT_TYPE='CHECK' AND cc.CHECK_CLAUSE LIKE '%LAB_PANEL%' LIMIT 1);
SET @catalog_kind_drop = CONCAT('ALTER TABLE reference_catalogs DROP CHECK `', REPLACE(@catalog_kind_check,'`','``'), '`');
PREPARE catalog_kind_statement FROM @catalog_kind_drop;
EXECUTE catalog_kind_statement;
DEALLOCATE PREPARE catalog_kind_statement;
ALTER TABLE reference_catalogs ADD CONSTRAINT reference_catalog_kind CHECK (kind IN ('LAB_PANEL','SPECIMEN_TYPE','INVENTORY_UNIT','REFERRAL_DESTINATION','BILLING_CATEGORY'));
ALTER TABLE reference_catalogs ADD COLUMN billing_default VARCHAR(10) NULL, ADD CONSTRAINT billing_category_default CHECK (billing_default IS NULL OR (kind='BILLING_CATEGORY' AND billing_default IN ('SERVICE','PRODUCT'))), ADD UNIQUE KEY billing_category_default_once(branch_id,kind,billing_default);
INSERT INTO reference_catalogs(tenant_id,branch_id,kind,label,sort_order,billing_default) SELECT b.tenant_id,b.id,'BILLING_CATEGORY',d.label,d.sort_order,d.label FROM branches b CROSS JOIN (SELECT 'SERVICE' label,0 sort_order UNION ALL SELECT 'PRODUCT',1) d WHERE NOT EXISTS (SELECT 1 FROM reference_catalogs c WHERE c.branch_id=b.id AND c.kind='BILLING_CATEGORY');
