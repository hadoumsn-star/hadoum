# Monitoring, Logging & Alerting

## Health endpoint

`GET /api/health` (implemented with `@nestjs/terminus` in
`hadoum_api/src/health/`). Returns HTTP 200 with `{"status":"ok",...}` when
every check passes, HTTP 503 otherwise. Checks:

| Check | What it verifies |
|---|---|
| `database` | `SELECT 1` against Postgres, reports latency in ms |
| `migrations` | The most recent row in `_prisma_migrations` has `finished_at` set (i.e. no pending/failed migration) |
| `disk` | Root filesystem usage; fails above 90% (falls back to reporting "unavailable" rather than failing on platforms where `statfsSync` isn't supported, e.g. bare Windows) |
| `storage` | S3 env vars are present (a configuration check, not a live connectivity probe - see "Known scope limits" below) |
| `meta` | App version (from `package.json`), `APP_ENV`, process uptime in seconds |

This same endpoint is what `hadoum_api/healthcheck.js` calls for the
Docker `HEALTHCHECK` instruction, what the deploy script polls after every
deploy, and what `.github/workflows/monitor.yml` polls on a schedule.

## Metrics endpoint

`GET /api/metrics` (Prometheus text format, via `prom-client` in
`hadoum_api/src/metrics/`). Point a Prometheus server's scrape config at
this path (no separate exporter needed). Exposed metrics:

- **Default Node.js process metrics** (`hadoum_process_*`, `hadoum_nodejs_*`)
  via `collectDefaultMetrics()` - CPU time, resident memory, event loop lag,
  GC, etc. This is where "Memory" and "CPU" from the sprint goals are
  covered.
- `hadoum_http_request_duration_seconds` (histogram, labeled by method /
  route / status code) - response time.
- `hadoum_http_requests_total`, `hadoum_http_errors_total` (4xx/5xx) -
  request volume and error rate.
- `hadoum_db_query_latency_seconds` - a lightweight `SELECT 1` probe timed
  at scrape time (not per-query instrumentation - see below).
- `hadoum_active_users` - see "Active users" below.
- `hadoum_notifications_unread_total`, `hadoum_validation_queue_pending_total`,
  `hadoum_documents_total` - live counts queried from the database at
  scrape time.

### Known, disclosed scope limits

- **Database latency** is a periodic lightweight probe (`SELECT 1`,
  measured whenever `/api/metrics` is scraped), not per-request
  instrumentation of every real query. Wiring true per-query timing would
  mean touching `PrismaService`, which is shared by all nine
  services covered by Sprint 5's test suite - deliberately avoided to keep
  this infra sprint from risking regressions in already-tested business
  logic.
- **Active users** is an approximation: JWT auth is stateless, so there is
  no real server-side session list. The metric counts distinct
  authenticated user IDs seen in the last 15 minutes, tracked in an
  in-memory map on the API process. It resets on restart and is
  per-process (not aggregated across multiple API replicas, since none run
  today).
- **Uploads** is proxied by `hadoum_documents_total`, which counts rows in
  the `Document` table (used by the children module). Module 4's
  attachments (stock, inventory, entry-logs, etc.) store files outside
  that table and are not yet aggregated into a single uploads metric.
- **Storage** health/metrics check configuration presence, not live S3
  reachability - a real connectivity probe on every health check would add
  latency and an external dependency to a check that's supposed to be
  fast and self-contained.

## Logging

Structured JSON via `nestjs-pino` (`hadoum_api/src/app.module.ts`,
`LoggerModule.forRoot(...)`). Every log line is a JSON object with at
least `level`, `time`, `pid`, `hostname`, `msg`; HTTP request logs add
`req`/`res`/`responseTime`.

- **Levels**: `debug`, `info`, `warn`, `error` (standard pino levels),
  controlled by `LOG_LEVEL` (defaults: `debug` in local, `info` in
  development/production, `silent` in the e2e test env).
- **Correlation ID**: every request gets an `id` (from the incoming
  `X-Request-Id` header if present, otherwise a generated UUID), echoed
  back as the `X-Request-Id` response header and attached to every log
  line for that request - grep any log aggregator by that ID to get the
  full request's log trail.
- **No secrets**: `redact` paths strip `Authorization`/`Cookie` headers,
  `Set-Cookie` response headers, and `password`/`currentPassword`/
  `newPassword`/`token` request body fields before they're ever
  serialized, replacing them with `[REDACTED]`.
- `/api/health` and `/api/metrics` requests are excluded from
  auto-logging (`autoLogging.ignore`) so scheduled polling doesn't spam
  the logs.

Logs go to stdout/stderr as newline-delimited JSON - ship them to whatever
log aggregation the deploy host has (Docker's default `json-file` driver,
or forward via a log shipper) rather than writing to files inside the
container.

## Alerting

`scripts/notify.sh` (host-side) and `hadoum_api/scripts/notify.sh`
(container-side, used by `entrypoint.sh`) post a JSON payload to a
Slack/Discord-compatible incoming webhook (`ALERT_WEBHOOK_URL`). Both are
no-ops (never fail the caller) when the webhook isn't configured - alerting
must never be able to take down a deploy or a backup job.

| Trigger | Fired from |
|---|---|
| Container restart | `scripts/monitor/check-containers.sh` (compares `RestartCount` across runs) |
| Backup failure | `scripts/backup/backup.sh` |
| Migration failure | `hadoum_api/entrypoint.sh` (on `prisma migrate deploy` failure) |
| Health check failure | `.github/workflows/monitor.yml`'s HTTP check, and `deploy.sh`'s post-deploy check |
| Disk usage above threshold | `scripts/monitor/check-containers.sh` (default 90%, `DISK_WARNING_PERCENT`) |
| Database unavailable | `scripts/monitor/check-containers.sh` (`pg_isready`) |
| Deploy failure / rollback | `scripts/deploy/deploy.sh` |
| Unhealthy container (Docker healthcheck) | `scripts/monitor/check-containers.sh` |

`.github/workflows/monitor.yml` runs every 15 minutes, independent of
deploys, so problems between deployments are still caught. Both its jobs
degrade gracefully (log a notice and exit 0) if the relevant secrets
aren't configured yet.

## What's not yet built

No dashboard/visualization layer (Grafana or similar) is included - this
sprint exposes the metrics and delivers webhook alerts, but does not stand
up a Prometheus server or a dashboard to scrape/display them. Wiring
`/api/metrics` into an existing or new Prometheus instance is the natural
next step; see the Sprint 6 final report's recommendations.
