# Viewing MySQL tables

## Local browser viewer

Run from the project directory:

```powershell
npm run db:view
```

Open http://127.0.0.1:3002. Browser authentication username is `clinic_viewer`; password is the `DB_VIEWER_PASSWORD` value in private `.env`. Select a table to inspect its columns, exact row count and records. Use next/previous to page through every row. JSON fields remain structured; binary attachments are represented as byte counts and Base64. Password hashes and encrypted clinical payloads are database storage, not readable original passwords/photos.

This utility binds only the local loopback interface. It requires a separate `DB_VIEWER_DATABASE_URL`; there is no fallback to application/root credentials. Its database account has SELECT only, and endpoints permit no SQL commands or modifications. Keep it local and stop with Ctrl+C when finished. It is not mounted inside the production application and is not copied into its Docker runtime image.

## MySQL database client

Any MySQL-compatible client can use the same SELECT-only account:

- Host: `127.0.0.1`
- Port: `33079`
- Database: `clinic_dev`
- Username: `clinic_viewer`
- Database password: the password component of `DB_VIEWER_DATABASE_URL` in private `.env`.

Inspect tables and records with:

```sql
SHOW TABLES;
SHOW COLUMNS FROM patients;
SELECT COUNT(*) FROM patients;
SELECT * FROM patients ORDER BY created_at, id LIMIT 100 OFFSET 0;
```

Increase OFFSET to inspect subsequent rows. Use the browser viewer to enumerate all tables without writing SQL. Connection credentials are development-only; production inspection requires an independently provisioned read-only account through approved network access.

## Reset result

The isolated active MySQL database was cleared and its initial migrations reapplied on 2026-10-07. Administrator and initial clinic/branch/rooms were recreated. Subsequent user-entered records were preserved when migrations 006–009 were applied. Browser test fixtures use separate disposable databases. Signing into the application creates session/audit records as expected.

An automatic approval review blocked recursive removal of the unused `.local/pgdata` legacy PostgreSQL folder and old sample screenshots. Those ignored artifacts are not read by the active MySQL application and are not included in the deployment image. They remain on disk pending manual cleanup.
