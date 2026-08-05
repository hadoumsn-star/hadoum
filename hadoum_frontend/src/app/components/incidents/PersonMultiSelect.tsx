import { useState } from 'react';
import { Search, X } from 'lucide-react';

// PR 11 — generic multi-select used for "persons concerned" (children and
// staff), always backed by real ids from Child/StaffMember, never free text.

export interface PersonOption {
  id: string;
  label: string;
  sublabel?: string;
}

export function PersonMultiSelect({ label, placeholder, options, selectedIds, onChange }: {
  label: string;
  placeholder: string;
  options: PersonOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const selected = options.filter(o => selectedIds.includes(o.id));
  const results = options
    .filter(o => !selectedIds.includes(o.id))
    .filter(o => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 8);

  const add = (id: string) => { onChange([...selectedIds, id]); setQuery(''); };
  const remove = (id: string) => onChange(selectedIds.filter(x => x !== id));

  return (
    <div>
      <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>{label}</label>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map(p => (
            <span key={p.id} className="flex items-center gap-1 px-2 py-1 rounded-full"
              style={{ background: '#F3F4F6', color: '#374151', fontSize: 12, fontWeight: 500 }}>
              {p.label}
              <button type="button" onClick={() => remove(p.id)}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#9CA3AF', display: 'flex' }}>
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }} />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          style={{
            width: '100%', padding: '8px 12px 8px 32px', borderRadius: 8,
            border: '1px solid #E5E7EB', background: '#FFFFFF',
            color: '#1A1A1A', fontSize: 13, outline: 'none', boxSizing: 'border-box',
          }}
        />
        {open && results.length > 0 && (
          <div className="absolute z-10 w-full mt-1 rounded-lg overflow-hidden shadow-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', maxHeight: 180, overflowY: 'auto' }}>
            {results.map(o => (
              <button key={o.id} type="button" onMouseDown={() => add(o.id)}
                className="w-full text-left px-3 py-2 flex flex-col"
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <span style={{ color: '#1A1A1A', fontSize: 13 }}>{o.label}</span>
                {o.sublabel && <span style={{ color: '#9CA3AF', fontSize: 11 }}>{o.sublabel}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
