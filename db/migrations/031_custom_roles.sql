CREATE TABLE custom_roles (
 id bigint unsigned NOT NULL AUTO_INCREMENT,
 tenant_id bigint unsigned NOT NULL,
 name varchar(100) NOT NULL,
 modules json NOT NULL,
 version int NOT NULL DEFAULT 1,
 created_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(id),
 UNIQUE KEY custom_roles_tenant_id(tenant_id,id),
 UNIQUE KEY custom_roles_name(tenant_id,name),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id),
 CHECK(JSON_TYPE(modules)='ARRAY')
) ENGINE=InnoDB;
ALTER TABLE users ADD COLUMN custom_role_id bigint unsigned NULL;
ALTER TABLE users ADD CONSTRAINT users_custom_role FOREIGN KEY(tenant_id,custom_role_id) REFERENCES custom_roles(tenant_id,id);
ALTER TABLE users ADD CONSTRAINT users_admin_custom_role CHECK(role<>'ADMIN' OR custom_role_id IS NULL);
