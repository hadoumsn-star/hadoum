// Pure normalization helpers used for duplicate detection (ContactsService)
// and, later, for the backfill script (a separate PR). Kept dependency-free
// and exported individually so they can be unit-tested in isolation.

/** Strips everything but digits. Returns null for an empty/missing phone. */
export function normalizePhone(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

/** Trims and lowercases. Returns null for an empty/missing email. */
export function normalizeEmail(email?: string | null): string | null {
  if (!email) return null;
  const value = email.trim().toLowerCase();
  return value.length > 0 ? value : null;
}

/**
 * Trims, collapses internal whitespace, and lowercases — used for both
 * `fullName` and `organization` so the two can be compared as a pair.
 * Deliberately not fuzzy/phonetic: "Sénégal Gaz" and "Senegal Gaz SARL" are
 * treated as different values, matching the no-automatic-fuzzy-merge rule
 * that also governs the (separate, later) backfill script.
 */
export function normalizeName(value?: string | null): string | null {
  if (!value) return null;
  const collapsed = value.trim().replace(/\s+/g, ' ').toLowerCase();
  return collapsed.length > 0 ? collapsed : null;
}
