ALTER TABLE inventory_items ADD COLUMN active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN version INT NOT NULL DEFAULT 1 CHECK (version>0),
  ADD COLUMN updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
CREATE TABLE reference_catalogs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  branch_id BIGINT UNSIGNED NOT NULL,
  kind VARCHAR(30) NOT NULL CHECK (kind IN ('LAB_PANEL','SPECIMEN_TYPE','INVENTORY_UNIT','REFERRAL_DESTINATION')),
  label VARCHAR(200) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0 CHECK (sort_order>=0 AND sort_order<=1000000),
  version INT NOT NULL DEFAULT 1 CHECK (version>0),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY catalog_label (branch_id,kind,label),
  KEY catalog_choices (tenant_id,branch_id,kind,active,sort_order,id),
  FOREIGN KEY (tenant_id,branch_id) REFERENCES branches(tenant_id,id)
) ENGINE=InnoDB;
