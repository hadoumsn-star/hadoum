import { useNavigate } from 'react-router';
import {
  ChevronRight, Package, Wrench, FileWarning, AlertTriangle, ClipboardCheck,
} from 'lucide-react';
import { SectionTitle, SectionError } from './DashboardShared';
import type { ApiDashboardOperations } from '../../services/dashboard.api';

// ─── Opérations (Module 6 operations counts) ───────────────────────────────
// Module 6 (PR 24): extracted verbatim out of DirectorDashboard.tsx (its
// original, PR 23/21 home) — Director and Supervisor render the exact same
// five cards from the exact same /dashboard/operations aggregate (DIRECTOR/
// SUPERVISOR only at the backend — see DashboardController's own @Roles
// override on this route). BOARD never imports this component.

function OperationCard({
  title, count, icon: Icon, testId, onClick,
}: { title: string; count: number | null; icon: React.ElementType; testId: string; onClick: () => void }) {
  const attention = (count ?? 0) > 0;
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-left w-full"
      style={{
        background: '#FFFFFF',
        border: `1px solid ${attention ? '#FED7AA' : '#E5E7EB'}`,
        cursor: 'pointer',
      }}
    >
      <div
        className="flex items-center justify-center rounded-lg flex-shrink-0"
        style={{ width: 34, height: 34, background: attention ? '#FFFBEB' : '#F3F4F6' }}
      >
        <Icon size={16} style={{ color: attention ? '#D97706' : '#9CA3AF' }} />
      </div>
      <div className="flex-1 min-w-0">
        <p style={{ color: '#1A1A1A', fontSize: 18, fontWeight: 700, lineHeight: 1 }}>{count ?? '—'}</p>
        <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>{title}</p>
      </div>
      <ChevronRight size={14} style={{ color: '#9CA3AF', flexShrink: 0 }} />
    </button>
  );
}

export function OperationsSection({ data, loading, error, onRetry }: {
  data: ApiDashboardOperations | null; loading: boolean; error: boolean; onRetry: () => void;
}) {
  const navigate = useNavigate();
  const cards = [
    { key: 'stock',        label: 'Stocks faibles',              count: data?.stockAlertsCount ?? null,                              icon: Package,        route: '/app/stocks-inventaire' },
    { key: 'maintenance',  label: 'Maintenance',                  count: data?.maintenanceTicketsRequiringAttentionCount ?? null,     icon: Wrench,         route: '/app/administration' },
    { key: 'procedures',   label: 'Démarches administratives',    count: data?.proceduresRequiringAttentionCount ?? null,             icon: FileWarning,    route: '/app/demarches-administratives' },
    { key: 'incidents',    label: 'Incidents ouverts',            count: data?.openIncidentsCount ?? null,                            icon: AlertTriangle,  route: '/app/incidents' },
    { key: 'validations',  label: 'Demandes à valider',           count: data?.pendingValidationsCount ?? null,                       icon: ClipboardCheck, route: '/app/validations' },
  ];

  return (
    <div>
      <SectionTitle testId="section-title-operations" style={{ marginBottom: 10 }}>
        OPÉRATIONS
      </SectionTitle>
      {error ? (
        <SectionError testId="operations-error" onRetry={onRetry} />
      ) : (
        <div data-testid="operations-cards" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
          {cards.map(c => (
            <OperationCard
              key={c.key}
              testId={`operation-${c.key}`}
              title={c.label}
              count={loading ? null : c.count}
              icon={c.icon}
              onClick={() => navigate(c.route)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
