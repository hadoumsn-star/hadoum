import { useEffect, useRef, useState } from 'react';
import { contactsApi } from '../services/contacts.api';
import type { ApiContactSummary } from '../types/contacts.types';

// The project has no existing custom-hooks directory or debounce/query
// utility (confirmed by a repo-wide search) — this is the first. It exists
// so ContactAutocomplete has exactly one search implementation instead of
// re-deriving debounce/staleness handling inline.

export interface UseContactSearchParams {
  search: string;
  categoryId?: string;
  enabled: boolean;
  pageSize?: number;
}

export interface UseContactSearchResult {
  results: ApiContactSummary[];
  loading: boolean;
  error: string | null;
}

const DEBOUNCE_MS = 280;

export function useContactSearch({
  search,
  categoryId,
  enabled,
  pageSize = 8,
}: UseContactSearchParams): UseContactSearchResult {
  const [results, setResults] = useState<ApiContactSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bumped on every new request; a response is only applied if it's still
  // the most recent one in flight — cheaper than AbortController plumbing
  // through the shared `api` client, and sufficient since only the latest
  // result ever matters here.
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const timer = setTimeout(() => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);

      // No empty-search short-circuit: an empty query is what powers
      // "default suggestions on focus" (GET /contacts with no `search`
      // returns the first page, alphabetically) — skipping the call would
      // remove that behavior, not improve UX.
      contactsApi
        .list({
          search: search.trim() || undefined,
          categoryId,
          active: true,
          compact: true,
          pageSize,
        })
        .then((res) => {
          if (requestId !== requestIdRef.current) return;
          setResults(res.data as ApiContactSummary[]);
        })
        .catch((err: unknown) => {
          if (requestId !== requestIdRef.current) return;
          setError(
            err instanceof Error ? err.message : 'Erreur de recherche.',
          );
          setResults([]);
        })
        .finally(() => {
          if (requestId !== requestIdRef.current) return;
          setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [search, categoryId, enabled, pageSize]);

  return { results, loading, error };
}
