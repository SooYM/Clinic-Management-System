CREATE TABLE commission_policies(
 tenant_id char(36) NOT NULL,
 branch_id char(36) PRIMARY KEY,
 service_base_bps integer NOT NULL DEFAULT 1000,
 service_threshold_cents integer NOT NULL DEFAULT 50000,
 service_high_bps integer NOT NULL DEFAULT 1500,
 product_bps integer NOT NULL DEFAULT 500,
 updated_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id),
 CHECK(service_base_bps BETWEEN 0 AND 10000),
 CHECK(service_high_bps BETWEEN 0 AND 10000),
 CHECK(product_bps BETWEEN 0 AND 10000),
 CHECK(service_threshold_cents>=0)
) ENGINE=InnoDB;
ALTER TABLE users MODIFY COLUMN email varchar(254) NOT NULL;
ALTER TABLE patients MODIFY COLUMN email varchar(254) NOT NULL DEFAULT '';
