-- Extend staff roles without changing existing accounts or configured module grants.
ALTER TABLE users DROP CHECK users_chk_1;
ALTER TABLE users ADD CONSTRAINT users_role_allowed CHECK(role IN ('ADMIN','DOCTOR','RECEPTIONIST','NURSE','THERAPIST','CASHIER'));
ALTER TABLE role_module_permissions DROP CHECK role_module_permissions_chk_1;
ALTER TABLE role_module_permissions ADD CONSTRAINT role_module_permissions_role_allowed CHECK(role IN ('DOCTOR','RECEPTIONIST','NURSE','THERAPIST','CASHIER'));
-- A missing manufacturer batch is NULL, preserving unique numbered batches while allowing repeated unnumbered receipts.
ALTER TABLE inventory_batches MODIFY batch_number varchar(100) NULL;
