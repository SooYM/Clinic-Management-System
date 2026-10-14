ALTER TABLE queue_tickets ADD COLUMN appointment_id BIGINT UNSIGNED NULL;
ALTER TABLE queue_tickets ADD CONSTRAINT queue_appointment_scope FOREIGN KEY (tenant_id,branch_id,appointment_id) REFERENCES appointments(tenant_id,branch_id,id);
CREATE UNIQUE INDEX queue_appointment_once ON queue_tickets(appointment_id);
