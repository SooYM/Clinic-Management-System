# Workstation startup harness

Server database configuration loads `.env` before creating the MySQL pool, including direct database-module imports. Entrypoints must load configuration before importing dependent application modules. The launcher checks the configured MySQL3310 connection; API startup must use that same explicit URL. A successful MySQL preflight alone does not prove API3101 is listening. Check `/api/health` through the frontend origin after startup. Never solve a configuration-loading failure by starting another database on3306.

Run each app in its own PowerShell terminal, from any directory:

```powershell
webapp clinic management
webapp progress
```

Inspect allocations and current listeners:

```powershell
webapp ports
webapp status
webapp check clinic management
webapp check progress
```

Running `webapp clinic management` again stops verified Clinic web/API workers and restarts one instance on3100/3101. Unknown port owners abort before cleanup; no duplicate or fallback is started. Databases are reused only after ownership and authenticated readiness checks. Ctrl+C stops the foreground app; persistent MySQL stays running. The older `webapp clinic` alias remains supported.

| Application | Website | API | MySQL | Other local listeners |
| --- | --- | --- | --- | --- |
| Progress Tracker | http://localhost:3001 | Same process | 3307 | Existing unrelated listeners remain untouched |
| Clinic | http://127.0.0.1:3100 | 3101 | 3310 | Viewer3102, explicit demo3103, isolated QA3110–3114 |

The wrapper is `%USERPROFILE%\.local\bin\webapp.cmd`. Global files live in `%USERPROFILE%\.codex\harness`: `ENGINEERING.md`, `ports.json`, `port-events.jsonl`, `webapp.ps1`, `Write-PortEvent.ps1` and `Write-PortRegistry.ps1`. Both existing global AGENTS.md files reference this harness. Machine-specific global files are installed outside this repository. Fresh machines can use the repository's `start.ps1` after configuring MySQL and dependencies.

Register new apps through a reviewed complete registry and its locked atomic writer. Do not edit the live registry directly. Preserve allocation, retirement and observed history. No random ports or silent fallback. Progress permanently owns3001. Check actual listeners: a reservation alone does not prove process ownership.

Clinic configuration changed after a stopped-database cold backup in ignored `.local/backups/20261015-port-change`. It contains previous configuration and the complete data directory. Never commit or share it. Restore only while the verified database is stopped. Normal startup never initializes, resets, seeds or migrates data.

For data recovery, retain the current reserved ports in `.env` and `mysql.ini`. Do not reactivate Clinic's old API3001 or restore old port assignments alongside Progress Tracker. The guarded `scripts/start-local-mysql.ps1 -Stop` refuses shutdown while Clinic's application listeners remain active.

New legacy Exabytes projects default to maintained PHP/MySQL backends and locally built React/TypeScript static frontends. Preserve Angular in existing Angular projects. Node/Python server runtimes require verified hosting support. This Clinic backend requires a compatible Node host or separately scoped migration.

## Restart ownership and verification

The shared registry lock serializes cleanup before acquiring the next foreground lifetime lock. `scripts/stop-local-app.ps1` validates both3100/3101 listeners before stopping any process. It stops only verified project launchers, watchers and their descendants, checking creation time and command line again before termination. MySQL is excluded. Old failed development watchers are cleaned up when their command points into this project. `concurrently --kill-others` stops sibling workers when either child exits. No port reservation, account credential or database configuration changes during restart.

`webapp check clinic management` performs read-only configuration and ownership checks while Clinic is running. The workstation wrapper retains its earlier version at `%USERPROFILE%\.codex\harness\webapp.pre-clinic-management-20261021.ps1` for rollback. Restore that file to `webapp.ps1` to reinstate the earlier refusal-on-collision behavior.

On21 October2026, five focused startup tests passed. Two consecutive real `webapp clinic management` runs replaced web/API PIDs on the same ports; MySQL retained PID6896. The final web response returned200 and `/api/health` returned `ok`. No database records were edited during these checks.
