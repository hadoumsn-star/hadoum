# Security audit — Module 4 consolidation sprint (2026-07-30)

Scope: every backend controller under `hadoum_api/src`, not just Module 4.
All findings below were verified either by direct code reading or by live
HTTP requests with real JWTs issued by the running dev server (test
accounts: DIRECTOR = `hadoum@gmail.com`, SUPERVISOR = `dounde.diallo@gmail.com`
— the only two accounts that exist in this database; `EDUCATOR`/`BOARD`
exist in the `UserRole` enum but have zero live users).

## 1. Controller inventory

17 controllers total.

| Controller | Guard before sprint | Guard after sprint | Roles |
|---|---|---|---|
| `auth.controller.ts` | none | none (correctly public: login, forgot-password, reset-password) | — |
| `app.controller.ts` | none | none (correctly public: root health-check `GET /api`) | — |
| `children.controller.ts` | **none** | `JwtAuthGuard, RolesGuard` | DIRECTOR, SUPERVISOR |
| `finances.controller.ts` | **none** | `JwtAuthGuard, RolesGuard` | DIRECTOR, SUPERVISOR |
| `incidents.controller.ts` | **none** | `JwtAuthGuard, RolesGuard` | DIRECTOR, SUPERVISOR |
| `reports.controller.ts` | **none** | `JwtAuthGuard, RolesGuard` | DIRECTOR, SUPERVISOR |
| `staff.controller.ts` | **none** | `JwtAuthGuard, RolesGuard` | DIRECTOR, SUPERVISOR |
| `spaces.controller.ts` | present | present (unchanged) | DIRECTOR write, DIRECTOR+SUPERVISOR read |
| `maintenance-tickets.controller.ts` | present | present (unchanged) | DIRECTOR write, SUPERVISOR approve/reject/request-changes, both read |
| `supplier-contracts.controller.ts` | present | present (unchanged) | same pattern |
| `administrative-procedures.controller.ts` | present | present (unchanged) | same pattern |
| `stock-items.controller.ts` | present | present (unchanged) | same pattern |
| `stock-movements.controller.ts` | present | present (unchanged) | DIRECTOR+SUPERVISOR read-only (1 route) |
| `inventory-assets.controller.ts` | present | present (unchanged) | same pattern |
| `entry-logs.controller.ts` | present | present (unchanged) | same pattern |
| `goods-movement-logs.controller.ts` | present | present (unchanged) | same pattern |
| `validations.controller.ts` | present | present (unchanged) | `pending` = SUPERVISOR, `history` = both |
| `notifications.controller.ts` | present (`JwtAuthGuard` only, no roles — correct, self-scoped by `@CurrentUser()`) | unchanged | any authenticated user, own data only |

**Critical finding, fixed**: `children`, `finances`, `incidents`, `reports`,
`staff` had **zero authentication** — every route (including children's
medical records, vaccination/consultation history, financial transactions,
incident reports, uploaded reports, and staff/candidate personal documents
and CVs) was reachable by anyone on the network with no login at all. This
predates Module 4; all six Module-4-era controllers plus `spaces` (built in
an earlier Module 4 section) were already correctly guarded, which is what
made the five legacy gaps stand out on inspection.

**Role choice for the five fixed controllers**: `DIRECTOR, SUPERVISOR`
(authenticated, either role) — not a DIRECTOR-only or split policy. This
was a deliberate choice, not an oversight: the frontend already presents
these five modules identically to both roles (both see "Voir les enfants",
"Suivre les finances", "Suivi des incidents", "Consulter les rapports",
"Mon équipe" in their navigation), and there is no existing approve/reject
workflow for these legacy resources the way there is for Module 4. Inventing
a new DIRECTOR/SUPERVISOR split here would be a business-policy decision
outside this sprint's mandate ("do not add new business features"); requiring
authentication while preserving today's actual access pattern is the
correct, minimal fix.

## 2. JwtAuthGuard / RolesGuard coverage

- `JwtAuthGuard` verifies the `Bearer` token via `JwtService.verify()` and
  populates `request.user` from the verified payload only (`sub`, `email`,
  `role`) — no client-supplied header or body can influence identity. No
  issue found.
- `RolesGuard` returns `true` (allows the request through) when no `@Roles()`
  metadata is present on the route or controller — i.e. it is *not* an
  authentication guard by itself, only an authorization guard. This makes
  guard coverage fully dependent on `JwtAuthGuard` always being paired with
  it, and on every sensitive route having explicit `@Roles()`. No global
  `APP_GUARD` is registered anywhere (confirmed via
  `grep -rn "APP_GUARD" src`) — authentication is opt-in per controller, not
  enforced by a framework-level default. This is what allowed the five
  controllers above to go unauthenticated; it remains true today for any
  *future* controller that forgets to add the guard. See §9 for a
  recommendation.
- Every route in every guarded controller was confirmed (live inventory,
  §1) to carry an explicit `@Roles()` — no route was found relying on the
  "guard present but no roles" gap in practice.

## 3. Self-approval prevention

Centralized correctly in `validations.service.ts`'s private `reviewPending()`,
shared by `approve()`/`reject()`/`requestChanges()` for **all seven**
validation-enabled resource types (maintenance tickets, supplier contracts,
administrative procedures, stock items, inventory assets, entry logs, goods
movement logs):

```ts
if (pending.submittedById === input.reviewedById) {
  throw new ForbiddenException('Vous ne pouvez pas valider votre propre soumission.');
}
```

This is defense-in-depth on top of route-level separation
(`submitValidation`/operational routes are always `@Roles('DIRECTOR')`;
`approve`/`reject`/`requestChanges` are always `@Roles('SUPERVISOR')` — never
the reverse, never both). Live-tested: DIRECTOR calling `approve`/`reject`
on any resource → `403 Forbidden` before the service layer is even reached
(route-level block). True same-account self-approval could not be triggered
live because the two real accounts have disjoint roles by construction (one
DIRECTOR, one SUPERVISOR) — the service-level check is untestable with the
current two accounts but was verified by direct code reading to be correct
and would trigger `403` if a future account ever held elevated dual access.

## 4. Object-level authorization / IDOR

- `NotificationsController`: `findMine`/`unreadCount`/`markAllRead` are
  scoped to `@CurrentUser()`'s own JWT-derived id, never a client-supplied
  id — no IDOR surface. `markRead(id, user.id)` looks up the notification by
  its own id but the service checks `notification.recipientId !== userId`
  and throws `403` before updating. **Live-tested**: DIRECTOR attempting to
  mark a SUPERVISOR notification as read → `403`.
- All Module 4 document endpoints (`getDocumentUrl`/`deleteDocument` on
  `entry-logs`, and the equivalent pattern on every other Module 4 resource)
  scope the lookup to `(documentId, parentId)` together and return `404` if
  the document belongs to a different parent — code-reviewed across
  `entry-logs.service.ts` and confirmed structurally identical elsewhere.
- `children.service.ts`, `staff.service.ts` (`getCandidateDocUrl`/
  `deleteCandidateDoc`) already scoped correctly (`findFirst({ where: { id,
  parentId } })`).
- **Found and fixed**: `staff.service.ts`'s `getStaffDocUrl`/`deleteStaffDoc`
  accepted a `staffId` path parameter but never checked it — any
  authenticated user could fetch or delete **any** staff member's document
  by document id alone, regardless of the `staffId` in the URL. Fixed to
  `findFirstOrThrow({ where: { id: docId, staffId } })`, matching the
  pattern used everywhere else in the codebase. **Live-tested**: fetching a
  document that belongs to staff A while passing staff B's id in the URL now
  returns `404` (was previously `200` with the real signed URL, before the
  auth fix even made this reachable at all).

## 5. Upload / document / signed-URL security

- Authentication: all upload/delete/signed-URL routes now require
  `JwtAuthGuard` (five previously did not — see §1).
- Roles: upload and delete are `DIRECTOR`-only on every Module 4 resource;
  `DIRECTOR, SUPERVISOR` (read) can list documents and fetch signed URLs.
  Legacy modules: both roles can do both, matching §1's reasoning.
- Storage keys are always server-generated (`${folder}/${randomUUID()}${ext}`
  in `upload.service.ts`) — the client cannot choose an S3 key.
- Presigned URLs expire in 15 minutes (`PRESIGNED_TTL_SECONDS`), generated
  server-side; raw S3 credentials are never returned to the client.
- File size limits are set per-route via Multer's `FileInterceptor({ limits:
  { fileSize: ... } })`, consistently present (5–20 MB depending on the
  document type) across every upload route reviewed.
- Document ownership (cross-resource id spoofing) — see §4.
- **Not fixed, documented as a remaining risk**: no MIME-type allowlist
  exists anywhere. `upload.service.ts` stores `file.mimetype` as the S3
  object's `Content-Type` directly from the client-supplied value with no
  validation, and no `FileInterceptor` in any controller sets a `fileFilter`.
  Any file type can currently be uploaded to any document slot (CVs,
  medical documents, photos, reports, attachments all share the same
  unrestricted path). This is a real gap, but fixing it correctly requires
  deciding an allowlist *per upload context* (e.g. CV vs. photo vs. report)
  — a business decision outside this sprint's "no new features" mandate.
  Recommended smallest safe next step: a single shared allowlist constant
  (PDF, JPEG, PNG, DOC/DOCX) applied uniformly via `fileFilter` across all
  `FileInterceptor` calls, with a follow-up sprint to differentiate by
  context if needed.

## 6. Mass assignment

- Global `ValidationPipe({ whitelist: true, transform: true })` strips any
  property not declared on the target DTO class before it ever reaches a
  service — `forbidNonWhitelisted` is not enabled, so extra fields are
  silently dropped rather than rejected with `400`. This is a UX/clarity
  gap, not a security one (the fields are still stripped either way);
  documented, not changed, since enabling it changes API error behavior for
  every existing client call site and wasn't demonstrated to be needed for
  a security guarantee that isn't already met.
- DTO audit across `maintenance-tickets`, `supplier-contracts`,
  `administrative-procedures`, `stock-items`, `inventory-assets`,
  `goods-movement-logs`, `entry-logs`: **no** DTO declares `validationStatus`,
  `pendingValidationAction`, `pendingValidationPayload`, `submittedById`,
  `reviewedById`, `approvedById`, `createdById`, `archivedAt`, `createdAt`,
  or `updatedAt` as a client-settable property. All of these are set
  exclusively server-side from `@CurrentUser()` or internal service logic.
  **Live-tested**: a `POST /goods-movement-logs` payload that explicitly
  included `validationStatus: "APPROVED"`, `status: "ARCHIVE"`,
  `recordedById: "<spoofed-uuid>"`, `pendingValidationAction`, `archivedAt`,
  and even a client-chosen `id` — the created record ignored every one of
  them: `status` was server-computed (`ENREGISTRE`), `validationStatus` was
  `null`, `recordedById` was the real authenticated user's id from the JWT,
  and `id` was a fresh server-generated UUID.
- `currentQuantity` (`StockItem`) is not present in `UpdateStockItemDto` —
  **live-tested**: `PATCH /stock-items/:id` with `{"currentQuantity": 99999}`
  left the real quantity (3) unchanged. Quantity is movement-driven only,
  via dedicated entry/exit/adjustment endpoints with their own atomic
  concurrency guards, as designed.
- **Found and fixed** (a workflow-bypass variant of the same concern):
  `UpdateMaintenanceTicketDto.status` accepts any `TicketStatus` enum value
  with no server-side restriction, unlike the equivalent `update()` methods
  on `administrative-procedures.service.ts` and `inventory-assets.service.ts`,
  which both already restrict generic-update status changes to a "routine"
  subset and reject (`409`) anything else. This let a DIRECTOR bypass
  `close()`'s business rule — *"a CRITIQUE-urgency ticket must be closed via
  the validation circuit"* — by calling generic `PATCH /:id` with
  `{"status": "FERME"}` directly, skipping the SUPERVISOR-review requirement
  entirely for critical tickets. Fixed by adding the exact same
  `routineStates` guard already used by the other two services (`OUVERT`,
  `ASSIGNE`, `EN_COURS`, `EN_ATTENTE` only; anything else — including to or
  from `FERME`/`ANNULE`/`RESOLU` — now requires going through
  `/assign`, `/close`, or the validation workflow, and returns `409`
  otherwise).

## 7. JWT configuration and secrets

- **Found and fixed, critical**: `auth.module.ts` configured
  `secret: process.env.JWT_SECRET ?? 'hadoum-secret-2026'` — a hardcoded
  fallback secret committed to source control. **This was not theoretical**:
  `.env` did not set `JWT_SECRET` at all, meaning the running dev server was
  actually issuing and verifying tokens signed with this public fallback
  string for the entire sprint until this was found. Anyone who read this
  source file could forge a valid JWT for any user id and role.
  - Fixed: generated a real random secret
    (`crypto.randomBytes(48).toString('base64')`) and added it to the local,
    gitignored `.env`. `auth.module.ts` now throws at startup
    (`if (!process.env.JWT_SECRET) throw new Error(...)`) instead of
    falling back — the application fails fast rather than starting insecure.
  - This check initially fired **before** `.env` was loaded (NestJS's
    `ConfigModule.forRoot()` only runs once `AppModule`'s decorator body is
    evaluated, which is *after* all of `AppModule`'s own `import` statements
    — including the one that pulls in `AuthModule` — have already executed).
    Fixed by adding `import 'dotenv/config';` as the literal first line of
    `main.ts`, guaranteeing `.env` is loaded before any other module is
    imported, independent of `ConfigModule`'s own timing. This was verified
    by intentionally reproducing the crash (the fail-fast throw fired
    correctly with a clear message and stack trace, not a silent fallback),
    then confirming a clean boot after the ordering fix.
  - Rotating the secret invalidated every previously-issued token, including
    the browser sessions used earlier in this sprint — expected, and this is
    exactly the intended effect of the fix.
- Token expiry: 7 days (`signOptions: { expiresIn: '7d' }`) — unchanged, not
  flagged as a defect; a reasonable UX/security tradeoff for a low-traffic
  internal tool that this sprint did not have grounds to override
  unilaterally.
- Reset-token flow (`auth.service.ts`, forgot/reset password) and
  `NODE_ENV`-based branching were not part of this sprint's fix set beyond
  the above; no additional hardcoded secret was found anywhere else in
  `src` (`grep -rn "hadoum-secret\|process.env.*??" src` was used to search
  for the same fallback-secret pattern elsewhere — none found).

## 8. Credentials and logging

- `.env` (containing `DATABASE_URL`, `JWT_SECRET`, S3 credentials, SMTP
  credentials) is listed in `.gitignore` and confirmed absent from
  `git ls-files` — nothing is committed.
- No Prisma query logging is enabled in `PrismaService` (no `log:` option
  passed to the client) — no risk of query/parameter logging in this
  configuration.
- No code path was found that logs a full request body, JWT, or password —
  error responses observed during testing were generic (`{"statusCode":500,
  "message":"Internal server error"}`), not stack traces (see §9 for the one
  case where the *status code*, not the body, was wrong).

## 9. Error response consistency

**Found and fixed**: `findUniqueOrThrow`/`findFirstOrThrow` (27 call sites
across `children.service.ts`, `staff.service.ts`, `stock-items.service.ts`)
throw a raw `Prisma.PrismaClientKnownRequestError` (code `P2025`) when a
record doesn't exist. With no global exception filter, NestJS's default
handling turned this into an unhandled `500 Internal Server Error` instead
of `404` — discovered live while testing the staff-document IDOR fix in §4
(the blocked cross-resource request returned `500`, not `404`). The response
body itself was already generic and safe (`{"statusCode":500,"message":
"Internal server error"}` — no stack trace or Prisma internals reached the
client), but the status code was wrong across all 27 call sites, not just
the one being tested.

Fixed with a global exception filter
(`src/prisma/prisma-exception.filter.ts`, registered via
`app.useGlobalFilters()` in `main.ts`) that catches
`Prisma.PrismaClientKnownRequestError` and maps code `P2025` to a proper
`404`, leaving every other Prisma error as a sanitized `500` (unchanged
behavior for cases not explicitly handled). This fixes the status code for
all 27 existing call sites at once, not just the one discovered during
testing. **Re-tested after the fix**: the same cross-resource request now
correctly returns `404`.

Verified elsewhere in the codebase: `400`/`401`/`403`/`404`/`409` are used
correctly and consistently by the explicit `NotFoundException`/
`ForbiddenException`/`ConflictException`/DTO-validation paths that don't go
through `findUniqueOrThrow` (see §10 for the live test matrix).

## 10. Live HTTP test results

All tests below were run against the live dev server with real JWTs
(`curl` + `POST /api/auth/login`), after all fixes in this document were
applied.

| Test | Expected | Result |
|---|---|---|
| Unauthenticated `GET /children`, `/finances/transactions`, `/incidents`, `/staff`, `/reports`, `/entry-logs` | 401 | ✅ 401 (all six) |
| Unauthenticated `POST /children`, `/entry-logs` | 401 | ✅ 401 (both) |
| Unauthenticated `POST /reports/upload` | 401 | ✅ 401 |
| Unauthenticated `GET /validations/pending` | 401 | ✅ 401 |
| SUPERVISOR `POST /entry-logs`, `/spaces`, `/maintenance-tickets` (operational writes) | 403 | ✅ 403 (all three) |
| DIRECTOR `PATCH /entry-logs/:id/approve`, `/reject`, `GET /validations/pending` | 403 | ✅ 403 (all three) |
| SUPERVISOR `GET /children`, `/finances/transactions`, `/incidents` (legacy modules, both roles allowed) | 200 | ✅ 200 (all three — confirms the fix preserved existing UX) |
| DIRECTOR `GET /entry-logs/<nonexistent-uuid>` | 404 | ✅ 404 |
| Cross-resource staff document (staff A's doc via staff B's id) | 404 | ✅ 404 (was `200`/leaked before the fix in §4; was `500` before the filter fix in §9) |
| DIRECTOR marking SUPERVISOR's notification read | 403 | ✅ 403 |
| Reject with empty comment (`""`) | 400 | ✅ 400 |
| Reject with missing comment field | 400 | ✅ 400 |
| Approve a pending goods movement | 200 | ✅ 200 |
| Approve the same movement again | 409 | ✅ 409 |
| Reject the same (already-approved) movement | 409 | ✅ 409 |
| Create with `validationStatus`, `status`, `recordedById`, `pendingValidationAction`, `archivedAt`, `id` all spoofed in the payload | all ignored | ✅ all ignored — server-computed `status`, `null` `validationStatus`, real JWT-derived `recordedById`, fresh server `id` |
| `PATCH /stock-items/:id` with `{"currentQuantity": 99999}` | unchanged | ✅ unchanged (3) |
| `POST /goods-movement-logs` with `quantity: -50` | 400 | ✅ 400 |
| `POST /goods-movement-logs` with `quantity: "not-a-number"` | 400 | ✅ 400 |
| `POST /goods-movement-logs` with an unknown extra field | 201, field silently dropped | ✅ 201, field absent from stored/returned record |

Not reproduced live (see §3): true same-account self-approval — structurally
unreachable with the two real accounts (disjoint roles), verified correct by
code review instead.

## 11. Remaining risks (not fixed this sprint)

- **No MIME-type allowlist on uploads** (§5) — real gap, needs a business
  decision on per-context allowed types before it can be fixed correctly.
- **`StockMovement.stockItemId` still cascades from `StockItem`** on delete
  (documented in `docs/database-migrations.md` §6) — currently unreachable
  since `StockItem` has no delete endpoint, but would destroy movement
  history if one were ever added without also addressing this.
- **No `APP_GUARD` global default** — authentication remains opt-in per
  controller (§2). Every controller was audited and is now correctly
  guarded, but a *future* controller added without `@UseGuards(...)` would
  silently reproduce the exact vulnerability found and fixed in this sprint.
  Recommended next step (not applied here, since it changes the framework-
  level default behavior for every future route and deserves its own
  focused review rather than a rushed change at the end of this sprint):
  register `JwtAuthGuard` as a global `APP_GUARD` and use an explicit
  `@Public()` decorator (checked via `Reflector`, same mechanism as
  `@Roles()`) for the three routes that should remain open
  (`auth.controller.ts`'s three routes, `app.controller.ts`'s health check).
- **`forbidNonWhitelisted` not enabled** (§6) — cosmetic/clarity gap only,
  not a security hole (fields are already stripped either way).
