// Small, dependency-free helpers shared by ContactAutocomplete and
// ContactFormModal. No phone-formatting or badge-tinting helper existed
// anywhere else in the frontend before this (confirmed by a repo-wide
// search), so this is the first — kept intentionally minimal rather than
// pulling in a phone-formatting library for one module.

// Formats a Senegalese number as the user types/on blur. Purely cosmetic —
// `phone` is a free-text field on the backend with no format validation, so
// this never blocks submission, it only normalizes the display.
//   +221771234567 -> "+221 77 123 45 67"
//   771234567     -> "77 123 45 67"
export function formatSenegalPhone(raw: string): string {
  const trimmed = raw.trim();
  const hasCountryCode = trimmed.replace(/[\s-]/g, '').startsWith('+221');
  const digits = trimmed.replace(/\D/g, '');

  if (hasCountryCode || digits.startsWith('221')) {
    const local = digits.startsWith('221') ? digits.slice(3) : digits;
    const groups = local.match(/.{1,2}/g) ?? [];
    return `+221 ${groups.join(' ')}`.trim();
  }

  const groups = digits.match(/.{1,2}/g) ?? [];
  return groups.join(' ');
}

// A category's `color` is a single accent hex (or null). Rather than
// hardcoding a bg/text pair per category — which would assume category keys
// are a stable, known set, which the guardrails explicitly rule out — the
// background is derived from the same color the category already defines,
// falling back to the neutral chip style used for unknown/absent state
// elsewhere in the app (see e.g. TICKET_STATUS_STYLE.FERME).
export function categoryBadgeStyle(color: string | null): {
  bg: string;
  color: string;
} {
  if (!color) return { bg: '#F3F4F6', color: '#374151' };
  return { bg: `${color}1A`, color };
}
