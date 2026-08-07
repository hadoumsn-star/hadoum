import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { auditLogsApi, type ApiAuditLog, type ApiAuditModule, type ApiAuditLogUser } from '../services/auditLogs.api';
import { AUDIT_MODULE_LABELS, AUDIT_MODULE_OPTIONS, AUDIT_MODULE_STYLE, auditActionLabel } from '../config/auditLogs.config';
import { Search, ChevronDown, ChevronUp, ScrollText } from 'lucide-react';

const INPUT: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid #E5E7EB', background: '#FFFFFF',
  color: '#1A1A1A', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('fr-FR', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

function ModuleBadge({ module }: { module: ApiAuditModule }) {
  const st = AUDIT_MODULE_STYLE[module];
  return (
    <span className="px-2 py-0.5 rounded-full" style={{ background: st.bg, color: st.color, fontSize: 10, fontWeight: 700 }}>
      {AUDIT_MODULE_LABELS[module].toUpperCase()}
    </span>
  );
}

// ─── Before/after snapshot diff ────────────────────────────────────────────────

function fieldDiff(before: unknown, after: unknown): { key: string; before: unknown; after: unknown }[] {
  const beforeObj = (before && typeof before === 'object' ? before : {}) as Record<string, unknown>;
  const afterObj = (after && typeof after === 'object' ? after : {}) as Record<string, unknown>;
  const keys = Array.from(new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]));
  return keys
    .filter(k => JSON.stringify(beforeObj[k]) !== JSON.stringify(afterObj[k]))
    .map(k => ({ key: k, before: beforeObj[k], after: afterObj[k] }));
}

const fmtValue = (v: unknown) => v === undefined ? '—' : v === null ? 'null' : typeof v === 'object' ? JSON.stringify(v) : String(v);

function LogDetail({ log }: { log: ApiAuditLog }) {
  if (log.before === null && log.after === null) {
    return <p style={{ color: '#9CA3AF', fontSize: 12, padding: '8px 0' }}>Aucun détail enregistré.</p>;
  }
  if (log.before === null) {
    return (
      <div style={{ padding: '8px 0' }}>
        <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, marginBottom: 6 }}>ENREGISTREMENT CRÉÉ</p>
        <pre style={{ background: '#F9F7F3', border: '1px solid #E5E7EB', borderRadius: 8, padding: 10, fontSize: 11, color: '#374151', overflowX: 'auto', margin: 0 }}>
          {JSON.stringify(log.after, null, 2)}
        </pre>
      </div>
    );
  }
  if (log.after === null) {
    return (
      <div style={{ padding: '8px 0' }}>
        <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, marginBottom: 6 }}>ENREGISTREMENT SUPPRIMÉ</p>
        <pre style={{ background: '#F9F7F3', border: '1px solid #E5E7EB', borderRadius: 8, padding: 10, fontSize: 11, color: '#374151', overflowX: 'auto', margin: 0 }}>
          {JSON.stringify(log.before, null, 2)}
        </pre>
      </div>
    );
  }
  const diff = fieldDiff(log.before, log.after);
  if (diff.length === 0) {
    return <p style={{ color: '#9CA3AF', fontSize: 12, padding: '8px 0' }}>Aucun champ modifié.</p>;
  }
  return (
    <div style={{ padding: '8px 0' }} className="space-y-1.5">
      <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>CHAMPS MODIFIÉS</p>
      {diff.map(d => (
        <div key={d.key} className="flex items-start gap-2 rounded-lg px-3 py-2" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB', fontSize: 12 }}>
          <span style={{ color: '#374151', fontWeight: 600, flexShrink: 0, minWidth: 120 }}>{d.key}</span>
          <span style={{ color: '#B91C1C', textDecoration: 'line-through', wordBreak: 'break-all' }}>{fmtValue(d.before)}</span>
          <span style={{ color: '#9CA3AF' }}>→</span>
          <span style={{ color: '#065F46', wordBreak: 'break-all' }}>{fmtValue(d.after)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────────

export function AuditLogsPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<ApiAuditLog[]>([]);
  const [users, setUsers] = useState<ApiAuditLogUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  // PR 12 — other modules (e.g. Stock) link here with `?module=&search=` to
  // land pre-filtered on "their" entries; read once as the initial state
  // only (useState initializers run exactly once, on mount) — the page
  // still behaves exactly as before for a plain /app/audit-logs visit.
  const [search, setSearch] = useState(
    () => new URLSearchParams(window.location.search).get('search') ?? '',
  );
  const [moduleFilter, setModuleFilter] = useState<ApiAuditModule | 'all'>(
    () => (new URLSearchParams(window.location.search).get('module') as ApiAuditModule | null) ?? 'all',
  );
  const [userFilter, setUserFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // DIRECTOR-only (Supervisor experience simplification) — SUPERVISOR opening
  // this page directly (old link, or typed URL) now falls into the existing
  // "unauthorized" branch below instead of a router-level redirect; the
  // backend route itself is untouched (still @Roles('DIRECTOR', 'SUPERVISOR'))
  // since this is a frontend-only visibility change.
  const canView = user?.role === 'director';

  const load = () => {
    setLoading(true);
    auditLogsApi.list({
      module: moduleFilter === 'all' ? undefined : moduleFilter,
      userId: userFilter === 'all' ? undefined : userFilter,
      search: search.trim() || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    })
      .then(setLogs)
      .catch(() => toast.error("Erreur de chargement du journal d'audit."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!canView) return;
    auditLogsApi.listUsers().then(setUsers).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!canView) return;
    const timeout = setTimeout(load, 300); // debounce free-text search
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, moduleFilter, userFilter, dateFrom, dateTo]);

  if (!canView) {
    return (
      <div className="px-4 md:px-6 py-6">
        <p style={{ color: '#6B7280', fontSize: 14 }}>Accès réservé à la direction.</p>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-6 py-6 space-y-5" style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div>
        <h2 className="flex items-center gap-2" style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>
          <ScrollText size={22} style={{ color: '#3E5A78' }} /> Journal d'audit
        </h2>
        <p style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>
          {logs.length} entrée{logs.length > 1 ? 's' : ''} · Finances, Contacts, Maintenance, Démarches administratives, Contrats fournisseurs, Stock, Incidents
        </p>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1" style={{ minWidth: 200 }}>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher (entité, action, utilisateur)…" style={{ ...INPUT, paddingLeft: 32 }} />
        </div>
        <select data-testid="audit-filter-module" value={moduleFilter} onChange={e => setModuleFilter(e.target.value as ApiAuditModule | 'all')}
          style={{ ...INPUT, width: 'auto', cursor: 'pointer' }}>
          <option value="all">Tous les modules</option>
          {AUDIT_MODULE_OPTIONS.map(m => <option key={m} value={m}>{AUDIT_MODULE_LABELS[m]}</option>)}
        </select>
        <select data-testid="audit-filter-user" value={userFilter} onChange={e => setUserFilter(e.target.value)}
          style={{ ...INPUT, width: 'auto', cursor: 'pointer' }}>
          <option value="all">Tous les utilisateurs</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <input type="date" data-testid="audit-filter-date-from" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          style={{ ...INPUT, width: 'auto' }} title="Du" />
        <input type="date" data-testid="audit-filter-date-to" value={dateTo} onChange={e => setDateTo(e.target.value)}
          style={{ ...INPUT, width: 'auto' }} title="Au" />
      </div>

      {/* List */}
      <div className="space-y-2">
        {loading ? (
          <p style={{ color: '#9CA3AF', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>Chargement…</p>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
            <p style={{ color: '#374151', fontSize: 14, fontWeight: 500 }}>Aucune entrée ne correspond à ces filtres</p>
          </div>
        ) : logs.map(log => {
          const isOpen = expanded === log.id;
          return (
            <div key={log.id} data-testid={`audit-row-${log.id}`} className="rounded-xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
              <button
                onClick={() => setExpanded(isOpen ? null : log.id)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <div className="flex items-center gap-3 flex-wrap flex-1 min-w-0">
                  <ModuleBadge module={log.module} />
                  <span style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 600 }}>{auditActionLabel(log.action)}</span>
                  <span style={{ color: '#6B7280', fontSize: 12 }}>{log.entity}{log.entityId ? ` #${log.entityId.slice(0, 8)}` : ''}</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span style={{ color: '#374151', fontSize: 12, fontWeight: 500 }}>{log.user?.name ?? 'Système'}</span>
                  <span style={{ color: '#9CA3AF', fontSize: 12 }}>{fmtDateTime(log.createdAt)}</span>
                  {isOpen ? <ChevronUp size={16} style={{ color: '#9CA3AF' }} /> : <ChevronDown size={16} style={{ color: '#9CA3AF' }} />}
                </div>
              </button>
              {isOpen && (
                <div className="px-4 pb-3" style={{ borderTop: '1px solid #F3F4F6' }}>
                  <LogDetail log={log} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
