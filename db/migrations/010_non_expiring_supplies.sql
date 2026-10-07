-- Medication expiry remains required by category-aware receiving validation.
-- General supplies may have no expiry; no existing batch values are changed.
ALTER TABLE inventory_batches MODIFY expires_on DATE NULL;
