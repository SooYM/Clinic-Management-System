-- Keep booking, notification and audit history when a future/unused booking is removed from the active list.
ALTER TABLE appointments ADD COLUMN deleted_at DATETIME(3) NULL;
