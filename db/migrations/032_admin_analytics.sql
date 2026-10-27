CREATE TABLE expenses (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 tenant_id BIGINT UNSIGNED NOT NULL,
 branch_id BIGINT UNSIGNED NOT NULL,
 actor_id BIGINT UNSIGNED NOT NULL,
 paid_on DATE NOT NULL,
 category VARCHAR(30) NOT NULL,
 description VARCHAR(500) NOT NULL,
 amount_cents INT UNSIGNED NOT NULL,
 reference VARCHAR(200) NOT NULL DEFAULT '',
 idempotency_key VARCHAR(100) NOT NULL,
 request_hash CHAR(64) NOT NULL,
 version INT NOT NULL DEFAULT 1,
 voided_at DATETIME(3) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY expenses_period(tenant_id,branch_id,paid_on,voided_at,id),
 UNIQUE KEY expenses_idempotency(branch_id,idempotency_key),
 FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES users(tenant_id,id),
 CHECK(category IN ('STOCK_PURCHASE','RENT','SALARY','UTILITIES','OTHER')),
 CHECK(amount_cents>0 AND amount_cents<=2000000000),
 CHECK(version>0)
) ENGINE=InnoDB;
CREATE INDEX payments_cash_period ON payments(tenant_id,branch_id,created_at,method,invoice_id);
CREATE INDEX stock_usage_period ON stock_movements(tenant_id,branch_id,created_at);
CREATE INDEX invoices_paid_period ON invoices(tenant_id,branch_id,status,created_at);
