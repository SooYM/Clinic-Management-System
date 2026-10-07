ALTER TABLE treatment_packages ADD COLUMN sale_invoice_id char(36) NULL;
ALTER TABLE treatment_packages ADD CONSTRAINT package_sale_invoice_fk FOREIGN KEY(tenant_id,branch_id,sale_invoice_id) REFERENCES invoices(tenant_id,branch_id,id);
CREATE UNIQUE INDEX package_sale_invoice_unique ON treatment_packages(sale_invoice_id);
