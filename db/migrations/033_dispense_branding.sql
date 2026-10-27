ALTER TABLE dispenses ADD COLUMN label_snapshot JSON NULL,
  ADD CONSTRAINT dispense_label_snapshot CHECK(label_snapshot IS NULL OR JSON_TYPE(label_snapshot)='OBJECT');
