import { budgetCategories, recentTransactions } from '../data/mockData';
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from 'lucide-react';

const totalBudget  = budgetCategories.reduce((s, c) => s + c.budgetDA, 0);
const totalConsomme = budgetCategories.reduce((s, c) => s + c.consommeDA, 0);
const totalRestant  = totalBudget - totalConsomme;

function fmt(n: number) {
  return n.toLocaleString('fr-FR') + ' DA';
}

export function FinancesPage() {
  const recettes = recentTransactions.filter((t) => t.type === 'recette').reduce((s, t) => s + t.amount, 0);
  const depenses = recentTransactions.filter((t) => t.type === 'depense').reduce((s, t) => s + t.amount, 0);

  return (
    <div className="px-4 md:px-6 py-6 space-y-6" style={{ maxWidth: 1100 }}>
      <div>
        <h2 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>Finances & Budget</h2>
        <p style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>Exercice 2026 · Mise à jour le 3 Mai 2026</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Budget total',   value: fmt(totalBudget),   sub: 'Exercice 2026',      color: '#3E5A78', bg: '#EEF2F7', icon: TrendingUp },
          { label: 'Consommé',       value: fmt(totalConsomme), sub: `${Math.round(totalConsomme/totalBudget*100)}% du budget`, color: '#D97706', bg: '#FFFBEB', icon: TrendingDown },
          { label: 'Solde restant',  value: fmt(totalRestant),  sub: 'Jusqu\'à fin mai',   color: '#065F46', bg: '#ECFDF5', icon: TrendingUp },
        ].map(({ label, value, sub, color, bg, icon: Icon }) => (
          <div key={label} className="rounded-xl p-5" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center justify-center rounded-xl" style={{ width: 38, height: 38, background: bg }}>
                <Icon size={18} style={{ color }} />
              </div>
            </div>
            <p style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>{value}</p>
            <p style={{ color: '#374151', fontSize: 13, fontWeight: 500, marginTop: 3 }}>{label}</p>
            <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 1 }}>{sub}</p>
          </div>
        ))}
      </div>

      {/* Budget by category */}
      <div className="rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
        <div className="px-5 py-4" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600 }}>Consommation par poste</h3>
        </div>
        <div className="p-5 space-y-4">
          {budgetCategories.map((c) => {
            const pct = Math.round((c.consommeDA / c.budgetDA) * 100);
            const over = pct >= 80;
            return (
              <div key={c.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
                    <span style={{ color: '#374151', fontSize: 13, fontWeight: 500 }}>{c.categorie}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span style={{ color: '#9CA3AF', fontSize: 12 }}>{fmt(c.consommeDA)} / {fmt(c.budgetDA)}</span>
                    <span style={{ color: over ? '#D97706' : '#065F46', fontSize: 12, fontWeight: 700 }}>{pct}%</span>
                  </div>
                </div>
                <div className="relative h-2 rounded-full overflow-hidden" style={{ background: '#F3F4F6' }}>
                  <div className="absolute left-0 top-0 h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: pct >= 90 ? '#B91C1C' : pct >= 75 ? '#D97706' : c.color }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent transactions */}
      <div className="rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600 }}>Dernières transactions</h3>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1" style={{ color: '#065F46', fontSize: 12, fontWeight: 600 }}>
              <ArrowDownRight size={13} /> {fmt(recettes)}
            </span>
            <span className="flex items-center gap-1" style={{ color: '#B91C1C', fontSize: 12, fontWeight: 600 }}>
              <ArrowUpRight size={13} /> {fmt(depenses)}
            </span>
          </div>
        </div>
        <ul>
          {recentTransactions.map((t, i) => (
            <li key={t.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50"
              style={{ borderBottom: i < recentTransactions.length - 1 ? '1px solid #F9F7F3' : 'none' }}>
              <div className="flex items-center justify-center rounded-lg flex-shrink-0"
                style={{ width: 32, height: 32, background: t.type === 'recette' ? '#ECFDF5' : '#FEF2F2' }}>
                {t.type === 'recette'
                  ? <ArrowDownRight size={14} style={{ color: '#065F46' }} />
                  : <ArrowUpRight size={14} style={{ color: '#B91C1C' }} />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 500 }}>{t.description}</p>
                <p style={{ color: '#9CA3AF', fontSize: 11, marginTop: 1 }}>{t.category} · {t.date}</p>
              </div>
              <span style={{ color: t.type === 'recette' ? '#065F46' : '#B91C1C', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                {t.type === 'recette' ? '+' : '-'}{fmt(t.amount)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
