import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { SectionTitle, SectionError } from './DashboardShared';
import { formatXof } from '../../config/financeCategories.config';
import type { ApiDashboardTrends } from '../../services/dashboard.api';

// ─── Tendances (Module 6 charts) ───────────────────────────────────────────
// Module 6 (PR 24): extracted verbatim out of DirectorDashboard.tsx (its
// original, PR 21/23 home) — Director, Supervisor and Board all render the
// exact same three chart cards from the exact same /dashboard/trends
// aggregate (DIRECTOR/SUPERVISOR/BOARD alike — every field here is an
// aggregate chart series, amounts/counts/labels, never person-level data;
// see DashboardController's own doc comment on why /trends carries no
// method-level @Roles override). Each chart renders from its own series
// only — finance/donations/staff attendance are never assumed to share
// labels or granularity (see DashboardService.getTrends's own doc comment
// on why their grains differ).

function ChartCard({ title, testId, empty, children }: {
  title: string; testId: string; empty: boolean; children: React.ReactNode;
}) {
  return (
    <div data-testid={testId} className="rounded-xl p-5" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
      <h4 style={{ color: '#1A1A1A', fontSize: 14, fontWeight: 700, marginBottom: 12 }}>{title}</h4>
      {empty ? (
        <div data-testid={`${testId}-empty`} className="py-10 text-center">
          <p style={{ color: '#9CA3AF', fontSize: 13 }}>Aucune donnée disponible pour cette période.</p>
        </div>
      ) : children}
    </div>
  );
}

function chartTooltipStyle() {
  return { background: '#1A1A1A', border: 'none', borderRadius: 8, fontSize: 12 };
}

export function TrendsSection({ data, loading, error, onRetry }: {
  data: ApiDashboardTrends | null; loading: boolean; error: boolean; onRetry: () => void;
}) {
  if (error) {
    return (
      <div>
        <SectionTitle testId="section-title-tendances" style={{ marginBottom: 10 }}>TENDANCES</SectionTitle>
        <SectionError testId="tendances-error" onRetry={onRetry} />
      </div>
    );
  }

  const financeEmpty = !loading && (!data || data.finance.every(p => p.recettesXof === 0 && p.depensesXof === 0));
  const donationsEmpty = !loading && (!data || data.donations.every(p => p.amountXof === 0 && p.count === 0));
  const staffEmpty = !loading && (!data || data.staffAttendance.every(p => p.present === 0 && p.absent === 0 && p.nonConfirmed === 0));
  const totalDonationsCount = data ? data.donations.reduce((s, p) => s + p.count, 0) : 0;

  return (
    <div>
      <SectionTitle testId="section-title-tendances" style={{ marginBottom: 10 }}>
        TENDANCES
      </SectionTitle>
      <div data-testid="trends-cards" className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <ChartCard title="Recettes vs Dépenses" testId="chart-finance" empty={loading ? false : financeEmpty}>
          {loading ? (
            <div className="py-10 text-center"><p style={{ color: '#9CA3AF', fontSize: 13 }}>Chargement…</p></div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data?.finance ?? []} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={chartTooltipStyle()} labelStyle={{ color: '#9CA3AF' }} itemStyle={{ color: '#FFFFFF' }}
                  formatter={(v: number) => formatXof(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="recettesXof" name="Recettes" fill="#065F46" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="depensesXof" name="Dépenses" fill="#B91C1C" radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Évolution des dons" testId="chart-donations" empty={loading ? false : donationsEmpty}>
          {loading ? (
            <div className="py-10 text-center"><p style={{ color: '#9CA3AF', fontSize: 13 }}>Chargement…</p></div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={data?.donations ?? []} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={chartTooltipStyle()} labelStyle={{ color: '#9CA3AF' }} itemStyle={{ color: '#FFFFFF' }}
                    formatter={(v: number) => formatXof(v)} />
                  <Bar dataKey="amountXof" name="Montant collecté" fill="#3E5A78" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
              {/* Count shown as secondary textual context only — never a
                  second axis on the same chart (dual-axis amount/count
                  reads as confusing, per the PR 23 spec). */}
              <p data-testid="chart-donations-count" style={{ color: '#9CA3AF', fontSize: 11, marginTop: 8, textAlign: 'center' }}>
                {totalDonationsCount} don{totalDonationsCount !== 1 ? 's' : ''} sur la période
              </p>
            </>
          )}
        </ChartCard>

        <ChartCard title="Présence du personnel" testId="chart-staff" empty={loading ? false : staffEmpty}>
          {loading ? (
            <div className="py-10 text-center"><p style={{ color: '#9CA3AF', fontSize: 13 }}>Chargement…</p></div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data?.staffAttendance ?? []} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={chartTooltipStyle()} labelStyle={{ color: '#9CA3AF' }} itemStyle={{ color: '#FFFFFF' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="present" name="Présents" fill="#065F46" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="absent" name="Absents" fill="#B91C1C" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                {/* Never merged into "absent" — its own distinct series. */}
                <Bar dataKey="nonConfirmed" name="Non confirmés" fill="#D97706" radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
