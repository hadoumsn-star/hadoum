# Database Backups & Disaster Recovery

## Strategy summary

| Requirement | How it's met |
|---|---|
| Nightly | Scheduled via the deploy host's cron (or a scheduled CD-style workflow - see §4); `scripts/backup/backup.sh` also runs automatically before every deploy |
| Compressed | `pg_dump -Fc` (custom format, zlib-compressed by default) |
| Retention | Dumps older than `BACKUP_RETENTION_DAYS` (default 14) are pruned after each successful backup |
| Rotation | Same mechanism - old dumps are deleted, not accumulated indefinitely |
| Verification | Every dump is immediately checked with `pg_restore --list` before being considered valid |
| Restore test | `scripts/backup/restore-test.sh` restores a dump into a disposable, throwaway database and checks it has completed migrations, then drops the disposable database - never touches real data |

All backup/restore scripts live in `scripts/backup/` and share
`scripts/backup/_common.sh`, which resolves `PROJECT_NAME` (`hadoum-prod`
by default, or `hadoum-development`) to the right container name and
`backups/<env>/` directory. `backups/` is gitignored everywhere.

## Taking a backup

```bash
# Production (the default)
POSTGRES_USER=... POSTGRES_DB=... ./scripts/backup/backup.sh

# Development
PROJECT_NAME=hadoum-development POSTGRES_USER=... POSTGRES_DB=... ./scripts/backup/backup.sh
```

`POSTGRES_USER`/`POSTGRES_DB` must be exported first (source the relevant
`.env.prod` / `.env.development` on the deploy host - never hardcoded in
the script). Output: `backups/<env>/hadoum_<env>_<UTC timestamp>.dump`.

This same script runs automatically as step 1 of every CD deploy
(`scripts/deploy/deploy.sh`) - a deploy is aborted before anything else
happens if the pre-deploy backup fails.

## Verifying a backup is actually restorable

A backup that has never been tested is not a verified backup. Run:

```bash
POSTGRES_USER=... POSTGRES_DB=... ./scripts/backup/restore-test.sh backups/prod/hadoum_prod_20260716_020000.dump
```

This creates a disposable database (`hadoum_restore_test_<timestamp>`) on
the **same** Postgres server, restores the dump into it, confirms
`_prisma_migrations` has completed entries, then drops the disposable
database - the real prod/development database is never touched. Run this
after every backup, or at minimum on a regular schedule (weekly is a
reasonable floor); wiring it into the same cron/schedule as the nightly
backup is the simplest way to guarantee it actually happens.

## Restoring for real (destructive)

```bash
POSTGRES_USER=... POSTGRES_DB=... ./scripts/backup/restore.sh backups/prod/hadoum_prod_20260716_020000.dump
```

This **overwrites** the live database. It requires two separate typed
confirmations (the environment name, then the literal word `RESTORE`) and
alerts on both success and failure. Use `restore-test.sh` first if there
is any doubt about whether the archive is valid - `restore.sh` is for the
real incident, not for checking.

## 4. Scheduling nightly backups

Two supported options, both calling the same script:

**Option A - server-side cron (simplest, recommended once a real server
exists):**

```cron
0 2 * * * cd ~/hadoum && . .env.prod && PROJECT_NAME=hadoum-prod POSTGRES_USER="$POSTGRES_USER" POSTGRES_DB="$POSTGRES_DB" ./scripts/backup/backup.sh >> /var/log/hadoum-backup.log 2>&1
```

**Option B - GitHub Actions schedule that SSHes in**, mirroring
`.github/workflows/monitor.yml`'s pattern (a `schedule:` trigger + the same
SSH secrets already configured for CD). Preferred if you want backup
failures to show up in GitHub's Actions history alongside deploys and
monitoring, at the cost of depending on GitHub Actions' scheduler
reliability (a server-side cron will still run backups if GitHub Actions
itself is unavailable).

Either way, a failed backup calls `scripts/notify.sh backup_failure ...`
(see `docs/monitoring.md`) if `ALERT_WEBHOOK_URL` is configured.

## Disaster recovery

**Scenario: production database is corrupted or lost.**

1. Stop the API to prevent writes against a broken database:
   `docker compose -p hadoum-prod -f docker-compose.prod.yml stop api`.
2. Identify the most recent backup: `ls -t backups/prod/*.dump | head -1`.
3. Run `restore-test.sh` against it first to confirm it's valid, if there's
   any time pressure allowing it.
4. Run `restore.sh` with that file.
5. Restart the API: `docker compose -p hadoum-prod -f docker-compose.prod.yml up -d api`.
6. Confirm via the health endpoint (`docs/monitoring.md`) and spot-check
   recent data for the gap between the backup timestamp and the incident.
7. Write up what happened per `docs/release-process.md`'s incident response
   section.

**Scenario: entire deploy host is lost.** Provision a new host per
`docs/deployment.md` §4, restore the most recent off-host copy of the
latest `backups/prod/*.dump` (**backups only exist on the host they were
taken on unless copied elsewhere** - see the recommendation below), then
follow the same restore steps.

**Recommendation (not yet automated):** ship backup archives to storage
outside the deploy host itself (e.g. the same Hetzner Object Storage bucket
already used for uploads, under a separate prefix) so a full host loss
doesn't also take the backups with it. This is the single most important
gap to close before this strategy is fully production-hardened - see the
Sprint 6 final report for this recommendation in context.
