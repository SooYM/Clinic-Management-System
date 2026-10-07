CREATE TABLE inventory_usages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  branch_id BIGINT UNSIGNED NOT NULL,
  item_id BIGINT UNSIGNED NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  reason VARCHAR(500) NOT NULL,
  actor_id BIGINT UNSIGNED NOT NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY usage_idempotency (branch_id,idempotency_key),
  UNIQUE KEY usage_scope (tenant_id,branch_id,id),
  FOREIGN KEY (tenant_id,branch_id,item_id) REFERENCES inventory_items(tenant_id,branch_id,id),
  FOREIGN KEY (actor_id) REFERENCES users(id)
) ENGINE=InnoDB;
ALTER TABLE stock_movements ADD COLUMN usage_id BIGINT UNSIGNED NULL,
  ADD CONSTRAINT movement_usage_fk FOREIGN KEY (tenant_id,branch_id,usage_id) REFERENCES inventory_usages(tenant_id,branch_id,id);
