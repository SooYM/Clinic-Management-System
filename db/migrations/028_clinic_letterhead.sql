ALTER TABLE tenants
  ADD COLUMN letterhead JSON NULL,
  ADD COLUMN letterhead_version INT NOT NULL DEFAULT 1 CHECK(letterhead_version > 0);
