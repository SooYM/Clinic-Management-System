-- Retain existing ISO countries and allow a user-entered nationality country.
ALTER TABLE patients DROP CHECK patients_country_code_format,
  MODIFY COLUMN country_code VARCHAR(5) NULL,
  ADD COLUMN country_name VARCHAR(100) NULL,
  ADD CONSTRAINT patients_country_code_format CHECK (country_code IS NULL OR country_code='OTHER' OR REGEXP_LIKE(country_code, '^[A-Z]{2}$', 'c')),
  ADD CONSTRAINT patients_custom_country CHECK ((country_code IS NOT NULL AND country_code='OTHER' AND country_name IS NOT NULL AND CHAR_LENGTH(TRIM(country_name)) BETWEEN 1 AND 100) OR ((country_code IS NULL OR country_code<>'OTHER') AND country_name IS NULL));
