-- Expiry releases operational uniqueness while retaining original visit status and references.
ALTER TABLE queue_tickets
  ADD COLUMN expired_at DATETIME(3) NULL,
  DROP INDEX occupied_room_id,
  DROP INDEX branch_id,
  DROP COLUMN active_patient_id,
  DROP COLUMN occupied_room_id,
  ADD COLUMN active_patient_id BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN expired_at IS NULL AND status NOT IN ('COMPLETED','SKIPPED') THEN patient_id ELSE NULL END) STORED,
  ADD COLUMN occupied_room_id BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN expired_at IS NULL AND status IN ('CALLED_TO_ROOM','IN_CONSULTATION') THEN room_id ELSE NULL END) STORED,
  ADD UNIQUE KEY queue_active_patient (branch_id,active_patient_id),
  ADD UNIQUE KEY queue_occupied_room (occupied_room_id),
  ADD INDEX queue_expiry (tenant_id,branch_id,expired_at,created_at);
