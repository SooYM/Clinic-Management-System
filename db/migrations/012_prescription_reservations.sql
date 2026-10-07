ALTER TABLE inventory_batches ADD UNIQUE KEY batch_item_scope (tenant_id,branch_id,item_id,id);
CREATE TABLE prescription_reservations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  branch_id BIGINT UNSIGNED NOT NULL,
  encounter_id BIGINT UNSIGNED NOT NULL,
  item_id BIGINT UNSIGNED NOT NULL,
  batch_id BIGINT UNSIGNED NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'RESERVED' CHECK (status IN ('RESERVED','FULFILLED','RELEASED')),
  consumed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY reservation_batch (encounter_id,batch_id),
  KEY reservation_available (batch_id,consumed_at),
  FOREIGN KEY (tenant_id,branch_id,encounter_id) REFERENCES encounters(tenant_id,branch_id,id),
  FOREIGN KEY (tenant_id,branch_id,item_id) REFERENCES inventory_items(tenant_id,branch_id,id),
  FOREIGN KEY (tenant_id,branch_id,item_id,batch_id) REFERENCES inventory_batches(tenant_id,branch_id,item_id,id)
) ENGINE=InnoDB;
