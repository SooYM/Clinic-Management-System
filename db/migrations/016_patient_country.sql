-- Preserve unknown nationalities in existing records; derive MY only for explicitly Malaysian patients.
ALTER TABLE patients ADD COLUMN country_code CHAR(2) NULL,
  ADD CONSTRAINT patients_country_code_format CHECK (country_code IS NULL OR REGEXP_LIKE(country_code, '^[A-Z]{2}$', 'c'));
UPDATE patients SET country_code='MY' WHERE nationality='MALAYSIAN';
