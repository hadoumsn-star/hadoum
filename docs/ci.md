# Continuous Integration

`.github/workflows/ci.yml` runs on every push and pull request. It is
organized as five independent jobs so a failure in one (say, Playwright)
doesn't hide a failure in another (say, backend lint).

## Jobs

### `backend`

Runs against `hadoum_api`.

1. Checkout, `actions/setup-node` (installs the Node version pinned for the
   repo), `npm ci`.
2. `npx prisma generate` and `npx prisma validate` — catches a schema/client
   drift before anything else runs.
3. `npm run lint:check` — ESLint, zero-warnings gate.
4. `npm run test:cov -- --ci` — the nine-service Jest unit suite (see
   `docs/testing.md` §1) with coverage. Fails the job if any per-service
   `coverageThreshold` in `package.json` is not met.
5. Uploads the `coverage/` directory as the `backend-coverage` artifact
   (`actions/upload-artifact@v4`) — downloadable from the run summary as an
   HTML report.
6. `npm run build` — `tsc` production build, catches any type error the
   faster `lint`/`test` steps didn't.

### `backend-e2e`

Runs the backend's HTTP-level integration suite (`docs/testing.md` §2)
against a real, ephemeral database.

1. A `postgres:16` **service container** (with a health check the job waits
   on before proceeding) — not the developer's own database, not a mock.
2. Env vars for `DATABASE_URL` (pointing at the service container),
   `JWT_SECRET`, and placeholder S3/SMTP values (the real network calls
   those would trigger are replaced by `FakeUploadService` inside the test
   process itself, so the placeholders only need to exist, not resolve).
3. `npx prisma migrate deploy` — applies committed migrations exactly as
   production would, never `migrate dev` or `db push` (see the
   `infrastructure` job below, which enforces this repo-wide).
4. `npm run test:e2e`.

### `frontend`

Runs against `hadoum_frontend`.

1. Checkout, setup-node, `npm ci`.
2. `npm run lint` — ESLint (`eslint.config.js`), zero-error gate (warnings,
   e.g. the pre-existing `@typescript-eslint/no-explicit-any` debt, do not
   fail the build — see `docs/testing.md` and the sprint report for why).
3. `npm run typecheck` — `tsc --noEmit`.
4. `npm run build` — Vite production build.

### `e2e`

The full-stack Playwright run (`docs/testing.md` §3).

1. `postgres:16` service container, migrated with `prisma migrate deploy`.
2. Backend built (`npm run build`) and started in the background
   (`node dist/main.js &`), with a `curl` retry loop polling its health
   endpoint before proceeding — the job does not race a cold-starting
   server.
3. Test accounts seeded by running the project's real
   `hadoum_api/prisma/seed.ts` against the CI database (the same script
   used for local dev seeding — CI does not maintain a parallel seed
   script).
4. `npx playwright install --with-deps chromium`.
5. `npm run test:e2e` (`CI=true`, which Playwright's config reads to adjust
   retries/workers).
6. Uploads `playwright-report/` as the `playwright-report` artifact,
   whether the job passed or failed, so a failure's trace/screenshots are
   downloadable from the run summary.

### `infrastructure`

Pre-existing, unchanged by this sprint. Validates `docker-compose.yml`,
shell-script syntax, that no real `.env` file is tracked in git, and that
no workflow or script anywhere invokes a destructive Prisma command
(`db push`, `migrate reset`) outside of local-dev-only contexts. The new
`backend-e2e` and `e2e` jobs were written to comply with this policy
(`migrate deploy` only).

## What fails the pipeline

- ESLint errors (backend or frontend).
- `tsc` errors (backend build, frontend typecheck).
- Any failing Jest unit test, integration test, or Playwright test.
- Any of the nine core services dropping below its coverage threshold in
  `hadoum_api/package.json`'s `jest.coverageThreshold` (80% lines/statements,
  90% for `NotificationsService`).
- Prisma schema/client drift (`prisma validate` failing) or a migration
  that doesn't apply cleanly (`migrate deploy` failing).
- Any workflow, script, or compose file failing the `infrastructure` job's
  safety checks.

## Artifacts

Every run publishes, downloadable from the Actions run summary:

- `backend-coverage` — HTML coverage report for the nine core services.
- `playwright-report` — HTML report with traces/screenshots for every
  Playwright test, including failures.

## Running the same checks locally

```bash
# backend
cd hadoum_api
npx prisma generate && npx prisma validate
npm run lint:check
npm run test:cov
npm run build

# backend integration tests (needs hadoum_test DB — see docs/testing.md §2)
npm run test:e2e

# frontend
cd hadoum_frontend
npm run lint
npm run typecheck
npm run build

# frontend e2e (needs a running backend — see docs/testing.md §3)
npm run test:e2e
```
