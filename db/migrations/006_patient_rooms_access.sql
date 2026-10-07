ALTER TABLE rooms ADD COLUMN active boolean NOT NULL DEFAULT true;
CREATE INDEX rooms_active_branch ON rooms(tenant_id,branch_id,active);
ALTER TABLE patients ADD COLUMN first_name varchar(150) NOT NULL DEFAULT '';
ALTER TABLE patients ADD COLUMN last_name varchar(150) NOT NULL DEFAULT '';
ALTER TABLE patients ADD COLUMN nationality varchar(20) NULL;
ALTER TABLE patients ADD COLUMN address_line1 varchar(500) NOT NULL DEFAULT '';
ALTER TABLE patients ADD COLUMN address_line2 varchar(500) NOT NULL DEFAULT '';
ALTER TABLE patients ADD COLUMN postcode varchar(20) NOT NULL DEFAULT '';
ALTER TABLE patients ADD COLUMN state varchar(100) NOT NULL DEFAULT '';
ALTER TABLE patients ADD CONSTRAINT patients_nationality_allowed CHECK(nationality IS NULL OR nationality IN ('MALAYSIAN','NON_MALAYSIAN'));
UPDATE patients SET first_name=name WHERE first_name='';
CREATE TABLE role_module_permissions(
 tenant_id char(36) NOT NULL,
 role varchar(20) NOT NULL,
 modules json NOT NULL,
 updated_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(tenant_id,role),
 FOREIGN KEY(tenant_id) REFERENCES tenants(id),
 CHECK(role IN ('DOCTOR','RECEPTIONIST','NURSE','THERAPIST')),
 CHECK(JSON_TYPE(modules)='ARRAY')
) ENGINE=InnoDB;
