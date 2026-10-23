-- Nullable fees distinguish historical cashier-priced charts from doctor-approved checkout.
ALTER TABLE encounters
  ADD COLUMN consultation_fee_cents INT NULL CHECK (consultation_fee_cents >= 0),
  ADD COLUMN procedure_fee_cents INT NULL CHECK (procedure_fee_cents >= 0),
  ADD COLUMN consumables JSON NOT NULL DEFAULT (JSON_ARRAY());
