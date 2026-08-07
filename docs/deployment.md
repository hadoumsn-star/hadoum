# Deployment

This document covers the three-environment layout, the CD pipeline, secret
management, and first-time server setup. For day-to-day local development
see `docs/LOCAL_ENVIRONMENT.md`. For running tests, `docs/testing.md`. For
CI (as opposed to CD), `docs/ci.md`.

## 1. Environments

| | Local | Development | Production |
|---|---|---|---|
| Purpose | Individual developer's machine | Shared, deployed pre-prod environment | Live environment |
| Compose file | `docker-compose.local.yml` | `docker-compose.development.yml` | `docker-compose.prod.yml` |
| Compose project | `hadoum-local` | `hadoum-development` | `hadoum-prod` |
| Env file | `.env.local` | `.env.development` | `.env.prod` |
| Database | dedicated, disposable | dedicated, persistent | dedicated, persistent, externally-managed volume |
| Network | `hadoum-network-local` | `hadoum-network-development` | `hadoum-network-prod` |
| Images | built locally, hot reload | pulled from GHCR, built optimized | pulled from GHCR, built optimized |
| Deploy trigger | none (manual `scripts/local/up.sh`) | automatic on merge to `develop` | on tag `v*` or GitHub Release, gated by manual approval |

No environment shares a volume or network name with another - see
`docs/LOCAL_ENVIRONMENT.md` §0 for the full resource-naming table and the
guard rails (`scripts/local/_common.sh`'s `guard_no_prod`) that keep local
tooling from ever touching a deployed environment.

## 2. CD pipeline (`.github/workflows/cd.yml`)

```
PR --> ci.yml --> merge to develop --> automatic deploy to development
                                              |
                                       (manual approval on the
                                        "production" GitHub Environment)
                                              v
                          tag "vX.Y.Z" or GitHub Release published
                                              |
                                              v
                                   automatic deploy to production
```

Jobs:

- **build-and-push** - builds the `hadoum_api` and `hadoum_frontend` Docker
  images and pushes them to GitHub Container Registry
  (`ghcr.io/<owner>/hadoum-api`, `ghcr.io/<owner>/hadoum-frontend`), tagged
  with the first 12 characters of the commit SHA. Skipped when a
  `workflow_dispatch` run supplies an explicit `image_tag` (redeploy /
  manual rollback - see `docs/release-process.md`).
- **deploy-development** - runs on every push to `develop`. SSHes into the
  configured dev host and runs `scripts/deploy/deploy.sh development
  <tag> <health_url>`.
- **deploy-production** - runs on a `v*` tag push or a published GitHub
  Release. Uses the `production` GitHub Environment, so it will pause for
  approval if you configure required reviewers there (**Settings >
  Environments > production > Required reviewers** - the workflow file
  cannot enable this for you, it must be set once in the repo UI). Then
  SSHes into the prod host and runs `scripts/deploy/deploy.sh prod <tag>
  <health_url>`.

Every deploy (`scripts/deploy/deploy.sh`), in order:

1. **Backs up** the target database (`scripts/backup/backup.sh`) - the
   deploy is aborted before anything changes if the backup fails.
2. **Pulls** the new image tag.
3. **Restarts** the stack (`docker compose up -d`), which runs `prisma
   migrate deploy` automatically via `hadoum_api/entrypoint.sh` before the
   API process starts.
4. **Health-checks** the deployed health endpoint for up to ~60 seconds.
5. **Rolls back** automatically to the last known-good tag (recorded in
   `.last_good_tag.<env>` on the deploy host) if the health check never
   turns green, and sends an alert either way (success is silent; failure
   and rollback both alert - see `docs/monitoring.md`).

Until a real server exists, `deploy-development` and `deploy-production`
fail fast at their "Verify required secrets" step with a clear list of
what's missing - this workflow is safe to merge before any infrastructure
is provisioned.

## 3. Secrets

All secrets are GitHub Actions repository/environment secrets - **none are
committed**. `docs/LOCAL_ENVIRONMENT.md` covers `.env.local`, which stays
on the developer's machine only.

### Per-environment deploy secrets (set on the `development` / `production` GitHub Environments)

| Secret | Purpose |
|---|---|
| `{DEV,PROD}_DEPLOY_HOST` | SSH host of the deploy server |
| `{DEV,PROD}_DEPLOY_USER` | SSH user |
| `{DEV,PROD}_DEPLOY_SSH_KEY` | Private key (the matching public key must be authorized on the server) |
| `{DEV,PROD}_DEPLOY_SSH_PORT` | Optional, defaults to 22 |
| `{DEV,PROD}_DEPLOY_PATH` | Optional, defaults to `~/hadoum` - path to the checked-out repo on the server |
| `{DEV,PROD}_HEALTH_URL` | Full URL of the health endpoint to poll after deploy, e.g. `https://dev.hadoum.com/api/health` |

### Shared

| Secret | Purpose |
|---|---|
| `ALERT_WEBHOOK_URL` | Slack/Discord-compatible incoming webhook for CD/monitoring alerts (optional - alerting silently no-ops without it) |
| `GITHUB_TOKEN` | Automatic, used to push images to GHCR - nothing to configure |

### Application secrets (on the server, in `.env.development` / `.env.prod` - never in GitHub, never committed)

`DATABASE_URL` (assembled from `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB`),
`JWT_SECRET`, `S3_ENDPOINT`/`S3_REGION`/`S3_ACCESS_KEY`/`S3_SECRET_KEY`/`S3_BUCKET`,
`SMTP_USER`/`SMTP_PASS`, plus `FRONTEND_URL`, `NGINX_SERVER_NAME`,
`NGINX_CERT_DOMAIN`, `APP_ENV`, `LOG_LEVEL`, `RATE_LIMIT_MAX`,
`RATE_LIMIT_TTL_MS`, `API_IMAGE`, `FRONTEND_IMAGE`, `IMAGE_TAG`, and
optionally `ALERT_WEBHOOK_URL` (used by `hadoum_api/entrypoint.sh` to alert
on migration failure directly from the container). See `.env.example` (the
production template) and `.env.development.example` for the full list with
placeholders.

**Fail-if-missing is enforced at two layers**: `docker-compose.prod.yml`
uses `${VAR:?message}` for every required variable (container refuses to
start without it), and the CD workflow's "Verify required secrets" step
fails the deploy before it touches the server if any deploy secret is
absent.

### Audit

A hardcoded database password was found and removed from
`hadoum_api/docker-compose.yml` (a legacy standalone-Postgres compose file
used only for the "run the API directly on the host" workflow) during this
sprint - it now reads credentials from a gitignored `hadoum_api/.env`
instead. That file was never pushed to a shared remote in this repo's
history at time of writing, but rotate the corresponding local Postgres
password if this repository has ever been pushed anywhere non-private.

## 4. First-time server setup (per environment)

On the target host (development or production):

```bash
git clone <this-repo-url> ~/hadoum
cd ~/hadoum
cp .env.example .env.prod              # or .env.development.example -> .env.development
vi .env.prod                            # fill in real values
docker volume create hadoum-postgres-prod-data   # prod only - the volume is external:true
```

Authorize the deploy key: append the **public** half of the key you put in
`{DEV,PROD}_DEPLOY_SSH_KEY` to `~/.ssh/authorized_keys` for the deploy
user.

Authenticate the **server itself** to GHCR so `docker compose pull` works
there (the CI runner gets this for free via `GITHUB_TOKEN` when building
images, but the deploy host is a separate machine and needs its own
login): generate a GitHub PAT with `read:packages` scope and run once,
on the server:

```bash
echo "$GHCR_PAT" | docker login ghcr.io -u <github-username> --password-stdin
```

GHCR packages default to private; either keep this login in place or make
the packages public in the repo's package settings.

For production's TLS: provision certificates under
`/etc/letsencrypt/live/<NGINX_CERT_DOMAIN>/` on the host before the first
deploy (e.g. via certbot in standalone mode against port 80) - the frontend
container mounts `/etc/letsencrypt` read-only and will fail health checks
without a valid cert at that path. `templates/default.conf.template` (in
`hadoum_frontend/`) serves the Let's Encrypt HTTP-01 challenge path over
plain HTTP for renewals.

Once the `.env.*` file and (for prod) the external volume exist, the first
deploy can come from the CD pipeline (push to `develop`, or push a `v*`
tag) - no manual `docker compose up` is required afterward.

## 5. Manual / emergency deploy

See `docs/release-process.md` for rollback and incident procedures. In
short: `workflow_dispatch` the CD workflow with an explicit `image_tag` to
redeploy any previously-built image (including rolling back to an older
one) without waiting for a new build.
