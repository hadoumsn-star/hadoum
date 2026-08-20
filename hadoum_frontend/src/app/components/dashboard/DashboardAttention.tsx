import { useNavigate } from 'react-router';
import {
  ChevronRight, AlertOctagon, AlertTriangle, Info, CheckCircle2,
} from 'lucide-react';
import { SectionTitle, SectionError } from './DashboardShared';
import {
  type ApiDashboardAttention, type ApiDashboardAttentionItem, type ApiDashboardAttentionSeverity,
} from '../../services/dashboard.api';
import { resolveAttentionTargetPath } from '../../utils/donorTabLink';

// ─── "À traiter" (Module 6 attention feed) ─────────────────────────────────
// Module 6 (PR 24): extracted verbatim out of DirectorDashboard.tsx (its
// original, PR 22/23 home) — Director and Supervisor render the exact same
// consolidated cross-domain attention feed from the exact same
// /dashboard/attention aggregate (DIRECTOR/SUPERVISOR only at the backend —
// see DashboardController's own @Roles override on this route). BOARD never
// imports this component. Every condition (stock/maintenance/procedures/
// incidents/validations/campaigns/donor reports) is computed backend-side
// from real current entity state — this component only renders exactly
// what /dashboard/attention returns, it never re-derives or re-ranks
// severity itself.

const ATTENTION_SEVERITY_STYLE: Record<ApiDashboardAttentionSeverity, {
  icon: React.ElementType; label: string; color: string; bg: string; border: string;
}> = {
  CRITICAL: { icon: AlertOctagon,   label: 'Urgent',        color: '#B91C1C', bg: '#FEF2F2', border: '#FECACA' },
  WARNING:  { icon: AlertTriangle,  label: 'À surveiller',  color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  INFO:     { icon: Info,           label: 'Information',   color: '#3E5A78', bg: '#EEF2F7', border: '#E5E7EB' },
};

function AttentionCard({ item }: { item: ApiDashboardAttentionItem }) {
  const navigate = useNavigate();
  const style = ATTENTION_SEVERITY_STYLE[item.severity];
  const SeverityIcon = style.icon;

  return (
    <div data-testid={`attention-item-${item.key}`} className="rounded-xl p-4 flex items-start gap-3"
      style={{ background: '#FFFFFF', border: `1px solid ${style.border}` }}>
      <div className="flex items-center justify-center rounded-lg flex-shrink-0" style={{ width: 34, height: 34, background: style.bg }}>
        <SeverityIcon size={16} style={{ color: style.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          {/* Severity is never color-only: an explicit French label sits
              next to the icon, both driven by the backend's own severity
              field — see ATTENTION_SEVERITY_STYLE above. */}
          <span data-testid={`attention-severity-${item.key}`} className="px-2 py-0.5 rounded-full"
            style={{ background: style.bg, color: style.color, fontSize: 10, fontWeight: 700 }}>
            {style.label}
          </span>
          <span style={{ color: '#1A1A1A', fontSize: 14, fontWeight: 700 }}>{item.title}</span>
          <span className="px-2 py-0.5 rounded-full" style={{ background: '#F3F4F6', color: '#374151', fontSize: 11, fontWeight: 700 }}>
            {item.count}
          </span>
        </div>
        <p style={{ color: '#6B7280', fontSize: 12.5 }}>{item.message}</p>
      </div>
      <button
        data-testid={`attention-action-${item.key}`}
        onClick={() => navigate(resolveAttentionTargetPath(item))}
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg flex-shrink-0 self-center"
        style={{ background: '#F3F4F6', color: '#374151', fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer' }}
      >
        Voir <ChevronRight size={13} />
      </button>
    </div>
  );
}

export function AttentionSection({ data, loading, error, onRetry }: {
  data: ApiDashboardAttention | null; loading: boolean; error: boolean; onRetry: () => void;
}) {
  return (
    <div>
      <SectionTitle testId="section-title-a-traiter" style={{ marginBottom: 10 }}>
        À TRAITER
      </SectionTitle>
      {error ? (
        <SectionError testId="a-traiter-error" onRetry={onRetry} />
      ) : loading ? (
        <div data-testid="a-traiter-loading" className="rounded-xl py-8 text-center" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
          <p style={{ color: '#9CA3AF', fontSize: 13 }}>Chargement…</p>
        </div>
      ) : !data || data.items.length === 0 ? (
        <div data-testid="a-traiter-empty" className="rounded-xl py-8 text-center" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
          <CheckCircle2 size={22} style={{ color: '#065F46', margin: '0 auto 8px' }} />
          <p style={{ color: '#6B7280', fontSize: 13 }}>Aucun point d'attention actuellement.</p>
        </div>
      ) : (
        <div data-testid="a-traiter" className="space-y-3">
          {data.items.map(item => <AttentionCard key={item.key} item={item} />)}
        </div>
      )}
    </div>
  );
}
