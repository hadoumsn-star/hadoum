# Release Process

## Development deployment

Automatic. Merge a PR into `develop` (after `ci.yml` passes) and
`.github/workflows/cd.yml`'s `deploy-development` job builds, pushes, and
deploys within the same run - no manual step.

## Production deployment

1. Confirm `develop` has been running in development long enough to trust
   it (no fixed bake time is enforced by tooling - use judgment).
2. Cut a release: either push a tag matching `v*` (e.g. `git tag v1.4.0 &&
   git push origin v1.4.0`) or publish a GitHub Release from that tag.
3. `deploy-production` starts and pauses at the `production` GitHub
   Environment's approval gate (configure required reviewers once in
   **Settings > Environments > production** - see `docs/deployment.md`
   §2).
4. A reviewer approves the pending deployment in the Actions UI.
5. The job SSHes into the prod host and runs `scripts/deploy/deploy.sh
   prod <tag> <health_url>` - backup, pull, migrate (via
   `entrypoint.sh`), restart, health check, auto-rollback on failure (see
   `docs/deployment.md` §2 for the exact steps).
6. Watch the workflow run to its conclusion. A silent success is expected;
   a failure or rollback both send an alert (`docs/monitoring.md`) and
   fail the job, which should also surface in GitHub's normal
   notification channels for the repo.

## Rollback

**Preferred: redeploy a known-good tag.**

```
gh workflow run cd.yml -f environment=production -f image_tag=<previous 12-char sha>
```

(Or trigger it from the Actions UI: **Run workflow** on `cd.yml`, choose
`production`, and fill in `image_tag`.) This skips the build step entirely
and redeploys an already-built, already-tested image - the fastest safe
path back to a working state. Find the tag to roll back to from a previous
successful `build-and-push` run's logs, or from `.last_good_tag.prod` on
the server before the bad deploy overwrote it (if you have a moment to
check before redeploying).

**Automatic rollback** already happens if a deploy's post-deploy health
check fails (`scripts/deploy/deploy.sh` reverts to `.last_good_tag.<env>`
on its own) - the manual path above is for rolling back a deploy that
*passed* its health check but is misbehaving in a way the health check
doesn't catch.

## Emergency rollback (health check would not have caught it)

If the health endpoint is green but the app is otherwise broken (a data
bug, a bad business-logic change, a silent integration failure):

1. Identify the last known-good tag (same sources as above).
2. Run the manual redeploy command above immediately - don't wait to
   diagnose root cause first, restore service first.
3. If the database schema also needs to move backward (rare - most
   migrations here are additive), that is **not** automated. Stop the
   API, restore from the pre-deploy backup that `scripts/deploy/deploy.sh`
   took automatically (`docs/backups.md`), then redeploy the old tag.
4. Once service is restored, follow the incident response steps below.

## Database restore

See `docs/backups.md` in full. Summary: `scripts/backup/restore-test.sh`
to verify a backup non-destructively, `scripts/backup/restore.sh` (two
typed confirmations required) for the real, destructive restore.

## Incident response

1. **Restore service first, diagnose second** - use the rollback paths
   above rather than debugging in place under pressure, unless the
   in-place fix is clearly faster and lower-risk.
2. **Check `/api/health`** on the affected environment for which
   subsystem is failing (database, migrations, disk, storage - see
   `docs/monitoring.md`).
3. **Check `.github/workflows/monitor.yml`'s** latest run and any alerts
   received for context on when the problem started.
4. **Check logs** - structured JSON on stdout, correlate by
   `X-Request-Id` if the report includes one (`docs/monitoring.md`).
5. **After resolution**, write a short postmortem: what broke, when,
   blast radius, what the rollback/fix was, and one concrete
   process/tooling change that would have caught it sooner (add it to
   this repo's issue tracker or as a follow-up task - this document
   doesn't prescribe a template, just do it).
