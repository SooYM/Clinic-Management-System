-- Explicit capability; existing ordinary administrators are not silently elevated.
ALTER TABLE users ADD COLUMN is_super_admin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD CONSTRAINT users_super_admin_role CHECK (is_super_admin=FALSE OR role='ADMIN');
