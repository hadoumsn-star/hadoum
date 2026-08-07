# Hadoum — Contact Module: Technical Architecture

**Date:** 2026-08-03
**Branch:** `feature/corrections-reunion-modules-3-4`
**Status:** Design only. No code, no migrations, no files were created or modified to produce this document.

This design is grounded in the current schema (verified by direct inspection at design time, not assumed): `SupplierContract.supplierName` / `.contactPerson` / `.phone` / `.email` / `.address`, `AdministrativeProcedure.authority`, `MaintenanceTicket.assignedTo`, `Transaction` (no supplier field exists today), `Incident.signaledBy`. Existing precedent for "category of external party" already exists twice in the schema — `VisitorCategory` (11 values, entry register) and `ContractCategory` (9 values, utility-bill categories) — both hardcoded enums. This precedent directly informs the category design decision in §1.

---

## 1. Prisma model

### Contact

```
model Contact {
  id           String   @id @default(uuid())

  fullName     String              // primary display name — a person's name, OR the organization's
                                    // name itself when there is no specific named individual
  organization String?             // set when fullName is a person and they represent an org
                                    // (e.g. fullName="Amadou Diop", organization="Sénégal Gaz")

  categoryId   String
  category     ContactCategory  @relation(fields: [categoryId], references: [id], onDelete: Restrict)

  phone        String?
  email        String?
  address      String?
  notes        String?

  active       Boolean  @default(true)   // soft-delete flag — see §3 (no hard delete endpoint)

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  // Reverse relations, added incrementally as each consuming module migrates (§2):
  supplierContracts        SupplierContract[]
  maintenanceTickets       MaintenanceTicket[]
  administrativeProcedures AdministrativeProcedure[]
  transactions             Transaction[]

  @@index([categoryId])
  @@index([active])
  @@index([fullName])
}
```

**Field decisions worth stating explicitly:**
- `fullName` is required; `organization` is optional. This mirrors — inverted — the existing `SupplierContract.supplierName` + `.contactPerson` pair, and covers both shapes a contact can take: a pure organization ("Sénégal Gaz", no named person) or a person tied to an organization ("Amadou Diop" at "Sénégal Gaz").
- No unique constraint on `phone` or `email`. Real-world contact data is messy (shared office lines, re-entered typos); a hard DB constraint would cause avoidable friction. Duplicate prevention is handled as a soft, application-level warning (§3, §6) instead.
- `onDelete: Restrict` on the category relation — a category cannot be removed while any contact still uses it (forces an explicit reassignment first, never a silent orphan).
- No relation is made required (`onDelete: Cascade` is never used from Contact outward) — deactivating or would-be-deleting a Contact must never cascade-delete a `SupplierContract`, `MaintenanceTicket`, etc. Contact is a leaf the rest of the schema points *at*, never the other way around.

### ContactCategory — see the decision below for why this is a table, not an enum.

```
model ContactCategory {
  id        String   @id @default(uuid())
  key       String   @unique   // stable machine key, e.g. "FOURNISSEUR" — used in code/seed data
  label     String              // display label, e.g. "Fournisseur"
  color     String?             // optional UI badge color hint
  sortOrder Int      @default(0)
  active    Boolean  @default(true)

  contacts  Contact[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### Category modeling: enum vs. lookup table vs. configurable table

**Decision: configurable table (`ContactCategory` as designed above), not a Prisma enum.**

Justification, weighed directly against what's already in this codebase:

| | Enum | Bare lookup table (id + label) | Configurable table (chosen) |
|---|---|---|---|
| Adding a new category | Requires a Prisma migration + deploy | Just an `INSERT` | Just an `INSERT`, plus optional admin UI later |
| Matches existing precedent | Yes — `VisitorCategory`, `ContractCategory` both do this today | No | No |
| Fits the stated goal ("single source of truth" for *every current and future* consumer) | No | Partially | Yes |
| Can carry display metadata (color, sort order) | No | No | Yes |
| Can be deactivated without breaking history | No (enum values can't be soft-removed; changing one is a breaking migration) | Yes, if `active` flag added | Yes, built in |
| Governance (who can add/rename categories) | Developers only, via code | Anyone with DB access | Can be exposed to DIRECTOR/ADMIN via a settings screen (future) |

The two existing enums (`VisitorCategory`, `ContractCategory`) are precedent for the *pattern the team already reaches for*, but both are narrow, single-module classifications that were reasonable to hardcode because they don't claim to be reused elsewhere. Contact is explicitly the opposite: it is meant to be shared, from day one, across Expenses, Administrative Procedures, Supplier Contracts, and Maintenance, with Incidents and unnamed future consumers already flagged as coming. A hardcoded enum would mean every new consumer module with a slightly different categorization need (or every organizational change — e.g., deciding to split "Prestataire" into "Prestataire technique" / "Prestataire administratif") requires a schema migration. That directly contradicts the brief calling this the long-term "single source of truth."

A bare lookup table avoids the migration-per-category problem but still can't carry the badge-color/sort-order metadata the frontend list/autocomplete needs (§4), and gives no natural hook for the "future ADMIN role manages categories" possibility named in §5.

**Practical note:** choosing the configurable-table *schema* now does not require building a category-management admin UI in this phase — §5/§7 treat that UI as deferred. The schema is shaped correctly from the start either way, which is the point: the expensive-to-change part (the data model) is decided once, correctly, even if the cheap-to-add part (an admin screen) ships later.

**Seed data for `ContactCategory`**, derived from existing usage rather than invented: `FOURNISSEUR` (Fournisseur), `PRESTATAIRE` (Prestataire), `MAINTENANCE` (Prestataire maintenance), `PARTENAIRE` (Partenaire), `BAILLEUR` (Bailleur / donateur), `ADMINISTRATION` (Autorité administrative), `AUTRE` (Autre). This deliberately overlaps with `VisitorCategory`'s external-facing values (`FOURNISSEUR`, `PRESTATAIRE`, `MAINTENANCE`, `PARTENAIRE`) and excludes `VisitorCategory`'s internal-facing ones (`PARENT_TUTEUR`, `PERSONNEL`, `VISITEUR`, `BENEVOLE`) which describe *why someone is on the premises today*, a different concept from *what kind of external entity they are* — Contact is the latter. No attempt is made to consolidate `VisitorCategory`/`ContractCategory` into this table as part of this change; that is a separate, later decision (noted in §7 as explicitly out of scope).

---

## 2. Relationships — every module that should move off free text

| Module | Current field(s) | Nullability today | Proposed relation | Notes |
|---|---|---|---|---|
| **Supplier Contracts** | `supplierName` (String, **required**), `contactPerson`/`phone`/`email`/`address` (all optional) | required + 4 optional | New `contactId String` (required once migrated) | This is the richest existing free-text contact record in the app — effectively 5 fields collapsing into 1 relation. `contactPerson`/`phone`/`email`/`address` become redundant once `Contact` holds them; **do not carry them forward as separate columns.** |
| **Administrative Procedures** | `authority` (String, **required**) | required | New `contactId String?` (nullable) | `authority` today only ever names an organization ("DGPJS"), never a specific person — there is no existing "contact person at that authority" field, so this is a genuine enhancement, not a pure refactor. Kept nullable because some historical/archived procedures may only resolve to a generic authority name with no clean 1:1 contact. |
| **Maintenance Tickets** | `assignedTo` (String?, optional — UI placeholder confirmed live as *"Nom du prestataire"*) | optional | New `contactId String?` (nullable) | Lowest-risk target: field is already optional, no `NOT NULL` constraint to satisfy, no dependent required-field logic. **Recommended first migration target** to validate the pattern before touching Supplier Contracts. |
| **Expenses (Transaction)** | **none exists** — `Transaction` has `donorName` (income only) but no supplier field at all | n/a | New `supplierContactId String?` (nullable) | Purely additive. Nothing to migrate; no existing data at risk. `donorName` is a separate concept (donor, not supplier) and is **not** in scope for this change. |
| **Incidents** | `signaledBy` (String, required) | required | **No change recommended now** | `signaledBy` reads as an internal staff member reporting the incident, not an external party — migrating it to Contact would conflate internal and external people, which Contact is explicitly *not* meant to hold (see Non-goals below). The real future Contact use case here — "an external party was involved in this incident" — has no existing field to migrate; it would be a net-new nullable column, to be designed if/when Incidents' validation workflow work (audit §3, item 8) is scheduled. |

**Non-goals — explicitly out of scope:**
- `StaffMember`, `Candidate`, `FormerStaffMember` are internal people (HR records) and must **not** be absorbed into Contact, which is for *external* people/organizations only. Conflating the two would break the Staff module's own identity and permission model.
- `Child.guardianName`/`guardianPhone` are arguably a borderline case (a guardian is external to the org but tied 1:1 to a specific child) — deliberately **not** included in this design; flagging it here so it's a conscious future decision rather than a silent omission.
- `MaintenanceTicket.reportedBy` and `AdministrativeProcedure`'s implicit "who's handling this internally" concept are internal-staff fields, not Contact candidates.

---

## 3. Backend

### Module layout

```
hadoum_api/src/contacts/
  contacts.module.ts
  contacts.controller.ts
  contacts.service.ts
  dto/
    create-contact.dto.ts
    update-contact.dto.ts
    query-contacts.dto.ts
  contact-categories.controller.ts   (thin; could also live in the same controller — see below)
  contact-categories.service.ts
```

Whether categories get their own controller/service or share `ContactsController` is a minor implementation call, not an architectural one — either is fine; the DTOs and endpoint list below are unaffected.

### DTOs (fields + validation rules, no class syntax)

**CreateContactDto**
- `fullName`: string, required, `MinLength(1)`
- `organization`: string, optional
- `categoryId`: string, required, must reference an existing, active `ContactCategory`
- `phone`: string, optional — validated against the same Senegalese phone shape already used elsewhere in the app (`+221 XX XXX XX XX`), not a generic `@IsPhoneNumber()` with a different country assumption
- `email`: string, optional, `@IsEmail`
- `address`: string, optional
- `notes`: string, optional

**UpdateContactDto** — same shape as create, all fields optional (`PartialType(CreateContactDto)`), matching the existing convention used by `UpdateTransactionDto` etc. `active` is intentionally **not** part of this DTO — deactivation is its own endpoint (below), not a field you can silently flip via a generic update.

**QueryContactsDto** (for `GET /contacts`)
- `search`: string, optional — matched against `fullName` and `organization`
- `categoryId`: string, optional
- `active`: boolean, optional, defaults to `true` (inactive contacts are hidden from normal listing/search unless explicitly requested)

### Endpoints

| Method | Path | Purpose | Roles |
|---|---|---|---|
| `GET` | `/contacts` | Paginated/filtered list (search, category, active) — powers the Contact list page | DIRECTOR, SUPERVISOR |
| `GET` | `/contacts/search` | Lightweight, fast, minimal-payload endpoint (`id`, `fullName`, `organization`, `category.label`) — powers the autocomplete, separate from the full list so it stays cheap under fast typing | DIRECTOR, SUPERVISOR |
| `GET` | `/contacts/:id` | Full detail | DIRECTOR, SUPERVISOR |
| `POST` | `/contacts` | Create (includes the soft duplicate-check below) | DIRECTOR, SUPERVISOR |
| `PATCH` | `/contacts/:id` | Update editable fields | DIRECTOR, SUPERVISOR (see §5 for a stricter option) |
| `PATCH` | `/contacts/:id/deactivate` | Soft-delete — sets `active = false` | DIRECTOR only (see §5) |
| `PATCH` | `/contacts/:id/reactivate` | Reverses the above | DIRECTOR only |
| `GET` | `/contacts/categories` | List active categories, for populating dropdowns | any authenticated role that can reach a Contact-consuming form |
| `POST` / `PATCH` / `DELETE` | `/contacts/categories`, `/contacts/categories/:id` | Category management | DIRECTOR only (future ADMIN, §5) |

**No hard-delete endpoint exists anywhere in this design.** `Contact` is referenced from multiple modules; deleting a row out from under an existing `SupplierContract`/`MaintenanceTicket` would either orphan the reference or require `onDelete: Cascade`, which would silently delete unrelated business records — neither is acceptable. Deactivation is the only removal mechanism.

### Duplicate handling (service-layer, not a DB constraint)

Before creating a contact, the service performs a soft check: same `phone` OR same `email` OR (same `fullName` AND same `organization`, case/accent-insensitive) among **active** contacts. If a match is found, the create call does not fail — it returns the match as a `possibleDuplicate` alongside a `409`-shaped response the frontend can render as *"A similar contact already exists — use it instead?"*, with a way to proceed anyway (the user may genuinely be adding a second, distinct person who happens to share details). This is deliberately a warning, not a hard block — over-blocking creates its own friction and workarounds (people padding phone numbers with a fake digit to get past the guard, etc.).

### Validation workflow

**None.** Contact is a plain CRUD directory, not a validation-gated entity like Tickets/Contracts/Procedures. Creating or editing a contact does not go through `ValidationRequest`. This is a deliberate simplicity choice — a phone-number correction shouldn't need DIRECTOR/SUPERVISOR sign-off. If deactivation ever needs to be gated (e.g., "don't let a SUPERVISOR silently retire a contact everyone depends on"), that's handled by the permission matrix in §5 (deactivate is DIRECTOR-only), not by adding a validation circuit to something this simple.

---

## 4. Frontend

### Contact list page

New `hadoum_frontend/src/app/pages/ContactsPage.tsx`, route `/app/contacts`. Placed under the "Administration & Locaux" area of the sidebar (same operational/back-office grouping as Suppliers/Contracts/Procedures), not as a new top-level nav item — it's infrastructure for those pages, not a destination on its own for most users.

Layout, consistent with the existing list-page pattern already used across Module 4 (search box, filter chips, card/table list, modal-based CRUD — matching `LocauxPage.tsx`/`SupplierContractsPage.tsx` conventions rather than inventing a new one):
- Search box (name/organization)
- Category filter (chips or dropdown, populated from `GET /contacts/categories`)
- Active/inactive toggle (defaults to showing active only)
- List: fullName, organization, category badge, phone, email, active state, row actions (Modifier, Désactiver/Réactiver)
- "Nouveau contact" button → Create/Edit dialog

### Create/Edit dialog

`ContactModal` — single form, fields matching `CreateContactDto`. Category as a `<select>` sourced from `GET /contacts/categories`. Phone input reuses the existing `+221 XX XXX XX XX` auto-formatting behavior already implemented independently in `TeamPage.tsx` and `ChildrenPage.tsx` — extracting that into one shared formatter is a small, low-risk cleanup worth doing *as part of* this work rather than a fourth copy-paste. On submit, if the backend flags a possible duplicate, show it inline with a "use this contact instead" shortcut rather than silently creating a near-duplicate.

### Search dialog

`ContactPickerDialog` — a modal invoked from any consuming form (e.g., "Choisir un fournisseur" when creating a `SupplierContract`). Debounced search input, result list (fullName, organization, category badge), select-and-close behavior returning the chosen `contactId` to the calling form, plus an inline "+ Créer un nouveau contact" shortcut that opens `ContactModal` without losing the caller's in-progress form state (create-on-the-fly, so a user filling out a maintenance ticket doesn't have to abandon it, go create a contact, and start over).

### Reusable autocomplete component

`ContactAutocomplete` — a controlled combobox component: `value` (contactId or null), `onChange`, optional `categoryFilter` (to scope suggestions — e.g. when embedded in Maintenance Tickets' assignedTo field, default the filter to the `MAINTENANCE`/`PRESTATAIRE` categories, still allow clearing it), `placeholder`.

Required behavior, mapped to the brief's four requirements:
- **Search by name:** substring match against `fullName`, case- and accent-insensitive, via `GET /contacts/search?q=...`, debounced ~250–300ms.
- **Search by organization:** same endpoint, same query param also matches `organization` server-side (a single `search` param covering both fields, not two separate inputs — simpler UX, matches how the existing list pages' search boxes already behave).
- **Search by category:** a row of category filter chips above the results *within the dropdown panel* (not clever search-string syntax like `category:Fournisseur`, which is harder to discover) — clicking a chip narrows the current result set client-side against the already-fetched page, or re-queries with `categoryId` if the result set is large.
- **Keyboard navigation:** implements the standard ARIA combobox/listbox pattern — input has `role="combobox"`, results panel has `role="listbox"`, `ArrowDown`/`ArrowUp` move a highlighted `aria-activedescendant` through visible results, `Enter` selects the highlighted result, `Escape` closes the dropdown without altering the current value, `Tab` closes the dropdown and moves focus normally. This is an accessibility-driven design choice, not a nice-to-have — several existing pages already build custom dropdowns without this (e.g., the `PosteSelect` component in `TeamPage.tsx`), so this component is also an opportunity to set the pattern other custom dropdowns in the app should eventually follow.
- A "+ Créer un nouveau contact" affordance at the bottom of the result list when no good match exists, opening the same create-on-the-fly flow as the Search dialog.

`ContactAutocomplete` is what actually gets embedded in the consuming forms (Supplier Contracts' supplier field, Administrative Procedures' responsible/authority field, Maintenance Tickets' assignedTo field, and the new Expenses supplier field) — `ContactPickerDialog` is for cases where a full-screen/modal search experience is more appropriate than an inline dropdown (e.g., picking a contact from a dense table context). Both share the same underlying search logic; the picker is not a second implementation.

---

## 5. Permissions

Current roles in the schema: `DIRECTOR`, `EDUCATOR`, `SUPERVISOR`, `BOARD`. `ADMIN` and `ACCOUNTANT` do not exist yet — this section designs for their eventual addition without assuming their exact final semantics, since that needs product sign-off, not just an engineering guess.

The existing `RolesGuard` is a simple per-endpoint allow-list (`@Roles('DIRECTOR', 'SUPERVISOR')`) — adding a role to any endpoint later is a one-line, low-risk change. Nothing about this design requires changing that guard's architecture.

| Action | DIRECTOR | SUPERVISOR | ADMIN (future) | ACCOUNTANT (future) |
|---|---|---|---|---|
| View / search / autocomplete contacts | ✅ | ✅ | ✅ | ✅ — needed to select a supplier while entering an expense |
| Create a contact (dedicated page or "create on the fly" from a consuming form) | ✅ | ✅ | ✅ | ✅ — same reasoning: an accountant must be able to add a new supplier inline |
| Edit contact details | ✅ | ✅ | ✅ | ❌ (recommend: not by default — see reasoning) |
| Deactivate / reactivate a contact | ✅ | ❌ | ✅ | ❌ |
| Manage categories (create/rename/reorder/deactivate) | ✅ | ❌ | ✅ | ❌ |
| Hard delete | *(not offered to anyone — see §3)* | | | |

**Reasoning for the asymmetry between "create" and "edit/deactivate":** Contact is shared state — a `SupplierContract`, a `MaintenanceTicket`, and an `Expense` can all point at the same row. Letting any role that can *create* a contact also freely *edit or deactivate* any contact (including ones created by other people, for other modules) risks one module's user silently breaking another module's reference (e.g., a SUPERVISOR entering an expense edits a supplier's phone number, unaware that same contact is also the counterparty on an active `SupplierContract` someone else manages). Restricting edit/deactivate to DIRECTOR/ADMIN keeps "who can widen the directory" permissive (good — reduces friction for day-to-day data entry) while keeping "who can change/retract a shared record" conservative. This specific split is a recommendation, not a hard requirement of the schema/API design — it can be loosened (e.g., allow SUPERVISOR to edit contacts *they* created) without any architectural change, since it's purely a `@Roles(...)` decorator choice per endpoint.

`EDUCATOR` and `BOARD` are not given any access in this design — neither role currently touches Suppliers/Contracts/Procedures/Maintenance/Expenses, so neither needs Contact access. Add them later, to the same endpoints, if that changes.

---

## 6. Migration — no data loss

Existing free-text data becomes Contact rows through a strict **expand → backfill → verify → cutover → (later, separate) contract** sequence. Nothing is deleted until the final, deliberately-deferred step.

**Step 1 — Expand (additive schema migration).** Add `Contact` and `ContactCategory` tables. Add new **nullable** FK columns to the four consuming tables (`SupplierContract.contactId`, `AdministrativeProcedure.contactId`, `MaintenanceTicket.contactId`, `Transaction.supplierContactId`). Existing free-text columns are untouched. The application behaves identically to before this migration runs — zero user-facing change, fully reversible by simply not using the new columns.

**Step 2 — Seed categories.** Insert the initial `ContactCategory` rows listed in §1.

**Step 3 — Backfill script (one-off, per environment, dry-run first).** For each source table/field (`SupplierContract.supplierName`+`contactPerson`+`phone`+`email`+`address`, `AdministrativeProcedure.authority`, `MaintenanceTicket.assignedTo`):
1. Select distinct non-empty values, normalized for comparison (trim, collapse whitespace, case-fold) — but the *original* casing/text is preserved when creating the Contact, only the comparison is normalized.
2. For each distinct value, check whether a matching active `Contact` already exists (by fullName+organization, or by phone/email where available) — reuse it if so, to avoid creating a second row for the same real-world supplier already named slightly differently in two modules. Otherwise create a new `Contact`, tagged with a best-guess category from source table (`SupplierContract` → `FOURNISSEUR`, `MaintenanceTicket.assignedTo` → `PRESTATAIRE`/`MAINTENANCE`, `AdministrativeProcedure.authority` → `ADMINISTRATION`).
3. Update the source row's new FK column to point at the resolved `Contact`.

This script **always runs in dry-run mode first**, producing a report ("N distinct values found, M would become new contacts, K would match an existing one") for a human to sanity-check before the real write — because fuzzy matching can go wrong in both directions (failing to merge "Sénégal Gaz" / "Senegal Gaz SARL" as the same supplier; or wrongly merging two different people who happen to share a common name). This human checkpoint is the primary safeguard against silent data-quality damage, and is treated as mandatory, not optional tooling.

**Step 4 — Frontend cutover, one module at a time** (order recommended in the audit: Maintenance Tickets first as the lowest-risk/nullable case, then Supplier Contracts, then Administrative Procedures, then the new Expenses field). Each consuming form switches its free-text input to `ContactAutocomplete`. During this window, the app **dual-writes**: selecting a contact also writes its `fullName` into the legacy free-text column, so nothing currently reading the old column (list views, exports, notification message text) breaks while the cutover is in progress.

**Step 5 — Verify.** After a soak period, a reconciliation query per module confirms every active row has a resolved contact (or is explicitly, intentionally excluded — e.g. a long-archived procedure). Only after this check passes does the team consider the migration "complete" for that module.

**Step 6 — Contract (a separate, later, explicitly out-of-scope-for-now migration).** Stop dual-writing in code; rename the legacy free-text columns with a `_deprecated` suffix for one more release as a final safety net; drop them in a follow-up cleanup migration once nothing references them. This is intentionally not part of the initial rollout.

**Why this guarantees no data loss:** nothing is ever deleted before step 6, which this design explicitly defers past the scope of "introduce the Contact module." The backfill only adds rows and populates new nullable columns. The dry-run report gates the one step (backfill) that writes derived data. Dual-writing during cutover means even a bug in the new Contact-based path leaves the original free text intact and readable until the team is confident enough to remove it.

---

## 7. Risks

**Per-module risk:**

- **Supplier Contracts — highest complexity.** `supplierName` is `NOT NULL` today; making `contactId` required (once fully migrated) means every existing contract needs a resolved contact first — the backfill (§6) must complete and be verified before any `NOT NULL` constraint is added, and that constraint change should be its own later migration, not bundled with this one. Existing tests (`supplier-contracts.service.spec.ts`, `lifecycle-scenarios.e2e-spec.ts`) currently construct contracts with a raw `supplierName` string and **will need updating** once the field set changes — this is correct, expected breakage (the tests doing their job), and should be budgeted as part of this work's estimate, not discovered as a surprise.
- **Administrative Procedures — moderate.** Same test-update cost (`administrative-procedures.service.spec.ts`, `lifecycle-scenarios.e2e-spec.ts`), lower functional risk since `authority` is closer to a label than a data hub other logic depends on.
- **Maintenance Tickets — lowest risk.** `assignedTo` is already optional; a nullable `contactId` is strictly additive with no constraint to satisfy and no test currently pinning its exact string shape (from what's observable in the codebase). Confirmed as the recommended first module to migrate, both here and in the audit's implementation order.
- **Expenses/Transaction — additive, but untested.** No existing data at risk (nothing to migrate), but the Finance module has **zero automated test coverage today** (per the audit) — a regression introduced here would not be caught by any existing test. This change should ship with its own new tests, not rely on the rest of the suite to notice a problem.
- **Incidents — no current risk**, because no field is being touched (§2). Risk resurfaces only if/when a concrete external-party field is designed for this module later.

**Cross-cutting risks:**

- **Deactivation vs. referential integrity.** A `Contact` deactivated while still referenced by an *active* `SupplierContract` or open `MaintenanceTicket` must remain readable on those existing records (deactivation hides it from *new* selection, it must not break existing links). Every consuming detail view needs to render an inactive-but-referenced contact gracefully (e.g. a greyed "inactif" badge) instead of erroring or showing a broken reference.
- **Backfill data quality is the single biggest risk in this plan.** Under-merging (near-duplicate contacts for the same real entity, spelled differently across modules) and over-merging (two different real people/organizations wrongly collapsed into one row because they share a name) are both plausible outcomes of naive fuzzy matching. This is why §6 makes the dry-run report a mandatory human checkpoint rather than optional tooling — it is the primary mitigation, not a nice-to-have.
- **Notification/message-text coupling.** `SupplierContract`, `MaintenanceTicket`, and `AdministrativeProcedure` all feed the shared notification system audited earlier. Any code path that interpolates `supplierName`/`assignedTo`/`authority` directly into a notification or list-display message string needs to be found and updated to read from `contact.fullName` instead — otherwise those messages will silently show blank/`undefined` once the legacy columns are eventually dropped in the (deferred) contract step. Low risk during the dual-write transition window; a real risk item to track for the final cleanup migration specifically, so it isn't rediscovered as a bug later.
- **Process risk — reuse discipline.** The audit already found that five existing pages independently reimplemented their own approve/reject modal instead of sharing one component. The exact same failure mode could repeat here: if the four-plus consuming pages each hand-roll their own "pick a contact" UI instead of using `ContactAutocomplete`/`ContactPickerDialog`, the module fails to deliver on its own stated purpose (a *single* source of truth with *one* consistent picking experience). This is a review/discipline risk during implementation, not a technical gap in the design itself.
- **Explicitly not attempted in this design:** consolidating the existing `VisitorCategory` or `ContractCategory` enums into the new `ContactCategory` table. They serve different, narrower purposes (visit-reason-on-premises; utility-bill-type), and folding them in is a separate decision with its own migration cost — raised here only so it's a conscious "not now," not an oversight.
