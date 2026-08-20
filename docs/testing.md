# Testing

This project has four layers of automated tests, all added in the "Quality
& CI" sprint. This document explains how to run each one, what database
each needs, the mocking strategy used, and how coverage is measured and
gated.

## 1. Backend unit tests (`hadoum_api`)

**What**: Jest tests for the nine core business-logic services
(`ValidationsService`, `NotificationsService`, `StockItemsService`,
`InventoryAssetsService`, `EntryLogsService`, `GoodsMovementLogsService`,
`SupplierContractsService`, `AdministrativeProceduresService`,
`MaintenanceTicketsService`), colocated as `*.service.spec.ts` next to the
service they test.

**Database**: none. `PrismaService` is fully mocked (`jest.fn()` per
Prisma model method) via `@nestjs/testing`'s `Test.createTestingModule`, so
these tests never touch Postgres and run in a few seconds.

**Coverage**: happy path, validation failures, authorization/self-approval
edge cases (delegated to `ValidationsService`, tested there directly),
duplicate approval, approval-after-rejection, invalid state transitions
(e.g. a critical maintenance ticket cannot be closed outside the validation
circuit), concurrency guards (Prisma `updateMany` atomic quantity checks in
`StockItemsService`), and document ownership (cross-resource IDOR guard on
every `getDocumentUrl`/`deleteDocument` method).

**Run**:
```bash
cd hadoum_api
npm test              # run once
npm run test:watch    # watch mode
npm run test:cov      # with coverage + threshold gate (see §5)
```

## 2. Backend integration / E2E tests (`hadoum_api`)

**What**: Jest + Supertest tests that boot the *real* `AppModule` (all
guards, pipes, filters, real HTTP routing) and issue real HTTP requests via
`supertest`. Located in `hadoum_api/test/*.e2e-spec.ts`:

| File | Covers |
|---|---|
| `auth.e2e-spec.ts` | login, 401 on every unauthenticated protected route (including the five legacy modules fixed in the security-audit sprint), 403 role boundaries |
| `validation-workflow.e2e-spec.ts` | full maintenance-ticket lifecycle (create → submit → reject → resubmit → approve), notifications, self-approval block, duplicate approval (409), approval-after-rejection (409), empty-comment rejection (400), 404, validation history |
| `lifecycle-scenarios.e2e-spec.ts` | same lifecycle depth for supplier contracts and administrative procedures |
| `stock-inventory-register.e2e-spec.ts` | stock entries/exits (including the sensitive large-exit → validation path), inventory transfers (including the high-value → validation path), entry-log check-in/check-out and identity-document masking |
| `documents.e2e-spec.ts` | upload → list → signed URL → delete, cross-resource IDOR block, SUPERVISOR read-only enforcement, unauthenticated upload block |

**Database**: a real, disposable Postgres database, `hadoum_test`, on the
same Postgres server as local dev (`docker-compose.yml`'s `hadoum-db`
container). It is never the developer's own `hadoum_db`.

Set up once:
```bash
docker exec hadoum-db psql -U hadoum_user -d hadoum_db -c "CREATE DATABASE hadoum_test;"
cd hadoum_api
DATABASE_URL="postgresql://hadoum_user:hadoum1990@localhost:5432/hadoum_test" npx prisma migrate deploy
```

Configuration lives in `hadoum_api/.env.test` (gitignored — copy the shape
from the committed defaults if it's missing) and is loaded by
`test/setup-env.ts` via Jest's `setupFiles`, before any module (and
therefore before `PrismaService`, which reads `process.env.DATABASE_URL`
at construction time) is imported.

**Mocking strategy**: everything is real (real Postgres, real
`ValidationsService`, real bcrypt/JWT) **except** object storage.
`hadoum_api/test/utils/test-app.ts`'s `createTestApp()` overrides
`UploadService` with a `FakeUploadService` that returns deterministic fake
keys/URLs — no test ever calls real S3, in dev or in CI.

**Isolation between tests**: `test-app.ts`'s `cleanDatabase()` truncates
every table (except `_prisma_migrations`) with `CASCADE` before each test,
then `seedTestUsers()` recreates the two accounts every spec needs
(`director@test.local` / `supervisor@test.local`, password in
`TEST_PASSWORD`). Runs are serial (`maxWorkers: 1` in
`test/jest-e2e.json`) since all specs share one physical database.

**Run**:
```bash
cd hadoum_api
npm run test:e2e        # all *.e2e-spec.ts files
npm run test:e2e:cov    # with coverage (written to ../coverage-e2e)
```

## 3. Frontend E2E tests (`hadoum_frontend`, Playwright)

**What**: Playwright specs in `hadoum_frontend/e2e/*.spec.ts`, driving the
real running app in a real browser against the real backend — not a
mocked-API suite.

| File | Covers |
|---|---|
| `login.spec.ts` | invalid credentials, valid login, unauthenticated redirect |
| `navigation.spec.ts` | sidebar navigation, logout |
| `administration.spec.ts` | all Module 4 section cards, navigation into one |
| `supervisor.spec.ts` | SUPERVISOR dashboard pending-requests panel, read-only enforcement |
| `module4-register.spec.ts` | creating a visitor entry in the Registre d'entrées/sorties |
| `documents.spec.ts` | uploading a document to a register entry via the UI file picker |
| `validation.spec.ts` | two-actor scenario: DIRECTOR submits a sensitive goods movement in one browser context, SUPERVISOR approves it from a separate context |
| `notifications.spec.ts` | notification bell visibility/interaction |
| `responsive.spec.ts` | mobile viewport (375×812), no horizontal overflow, mobile menu toggle present |

**Database/backend**: these specs need a **real, running backend** (default
`http://localhost:3001`) connected to a real Postgres database, and the
frontend dev server (started automatically by Playwright's `webServer`
config in `playwright.config.ts` if not already running). In CI, the
`e2e` job in `.github/workflows/ci.yml` starts a Postgres service
container, migrates it, builds and starts the backend, then runs
Playwright against that stack.

**Test accounts**: `e2e/helpers.ts` defaults to the two real dev-database
accounts (`hadoum@gmail.com` / `dounde.diallo@gmail.com`) but every
credential is overridable via env vars (`E2E_DIRECTOR_EMAIL`,
`E2E_DIRECTOR_PASSWORD`, `E2E_SUPERVISOR_EMAIL`, `E2E_SUPERVISOR_PASSWORD`).
In CI, these accounts are created by running `hadoum_api/prisma/seed.ts`
against the freshly migrated CI database before Playwright starts.

**Run**:
```bash
cd hadoum_frontend
npx playwright install chromium   # once, downloads the browser binary
npm run test:e2e                  # headless, both desktop and mobile projects
npm run test:e2e:ui               # interactive UI mode
npm run test:e2e:report           # open the last HTML report
```

### 3a. Real upload/PDF coverage needs a real S3 endpoint (PR 19)

Unlike the backend E2E suite (§2), which overrides `UploadService` with an
in-memory `FakeUploadService`, these Playwright specs drive the **real**
running backend, which uses the **real** `UploadService` → a real S3-compatible
endpoint. `S3_ENDPOINT`/`S3_BUCKET` are "optionnel en local" (see
`.env.local.example`) — left blank, every upload (campaign documents, donor
report photos, contact photos, finance receipts, PDF report generation)
fails with `S3 upload failed: No value provided for input HTTP label: Bucket.`
Any spec depending on those flows either needs a real S3-compatible target
configured, or must design around uploads not being available (as most
existing document-upload specs already do — they assert the transaction/
resource itself was created, not that the attachment round-tripped).

To get **real** upload/PDF E2E coverage, point the backend at a local MinIO
instance instead of Hetzner:

- **Docker workflow** (`docker-compose.local.yml`): a `minio` service is
  already wired in, with a `minio-init` one-shot that creates the
  `hadoum-local` bucket on first boot. Set the MinIO block in `.env.local`
  as shown in `.env.local.example`, then `scripts/local/up.sh` as usual —
  the api container talks to `http://minio:9000`, never Hetzner.
- **No-Docker workflow** (e.g. this repo's `npm run start:dev` +
  portable-Postgres setup, with no Docker installed): download the
  single-binary MinIO server for your platform from
  https://min.io/download, then:
  ```bash
  # from the repo root — data dir is gitignored (.minio-portable), same
  # convention as .pgportable for Postgres
  mkdir -p .minio-portable/data
  MINIO_ROOT_USER=hadoum_dev_minio MINIO_ROOT_PASSWORD=<your-own-dev-password> \
    ./minio server .minio-portable/data --address ":9000" --console-address ":9001"
  ```
  Then create the bucket once (MinIO does not auto-create it) — either with
  the `mc` client, or via one call to the AWS SDK already installed in
  `hadoum_api` (`@aws-sdk/client-s3`), e.g. a one-off `node -e` script that
  constructs an `S3Client` pointed at `http://localhost:9000` with
  `forcePathStyle: true` and sends a `CreateBucketCommand({ Bucket:
  'hadoum-local' })`. Finally set `hadoum_api/.env`'s `S3_ENDPOINT=
  http://localhost:9000`, `S3_REGION=us-east-1`, `S3_ACCESS_KEY`/
  `S3_SECRET_KEY` to match, and `S3_BUCKET=hadoum-local`, then restart the
  backend (env vars are read once at process startup, not hot-reloaded).

Either way, credentials here are dev-only, local-only, never real Hetzner
production/development secrets, and never committed (`.env`/`.env.local`/
`.minio-portable` are all gitignored).

### 3b. Module 5 fixture-data determinism (PR 19)

`donors-module.spec.ts` reuses the shared dev database across every run,
same as the rest of this suite — there is no per-test isolated/disposable
database. That's usually harmless, but a few of the app's donor/campaign
`<select>` inputs fetch an unfiltered, alphabetically-sorted, backend-capped
page (`pageSize` maxes at 100 — see `QueryDonorProfilesDto` and its
siblings) rather than offering a live search. After enough accumulated runs,
a freshly created fixture can sort outside that first page and silently
never appear in the dropdown — which reads as test flakiness, not what it
actually is. `donors-module.spec.ts`'s `unique()` helper prefixes every
fixture name with `AAA-` specifically to keep it sorting first regardless of
how much data has accumulated. If you add a new Module 5 spec that creates a
donor/sponsor fixture and selects it from a plain (non-search) `<select>`,
reuse `unique()` rather than composing your own fixture name.

## 4. Manual verification

Every automated suite above was actually run against the live dev stack
(not just written) during this sprint — see the final sprint report for
the exact pass counts.

## 5. Coverage

**Backend**: `npm run test:cov` (from `hadoum_api`) generates
`hadoum_api/coverage/` (text summary in the terminal, `index.html` for a
browsable report, `lcov.info` for tooling). `package.json`'s `jest.coverageThreshold`
gates the nine core services individually (80% statements/lines each,
90% for `NotificationsService`) — **not** a single repository-wide number.
This is a deliberate, disclosed scoping decision: the nine services this
sprint added deep coverage for are held to a real bar; controllers, DTOs,
Prisma module wiring, and the seven services that predate this sprint
(`staff`, `children`, `finances`, `incidents`, `reports`, `spaces`,
`stock-movements`) are not yet covered and are not silently included in a
misleading aggregate. See the sprint report for the exact per-service
numbers and what remains uncovered.

**Frontend**: no unit-test framework was introduced (none existed before
this sprint, and the Playwright E2E suite already exercises the real
rendered app end-to-end); there is therefore no frontend line-coverage
number, by design — see the sprint report's "remaining uncovered areas"
section.

**CI enforcement**: see `docs/ci.md`.
