import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, X, Plus, Loader2, AlertCircle, Phone } from 'lucide-react';
import { Popover, PopoverAnchor, PopoverContent } from '../ui/popover';
import { contactsApi } from '../../services/contacts.api';
import { useContactSearch } from '../../hooks/useContactSearch';
import { categoryBadgeStyle } from './contacts.utils';
import { ContactFormModal } from './ContactFormModal';
import type {
  ApiContactCategory,
  ApiContactLike,
  ApiContactSummary,
} from '../../types/contacts.types';

// ─── Styling (matches the inline-style convention used across pages) ──────────

const FIELD: React.CSSProperties = {
  width: '100%',
  padding: '8px 34px 8px 32px',
  borderRadius: 8,
  border: '1px solid #E5E7EB',
  background: '#FFFFFF',
  color: '#1A1A1A',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
};

const LABEL_STYLE: React.CSSProperties = {
  color: '#374151',
  fontSize: 12,
  fontWeight: 500,
  display: 'block',
  marginBottom: 5,
};

// ─── Sub-components ─────────────────────────────────────────────────────────

function CategoryBadge({
  category,
}: {
  category: { label: string; color: string | null };
}) {
  const style = categoryBadgeStyle(category.color);
  return (
    <span
      className="px-1.5 py-0.5 rounded-full flex-shrink-0"
      style={{ background: style.bg, color: style.color, fontSize: 10, fontWeight: 700 }}
    >
      {category.label.toUpperCase()}
    </span>
  );
}

function ResultRow({
  contact,
  optionId,
  highlighted,
  onPick,
}: {
  contact: ApiContactSummary;
  optionId: string;
  highlighted: boolean;
  onPick: () => void;
}) {
  return (
    <div
      id={optionId}
      role="option"
      aria-selected={highlighted}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPick}
      className="px-3 py-2 cursor-pointer rounded-md"
      style={{ background: highlighted ? '#EEF2F7' : 'transparent' }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 600 }}>
          {contact.fullName}
        </span>
        <CategoryBadge category={contact.category} />
      </div>
      {(contact.organization || contact.functionTitle) && (
        <p style={{ color: '#6B7280', fontSize: 12, marginTop: 1 }}>
          {[contact.organization, contact.functionTitle].filter(Boolean).join(' — ')}
        </p>
      )}
      {contact.phone && (
        <p className="flex items-center gap-1" style={{ color: '#9CA3AF', fontSize: 11, marginTop: 1 }}>
          <Phone size={10} /> {contact.phone}
        </p>
      )}
    </div>
  );
}

// ─── Props ───────────────────────────────────────────────────────────────────

// This component only ever reads `.fullName` and `.active` off
// `selectedContact` (for the query text and the "Inactif" badge) — it never
// round-trips the rest of the shape. Some callers only hold a reduced
// contact projection embedded in another resource (e.g. a DonorProfile's
// `contact`), so the prop accepts that minimal shape too rather than
// forcing every caller to have a full ApiContact/ApiContactSummary on hand.
type ContactSummaryLike = { fullName: string; active: boolean };

export interface ContactAutocompleteProps {
  /** Selected contact's id, or null when nothing is selected. Source of truth. */
  value: string | null;
  /**
   * The selected contact's data, for display. Required to show a meaningful
   * label when `value` is set — this component does not re-fetch a contact
   * from just its id, so callers should keep this in sync with `value`
   * (both come back together via `onChange`).
   */
  selectedContact?: ApiContactLike | ContactSummaryLike | null;
  onChange: (contact: ApiContactLike | null) => void;
  label?: string;
  placeholder?: string;
  /** Restrict search/create to these category ids. Takes precedence over categoryKeys. */
  categoryIds?: string[];
  /** Restrict search/create to categories with these keys (resolved via GET /contacts/categories). */
  categoryKeys?: string[];
  disabled?: boolean;
  required?: boolean;
  allowCreate?: boolean;
  /** Show an "Inactif" badge when the currently-selected contact is inactive. */
  includeInactiveSelected?: boolean;
  error?: string;
  helperText?: string;
}

export function ContactAutocomplete({
  value,
  selectedContact = null,
  onChange,
  label,
  placeholder = 'Rechercher un contact…',
  categoryIds,
  categoryKeys,
  disabled = false,
  required = false,
  allowCreate = false,
  includeInactiveSelected = false,
  error,
  helperText,
}: ContactAutocompleteProps) {
  const reactId = useId();
  const listboxId = `contact-autocomplete-listbox-${reactId}`;

  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(selectedContact?.fullName ?? '');
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const pickedThisSessionRef = useRef(false);

  const [categories, setCategories] = useState<ApiContactCategory[]>([]);
  useEffect(() => {
    contactsApi
      .listCategories()
      .then(setCategories)
      .catch(() => {
        // Non-fatal: search/create still work, just without category chips.
      });
  }, []);

  // Keep the displayed text in sync with the controlled selection whenever
  // the parent changes it from outside (e.g. a form reset).
  useEffect(() => {
    if (!open) setQuery(selectedContact?.fullName ?? '');
  }, [value, selectedContact, open]);

  const allowedCategoryIds = useMemo(() => {
    if (categoryIds && categoryIds.length > 0) return new Set(categoryIds);
    if (categoryKeys && categoryKeys.length > 0) {
      return new Set(
        categories.filter((c) => categoryKeys.includes(c.key)).map((c) => c.id),
      );
    }
    return null;
  }, [categoryIds, categoryKeys, categories]);

  const chipCategories = useMemo(() => {
    const list = allowedCategoryIds
      ? categories.filter((c) => allowedCategoryIds.has(c.id))
      : categories;
    return list;
  }, [categories, allowedCategoryIds]);

  const singleForcedCategoryId =
    allowedCategoryIds && allowedCategoryIds.size === 1
      ? [...allowedCategoryIds][0]
      : undefined;

  const { results: rawResults, loading, error: searchError } = useContactSearch({
    search: query,
    categoryId: categoryFilter ?? singleForcedCategoryId,
    enabled: open && !disabled,
    pageSize: 8,
  });

  const results =
    allowedCategoryIds && allowedCategoryIds.size > 1 && !categoryFilter
      ? rawResults.filter((r) => allowedCategoryIds.has(r.category.id))
      : rawResults;

  const optionCount = results.length + (allowCreate ? 1 : 0);
  const createRowIndex = allowCreate ? results.length : -1;

  function openDropdown() {
    if (disabled) return;
    pickedThisSessionRef.current = false;
    setOpen(true);
    setHighlightedIndex(-1);
  }

  function closeDropdown(revert: boolean) {
    setOpen(false);
    setHighlightedIndex(-1);
    if (revert && !pickedThisSessionRef.current) {
      setQuery(selectedContact?.fullName ?? '');
    }
  }

  function commitSelection(contact: ApiContactLike) {
    pickedThisSessionRef.current = true;
    setQuery(contact.fullName);
    setOpen(false);
    setHighlightedIndex(-1);
    onChange(contact);
  }

  function handleClear() {
    pickedThisSessionRef.current = true;
    setQuery('');
    onChange(null);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;

    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      openDropdown();
      return;
    }
    if (!open) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((i) => (optionCount === 0 ? -1 : (i + 1) % optionCount));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((i) =>
          optionCount === 0 ? -1 : (i - 1 + optionCount) % optionCount,
        );
        break;
      case 'Home':
        if (optionCount > 0) {
          e.preventDefault();
          setHighlightedIndex(0);
        }
        break;
      case 'End':
        if (optionCount > 0) {
          e.preventDefault();
          setHighlightedIndex(optionCount - 1);
        }
        break;
      case 'Enter':
        if (highlightedIndex === -1) return;
        e.preventDefault();
        if (highlightedIndex === createRowIndex) {
          setCreateOpen(true);
          setOpen(false);
        } else {
          const picked = results[highlightedIndex];
          if (picked) commitSelection(picked);
        }
        break;
      case 'Escape':
        e.preventDefault();
        closeDropdown(true);
        break;
      case 'Tab':
        closeDropdown(true);
        break;
      default:
        break;
    }
  }

  const selectedIsInactive = selectedContact?.active === false;
  const showInactiveBadge = includeInactiveSelected && !!value && selectedIsInactive;

  const activeOptionId =
    open && highlightedIndex >= 0
      ? highlightedIndex === createRowIndex
        ? `${listboxId}-create`
        : `${listboxId}-option-${highlightedIndex}`
      : undefined;

  return (
    <div>
      {label && (
        <label style={LABEL_STYLE} htmlFor={`${listboxId}-input`}>
          {label} {required && <span style={{ color: '#B91C1C' }}>*</span>}
        </label>
      )}

      <Popover open={open} onOpenChange={(next) => (next ? openDropdown() : closeDropdown(true))}>
        <PopoverAnchor asChild>
          <div className="relative" ref={anchorRef}>
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: '#9CA3AF' }}
            />
            <input
              id={`${listboxId}-input`}
              ref={inputRef}
              role="combobox"
              aria-expanded={open}
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={activeOptionId}
              aria-invalid={!!error}
              aria-required={required}
              disabled={disabled}
              value={query}
              placeholder={placeholder}
              onFocus={openDropdown}
              onChange={(e) => {
                setQuery(e.target.value);
                pickedThisSessionRef.current = false;
                if (!open) setOpen(true);
                setHighlightedIndex(-1);
              }}
              onKeyDown={handleKeyDown}
              style={{
                ...FIELD,
                border: `1px solid ${error ? '#B91C1C' : '#E5E7EB'}`,
                background: disabled ? '#F3F4F6' : '#FFFFFF',
              }}
            />
            {value && !disabled && (
              <button
                type="button"
                aria-label="Effacer la sélection"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleClear}
                className="absolute right-2.5 top-1/2 -translate-y-1/2"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </PopoverAnchor>

        <PopoverContent
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
          // The input opens the dropdown itself (via onFocus/onChange, not a
          // PopoverTrigger) — without this, Radix's dismissable layer can
          // treat the very click that focused the input as an "outside"
          // interaction and close the content on the same click that opened
          // it (only reproduces with a real click; .fill() doesn't hit this
          // path, which is why it went unnoticed at first). `onInteractOutside`
          // covers both the pointer and focus variants Radix can fire;
          // `.contains()` on the whole anchor (not just the input) so this
          // also tolerates the click landing on the search icon or clear
          // button.
          onInteractOutside={(e) => {
            if (anchorRef.current?.contains(e.target as Node)) e.preventDefault();
          }}
          className="p-0 overflow-hidden"
          style={{ width: inputRef.current?.offsetWidth, maxWidth: 420 }}
        >
          <div role="listbox" id={listboxId} aria-label="Résultats de recherche de contacts">
            {chipCategories.length > 1 && (
              <div className="flex gap-1.5 flex-wrap px-3 pt-3 pb-2" style={{ borderBottom: '1px solid #F3F4F6' }}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setCategoryFilter(null)}
                  className="px-2 py-0.5 rounded-full"
                  style={{
                    background: categoryFilter === null ? '#3E5A78' : '#F3F4F6',
                    color: categoryFilter === null ? '#FFFFFF' : '#374151',
                    fontSize: 10,
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Toutes
                </button>
                {chipCategories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setCategoryFilter(c.id)}
                    className="px-2 py-0.5 rounded-full"
                    style={{
                      background: categoryFilter === c.id ? '#3E5A78' : '#F3F4F6',
                      color: categoryFilter === c.id ? '#FFFFFF' : '#374151',
                      fontSize: 10,
                      fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}

            <div className="max-h-72 overflow-y-auto p-1.5">
              {/*
                Every top-level child here gets an explicit `key`, including
                the single (non-mapped) ones. Without it, React reconciles
                this set of conditional siblings positionally — e.g. once
                `results.map(...)` starts contributing more elements than a
                prior render, the trailing "Nouveau contact" row shifts to a
                new index, collides with a differently-typed prior node at
                that index, and gets unmounted/remounted. That's invisible in
                a static screenshot but breaks a click landing on it mid
                re-render (confirmed via Playwright: "element was detached
                from the DOM, retrying").
              */}
              {loading && (
                <div key="state-loading" className="flex items-center gap-2 px-3 py-3" style={{ color: '#9CA3AF', fontSize: 13 }}>
                  <Loader2 size={14} className="animate-spin" /> Recherche…
                </div>
              )}

              {!loading && searchError && (
                <div key="state-error" className="flex items-center gap-2 px-3 py-3" style={{ color: '#B91C1C', fontSize: 13 }}>
                  <AlertCircle size={14} /> {searchError}
                </div>
              )}

              {!loading && !searchError && results.length === 0 && (
                <p key="state-empty" className="px-3 py-3" style={{ color: '#9CA3AF', fontSize: 13 }}>
                  Aucun contact trouvé.
                </p>
              )}

              {!loading &&
                !searchError &&
                results.map((contact, index) => (
                  <ResultRow
                    key={contact.id}
                    contact={contact}
                    optionId={`${listboxId}-option-${index}`}
                    highlighted={highlightedIndex === index}
                    onPick={() => commitSelection(contact)}
                  />
                ))}

              {allowCreate && (
                <div
                  key="row-create"
                  id={`${listboxId}-create`}
                  role="option"
                  aria-selected={highlightedIndex === createRowIndex}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setCreateOpen(true);
                    setOpen(false);
                  }}
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer rounded-md"
                  style={{
                    background: highlightedIndex === createRowIndex ? '#EEF2F7' : 'transparent',
                    color: '#3E5A78',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  <Plus size={14} /> Nouveau contact
                </div>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {showInactiveBadge && (
        <span
          className="inline-block mt-1.5 px-2 py-0.5 rounded-full"
          style={{ background: '#FEF2F2', color: '#B91C1C', fontSize: 10, fontWeight: 700 }}
        >
          CONTACT INACTIF
        </span>
      )}

      {error ? (
        <p style={{ color: '#B91C1C', fontSize: 11, marginTop: 4 }}>{error}</p>
      ) : helperText ? (
        <p style={{ color: '#9CA3AF', fontSize: 11, marginTop: 4 }}>{helperText}</p>
      ) : null}

      {createOpen && (
        <ContactFormModal
          mode="create"
          initialFullName={query.trim()}
          fixedCategoryId={singleForcedCategoryId}
          onClose={() => {
            setCreateOpen(false);
            setOpen(true);
            inputRef.current?.focus();
          }}
          onSaved={(contact) => {
            setCreateOpen(false);
            commitSelection(contact);
            inputRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}
