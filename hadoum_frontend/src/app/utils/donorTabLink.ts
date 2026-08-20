// Module 6 (PR 23) — one centralized place for "which /app/donateurs tab
// does this deep-link mean", so no component has to scatter its own
// string-matching against tab keys. DonorsPage's own MainTab union is not
// imported here (keeping this utils file free of a page-component import
// cycle) — the tab key strings are duplicated intentionally in the single
// VALID_DONOR_TABS list below, which DonorsPage validates every incoming
// `?tab=` value against.

export type DonorTab = 'parrains' | 'donateurs' | 'cagnottes' | 'dons' | 'communications' | 'rapports';

export const DEFAULT_DONOR_TAB: DonorTab = 'parrains';

const VALID_DONOR_TABS: readonly DonorTab[] = [
  'parrains', 'donateurs', 'cagnottes', 'dons', 'communications', 'rapports',
];

// Missing or unrecognized `?tab=` values fall back to the page's own normal
// default — never a crash, never a blank tab.
export function resolveDonorTabParam(value: string | null): DonorTab {
  return value && (VALID_DONOR_TABS as readonly string[]).includes(value)
    ? (value as DonorTab)
    : DEFAULT_DONOR_TAB;
}

// Module 6 dashboard attention items (PR 22) whose targetPath is the plain
// "/app/donateurs" — the backend deliberately has no notion of frontend
// tabs (see PR22's own doc comment on DashboardService.getAttention), so
// the tab-specific drill-down is resolved here, once, from the item's own
// deterministic `key` — not by pattern-matching the title/message text.
const ATTENTION_KEY_DONOR_TAB: Partial<Record<string, DonorTab>> = {
  'campaigns-ending-soon': 'cagnottes',
  'campaigns-past-end': 'cagnottes',
  'donor-reports-to-prepare': 'rapports',
};

/**
 * Resolves a Module 6 attention item's real navigation target: donor-related
 * items get their known tab appended (`/app/donateurs?tab=cagnottes`), every
 * other item's `targetPath` is used exactly as the backend returned it.
 */
export function resolveAttentionTargetPath(item: { key: string; targetPath: string }): string {
  const tab = ATTENTION_KEY_DONOR_TAB[item.key];
  if (tab && item.targetPath === '/app/donateurs') {
    return `/app/donateurs?tab=${tab}`;
  }
  return item.targetPath;
}
