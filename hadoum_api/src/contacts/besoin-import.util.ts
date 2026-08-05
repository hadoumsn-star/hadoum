// Pure logic backing scripts/import-besoin-contacts.ts (the one-time BESOIN
// contacts cleanup + import). Kept dependency-free and exported individually
// so it can be unit-tested with plain Jest, without a database.
//
// NOTE: these normalization helpers are intentionally separate from
// contacts.utils.ts — that file backs live ContactsService duplicate
// detection today; this one backs a one-off Excel-driven import with its own
// matching rules (leading "221" country-code stripping, accent folding) and
// is not wired into any runtime code path.

// ─── Test-contact detection ─────────────────────────────────────────────────
//
// Primary signal: every Playwright fixture in this repo names records via
// `unique(label)` -> `${label} ${Date.now()}-${Math.floor(Math.random()*1e5)}`
// (see e2e/helpers usage throughout) — a space, a 10-13 digit millisecond
// timestamp, a hyphen, then digits. That exact shape is a near-zero-false-
// -positive fingerprint of "created by an automated test fixture" — the
// literal criterion this task asks for — and is checked first. Everything
// else is the explicit keyword list from the task, plus a short list of
// obviously-not-a-person's-name QA tokens (diag/check/manuel check) found
// during inspection of this database, applied to fullName only (never to
// notes/organization, where an ordinary word like "check" could appear in
// a legitimate business note).

export const TEST_TIMESTAMP_SUFFIX = /\d{10,}-?\d*/;
// NOTE: 'diag' was deliberately dropped from this list. It was added to
// catch "NoPhone Diag 1785745025", but that contact is already caught by
// TEST_TIMESTAMP_SUFFIX above (a bare 10-digit run), making the keyword
// redundant — and it collides with real Senegalese surnames (e.g.
// "DIAGNE"), which a post-import verification pass on the real BESOIN
// contacts caught as a false positive. Keep it out.
export const TEST_NAME_KEYWORDS = [
  'test',
  'demo',
  'e2e',
  'playwright',
  'fixture',
  'sample',
  'contact test',
  'check',
  'manuel check',
  'qa',
  'unittest',
];
export const TEST_EMAIL_DOMAINS = [
  'example.com',
  'example.org',
  'test.com',
  'playwright.dev',
];

export interface TestClassification {
  isTest: boolean;
  reason: string | null;
}

export function classifyContact(c: {
  fullName: string;
  organization: string | null;
  notes: string | null;
  email: string | null;
}): TestClassification {
  const name = c.fullName ?? '';
  if (TEST_TIMESTAMP_SUFFIX.test(name)) {
    return {
      isTest: true,
      reason:
        'fullName carries the automated-fixture timestamp suffix (unique() pattern)',
    };
  }
  const lowerName = name.toLowerCase();
  for (const kw of TEST_NAME_KEYWORDS) {
    if (lowerName.includes(kw)) {
      return { isTest: true, reason: `fullName contains test keyword "${kw}"` };
    }
  }
  if (c.email) {
    const domain = c.email.split('@')[1]?.toLowerCase();
    if (domain && TEST_EMAIL_DOMAINS.includes(domain)) {
      return {
        isTest: true,
        reason: `email uses a test/example domain (${domain})`,
      };
    }
  }
  const org = (c.organization ?? '').toLowerCase();
  const notes = (c.notes ?? '').toLowerCase();
  for (const kw of ['test', 'demo', 'e2e', 'playwright', 'fixture']) {
    if (org.includes(kw))
      return {
        isTest: true,
        reason: `organization contains test keyword "${kw}"`,
      };
    if (notes.includes(kw))
      return { isTest: true, reason: `notes contain test keyword "${kw}"` };
  }
  return { isTest: false, reason: null };
}

// ─── Phone/name normalization for dedup ────────────────────────────────────

export function normalizePhone(
  phone: string | null | undefined,
): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  // Strip a leading Senegal country code if present (221 XX XXX XX XX),
  // leaving the 9-digit local number both sides can be compared on.
  return digits.startsWith('221') && digits.length > 9
    ? digits.slice(3)
    : digits;
}

// The sheet sometimes packs several numbers into one "Téléphone" cell,
// separated by "/" (e.g. "77 624 85 96 /76 623 30 27", or a trailing
// "77 592 74 48 / " with nothing after the slash). The Contact record still
// stores the raw cell text verbatim (display value preserved) — this is
// purely for duplicate-matching, so any one of the numbers can identify the
// same person.
export function splitPhoneEntries(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function normalizePhones(raw: string | null | undefined): string[] {
  const seen = new Set<string>();
  for (const entry of splitPhoneEntries(raw)) {
    const n = normalizePhone(entry);
    if (n) seen.add(n);
  }
  return Array.from(seen);
}

export function normalizeName(name: string | null | undefined): string {
  return (name ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/\s+/g, ' ');
}

// ─── Excel row shape + parsing ──────────────────────────────────────────────

export interface ImportRow {
  sourceSheet: 'CONTACTS UTILES' | 'PARENTS DORPHELINS';
  rowIndex: number;
  fullName: string;
  functionTitle: string | null;
  phone: string | null;
  notes: string | null;
  categoryKey: string;
  serviceRaw: string | null;
  excluded: boolean;
  excludeReason: string | null;
}

// PR: BESOIN import — mapping the sheet's free-text "Service" values onto
// this app's existing ContactCategory taxonomy. MEDICAL/OUVRIER/SOCIAL/
// FOURNISSEUR map onto an identically-purposed existing category.
// MEMBRES (in-house help/teachers not in the formal StaffMember HR system —
// dame de charge, profs, coordinateur) and STAFF (chauffeur, agent
// sécurité) have no dedicated category; per the task's own "or the existing
// appropriate category" / "existing appropriate external-contact category"
// wording, MEMBRES -> SOCIAL and STAFF -> PRESTATAIRE were chosen as the
// closest existing fit — flagged here for confirmation, not hidden.
export const SERVICE_TO_CATEGORY: Record<string, string> = {
  MEDICAL: 'SANTE',
  OUVRIER: 'ARTISAN',
  SOCIAL: 'SOCIAL',
  FOURNISSEUR: 'FOURNISSEUR',
  MEMBRES: 'SOCIAL',
  STAFF: 'PRESTATAIRE',
};
export const PARENT_TUTEUR_CATEGORY_KEY = 'PARENT_TUTEUR';

/** Minimal shape of a parsed spreadsheet row — decoupled from the `xlsx`
 * package's own types so this module (and its tests) stay dependency-free. */
export type SheetRow = Record<string, unknown>;

/** Cells come back from `xlsx` typed as `unknown` (string/number/boolean/
 * Date/null in practice) — this narrows before stringifying so it never
 * risks producing "[object Object]" for some unexpected cell shape. */
function cellToString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  if (value instanceof Date) return value.toISOString();
  return '';
}

export function parseContactsUtilesRows(rows: SheetRow[]): ImportRow[] {
  return rows.map((r, i) => {
    const nom = cellToString(r['Nom']).trim();
    const service =
      r['Service'] != null ? cellToString(r['Service']).trim() : null;
    // Case-insensitive, accent-insensitive, trimmed: "ETAT", "État", "etat",
    // " ETAT " must all match — normalizeName already trims, lowercases, and
    // strips accents (NFD decomposition + combining-mark removal).
    const isEtat = normalizeName(service) === 'etat';
    const categoryKey = service
      ? SERVICE_TO_CATEGORY[service.toUpperCase()]
      : undefined;
    let excluded = false;
    let excludeReason: string | null = null;
    if (!nom) {
      excluded = true;
      excludeReason = 'missing Nom';
    } else if (isEtat) {
      excluded = true;
      excludeReason = 'Service = ETAT';
    } else if (!categoryKey) {
      excluded = true;
      excludeReason = `unrecognized Service value "${service ?? ''}"`;
    }
    return {
      sourceSheet: 'CONTACTS UTILES',
      rowIndex: i + 2, // +1 header row, +1 to make it 1-based like Excel
      fullName: nom,
      functionTitle: r['Fonction'] ? cellToString(r['Fonction']).trim() : null,
      phone: r['Téléphone'] ? cellToString(r['Téléphone']).trim() : null,
      notes: r['Notes'] ? cellToString(r['Notes']).trim() : null,
      categoryKey: categoryKey ?? '',
      serviceRaw: service,
      excluded,
      excludeReason,
    };
  });
}

export function parseParentsOrphelinsRows(rows: SheetRow[]): ImportRow[] {
  return rows.map((r, i) => {
    const nom = cellToString(r['Nom']).trim();
    const enfants = r['Enfants'] ? cellToString(r['Enfants']).trim() : null;
    const existingNotes = r['Notes'] ? cellToString(r['Notes']).trim() : null;
    const notesParts = [
      enfants ? `Enfant(s) : ${enfants}` : null,
      existingNotes,
    ].filter((p): p is string => !!p);
    return {
      sourceSheet: 'PARENTS DORPHELINS',
      rowIndex: i + 2,
      fullName: nom,
      functionTitle: r['Role'] ? cellToString(r['Role']).trim() : null,
      phone: r['Téléphone'] ? cellToString(r['Téléphone']).trim() : null,
      notes: notesParts.length ? notesParts.join(' — ') : null,
      categoryKey: PARENT_TUTEUR_CATEGORY_KEY,
      serviceRaw: null,
      excluded: !nom,
      excludeReason: !nom ? 'missing Nom' : null,
    };
  });
}

// ─── Duplicate matching (dependency-free — no DB access) ───────────────────
//
// Pure candidate-matching, used both by the script against real, pre-existing
// Contact rows AND — via the exact same function — against rows already
// planned as "create" earlier in the same sheet (represented as synthetic
// candidates with a `pending:<n>` id; see scripts/import-besoin-contacts.ts).
// One code path answers both "does this row duplicate something already in
// the database" and "does this row duplicate an earlier row in this same
// import".

export interface DedupCandidate {
  id: string;
  fullName: string;
  phone: string | null;
  functionTitle: string | null;
  notes: string | null;
}

export interface MatchRow {
  fullName: string;
  phone: string | null;
  functionTitle: string | null;
  notes: string | null;
}

export type EnrichableField = 'functionTitle' | 'phone' | 'notes';

export interface MatchResult {
  action: 'create' | 'reuse' | 'ambiguous';
  matchedContactId: string | null;
  matchedOn: 'phone+name' | 'phone' | 'name' | null;
  candidateIds: string[]; // populated for 'ambiguous'
  enrichedFields: EnrichableField[]; // populated for 'reuse'
  note: string | null;
}

function enrichableFields(
  row: MatchRow,
  existing: DedupCandidate,
): EnrichableField[] {
  const fields: EnrichableField[] = [];
  if (!existing.functionTitle && row.functionTitle)
    fields.push('functionTitle');
  if (!existing.phone && row.phone) fields.push('phone');
  if (!existing.notes && row.notes) fields.push('notes');
  return fields;
}

/**
 * Checks a row against a candidate pool on, in priority order: normalized
 * phone + normalized fullName together, then normalized fullName alone (only
 * once phone gives no match at all). A phone match against candidate(s) whose
 * name clearly differs is deliberately NOT auto-reused — a shared household/
 * office line can genuinely belong to two different real people, and
 * silently merging them would conflate two identities. That case is created
 * separately and flagged for manual review instead, same as a genuine
 * multi-candidate ambiguity.
 */
export function matchContact(
  row: MatchRow,
  candidates: DedupCandidate[],
): MatchResult {
  const rowPhones = normalizePhones(row.phone);
  const rowName = normalizeName(row.fullName);

  const phoneMatches = rowPhones.length
    ? candidates.filter((c) =>
        normalizePhones(c.phone).some((p) => rowPhones.includes(p)),
      )
    : [];

  if (phoneMatches.length > 0) {
    const sameName = phoneMatches.filter(
      (c) => normalizeName(c.fullName) === rowName,
    );
    if (sameName.length === 1) {
      return {
        action: 'reuse',
        matchedContactId: sameName[0].id,
        matchedOn: 'phone+name',
        candidateIds: [],
        enrichedFields: enrichableFields(row, sameName[0]),
        note: null,
      };
    }
    if (sameName.length > 1) {
      return {
        action: 'ambiguous',
        matchedContactId: null,
        matchedOn: 'phone+name',
        candidateIds: sameName.map((c) => c.id),
        enrichedFields: [],
        note: `${sameName.length} existing contacts share both this phone and this name`,
      };
    }
    const others = phoneMatches.map((c) => c.fullName).join(', ');
    return {
      action: 'create',
      matchedContactId: null,
      matchedOn: null,
      candidateIds: [],
      enrichedFields: [],
      note: `shares a phone with existing contact(s) of a different name (${others}) — created separately, please verify manually`,
    };
  }

  if (rowName) {
    const nameMatches = candidates.filter(
      (c) => normalizeName(c.fullName) === rowName,
    );
    if (nameMatches.length === 1) {
      return {
        action: 'reuse',
        matchedContactId: nameMatches[0].id,
        matchedOn: 'name',
        candidateIds: [],
        enrichedFields: enrichableFields(row, nameMatches[0]),
        note: null,
      };
    }
    if (nameMatches.length > 1) {
      return {
        action: 'ambiguous',
        matchedContactId: null,
        matchedOn: 'name',
        candidateIds: nameMatches.map((c) => c.id),
        enrichedFields: [],
        note: `${nameMatches.length} existing contacts match on name alone`,
      };
    }
  }

  return {
    action: 'create',
    matchedContactId: null,
    matchedOn: null,
    candidateIds: [],
    enrichedFields: [],
    note: null,
  };
}
