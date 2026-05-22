import { useId } from 'react';
import { TrendingUp, TrendingDown, Users, UserCheck, DollarSign, GraduationCap } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, AreaChart, Area,
} from 'recharts';
import {
  monthlyTrendData, weeklyAttendanceData, classDistributionData, budgetCategories,
} from '../data/mockData';

const kpis = [
  { label: 'Taux de présence moyen',  value: '92%',   trend: '+2%',  positive: true,  icon: UserCheck,     color: '#065F46', bg: '#ECFDF5' },
  { label: 'Enfants suivis',          value: '87',     trend: '+2',   positive: true,  icon: Users,         color: '#3E5A78', bg: '#EEF2F7' },
  { label: 'Budget consommé',         value: '78%',    trend: '-4%',  positive: true,  icon: DollarSign,    color: '#D97706', bg: '#FFFBEB' },
  { label: 'Taux encadrement',        value: '1:7',    trend: 'Stable', positive: null, icon: GraduationCap, color: '#7C3AED', bg: '#F5F3FF' },
];

function Tt({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg px-3 py-2 shadow-lg" style={{ background: '#1A1A1A' }}>
      <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 2 }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: '#FFFFFF', fontSize: 13 }}>{p.name ?? p.dataKey}: {p.value}{p.dataKey === 'taux' ? '%' : ''}</p>
      ))}
    </div>
  );
}

export function IndicatorsPage() {
  const uid    = useId().replace(/:/g, '');
  const _uid   = uid; // suppress unused warning
  return (
    <div className="px-4 md:px-6 py-6 space-y-6" style={{ maxWidth: 1200 }}>
      <div>
        <h2 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>Indicateurs de pilotage</h2>
        <p style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>Vue consolidée — Exercice 2025-2026</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="rounded-xl p-5" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center justify-center rounded-xl" style={{ width: 38, height: 38, background: k.bg }}>
                  <Icon size={18} style={{ color: k.color }} />
                </div>
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                  style={{ background: k.positive === true ? '#ECFDF5' : k.positive === false ? '#FEF2F2' : '#F9F7F3', color: k.positive === true ? '#065F46' : k.positive === false ? '#B91C1C' : '#6B7280', fontSize: 10, fontWeight: 600 }}>
                  {k.positive === true ? <TrendingUp size={9} /> : k.positive === false ? <TrendingDown size={9} /> : null}
                  {k.trend}
                </span>
              </div>
              <p style={{ color: '#1A1A1A', fontSize: 26, fontWeight: 700 }}>{k.value}</p>
              <p style={{ color: '#374151', fontSize: 12, marginTop: 3 }}>{k.label}</p>
            </div>
          );
        })}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Trend */}
        <div className="rounded-xl p-5" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Taux de présence mensuel</h3>
          <p style={{ color: '#6B7280', fontSize: 12, marginBottom: 16 }}>Sept. 2025 – Mai 2026</p>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={monthlyTrendData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="mois" tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={[80, 100]} tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<Tt />} />
              <Area key="area-taux" type="monotone" dataKey="taux" stroke="#3E5A78" strokeWidth={2.5}
                fill="#3E5A78" fillOpacity={0.12}
                dot={{ fill: '#3E5A78', r: 3, strokeWidth: 0 }} activeDot={{ r: 5 }} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Weekly */}
        <div className="rounded-xl p-5" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Présences — Semaine en cours</h3>
          <p style={{ color: '#6B7280', fontSize: 12, marginBottom: 16 }}>Présents vs Absents</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weeklyAttendanceData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: '#9CA3AF', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#9CA3AF', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip content={<Tt />} />
              <Bar key="bar-presents" dataKey="presents" name="Présents" fill="#3E5A78" radius={[3, 3, 0, 0]} barSize={14} isAnimationActive={false} />
              <Bar key="bar-absents"  dataKey="absents"  name="Absents"  fill="#FECACA" radius={[3, 3, 0, 0]} barSize={14} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Class distribution */}
      <div className="rounded-xl p-5" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
        <h3 style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Répartition par niveau</h3>
        <p style={{ color: '#6B7280', fontSize: 12, marginBottom: 16 }}>87 enfants · 5 niveaux scolaires</p>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
          {classDistributionData.map((c, i) => {
            const colors = ['#3E5A78','#4A6A8A','#7C3AED','#065F46','#D97706'];
            const pct = Math.round((c.effectif / 87) * 100);
            return (
              <div key={c.classe} className="text-center">
                <div className="relative mx-auto mb-2" style={{ width: 64, height: 64 }}>
                  <svg viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#F3F4F6" strokeWidth="3" />
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke={colors[i]} strokeWidth="3"
                      strokeDasharray={`${pct} 100`} strokeLinecap="round" />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span style={{ color: colors[i], fontSize: 14, fontWeight: 700 }}>{c.effectif}</span>
                  </div>
                </div>
                <p style={{ color: '#374151', fontSize: 12, fontWeight: 600 }}>{c.classe}</p>
                <p style={{ color: '#9CA3AF', fontSize: 11 }}>{pct}%</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Budget by category (bar) */}
      <div className="rounded-xl p-5" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
        <h3 style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Consommation budgétaire</h3>
        <p style={{ color: '#6B7280', fontSize: 12, marginBottom: 16 }}>% du budget alloué par poste</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={budgetCategories.map(c => ({ ...c, pct: Math.round(c.consommeDA/c.budgetDA*100) }))}
            layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="categorie" tick={{ fill: '#374151', fontSize: 11 }} axisLine={false} tickLine={false} width={90} />
            <Tooltip content={<Tt />} />
            <Bar key="bar-budget-pct" dataKey="pct" name="% consommé" radius={[0, 4, 4, 0]} barSize={12} isAnimationActive={false}>
              {budgetCategories.map((c) => (
                <Cell key={`ind-budget-cell-${c.id}`} fill={c.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}