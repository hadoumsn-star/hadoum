# Database migrations — Module 4 consolidation

This document records the migration-baselining work done in the Module 4
consolidation sprint (2026-07-30): moving from an unmigrated `prisma db
push` workflow to a versioned `prisma migrate deploy` workflow, without
losing any data on the development database.

## 1. Environment identified

- **Connection**: `DATABASE_URL` in `.env` (gitignored, not committed) points to
  `postgresql://hadoum_user:***@localhost:5432/hadoum_db`.
- **Database**: `hadoum_db`, running in Docker container `hadoum-db`
  (`postgres:16`, defined in `docker-compose.yml`), port 5432 mapped to the
  host. Confirmed running (`docker ps`) throughout this sprint.
- **Classification**: local Docker development database. There is no
  staging or production configuration anywhere in this repository — only
  one `docker-compose.yml` and one `.env` exist, and no deployment target
  other than local dev is referenced. All safety rules about "never run
  against production" are therefore satisfied by construction: nothing in
  this repo can point at a production database.
- `.env` is listed in `.gitignore` and confirmed absent from `git ls-files`
  — no secret is committed.

## 2. Existing migration inventory (before this sprint)

20 migrations existed under `prisma/migrations/`, from
`20260514093658_init_module1` to `20260603300000_add_candidate_integration_date`.
All 20 were confirmed applied and healthy in `_prisma_migrations`
(`finished_at` set, `rolled_back_at` null, checksums intact, in the same
order as the migration directories) before any work began. This history
covers Module 1–3 (children, staff, candidates, reports, auth) and was
judged trustworthy — kept as-is, never edited.

**Drift found**: every schema change made while building Module 4 (Locaux
et espaces, Tickets de maintenance, Contrats fournisseurs, Démarches
administratives, Stocks et inventaire, Registre d'entrées/sorties) was
applied directly to the dev database via `prisma db push` /
`prisma db push --accept-data-loss`, and was **entirely absent** from the
migrations directory. `prisma migrate diff --from-migrations prisma/migrations
--to-config-datasource --script` produced 752 lines of SQL — the full
Module 4 delta, plus two small pieces of pre-Module-4 drift that had also
gone in via db push (see §5).

## 3. Backup

Before any migration-state change:

```
docker exec hadoum-db pg_dump -U hadoum_user -Fc -d hadoum_db \
  -f /tmp/hadoum_dev_before_module4_migration_2026-07-30_13-20.dump
docker cp hadoum-db:/tmp/... ./backups/
```

- **Path**: `backups/hadoum_dev_before_module4_migration_2026-07-30_13-20.dump`
  (repo-adjacent `backups/` directory, not committed).
- **Size**: 128,396 bytes.
- **Format**: PostgreSQL custom format (`-Fc`).
- **Verification**: `pg_restore --list` (run inside the `hadoum-db`
  container, since no local `pg_restore` binary was available on the host)
  → 245 TOC entries, matching all 43 tables and all enums live at backup
  time. No errors.
- **Container**: `hadoum-db`. **Database**: `hadoum_db`.

This backup was later actually restored and used for the clone-database
migration test (§6), which is the real end-to-end verification that it is
valid and sufficient for a rollback.

## 4. Migration strategy selected

**Strategy B — formal Module 4 consolidation migration.**

Rejected alternatives:

- **Strategy A** (incremental migrations from the last valid migration) —
  mechanically this is what Strategy B *is* (one `migrate diff` from the
  last migrated state to the current schema), but the result was organized
  as a small number of clearly-named, reviewed migrations rather than an
  unreviewed `migrate dev` diff, because the gap covers six entire features
  at once and deserved individual line-by-line review before being
  committed as history.
- **Strategy C** (new baseline, discarding old history) — rejected because
  the pre-Module-4 history (20 migrations) is coherent, cleanly applied,
  and worth keeping; there is no reason to throw it away.

Two migrations were created, matching the two categories of change found:

1. `20260730140000_module4_schema_consolidation` — everything that was
   already live on the dev database via db push (all Module 4 tables,
   enums, indexes, FKs, plus the two pieces of pre-Module-4 drift).
2. `20260730140100_module4_indexes_and_constraints` — genuinely new
   changes made *during this sprint's audit*, not previously live: one
   foreign-key delete-behaviour correction and ten new indexes (see §7).

## 5. Diff review before committing

Generated with:

```
npx prisma migrate diff --from-migrations prisma/migrations \
  --to-config-datasource --script
```

(This requires a shadow database — `prisma.config.ts` had no
`shadowDatabaseUrl` configured; a `shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"]`
line was added to `prisma.config.ts`, backed by a disposable
`hadoum_shadow` Postgres database created on the same container. This is a
one-line, additive, backward-compatible config change — commands that
don't need a shadow database are unaffected.)

Saved to `audit/diff_migrations_vs_livedb.sql` (752 lines) and reviewed
statement-by-statement before being copied into the migration file:

- **Zero** `DROP TABLE`, **zero** `DROP COLUMN`, **zero** `SET NOT NULL`
  anywhere in the diff.
- **One** `AlterEnum` block (`DocumentType`) and **one** pre-existing-table
  `AlterTable` (`Candidate.scheduledIntegrationDate`) touch tables with
  live data. Both were individually verified against live data before
  being accepted:
  - `DocumentType`: the new 15-value enum is a superset of every one of
    the 12 distinct values actually used across the 55 `Document` rows.
    No value in use is removed. This block only exists because migration
    history's version of this enum had drifted from what's live — the
    value set itself never changed.
  - `Candidate.scheduledIntegrationDate`: the live column is already
    `TIMESTAMP(3)`; the statement is a no-op against current data. Same
    root cause (migration history out of date, not the live schema).
  - Both are pre-Module-4 drift, not part of Module 4's changes.
- One nullable-column addition on `FormerStaffMember` (2 new nullable
  columns) — no backfill required.
- **Five new UNIQUE indexes** — checked for duplicates against live data
  before being accepted, all clean:

  | Field(s) | Duplicates found |
  |---|---|
  | `BudgetLine(category, month, year)` | 0 |
  | `InventoryAsset.assetCode` | 0 |
  | `InventoryAsset.serialNumber` | 0 |
  | `StockItem.barcode` | 0 |
  | `StockItem.reference` | 0 |

- **All new foreign keys** reference either brand-new Module 4 tables, or
  add nullable `SET NULL`-on-delete relations from Module 4 tables to
  pre-existing tables (`User`, `Space`, `Incident`, `SupplierContract`,
  `StockItem`) — no existing row can violate any of them, confirmed by
  the fact that every `ADD CONSTRAINT ... FOREIGN KEY` in the migration
  succeeded (Postgres validates existing rows against a new FK
  immediately unless `NOT VALID` is used, which none of these are).

## 6. Foreign-key / delete-behaviour review

Full FK inventory reviewed for cascade risk to historical business
records (stock movements, validations, register history, documents,
notification history, procedure validation history):

- All `*Document`/`*Attachment` child tables `CASCADE` from their direct
  parent (e.g. `StockItemDocument` from `StockItem`) — correct, documents
  have no independent meaning once their parent is gone.
- `InventoryAsset.spaceId`, `StockItem.spaceId`, `EntryLog.spaceId` all use
  `SET NULL` on Space deletion — the resource survives, only its space
  reference is cleared.
- **Found and fixed**: `MaintenanceTicket.spaceId` was the one outlier,
  using `ON DELETE CASCADE` — deleting a Space would silently destroy all
  its maintenance ticket history. `spaceId` is `NOT NULL` on this model
  (a ticket always belongs to a space), so `SET NULL` isn't available
  without a larger, business-logic-affecting schema change (making the
  column nullable) — out of scope for this sprint. Changed to
  `ON DELETE RESTRICT` instead: a Space with existing tickets can no
  longer be deleted at all, which is strictly safer than silent
  cascading and required no column-nullability change. Applied in
  migration `20260730140100_module4_indexes_and_constraints`. **Note**:
  `spaces.service.ts` has no Space-delete endpoint today, so this was a
  latent/unreachable risk, not an active one — fixed anyway since the fix
  was one line and closes the gap defensively.
- **Reviewed, not changed**: `StockMovement.stockItemId` also `CASCADE`s
  from `StockItem`. `StockItem` has no delete endpoint either (items are
  archived, never deleted, matching the "archive don't delete" pattern
  used throughout Module 4) — this mirrors the `*Document` pattern rather
  than being an inconsistency, and changing it would require the same
  kind of column-nullability change as above for no currently-reachable
  benefit. Documented here as a known limitation, not fixed.
- `Notification.recipientId` `CASCADE`s from `User` — acceptable: there is
  no `User` hard-delete endpoint anywhere in the app, and a user's own
  notification inbox disappearing if their account were ever truly
  deleted is standard behaviour, not a "historical business record" in
  the sense the audit was concerned with.

## 7. Index audit

Ten new indexes were added, each backed by an actual `where`/`orderBy`
field found in the corresponding service's query methods (not a blanket
application of every schema field) — see each migration file's inline
comments for the specific query pattern justifying it:

| Model | Index | Justification |
|---|---|---|
| `MaintenanceTicket` | `spaceId` | FK filter in `findAll()` |
| `MaintenanceTicket` | `status` | filter in `findAll()` |
| `SupplierContract` | `status` | filter in `findAll()` |
| `AdministrativeProcedure` | `status` | filter in `findAll()` |
| `StockItem` | `isActive` | applied on every `findAll()` call (default `true`) |
| `InventoryAsset` | `spaceId` | FK filter in `findAll()` |
| `InventoryAsset` | `status` | filter, used twice per call (archived toggle) |
| `Notification` | `(recipientId, createdAt)` | `findForUser()` sort, not covered by existing `(recipientId, isRead)` |
| `Notification` | `(resourceType, resourceId, type)` | hot dedup-guard query (`notify*Once()`) run on nearly every mutation across 7 resource services |
| `ValidationRequest` | `(status, submittedAt)` | `findPending()`/`findPendingFor()`/`findHistory()` sort |

Postgres does **not** auto-index foreign-key columns (unlike primary
keys), which is why `spaceId` needed an explicit index despite being an
FK on two models.

## 8. Migration files created

```
prisma/migrations/20260730140000_module4_schema_consolidation/migration.sql
prisma/migrations/20260730140100_module4_indexes_and_constraints/migration.sql
```

Both are commented inline explaining every non-obvious statement (see the
files themselves for full detail — summarized in §5–§7 above).

## 9. Applying to the existing development database

The live `hadoum_db` already had the exact schema that
`module4_schema_consolidation` describes (it was built via db push in the
first place), so running its SQL directly would fail (types/tables already
exist). Instead:

```
npx prisma migrate resolve --applied 20260730140000_module4_schema_consolidation
npx prisma migrate deploy
```

The `resolve --applied` step is a metadata-only operation (writes a row to
`_prisma_migrations`, executes no SQL). `migrate deploy` then found only
`20260730140100_module4_indexes_and_constraints` pending and applied it —
this one *did* contain real, previously-unapplied changes (the FK fix and
10 new indexes).

Result: `npx prisma migrate status` → *"Database schema is up to date!"*.
`npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`
→ exit code 0, *"No difference detected."*

`npx prisma generate` was re-run afterward; the backend (already running
in watch mode) picked up the new client and continued serving requests
(`GET /api` → 200) without a manual restart.

## 10. Fresh database test

A disposable database (`hadoum_fresh_test`, same Postgres container) was
created empty and migrated from scratch:

```
npx prisma migrate deploy
```

Result: **all 22 migrations applied successfully**, from
`20260514093658_init_module1` through
`20260730140100_module4_indexes_and_constraints`, in order, with no
errors.

Verified afterward:

| Check | Result |
|---|---|
| Tables (`information_schema.tables`) | 43 — matches live dev db |
| Enum types (`pg_type` where `typtype='e'`) | 45 |
| Indexes (`pg_indexes`) | 72 |
| Foreign key constraints | 48 |
| Drift vs `schema.prisma` (`migrate diff --exit-code`) | exit 0 — no difference |
| Backend boot (`node dist/main.js` against this database) | **Nest application successfully started**, all 17 controllers mapped their routes (including every Module 4 route), `PrismaModule` initialized cleanly — the only failure was `EADDRINUSE` on port 3001, because the dev-mode server was already running on that port at the time; the application itself fully bootstrapped and connected to the fresh database with no schema-related error. |

Database dropped after verification (`DROP DATABASE hadoum_fresh_test`).

## 11. Clone-of-current-data test

The verified backup from §3 was restored into a second disposable database
(`hadoum_clone_test`):

```
docker cp backups/hadoum_dev_before_module4_migration_2026-07-30_13-20.dump hadoum-db:/tmp/restore_test.dump
docker exec hadoum-db pg_restore -U hadoum_user -d hadoum_clone_test --no-owner --role=hadoum_user /tmp/restore_test.dump
```

Row counts immediately after restore matched the pre-migration live
database exactly (see table below, "Before" column). The same migration
procedure as §9 was then applied
(`migrate resolve --applied` for the consolidation migration, then
`migrate deploy` for the indexes/constraints migration).

**Row counts, every affected table, before vs. after migration:**

| Table | Before | After |
|---|---:|---:|
| AdministrativeProcedure | 1 | 1 |
| BudgetLine | 7 | 7 |
| Candidate | 1 | 1 |
| CandidateDoc | 4 | 4 |
| Child | 12 | 12 |
| Consultation | 0 | 0 |
| ContractDocument | 0 | 0 |
| DailyObservation | 2 | 2 |
| Document | 55 | 55 |
| EntryLog | 8 | 8 |
| EntryLogDocument | 1 | 1 |
| EventLog | 7 | 7 |
| FormerStaffMember | 1 | 1 |
| GoodsMovementDocument | 0 | 0 |
| GoodsMovementLog | 5 | 5 |
| Incident | 3 | 3 |
| IncidentNote | 1 | 1 |
| InventoryAsset | 1 | 1 |
| InventoryAssetDocument | 0 | 0 |
| MaintenanceTicket | 2 | 2 |
| MedicalRecord | 2 | 2 |
| Notification | 34 | 34 |
| ProcedureDocument | 0 | 0 |
| PsychRecord | 0 | 0 |
| PsychSession | 0 | 0 |
| Report | 2 | 2 |
| SchoolRecord | 8 | 8 |
| SchoolResult | 0 | 0 |
| Space | 2 | 2 |
| SpaceDocument | 1 | 1 |
| StaffAttendance | 5 | 5 |
| StaffDoc | 9 | 9 |
| StaffMember | 13 | 13 |
| StockItem | 3 | 3 |
| StockItemDocument | 1 | 1 |
| StockMovement | 6 | 6 |
| SupplierContract | 2 | 2 |
| TicketAttachment | 0 | 0 |
| Transaction | 2 | 2 |
| User | 3 | 3 |
| Vaccination | 3 | 3 |
| ValidationRequest | 16 | 16 |
| _prisma_migrations | 20 | 22 |

**Every table's row count is identical before and after.** No orphan
records were introduced (every new `FOREIGN KEY` constraint was validated
against existing rows by Postgres at `ADD CONSTRAINT` time — the migration
would have failed loudly if any row violated a new constraint; it did
not).

Drift after migration: `migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`
→ exit 0, no difference.

Application-level read test (live Prisma query through the app's own
`PrismaPg` adapter pattern, with relations):

```
EntryLog with relations read: 8
ValidationRequest with relations read: 16
User read: 3
```

All relation includes (`space`, `recordedBy`, `submittedBy`) resolved
without error, confirming the new foreign keys are queryable, not just
present.

Both disposable databases (`hadoum_clone_test`, `hadoum_shadow`) were
dropped after this report was written and all figures above recorded.

## 12. Warnings encountered

- `prisma migrate diff --from-url` was removed in this Prisma version
  (7.8.0); `--from-config-datasource`/`--to-config-datasource` must be
  used instead, referencing `prisma.config.ts`.
- `--from-migrations` requires `datasource.shadowDatabaseUrl` to be
  configured — addressed by adding the config line described in §5,
  backed by a disposable database, never a shared/production one.
- On Windows Git Bash, `docker exec ... -f /tmp/...` silently mangles the
  Unix path into a Windows path unless `MSYS_NO_PATHCONV=1` is set first
  — this caused the first backup attempt to fail before the workaround was
  found.
- No local `pg_restore`/`pg_dump` client was available on the host; both
  were run via `docker exec` inside the `hadoum-db` container instead.

## 13. Production migration command

Going forward, the supported workflow is:

```
npx prisma migrate deploy
```

This must never be replaced with `prisma db push` (with or without
`--accept-data-loss`) or `prisma migrate reset` for any schema change from
this point on. New schema changes should be authored with
`prisma migrate dev` locally (which also needs `SHADOW_DATABASE_URL` set,
see §5) and the generated migration reviewed before commit, following the
same review discipline used in this sprint.

## 14. Rollback procedure

Prisma does not generate down-migrations automatically. If a future
`prisma migrate deploy` needs to be rolled back:

1. **Stop deploying / revert application code** to the version matching
   the last known-good migration (redeploy the previous backend build so
   the app is not running against a schema it doesn't expect).
2. **Do not attempt to hand-write a reverse migration for an enum
   rename/recreate** (the `AlterEnum` pattern used in this sprint) without
   testing it on a disposable clone first — reversing enum swaps is easy
   to get subtly wrong (e.g. reintroducing a `DEFAULT` on the wrong
   column, or ordering `RENAME`/`DROP` incorrectly) and this workflow
   deliberately does not include an untested "just run it" reverse script.
3. **Restore from backup** when a migration has already partially or fully
   applied and left the database in a state the application cannot use:
   ```
   docker exec hadoum-db pg_restore -U hadoum_user -d hadoum_db \
     --clean --if-exists --no-owner --role=hadoum_user /path/to/backup.dump
   ```
   Restoration is required whenever a migration has run destructive SQL
   that cannot be trivially reversed (this sprint's migrations contain
   none, but future ones might) or when data integrity after a failed
   migration is in doubt.
4. **Verify the restored database** the same way this sprint's clone test
   did: compare row counts per table against the last known-good count,
   run `prisma migrate status` (should show exactly the migrations known
   to have been safely applied at backup time), and run
   `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`
   against the matching schema version to confirm zero drift.
5. **Redeploy the previous application version** only after the database
   is confirmed restored and consistent.

`prisma migrate deploy` failing partway through a multi-statement
migration does **not** automatically roll back the statements that already
succeeded — Prisma wraps each migration file in a transaction only when
the underlying statements are transaction-safe (this sprint's two
migration files contain no non-transactional DDL, so each one is fully
atomic — either every statement in the file applies or none do — but this
is not true for all possible future Postgres DDL, e.g. `CREATE INDEX
CONCURRENTLY`, which cannot run inside a transaction). Always verify
`migrate status` after any failed deploy before assuming partial application.

## 15. Known limitations

- `StockMovement.stockItemId` still cascades from `StockItem` (see §6) —
  currently unreachable via the API but not fixed, since `StockItem` has
  no nullable-column precedent to fall back on without a larger schema
  change.
- The `SHADOW_DATABASE_URL` used for `migrate diff --from-migrations` and
  future `migrate dev` usage is a local, disposable database on the same
  Docker instance — anyone continuing this workflow needs to create it
  once (`CREATE DATABASE hadoum_shadow;`) and set the env var locally; it
  is not auto-provisioned.
