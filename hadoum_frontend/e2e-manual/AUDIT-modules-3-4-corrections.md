# Hadoum — Technical Audit for Module 3/4 Corrections

**Date:** 2026-08-03
**Branch:** `feature/corrections-reunion-modules-3-4`
**Scope:** Read-only inspection. No files were modified to produce this report.
**Purpose:** Ground the corrections agreed in the Module 3/4 presentation in the actual current state of the codebase, so implementation work can be sequenced safely.

Findings below come from direct inspection of `hadoum_api/prisma/schema.prisma`, the NestJS controllers/services, the React pages/services, and the existing test suite on this branch — not from assumptions.

---

## 1. Director Dashboard

- **Frontend:** `hadoum_frontend/src/app/pages/DirectorDashboard.tsx` (632 lines). Sub-components in the same file: `CompactAlertsBar`, `ActivitesAValider`, `DemandesRH`, `DemanderFonds`, `PriorityTasks`, `KPICard`, `AttendanceBadge`.
- **Backend:** **none consumed.** The file imports zero API service and has no `useEffect` data-fetching. Every number on the page — children count, presence rate, staff KPI, budget-consumed %, the staff-attendance area chart, the class-distribution bar chart, the alerts list, the priority-task list — is either a **hardcoded literal** (`value="87"`, `value="74 / 87"`, `subtitle="Taux : 85%"`, etc.) or comes from `../data/mockData` (`staffAttendanceData`, `classDistributionData`, `activeAlerts`, `priorityTasks`, `teamMembers`) or from `AppDataContext` (`pendingActivities`, `leaveRequests`, `fundRequests`, `teamAttendanceConfirmed`).
- **`AppDataContext.tsx`** itself makes **zero API calls** — it's a pure in-memory `useState` store seeded with `INIT_ACTIVITIES`, `INIT_LEAVE`, `INIT_FUND`, `INIT_VALIDATIONS` constants. Anything the dashboard "creates" or "approves" only mutates this local state and is lost on refresh.
- **Prisma models:** none specifically back this page. It theoretically overlaps `Activity`, `StaffAttendance`, `FundRequest`, `ValidationRequest`, `Child` — all of which exist and are real elsewhere in the backend, just not wired here.
- **Endpoints used:** none.
- **Validation workflow:** none — "Activités à valider" (`ActivitesAValider`) and "Demandes RH" (`DemandesRH`) approve/refuse actions only flip local mock state.
- **Tests:** none (no frontend unit tests exist anywhere in the project; not covered by any Playwright spec found).
- **Missing/partial:** the entire page is a static mockup. Every KPI, chart, alert, and quick-action needs to be rewired to real endpoints (`/finances/dashboard`, `/staff/attendance/monthly`, `/children`, `/validations/pending`, `/fund-requests`, `/activities`).
- **Regression risk:** **low to fix, high visibility.** Nothing here is load-bearing for other features (nothing else imports from `DirectorDashboard.tsx`), so rewiring it is low-risk in isolation — but it's the first thing a DIRECTOR sees, so a partial/buggy rewire is highly visible. The "Demander des fonds" button here and its `FundRequest` mock type must be reconciled with the real `fund-requests` backend module (see §14/§4).

---

## 2. Staff Attendance

Two entirely separate implementations exist under the same name — this is a naming collision worth flagging on its own.

### 2a. Real staff attendance (Team module)
- **Frontend:** `TeamPage.tsx` → `AttendanceModal` component (opened via the calendar-clock icon on a `MemberCard`). Fields: type (Congé/Retard/Absence), date début/fin, motif, justified toggle, justification file upload. Has a "Suivi mensuel" tab with aggregated counts.
- **Backend:** `hadoum_api/src/staff/staff.controller.ts` — `POST/GET /staff/:id/attendance`, `GET /staff/attendance/monthly`, `PATCH/DELETE /staff/attendance/:recordId`, `POST /staff/attendance/:recordId/justif`, `GET /staff/attendance/:recordId/justif-url`.
- **Prisma model:** `StaffAttendance` (`type`, `motif`, `dateDebut`, `dateFin`, `justifKey`, `justified`, `validationStatus` — nullable).
- **Validation workflow:** partial/dormant. The model has a `validationStatus` column with a comment: *"null = pre-approved (created via the direct admin POST /staff/:id/attendance endpoint); set when created via POST /staff/:id/leave-requests instead."* **No `POST /staff/:id/leave-requests` route exists in the controller.** This is a half-built feature: the DB column and its intent exist, the endpoint that would populate it does not.
- **Tests:** none dedicated (`staff` has no `*.service.spec.ts` and is not in the e2e-spec list).
- **This part is genuinely functional** — verified directly in this branch's own manual test campaign (create/edit/delete/monthly view/justification upload all work, no confirmation dialog on delete).

### 2b. Mock child/team "presence" (Educator flow)
- **Frontend:** `AttendancePage.tsx` ("Saisir les présences", Educator role) — imports `allChildrenData`/`teamMembers` from `mockData` and `teamAttendanceConfirmed` from `AppDataContext`. No API import at all.
- **Backend:** a `ChildAttendance` Prisma model exists but **is referenced nowhere** in `hadoum_api/src` — confirmed via full-repo grep. It is a fully orphaned table.
- **Missing/partial:** this entire flow needs a backend (routes + service) built from scratch if it's meant to track daily child presence; right now it's 100% disconnected mock UI over a schema table nobody writes to.
- **Regression risk:** low — orphaned code, nothing depends on it.

**Recommendation for the correction plan:** clarify with the team whether "Staff attendance" in scope means 2a (already real, needs the dormant `validationStatus`/leave-request path either finished or removed) or 2b (needs to be built from zero), since they are unrelated systems sharing a name.

---

## 3. Incidents

- **Frontend:** `IncidentsPage.tsx` (558 lines) — fully wired to `incidentsApi` (`list`, `create`, `update`, `uploadAttachment`, `getAttachmentUrl`, notes, resolve).
- **Backend:** `hadoum_api/src/incidents/` — `incidents.controller.ts`, `.service.ts`, DTOs for create/update/add-note.
- **Endpoints:** `POST /incidents`, `GET /incidents`, `POST /incidents/:id/notes`, `PATCH /incidents/:id/resolve`, `PATCH /incidents/:id`, `DELETE /incidents/:id`, `POST /incidents/:id/attachment`, `GET /incidents/:id/attachment-url`. Roles: `DIRECTOR`, `SUPERVISOR`.
- **Prisma models:** `Incident` (`title`, `type`, `description`, `signaledBy`, `date`, `status`, single attachment), `IncidentNote` (child, cascade-deletes with the incident). `IncidentType` = MEDICAL/COMPORTEMENT/SCOLAIRE/LOGISTIQUE/AUTRE. `IncidentStatus` = EN_COURS/PLANIFIE/EN_RETARD/RESOLU.
- **Important structural fact:** `Incident` has **no foreign key to `Child`** — it is a general facility/operations incident log, not a per-child record. It does have reverse relations from `EntryLog` and `GoodsMovementLog` (an incident can be linked from a visitor entry or a goods movement), which is a different relationship than the spec's Module 1 description of "child-related incidents" — those are actually handled separately, via the generic `EventLog` on `Child` (see the Module 1 report from the earlier QA campaign).
- **Validation workflow:** none — status changes via a single `resolve` action and free-form `update`, not the `ValidationRequest` circuit used elsewhere.
- **Tests:** none (`incidents` has no `.service.spec.ts`, no e2e-spec).
- **Missing/partial:** if the corrections require incidents to go through the same approve/reject validation circuit as Tickets/Contracts/Procedures, that's new work — today it's a simpler, ungated CRUD.
- **Regression risk:** low — self-contained module, only referenced by `EntryLog`/`GoodsMovementLog` as an optional link.

---

## 4. Expenses (Finances — Transactions)

- **Frontend:** `FinancesPage.tsx` — `TransactionModal` (create only), transaction list with delete + view-justificatif.
- **Backend:** `hadoum_api/src/finances/finances.controller.ts` / `.service.ts`.
- **Endpoints:** `POST/GET /finances/transactions`, `GET/PATCH/DELETE /finances/transactions/:id`, `POST /finances/transactions/:id/justificatif`, `GET /finances/transactions/:id/justificatif-url`.
- **Prisma model:** `Transaction` — `type` (DEPENSE/RECETTE), `category` (10 values incl. the 6 expense categories the spec names), `amountXof` (Int, min 1), `date`, `status` (**only** `VALIDE` | `EN_ATTENTE` — no `REJETE`), `justifKey`/`justifMime` (single file), `donorName`/`isAnonymousDonor`, `createdBy`.
- **Validation workflow: does not exist for expenses.** Status is a plain dropdown chosen by whoever creates the transaction, with no submit/approve/reject step. `updateTransaction()` is defined in `finances.api.ts` but **never called from any component** — there is no UI path to edit a transaction after creation, let alone approve/reject one. Confirmed live in this branch's test campaign: a created transaction's only row action is "Supprimer" (delete), with no confirmation dialog.
- **Tests:** none (`finances` has no `.service.spec.ts`, no e2e-spec).
- **Missing/partial:** M3's spec requirements (submit → approve/reject-with-comment → history) are entirely absent. The `TransactionStatus` enum itself has no `REJETE` value and the model has no `rejectionComment`/`approvedBy`/`approvedAt` fields — this is a schema change, not just new endpoints.
- **Regression risk:** **medium.** `Transaction` is read by the dashboard aggregation (`GET /finances/dashboard`) and by `BudgetLine` comparisons — adding a real workflow (new status values, new fields) needs the dashboard's category/status filtering logic updated in lockstep, or the "budget vs actual" and "over-budget alert" calculations will silently miscount pending-vs-approved spend.

---

## 5. Budgets

- **Frontend:** `FinancesPage.tsx` → `BudgetEditorModal`, plus the dashboard's budget-vs-actual bars and over-budget alert banner.
- **Backend:** same `finances.controller.ts` — `GET /finances/budget-lines`, `PUT /finances/budget-lines`, `DELETE /finances/budget-lines/:id`, and `GET /finances/dashboard` (aggregates budget vs. realized per category, computes `overBudget`, cash balance in XOF + a fixed-peg EUR conversion).
- **Prisma model:** `BudgetLine` (`category`, `month`, `year`, `budgetXof`, unique on `[category, month, year]`).
- **Validation workflow:** none — direct upsert by whoever has DIRECTOR/SUPERVISOR access (no distinction between the two roles anywhere in `finances.controller.ts`: `@Roles('DIRECTOR', 'SUPERVISOR')` at class level, no finer gate).
- **Tests:** none.
- **Missing/partial:** budgeting itself works correctly (verified live: setting a budget below an existing expense correctly triggers the "dépassement de budget" alert with the right numbers) — the gap here is entirely about **who is allowed to set/change a budget**, if that's part of the correction (currently anyone with app access to Finances can).
- **Regression risk:** low for budgets in isolation; **coupled to Expenses' schema change** above since the dashboard endpoint computes both together.

---

## 6/8. Suppliers & Supplier Contracts

- **No standalone "Supplier" entity exists.** `supplierName` is a free-text field on `SupplierContract` — there is no supplier directory/registry to look up, dedupe, or reuse across contracts. If the correction plan wants a real supplier list (e.g., for M4-011 "create a supplier"), that is new schema + new module work, not a tweak to existing code.
- **Frontend:** `SupplierContractsPage.tsx` (859 lines) — create/edit modal with a rich field set (supplier name, contract name, category, description, contract number, start/end/renewal dates, renewal type, notice period, amount, billing frequency, contact person, phone, email, address, notes — notably richer contact info than the Staff module has).
- **Backend:** `hadoum_api/src/supplier-contracts/` — full CRUD + validation-circuit endpoints (submit/approve/reject/renew/archive), a computed `effectiveStatus` (BROUILLON/ACTIF/EXPIRE_BIENTOT/EXPIRE/RESILIE/ARCHIVE) that auto-flags expiry, and a `CONTRACT_EXPIRY_WARNING_DAYS` constant (default 30, env-overridable) driving the "expiring soon" flag — the `noticePeriod` field is stored but **not actually used** in that calculation.
- **Prisma model:** `SupplierContract`, plus `ContractDocument` for attachments.
- **Validation workflow:** **real**, using the shared `ValidationRequest` engine — confirmed live (create → submit → two independent DIRECTOR/SUPERVISOR sessions → reject-without-comment blocked → reject-with-comment succeeds). One open question from live testing: a freshly-created contract with minimal fields did **not** show a "Soumettre pour validation" button — the exact precondition (likely `status === 'BROUILLON'`, but not confirmed which field controls that at creation time) needs to be identified before any correction work touches this flow, to avoid assuming it's broken when it may just require different initial data.
- **Tests:** `supplier-contracts.service.spec.ts` (unit), covered in `lifecycle-scenarios.e2e-spec.ts` (backend integration).
- **Missing/partial:** no supplier registry (see above); `noticePeriod` is dead data; contract renewal ("Renouveler" button) exists in the UI but wasn't exercised end-to-end in the live campaign.
- **Regression risk:** low-medium — this module has real test coverage already, so changes are easier to validate, but any schema change (e.g., adding a `Supplier` table) needs a migration and a backfill strategy for the existing free-text `supplierName` values.

---

## 7. Administrative Procedures

- **Frontend:** `DemarchesAdministrativesPage.tsx` (912 lines).
- **Backend:** `hadoum_api/src/administrative-procedures/`.
- **Prisma model:** `AdministrativeProcedure`, plus `ProcedureDocument`.
- **Validation workflow:** **real and the most thoroughly-behaved of anything tested this campaign** — submit uses a custom in-app modal (not a native `confirm()`, unlike Tickets/Facilities — a UI inconsistency worth normalizing) with an optional comment; reject correctly disables its confirm button until a comment is typed (verified live); archive uses a native `confirm()`. Requires both `title` **and** `authority` to save (not just title) — that second mandatory field isn't obvious from the spec.
- **Tests:** `administrative-procedures.service.spec.ts` (unit), `lifecycle-scenarios.e2e-spec.ts` (backend integration).
- **Missing/partial:** renewal flow (new due date after approval) and the dedicated validation-history view weren't exercised live this pass — worth a dedicated check before assuming they're complete.
- **Regression risk:** low — well-tested already.

---

## 9. Spaces / Premises

- **Frontend:** `LocauxPage.tsx` (600 lines).
- **Backend:** `hadoum_api/src/spaces/`.
- **Prisma model:** `Space`, plus `SpaceDocument`.
- **Validation workflow:** **none** — Spaces is simpler than the other Module 4 entities: create/edit/archive only, no submit/approve/reject. Archive is gated by a real `confirm()` dialog (*"Archiver cet espace ? Il ne sera plus proposé comme espace actif."*), verified live.
- **Known defect (confirmed live, minor):** the capacity `<input type="number" min={0}>` accepts a typed `-5` — HTML `min` doesn't block keystrokes, only the spinner and (usually) form submission. Not confirmed whether the backend would reject a negative value if submitted, since submission wasn't attempted with it.
- **Tests:** none (`spaces` has no `.service.spec.ts` — notably, this is the one Module 4 entity without dedicated unit tests, unlike its siblings).
- **Missing/partial:** no validation circuit at all — if the correction plan wants space edits/archival to require approval, that's new work following the same pattern as Tickets.
- **Regression risk:** low — `MaintenanceTicket` references a `spaceId`, so archiving a space that has open tickets should be checked for orphaning behavior before any archive-flow changes.

---

## 10. Consumable Stock

- **Frontend:** `StocksInventairePage.tsx`, "Stocks" tab (1597-line file shared with Inventory).
- **Backend:** `hadoum_api/src/stock-items/` + `hadoum_api/src/stock-movements/`.
- **Prisma models:** `StockItem`, `StockMovement`, `StockItemDocument`.
- **Validation workflow:** real, with **auto-escalation thresholds** confirmed in code and live: exits over 50 units, adjustments removing >20% of current stock, or any adjustment tagged with a loss type (Perte/Casse/Péremption) trigger a "this will probably require supervisor validation" warning and route through `ValidationRequest`. Exit quantity exceeding available stock is **correctly blocked** client-side (confirm button visibly disabled) — verified live with a screenshot.
- **Transfer between locations** ("Transférer" button) exists and is wired (`mode: 'transfer'` in `MovementModal`), contrary to an initial impression during manual testing that only entry/exit/adjustment existed — it was just not the first button in DOM order.
- **Tests:** `stock-items.service.spec.ts` (unit), `stock-inventory-register.e2e-spec.ts` (backend integration, shared with Inventory + Entry Logs).
- **Missing/partial:** movement history panel exists on the item detail view but its contents weren't enumerated live this pass.
- **Regression risk:** low — real test coverage exists; this is one of the more mature Module 4 areas.

---

## 11. Inventory

- **Frontend:** `StocksInventairePage.tsx`, "Inventaire" tab (same file as Stock).
- **Backend:** `hadoum_api/src/inventory-assets/`.
- **Prisma model:** `InventoryAsset`, `InventoryAssetDocument`. Disposal reasons: `ApiAssetDisposalType` (Réforme/Perte/Casse/Vol).
- **Validation workflow:** real, same `ValidationRequest` pattern. Asset action modal supports 4 modes: `assign` / `transfer` / `disposal` / `archive` — disposal was verified live (mandatory reason field, correct options); assign/transfer exist in code but weren't exercised end-to-end live this pass.
- **Tests:** `inventory-assets.service.spec.ts` (unit), `stock-inventory-register.e2e-spec.ts` (backend integration).
- **Missing/partial:** assignment history and transfer-history views not verified live.
- **Regression risk:** low.

---

## 12. Visitor Entry/Exit Register (+ Goods Movement)

- **Frontend:** `RegistreEntreesSortiesPage.tsx` (1326 lines) — combines visitor/delivery entries and a separate "Biens et marchandises" (goods movement) sub-tab.
- **Backend:** `hadoum_api/src/entry-logs/` + `hadoum_api/src/goods-movement-logs/`.
- **Prisma models:** `EntryLog`, `EntryLogDocument`, `GoodsMovementLog`, `GoodsMovementDocument`. `ApiEntryType` covers 10 movement types (ENTREE/SORTIE/VISITE_PREVUE/VISITE_IMPREVUE/SORTIE_TEMPORAIRE/SORTIE_EXCEPTIONNELLE/RETOUR/PRESTATION/LIVRAISON/AUTRE), `ApiVisitorCategory` covers 11 categories.
- **Validation workflow:** **real, and the only area in the whole app confirmed to correctly enforce SUPERVISOR-as-read-only** (zero create/mutate buttons visible for SUPERVISOR across every sub-page checked; DIRECTOR-only gates confirmed both in the UI (`isDirector` checks) and via absence of 401/403 — because SUPERVISOR never gets offered the mutating controls in the first place). Goods movement's large-quantity auto-validation (>50 units, mirroring the Stock module's threshold) was verified live end-to-end with two genuinely separate browser sessions (DIRECTOR creates → SUPERVISOR approves).
- **Tests:** `entry-logs.service.spec.ts`, `goods-movement-logs.service.spec.ts` (unit), `stock-inventory-register.e2e-spec.ts` (backend integration).
- **Missing/partial:** "visite prévue" (planned-visit) records were confirmed created correctly in the database during live testing but were not located in the specific in-app view checked immediately after creation — the app likely routes them to a distinct "visites prévues" section rather than the main list; this needs a quick UI walkthrough to confirm before assuming anything is broken, since the data itself is safe.
- **Regression risk:** low — best-tested area of the app alongside Stock/Inventory.

---

## 13. Validation Workflows (cross-cutting engine)

- **Backend:** `hadoum_api/src/validations/` — a genuinely **generic, resource-agnostic** engine: `GET /validations/pending`, `GET /validations/:resourceType/:resourceId/history`. Backing model: `ValidationRequest` (32 rows in the current dev DB, actively used by Tickets, Contracts, Procedures, Stock Items, Inventory Assets, Entry Logs, Goods Movement Logs, Fund Requests, and Staff Attendance's dormant `validationStatus` column).
- **Frontend reality is fragmented:** despite the shared backend engine, **there is no shared frontend component.** Five separate pages (`DemarchesAdministrativesPage`, `RegistreEntreesSortiesPage`, `StocksInventairePage`, `SupplierContractsPage`, `TicketsMaintenancePage`) each independently define their own `DECISION_CFG` object and approve/reject modal, with small behavioral drift between them (native `confirm()` vs. custom modal for "submit", as noted in §7 and §9).
- **`ValidationsPage.tsx`** (route `/app/validations`, presumably meant to be a central "pending validations across the app" view) **is mock-driven via `AppDataContext`, not the real `GET /validations/pending` endpoint.** This is the same disconnection pattern as the Director Dashboard.
- **Tests:** `validations.service.spec.ts` (unit) — the shared engine itself is tested; the per-page duplicated frontend logic is not.
- **Missing/partial:** extracting the 5 duplicated `DECISION_CFG`/modal implementations into one shared component, and wiring `ValidationsPage.tsx` to the real `/validations/pending` endpoint, are both clear, low-risk, high-value corrections — the hard part (the backend engine) already exists and works.
- **Regression risk:** low for wiring `ValidationsPage.tsx` (nothing currently depends on it being mock); **medium** for consolidating the 5 duplicated modals, since each page's decision config has slightly different `commentRequired` rules per action and a careless merge could change behavior on a page silently (e.g., accidentally making Tickets' approve require a comment when it doesn't today).

---

## 14. Audit Logs / Action History

**There is no dedicated audit-log or action-history model anywhere in the schema.** Confirmed by grepping every model name containing "Log", "Audit", or "History":
- `EventLog` — exists, but is scoped to `Child` only (used for the Sorties/exit timeline in Module 1; not a general audit trail).
- `EntryLog` / `GoodsMovementLog` — these are visitor/goods **register entries** (Module 4G), not generic audit records, despite the name "Log".
- `ValidationRequest` — the closest thing to an audit trail that exists: it records who submitted, approved, or rejected a given resource, with a comment and timestamp, and is queryable per-resource via `GET /validations/:resourceType/:resourceId/history`. This is real and working (verified live for Tickets in this campaign — "Soumis par Hadoum Director" with a date, shown correctly in the UI).
- No login-history, no generic "who edited this record" trail for non-validation-gated entities (e.g., a plain `PATCH` to a Space or a Staff member's notes leaves no audit trace beyond the bare `updatedAt` timestamp — there's no record of *who* made the change or what it was before).

**Missing/partial:** if the corrections require a genuine audit log (who did what, when, across all entities — not just validation decisions), this is **net-new schema and infrastructure**, not an extension of something partially built. `ValidationRequest` history can be reused/generalized as a starting pattern, but it only covers the subset of actions that go through the validation circuit.

**Regression risk:** building this is additive (a new table + write hooks) and low-risk to existing features by itself, but retrofitting write-hooks into every existing service method (so every mutation gets logged) touches a lot of files and should be done last, once the schema/API shape of everything else is stable.

---

## Cross-cutting infrastructure questions

| Question | Answer |
|---|---|
| DIRECTOR and SUPERVISOR roles used? | Yes, consistently, via `@Roles('DIRECTOR', 'SUPERVISOR')` + `JwtAuthGuard`/`RolesGuard` on every controller checked. **Enforcement is inconsistent across modules**, though: Children/Staff/Finance give SUPERVISOR full write parity with DIRECTOR (no finer-grained check beyond "is logged in as either role"); Module 4's Register/Tickets/Contracts/Procedures/Stock/Inventory correctly restrict mutating actions to DIRECTOR only, both in the UI and confirmed via absent 401/403 responses (meaning SUPERVISOR is never offered the controls, rather than being blocked after the fact). |
| Notification service? | Yes, real: `hadoum_api/src/notifications/` (`GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`). Actively called from 9 service files (Activities, Administrative Procedures, Entry Logs, Fund Requests, Goods Movement Logs, Inventory Assets, Maintenance Tickets, Stock Items, Supplier Contracts) on validation-relevant events. Frontend notification bell exists and was confirmed working in an earlier pass of this campaign. |
| File upload service? | Yes, real and shared: `hadoum_api/src/upload/upload.service.ts`, using `@aws-sdk/client-s3` against Hetzner Object Storage (S3-compatible), env-configured (`S3_ENDPOINT`/`S3_BUCKET`/`S3_ACCESS_KEY`/`S3_SECRET_KEY`). Every module with document upload (Children, Staff, Finance, Tickets, Contracts, Procedures, Stock, Inventory, Register, Incidents) goes through this one service — genuinely reusable, not duplicated. |
| Action history / audit logging? | **No dedicated system** — see §14. Only `ValidationRequest` history and the `Child`-scoped `EventLog` exist; neither is a general-purpose audit trail. |
| Reusable approval components? | **Backend: yes** (the generic `validations` module/engine). **Frontend: no** — 5 pages independently reimplement the same approve/reject modal pattern; `ValidationsPage.tsx`, which looks like it should be the shared/central UI, is disconnected mock data instead. |

---

## Test coverage summary (this branch)

**Backend unit tests exist for:** administrative-procedures, entry-logs, goods-movement-logs, inventory-assets, maintenance-tickets, notifications, stock-items, supplier-contracts, validations. **Absent for:** finances, children, staff, incidents, spaces, activities, fund-requests, reports, auth (auth has e2e coverage instead).

**Backend e2e-spec files:** `auth`, `documents`, `lifecycle-scenarios` (contracts + procedures), `stock-inventory-register` (stock + inventory + entry logs), `app` (health). **No e2e coverage for:** finances, incidents, children, staff, spaces, fund-requests, activities, the goods-movement two-actor flow specifically (though it is covered by a frontend Playwright spec instead).

**Frontend:** no unit-test framework in the project at all; Playwright e2e specs exist (`e2e/*.spec.ts`) covering login, navigation, administration hub, module4-register creation, one two-actor validation scenario (goods movement), supervisor read-only check, and responsive layout — none of Finance, Incidents, Director Dashboard, or Staff Attendance.

---

## Recommended implementation order

Ordered by (a) how much of the backend already exists vs. needs schema changes, (b) blast radius / how many other features depend on it, and (c) whether it currently has test coverage to catch regressions.

1. **Consolidate the 5 duplicated validation-decision modals into one shared frontend component**, driven by the already-working generic `/validations` backend. Zero backend changes, immediately reduces the surface area for every subsequent correction that touches an approve/reject flow. Do this **first** so every module below inherits the fix instead of being touched twice.
2. **Wire `ValidationsPage.tsx` to the real `GET /validations/pending` endpoint** (remove its `AppDataContext` dependency). Small, isolated, immediately gives DIRECTOR/SUPERVISOR a real cross-module pending-approvals view — useful for verifying every other correction below as you make it.
3. **Fix the confirmed concrete defects in already-solid modules** (real backend + real tests already exist, so regressions are cheap to catch): Spaces' negative-capacity input; Finance's missing delete-confirmation; the "submit for validation" precondition on Supplier Contracts needs to be identified/documented (or fixed if it's genuinely wrong).
4. **Expenses/Budgets validation workflow** (§4/§5) — this is the biggest scoped piece of new work with an existing foundation. Requires a `Transaction` schema change (`REJETE` status, comment/approver fields) before any endpoint work; do the migration first, keep `BudgetLine`/dashboard aggregation logic in sync in the same change since they read `Transaction.status`. No existing tests to lean on — write them alongside the feature, not after.
5. **Fund Requests** — reconcile `DirectorDashboard.tsx`'s mock `DemanderFonds`/`AppDataContext` flow with the real, already-built `fund-requests` backend (which has full approve/reject/history). This is "wire up existing backend to a new frontend," similar in shape to item 2, but touches the Director/Supervisor dashboards which are currently 100% mock — expect this to surface how much of §1's dashboard rewrite is a prerequisite.
6. **Director Dashboard real-data rewrite** (§1) — do this after Expenses/Budgets and Fund Requests are real, so the dashboard's KPIs and "Activités/Demandes à valider" widgets have real endpoints to point at instead of being rewired twice.
7. **Staff Attendance's dormant `validationStatus`/leave-request path** (§2a) — decide whether to finish it (add the missing `POST /staff/:id/leave-requests` route) or remove the unused column/comment; either way it's a small, contained change once items 1-2 give you the shared approval UI to plug it into.
8. **Incidents validation workflow**, if the corrections require it (§3) — modeled directly on the now-shared pattern from item 1, applied to a currently-simple ungated module.
9. **Audit logging** (§14) — last, deliberately: it's additive infrastructure that ideally instruments the *final* shape of every service's mutation methods. Building it before the above changes means re-touching every file a second time once schemas/flows shift.
10. **Child-attendance mock page and the orphaned `ChildAttendance` model** (§2b) — lowest priority unless explicitly in scope for this correction round; currently harmless dead code, but do not build on top of it without confirming it's actually wanted, since nothing currently reads or writes that table.

**Cross-cutting caution:** items 3 onward that touch `finances.controller.ts`/`Transaction` should be paired with adding unit tests at the same time — this is the module with a real spec's worth of requirements (M3) and zero automated coverage today.
