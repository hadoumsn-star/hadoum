# Contributing

## Project layout

- `hadoum_api/` — NestJS backend (Prisma + PostgreSQL).
- `hadoum_frontend/` — React + Vite frontend.
- `docs/` — cross-cutting documentation (this file, `testing.md`, `ci.md`,
  `LOCAL_ENVIRONMENT.md`, `deployment.md`, `operations.md`, `backups.md`,
  `release-process.md`, `monitoring.md`).
- `hadoum_api/docs/` — backend-specific documentation
  (`database-migrations.md`, `security-audit.md`).

## Environments

This project has three isolated environments: **local** (your machine),
**development** (auto-deployed on merge to `develop`), and **production**
(deployed on tag/release, with manual approval). See `docs/deployment.md`
for the full picture and `docs/LOCAL_ENVIRONMENT.md` for the Docker-based
local setup (`docker-compose.local.yml`, `.env.local`, helper scripts under
`scripts/local/`).

## Before opening a pull request

Run the same checks CI runs (full commands in `docs/ci.md`):

```bash
# backend
cd hadoum_api
npx prisma validate
npm run lint:check
npm run test:cov
npm run build

# frontend
cd hadoum_frontend
npm run lint
npm run typecheck
npm run build
```

If your change touches a service covered by the unit-test suite
(`docs/testing.md` §1) or a user-facing flow covered by an integration or
Playwright spec (`docs/testing.md` §2–3), run that suite too and update or
add tests alongside the code change — don't rely on CI to be the first
place a regression is caught.

## Database changes

Any Prisma schema change needs a real migration
(`npx prisma migrate dev --name <description>` locally), committed
alongside the code that needs it. See `hadoum_api/docs/database-migrations.md`
for the full policy (why `db push` and `migrate reset` are forbidden
outside local scratch use, and how migrations are applied in each
environment).

## Coding conventions

- Backend: NestJS module structure (`*.controller.ts`, `*.service.ts`,
  `dto/`), DTOs validated with `class-validator`, Prisma as the only data
  access layer (no raw SQL outside the test-database helpers).
- Frontend: functional components, the config-driven page pattern used by
  the Module 4 pages (`src/app/config/*.config.ts` + a generic page
  component) rather than one bespoke component per resource.
- Both: no new `any` types in code you write or touch — the ~109 existing
  `@typescript-eslint/no-explicit-any` warnings on the frontend are known
  debt, not a precedent to extend (see the Sprint 5 report for the
  remediation recommendation).

## Commit / PR scope

Keep pull requests scoped to one concern (one feature, one fix, one
refactor). Sprint-sized work is fine as a single PR if it was scoped and
delivered as a single sprint (as this repo's own history does), but avoid
bundling unrelated changes into one PR out of convenience.

## Security-sensitive changes

Any change to authentication, authorization guards, validation-workflow
approval logic, or document access control should include an integration
test proving the boundary holds (401/403/404 as appropriate — see the
IDOR and self-approval tests in `hadoum_api/test/*.e2e-spec.ts` for the
pattern), not just a unit test against a mocked Prisma layer.
