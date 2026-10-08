# Deployment and recovery

The real application build and MySQL integration tests can be verified locally. Normal build/start uses MySQL; build:demo/start:demo serves the separate simulated browser demo. Docker is unavailable on this workstation, so the container build, HTTPS ingress and remote database TLS handshake remain deployment-host checks. No cloud deployment has been performed.

For the free Render browser demo, follow [RENDER_UPGRADE.md](RENDER_UPGRADE.md) and [render.yaml](../render.yaml). It has no database or worker and preloads fictional sessionStorage examples only. The rest of this guide covers the separate real MySQL application.

## Production configuration

Copy `deployment.env.example` to `.env.deploy` on the deployment host. Replace every placeholder with separate random secrets. Keep this file outside source control, restrict file permissions, and back up signing keys separately from the database. Photo workflow is retired; `PHOTO_ENCRYPTION_KEY` is optional for new deployments. Preserve any previously used photo key for retained historical encrypted records.

`APP_ORIGIN` and `PUBLIC_URL` must identify the same exact HTTPS origin, without a path or trailing slash. Production startup rejects missing keys, placeholder signing keys, invalid photo keys, root database credentials, invalid ports, and pending migrations. It verifies database connectivity and the built `dist/index.html` before listening. Empty business tables are valid; missing schema is not.

Database passwords in `DATABASE_URL` and `MIGRATION_DATABASE_URL` must be URL-encoded. These URLs are supplied explicitly rather than interpolating an unescaped password into a URL. MySQL's own `MYSQL_MIGRATION_PASSWORD` receives the original password.

`DATABASE_TLS=true` enables certificate and hostname verification. Set `DATABASE_TLS_CA_FILE` to a readable PEM certificate authority file when the database provider requires a custom CA; otherwise Node's trusted certificate authorities apply. Invalid certificates fail connection. No insecure certificate bypass is provided. For the bundled database only, `ALLOW_PRIVATE_DATABASE_PLAINTEXT=true` explicitly permits transport on Docker's isolated private network; the database has no published host port. Use verified TLS for remote database connections. Mount a CA file into containers and set its container path when using TLS there.

`TRUST_PROXY_HOPS=1` is suitable only when exactly one trusted HTTPS reverse proxy is the sole path to the loopback-published application port. Values 0 through 3 are supported. Never expose the application directly with a trusted-hop setting that allows untrusted clients to inject forwarded addresses.

## Docker setup

Install Docker Engine/Desktop with Compose v2 on the deployment host. The image runs Node as a non-root user; application containers have a read-only filesystem, writable temporary directory, dropped Linux capabilities, and resource limits. MySQL persists in named volume `clinic-mysql`.

```sh
docker compose --env-file .env.deploy --profile tools build
docker compose --env-file .env.deploy up -d db
docker compose --env-file .env.deploy --profile tools run --rm migrate
```

Provision the runtime account once using a DBA session. The MySQL image provisions `clinic_migrator` with schema permissions for migrations; the API and worker must use a separate runtime account.

```sh
docker compose --env-file .env.deploy exec db mysql -uroot -p
```

Replace the SQL password below with the runtime secret represented in `DATABASE_URL`. Do not paste production secrets into shared logs or commit them.

```sql
CREATE USER 'clinic_app'@'%' IDENTIFIED BY '<runtime password>';
GRANT SELECT, INSERT, UPDATE, DELETE ON clinic.* TO 'clinic_app'@'%';
```

Bootstrap exactly one administrator, then remove `BOOTSTRAP_PASSWORD` from deployment environment. Do not run sample seed in production.

```sh
docker compose --env-file .env.deploy --profile tools run --rm bootstrap
docker compose --env-file .env.deploy up -d app
docker compose --env-file .env.deploy ps
docker compose --env-file .env.deploy logs --tail=100 app
```

Place an HTTPS reverse proxy in front of `127.0.0.1:3001`. Preserve host and configured origin; forward client IP only through the trusted proxy. SSE queue connections require proxy buffering disabled and a read timeout exceeding the 20-second heartbeat. HTTP cookies are `Secure` in production, so browser sign-in must use HTTPS. Check `GET /api/health` through the deployed origin; it verifies live database connectivity. Startup migration checks run before this endpoint becomes available.

## Notification worker

Configure SMTP credentials and/or WhatsApp credentials plus approved templates in `.env.deploy`, then start the separate worker:

```sh
docker compose --env-file .env.deploy --profile notifications up -d worker
docker compose --env-file .env.deploy logs --tail=100 worker
```

The worker claims messages transactionally and reevaluates recipient consent. Refill reminders become available three days before prescription supply ends. `SENT` records provider acceptance, not confirmed delivery. Missing provider settings produce `UNCONFIGURED`; after configuration, an administrator can retry these messages through the notification controls. Provider delivery still requires a consented test recipient and verification on the actual deployment host.

## Deployment without Docker

Use Node 22.12 or newer and MySQL 8.4 with InnoDB/utf8mb4. Provision schema and separate migration/runtime users. Supply required production settings through the deployment service environment. With migration credentials active, run:

```sh
npm ci --include=dev
npm run build
npm run db:migrate
npm run db:bootstrap
```

Switch `DATABASE_URL` to the restricted runtime account before starting `npm start` and `npm run worker:notifications` as separate supervised processes. Bind loopback behind an HTTPS reverse proxy; use `HOST=0.0.0.0` only when ingress rules restrict direct access. Process supervisor restart policies and environment-secret permissions belong to the deployment host.

## Verification and upgrades

Run `npm run typecheck`, `npm run build`, and `npm test` before release. MySQL integration tests create isolated test databases using `TEST_DATABASE_URL`; never give them live clinic credentials. On the deployment host, additionally run `docker compose --env-file .env.deploy config --quiet`, build/start the container, confirm its healthcheck, sign in through HTTPS, test role/branch isolation, issue a clinical PDF, verify its public QR, and check worker/provider behavior.

Back up before upgrades, then rehearse migrations in staging. Stop API/worker writers, then run migration credentials before restarting them. All sixteen migrations apply in order;009 converts actual primary/foreign entity keys to numeric IDs. Migrations 010–012 add non-expiring supplies, usage records and prescription holds without rewriting existing clinical records. Migration 013 adds patient medication-taking reports without changing inventory or existing clinical rows. Preserve original signing/photo keys for retained historical records. Interrupted009 requires pre-upgrade backup restoration before retry. Resolve pending UUID-bearing checkout requests first; old hashes safely reject numeric retries. MySQL DDL commits implicitly; interrupted migration recovery may require a forward corrective migration or restored backup. Applied migration checksums must remain unchanged.

Back up MySQL with an approved consistent backup process, encrypt backup storage, restrict access, and rehearse restoration into an isolated database. Reconcile stock, deposits, invoice totals, and signed document integrity after restore. Retired package, commission, and photo records remain historical and must retain their integrity. The Compose volume is persistence, not a backup. Do not run `docker compose down -v` against retained clinic data.

The repository does not provision TLS ingress, encrypted production disks, external monitoring/alerting, provider credentials, backup infrastructure, retention policy or disaster recovery automatically. Container/runtime/TLS/provider checks remain necessary before clinical production use.

## Catalog setup after upgrading

Migration 014 preserves inventory and adds active/version fields plus branch reference catalogs. No choices are preloaded into local MySQL. Administrators configure lab panels, specimen types, inventory units and referral destinations in Administration. The browser demo alone includes fictional starter choices. Archive choices to remove future selections while retaining historical records.

Migration 015 preserves existing data, enables versioned branch removal/restoration and adds nullable receipt snapshots. Back up before applying and restart API/worker writers afterward. Do not alter applied migration checksums. Existing invoices remain legacy metadata fallbacks; only future checkout writes snapshots.

Migration 016 adds nullable patient country of nationality. Back up before applying, then restart the API. Explicit Malaysian records receive MY; no foreign country is guessed. Entity IDs and historical clinical/financial rows remain unchanged. Render browser demo needs no MySQL migration.
