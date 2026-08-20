import { useEffect, useState } from 'react';
import type { DependencyList } from 'react';
import {
  AlertTriangle, RefreshCw, TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import {
  DASHBOARD_PERIOD_OPTIONS, type ApiDashboardPeriodType,
} from '../../services/dashboard.api';

// Module 6 (PR 24) — the handful of primitives every role's dashboard
// (Director/Supervisor/Board) genuinely shares byte-for-byte: extracted out
// of DirectorDashboard.tsx (its original, PR 23 home) with no behavior
// change, so DirectorDashboard, SupervisorDashboard and BoardDashboard all
// import the exact same implementation instead of three drifting copies.
// See DashboardOperations.tsx/DashboardAttention.tsx/DashboardTrends.tsx for
// the section-level components built on top of these (Director + Supervisor
// only — Board has no access to /dashboard/operations or /dashboard/
// attention, so those sections are never imported by BoardDashboard).

// ─── Section title (shared across every dashboard block) ──────────────────
// One consistent heading style for every dashboard section — larger and
// bolder than a KPICard's own title line (14px/500), so section titles read
// clearly above the cards they head, on both mobile and desktop.
export function SectionTitle({ children, testId, style }: { children: React.ReactNode; testId?: string; style?: React.CSSProperties }) {
  return (
    <h3
      data-testid={testId}
      className="text-[15px] sm:text-[17px] font-bold"
      style={{ color: '#1A1A1A', letterSpacing: '0.02em', ...style }}
    >
      {children}
    </h3>
  );
}

// ─── Generic aggregate-fetch hook ──────────────────────────────────────────
// Module 6 (PR 23): every dashboard issues its own independent aggregate
// requests (overview/operations/trends/attention). Each section owns its
// own loading/error/retry state via this hook, so one failing request (e.g.
// a slow /dashboard/trends) never blanks out data another section already
// has — "graceful partial rendering", per the PR 23 spec.
export function useDashboardFetch<T>(fetcher: () => Promise<T>, deps: DependencyList) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetcher()
      .then(res => { if (!cancelled) setData(res); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  return { data, loading, error, reload: () => setAttempt(a => a + 1) } as const;
}

// ─── Section-level error state ─────────────────────────────────────────────

export function SectionError({ testId, onRetry }: { testId: string; onRetry: () => void }) {
  return (
    <div data-testid={testId} className="rounded-xl py-8 text-center" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
      <AlertTriangle size={20} style={{ color: '#B91C1C', margin: '0 auto 8px' }} />
      <p style={{ color: '#374151', fontSize: 13 }}>Erreur de chargement.</p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-lg"
        style={{ background: '#F3F4F6', color: '#374151', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}
      >
        <RefreshCw size={12} /> Réessayer
      </button>
    </div>
  );
}

// ─── Period selector ────────────────────────────────────────────────────────
// Sends the backend's own enum value straight through (see
// dashboardApi.DASHBOARD_PERIOD_OPTIONS) — the frontend never computes a
// date window itself.

export function PeriodSelector({ value, onChange }: { value: ApiDashboardPeriodType; onChange: (v: ApiDashboardPeriodType) => void }) {
  return (
    <select
      data-testid="dashboard-period-selector"
      aria-label="Période du tableau de bord"
      value={value}
      onChange={e => onChange(e.target.value as ApiDashboardPeriodType)}
      className="px-3 py-2 rounded-lg"
      style={{ background: '#FFFFFF', color: '#1A1A1A', fontSize: 13, fontWeight: 500, border: '1px solid #E5E7EB', cursor: 'pointer' }}
    >
      {DASHBOARD_PERIOD_OPTIONS.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

export function KPICard({
  title, value, subtitle, trend, icon: Icon, iconColor, iconBg, testId, onClick, highlight,
}: {
  title: string; value: string | number; subtitle: string;
  trend?: { value: string; positive: boolean | null };
  icon: React.ElementType; iconColor: string; iconBg: string; testId?: string;
  onClick?: () => void; highlight?: boolean;
}) {
  const Wrapper: 'button' | 'div' = onClick ? 'button' : 'div';
  return (
    <Wrapper
      data-testid={testId}
      onClick={onClick}
      className="rounded-xl p-5 flex flex-col gap-4"
      style={{
        background: '#FFFFFF',
        border: highlight ? '1.5px solid #D97706' : '1px solid #E5E7EB',
        textAlign: 'left',
        width: '100%',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div className="flex items-start justify-between">
        <div
          className="flex items-center justify-center rounded-xl"
          style={{ width: 40, height: 40, background: iconBg }}
        >
          <Icon size={19} style={{ color: iconColor }} />
        </div>
        {trend && (
          <div
            className="flex items-center gap-1 px-2 py-1 rounded-full"
            style={{
              background: trend.positive === true ? '#ECFDF5' : trend.positive === false ? '#FEF2F2' : '#F9F7F3',
              color: trend.positive === true ? '#065F46' : trend.positive === false ? '#B91C1C' : '#6B7280',
            }}
          >
            {trend.positive === true && <TrendingUp size={11} />}
            {trend.positive === false && <TrendingDown size={11} />}
            {trend.positive === null && <Minus size={11} />}
            <span style={{ fontSize: 11, fontWeight: 600 }}>{trend.value}</span>
          </div>
        )}
      </div>
      <div>
        <p style={{ color: '#1A1A1A', fontSize: 24, fontWeight: 700, lineHeight: 1.1 }}>{value}</p>
        <p style={{ color: '#1A1A1A', fontSize: 14, fontWeight: 500, marginTop: 4 }}>{title}</p>
        <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>{subtitle}</p>
      </div>
    </Wrapper>
  );
}
