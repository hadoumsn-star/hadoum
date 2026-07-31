# Operations

Day-to-day operational reference for the development/production
environments. For first-time setup see `docs/deployment.md`; for
backups/restore see `docs/backups.md`; for what gets monitored and how
alerts fire see `docs/monitoring.md`; for the release/rollback workflow
see `docs/release-process.md`.

## Checking status

```bash
# On the deploy host, inside the checked-out repo (~/hadoum by default):
docker compose -p hadoum-prod -f docker-compose.prod.yml ps
docker compose -p hadoum-prod -f docker-compose.prod.yml logs -f --tail=200 [service]

# Or remotely:
curl -s https://hadoum.com/api/health | jq .
curl -s https://hadoum.com/api/metrics | head -50
```

Swap `hadoum-prod` / `docker-compose.prod.yml` for `hadoum-development` /
`docker-compose.development.yml` for the dev environment.

## Restarting a single service

```bash
docker compose -p hadoum-prod -f docker-compose.prod.yml --env-file .env.prod restart api
```

`api` restarts run `prisma migrate deploy` again on startup
(`hadoum_api/entrypoint.sh`) - harmless if there's nothing new to migrate,
but be aware a restart is not purely cosmetic if a migration is pending.

## Security posture reference

Configured this sprint, all in `hadoum_api/src/main.ts` unless noted:

| Control | Detail |
|---|---|
| Helmet | Default header set (HSTS, `X-Content-Type-Options`, CSP, etc.) via `helmet()` middleware |
| CORS | Restricted to `FRONTEND_URL` (comma-separated list supported), not wildcard-open; a startup warning fires if `FRONTEND_URL` is unset |
| Rate limiting | `@nestjs/throttler`, global guard, default 100 requests/60s per IP (`RATE_LIMIT_MAX` / `RATE_LIMIT_TTL_MS`); `/api/health` and `/api/metrics` are exempt via `@SkipThrottle()` |
| Compression | `compression()` middleware on the API; gzip in nginx for the frontend (`hadoum_frontend/templates/default.conf.template`) |
| Trusted proxy | `app.set('trust proxy', 1)` - the API trusts exactly one hop (nginx) for `X-Forwarded-*`, so `req.ip` and the rate limiter see the real client IP |
| Security headers (frontend) | HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP - all in `hadoum_frontend/templates/default.conf.template` |
| TLS | `ssl_protocols TLSv1.2 TLSv1.3`, restricted cipher list, session cache/tickets configured; certs expected at `/etc/letsencrypt/live/<NGINX_CERT_DOMAIN>/` |
| Non-root containers | Both `hadoum_api` (runs as the image's built-in `node` user) and nginx workers (default `nginx` user in the base image) |
| Signal handling | `tini` as PID 1 in `hadoum_api`'s image, so `SIGTERM` propagates correctly and zombie processes are reaped |

See `hadoum_api/docs/security-audit.md` (from the prior sprint) for the
authorization/IDOR-focused audit; this list is the infrastructure-layer
complement to it.

## Common tasks

**View required GitHub Secrets for a given environment**: `docs/deployment.md` §3.

**Rotate a secret** (e.g. `JWT_SECRET`): update it in `.env.prod` /
`.env.development` on the server, then `docker compose ... up -d api` to
pick it up. Rotating `JWT_SECRET` invalidates all existing sessions -
users will need to log in again.

**Scale**: not configured in this sprint - `docker-compose.*.yml` runs a
single instance of each service. See the Sprint 6 final report's
recommendations for what horizontal scaling would require (out of scope
here: it would need the active-users metric and rate limiter to move from
in-process state to a shared store).

**Renew TLS certificates**: run certbot on the host against the
`/.well-known/acme-challenge/` path served in
`hadoum_frontend/templates/default.conf.template`'s port-80 server block
(this path is intentionally excluded from the HTTP->HTTPS redirect so
renewals don't need to take the site down).
