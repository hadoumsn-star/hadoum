import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  Plus, X, Check, Eye, Loader2, Trash2,
  TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  AlertCircle, AlertTriangle, Upload,
} from 'lucide-react';
import {
  financesApi,
  type ApiTransaction, type ApiDashboard, type ApiTransactionType,
} from '../services/finances.api';
import {
  CATEGORY_LABELS, CATEGORY_COLORS, EXPENSE_CATEGORIES, INCOME_CATEGORIES,
  STATUS_LABELS, STATUS_STYLE, formatXof, formatEur,
  type ApiTransactionCategory, type ApiTransactionStatus,
} from '../config/financeCategories.config';

const INPUT: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1px solid #E5E7EB', background: '#FFFFFF',
  color: '#1A1A1A', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

const MONTH_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

function Tt({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg px-3 py-2 shadow-lg" style={{ background: '#1A1A1A' }}>
      <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 2 }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: '#FFFFFF', fontSize: 13 }}>{p.name ?? p.dataKey}: {formatXof(p.value)}</p>
      ))}
    </div>
  );
}

// ─── Add transaction modal (dépense or recette) ────────────────────────────────

function TransactionModal({ type, onSave, onClose }: {
  type: ApiTransactionType;
  onSave: (data: {
    category: ApiTransactionCategory; label: string; amountXof: number; date: string;
    status: ApiTransactionStatus; donorName?: string; isAnonymousDonor?: boolean;
  }, file: File | null) => void;
  onClose: () => void;
}) {
  const categories = type === 'DEPENSE' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  const [category, setCategory] = useState<ApiTransactionCategory>(categories[0]);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<ApiTransactionStatus>('VALIDE');
  const [anonymous, setAnonymous] = useState(false);
  const [donorName, setDonorName] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const amountNum = parseInt(amount, 10);
  const canSave = label.trim() && amountNum > 0 && date;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      category, label: label.trim(), amountXof: amountNum, date, status,
      ...(type === 'RECETTE' ? { isAnonymousDonor: anonymous, donorName: anonymous ? undefined : donorName.trim() || undefined } : {}),
    }, file);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(26,26,26,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FFFFFF', maxHeight: '92vh' }}>
        <div className="flex items-center justify-between px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 17, fontWeight: 700 }}>
            {type === 'DEPENSE' ? 'Nouvelle dépense' : 'Nouvelle entrée'}
          </h3>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Libellé *</label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Ex : Fournitures scolaires" style={INPUT} autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Catégorie</label>
              <select value={category} onChange={e => setCategory(e.target.value as ApiTransactionCategory)} style={INPUT}>
                {categories.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Date *</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={INPUT} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Montant (FCFA) *</label>
              <input type="number" min={1} value={amount} onChange={e => setAmount(e.target.value)} placeholder="45000" style={INPUT} />
            </div>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Statut</label>
              <select value={status} onChange={e => setStatus(e.target.value as ApiTransactionStatus)} style={INPUT}>
                <option value="VALIDE">Validé</option>
                <option value="EN_ATTENTE">En attente</option>
              </select>
            </div>
          </div>

          {type === 'RECETTE' && (
            <div className="space-y-2">
              <label className="flex items-center gap-2" style={{ fontSize: 13, color: '#374151' }}>
                <input type="checkbox" checked={anonymous} onChange={e => setAnonymous(e.target.checked)} />
                Don anonyme
              </label>
              {!anonymous && (
                <input value={donorName} onChange={e => setDonorName(e.target.value)} placeholder="Nom du donateur" style={INPUT} />
              )}
            </div>
          )}

          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>
              Justificatif {type === 'DEPENSE' ? '(recommandé)' : '(optionnel)'}
            </label>
            <label className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer"
              style={{ border: `1px solid ${file ? '#A7F3D0' : '#E5E7EB'}`, background: file ? 'rgba(6,95,70,0.04)' : '#FAFAFA' }}>
              <Upload size={14} style={{ color: file ? '#065F46' : '#9CA3AF', flexShrink: 0 }} />
              <span style={{ flex: 1, color: file ? '#065F46' : '#6B7280', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {file ? file.name : 'Joindre un fichier…'}
              </span>
              {file && (
                <button type="button" onClick={e => { e.preventDefault(); setFile(null); }}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#B91C1C', flexShrink: 0 }}>
                  <X size={13} />
                </button>
              )}
              <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>
        </div>

        <div className="flex gap-2 px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid #F3F4F6', background: '#F9F7F3' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, cursor: 'pointer' }}>
            Annuler
          </button>
          <button disabled={!canSave} onClick={handleSave}
            className="flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2"
            style={{ background: canSave ? '#3E5A78' : '#E5E7EB', color: canSave ? '#FFFFFF' : '#9CA3AF', fontSize: 13, fontWeight: 600, border: 'none', cursor: canSave ? 'pointer' : 'not-allowed' }}>
            <Check size={14} /> Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Budget editor modal ────────────────────────────────────────────────────────

function BudgetEditorModal({ initial, onSave, onClose }: {
  initial: Record<string, number>;
  onSave: (values: Record<string, number>) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(EXPENSE_CATEGORIES.map(c => [c, initial[c] ? String(initial[c]) : ''])),
  );

  const handleSave = () => {
    const parsed: Record<string, number> = {};
    for (const c of EXPENSE_CATEGORIES) {
      const n = parseInt(values[c], 10);
      if (n > 0) parsed[c] = n;
    }
    onSave(parsed);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(26,26,26,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FFFFFF', maxHeight: '92vh' }}>
        <div className="flex items-center justify-between px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 17, fontWeight: 700 }}>Budget prévisionnel du mois</h3>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-3">
          {EXPENSE_CATEGORIES.map(c => (
            <div key={c}>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>{CATEGORY_LABELS[c]}</label>
              <input type="number" min={0} value={values[c]}
                onChange={e => setValues(v => ({ ...v, [c]: e.target.value }))}
                placeholder="0" style={INPUT} />
            </div>
          ))}
        </div>
        <div className="flex gap-2 px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid #F3F4F6', background: '#F9F7F3' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, cursor: 'pointer' }}>
            Annuler
          </button>
          <button onClick={handleSave} className="flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2"
            style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
            <Check size={14} /> Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────────

export function FinancesPage() {
  const now = new Date();
  const [dashboard, setDashboard] = useState<ApiDashboard | null>(null);
  const [transactions, setTransactions] = useState<ApiTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDepense, setShowAddDepense] = useState(false);
  const [showAddRecette, setShowAddRecette] = useState(false);
  const [showBudgetEditor, setShowBudgetEditor] = useState(false);

  const reload = () => Promise.all([
    financesApi.getDashboard(now.getFullYear(), now.getMonth() + 1),
    financesApi.listTransactions(),
  ]).then(([d, t]) => { setDashboard(d); setTransactions(t); });

  useEffect(() => {
    reload()
      .catch(() => toast.error('Erreur de chargement des finances.'))
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async (
    type: ApiTransactionType,
    data: { category: ApiTransactionCategory; label: string; amountXof: number; date: string; status: ApiTransactionStatus; donorName?: string; isAnonymousDonor?: boolean },
    file: File | null,
  ) => {
    try {
      const created = await financesApi.createTransaction({ type, ...data });
      if (file) await financesApi.uploadJustificatif(created.id, file);
      await reload();
      setShowAddDepense(false);
      setShowAddRecette(false);
      toast.success(type === 'DEPENSE' ? 'Dépense enregistrée.' : 'Entrée enregistrée.');
    } catch {
      toast.error("Erreur lors de l'enregistrement.");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await financesApi.deleteTransaction(id);
      await reload();
    } catch {
      toast.error('Erreur lors de la suppression.');
    }
  };

  const handleViewJustificatif = async (id: string) => {
    try {
      const { url } = await financesApi.getJustificatifUrl(id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error("Impossible d'ouvrir le justificatif.");
    }
  };

  const handleSaveBudget = async (values: Record<string, number>) => {
    try {
      await Promise.all(
        Object.entries(values).map(([category, budgetXof]) =>
          financesApi.upsertBudgetLine({
            category: category as ApiTransactionCategory,
            month: now.getMonth() + 1,
            year: now.getFullYear(),
            budgetXof,
          }),
        ),
      );
      await reload();
      setShowBudgetEditor(false);
      toast.success('Budget mis à jour.');
    } catch {
      toast.error('Erreur lors de la mise à jour du budget.');
    }
  };

  if (loading || !dashboard) {
    return (
      <div className="flex items-center justify-center" style={{ height: '60vh' }}>
        <Loader2 size={28} className="animate-spin" style={{ color: '#3E5A78' }} />
      </div>
    );
  }

  const totalBudget = dashboard.byCategory.reduce((s, c) => s + (c.budgetXof ?? 0), 0);
  const totalRealized = dashboard.byCategory.reduce((s, c) => s + c.realizedXof, 0);
  const totalRestant = totalBudget - totalRealized;

  const budgetInitial = Object.fromEntries(
    dashboard.byCategory.filter(c => c.budgetXof !== null).map(c => [c.category, c.budgetXof as number]),
  );

  return (
    <div className="px-4 md:px-6 py-6 space-y-6" style={{ maxWidth: 1200 }}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>Finances & Budget</h2>
          <p style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>
            {MONTH_LABELS[dashboard.period.month - 1]} {dashboard.period.year}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAddRecette(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg"
            style={{ background: '#ECFDF5', color: '#065F46', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
            <Plus size={14} /> Entrée
          </button>
          <button onClick={() => setShowAddDepense(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg"
            style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
            <Plus size={14} /> Dépense
          </button>
        </div>
      </div>

      {/* Alerts */}
      {dashboard.alerts.length > 0 && (
        <div className="space-y-2">
          {dashboard.alerts.map(a => (
            <div key={a.category} className="flex items-center gap-2 px-4 py-3 rounded-xl"
              style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
              <AlertCircle size={15} style={{ color: '#B91C1C', flexShrink: 0 }} />
              <p style={{ color: '#1A1A1A', fontSize: 13 }}>
                <strong>{CATEGORY_LABELS[a.category]}</strong> — dépassement de budget : {formatXof(a.realizedXof)} / {formatXof(a.budgetXof)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Solde caisse',    value: formatXof(dashboard.soldeCaisseXof), sub: formatEur(dashboard.soldeCaisseEur), color: '#065F46', bg: '#ECFDF5', icon: TrendingUp },
          { label: 'Dépenses du mois', value: formatXof(totalRealized), sub: `${totalBudget > 0 ? Math.round(totalRealized / totalBudget * 100) : 0}% du budget`, color: '#D97706', bg: '#FFFBEB', icon: TrendingDown },
          { label: 'Budget restant',   value: formatXof(totalRestant), sub: `Budget total ${formatXof(totalBudget)}`, color: '#3E5A78', bg: '#EEF2F7', icon: TrendingUp },
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

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl p-5" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Dépenses par catégorie</h3>
          <p style={{ color: '#6B7280', fontSize: 12, marginBottom: 16 }}>Mois en cours</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dashboard.byCategory.map(c => ({ ...c, label: CATEGORY_LABELS[c.category] }))}
              layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" tick={{ fill: '#374151', fontSize: 11 }} axisLine={false} tickLine={false} width={90} />
              <Tooltip content={<Tt />} />
              <Bar dataKey="realizedXof" name="Dépensé" radius={[0, 4, 4, 0]} barSize={12} isAnimationActive={false}>
                {dashboard.byCategory.map(c => <Cell key={c.category} fill={CATEGORY_COLORS[c.category]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl p-5" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Comparatif mensuel</h3>
          <p style={{ color: '#6B7280', fontSize: 12, marginBottom: 16 }}>Recettes vs dépenses — 6 derniers mois</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dashboard.monthlyTrend.map(m => ({ ...m, label: MONTH_LABELS[m.month - 1] }))}
              margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<Tt />} />
              <Bar dataKey="recettesXof" name="Recettes" fill="#065F46" radius={[3, 3, 0, 0]} barSize={10} isAnimationActive={false} />
              <Bar dataKey="depensesXof" name="Dépenses" fill="#B91C1C" radius={[3, 3, 0, 0]} barSize={10} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Budget prévisionnel */}
      <div className="rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600 }}>Budget prévisionnel</h3>
          <button onClick={() => setShowBudgetEditor(true)}
            className="px-3 py-1.5 rounded-lg" style={{ background: '#EEF2F7', color: '#3E5A78', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
            Éditer le budget
          </button>
        </div>
        <div className="p-5 space-y-4">
          {dashboard.byCategory.filter(c => c.budgetXof !== null).map(c => {
            const pct = Math.round((c.realizedXof / (c.budgetXof as number)) * 100);
            return (
              <div key={c.category}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: CATEGORY_COLORS[c.category] }} />
                    <span style={{ color: '#374151', fontSize: 13, fontWeight: 500 }}>{CATEGORY_LABELS[c.category]}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span style={{ color: '#9CA3AF', fontSize: 12 }}>{formatXof(c.realizedXof)} / {formatXof(c.budgetXof as number)}</span>
                    <span style={{ color: c.overBudget ? '#B91C1C' : '#065F46', fontSize: 12, fontWeight: 700 }}>{pct}%</span>
                  </div>
                </div>
                <div className="relative h-2 rounded-full overflow-hidden" style={{ background: '#F3F4F6' }}>
                  <div className="absolute left-0 top-0 h-full rounded-full transition-all"
                    style={{ width: `${Math.min(pct, 100)}%`, background: pct >= 100 ? '#B91C1C' : pct >= 75 ? '#D97706' : CATEGORY_COLORS[c.category] }} />
                </div>
              </div>
            );
          })}
          {dashboard.byCategory.filter(c => c.budgetXof !== null).length === 0 && (
            <p style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: '12px 0' }}>
              Aucun budget défini pour ce mois. Cliquez sur « Éditer le budget » pour commencer.
            </p>
          )}
        </div>
      </div>

      {/* Transactions */}
      <div className="rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
        <div className="px-5 py-4" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600 }}>Transactions</h3>
        </div>
        {transactions.length === 0 ? (
          <p style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Aucune transaction enregistrée.</p>
        ) : (
          <ul>
            {transactions.map((t, i) => {
              const status = STATUS_STYLE[t.status];
              return (
                <li key={t.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50"
                  style={{ borderBottom: i < transactions.length - 1 ? '1px solid #F9F7F3' : 'none' }}>
                  <div className="flex items-center justify-center rounded-lg flex-shrink-0"
                    style={{ width: 32, height: 32, background: t.type === 'RECETTE' ? '#ECFDF5' : '#FEF2F2' }}>
                    {t.type === 'RECETTE'
                      ? <ArrowDownRight size={14} style={{ color: '#065F46' }} />
                      : <ArrowUpRight size={14} style={{ color: '#B91C1C' }} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 500 }}>{t.label}</p>
                    <p style={{ color: '#9CA3AF', fontSize: 11, marginTop: 1 }}>
                      {CATEGORY_LABELS[t.category]} · {new Date(t.date).toLocaleDateString('fr-FR')}
                      {t.donorName ? ` · ${t.donorName}` : t.isAnonymousDonor ? ' · Donateur anonyme' : ''}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: status.bg, color: status.color, fontSize: 10, fontWeight: 600 }}>
                    {STATUS_LABELS[t.status].toUpperCase()}
                  </span>
                  {t.justifKey && (
                    <button onClick={() => handleViewJustificatif(t.id)} title="Voir le justificatif"
                      className="flex items-center justify-center rounded flex-shrink-0"
                      style={{ width: 26, height: 26, background: '#EEF2F7', color: '#3E5A78', border: 'none', cursor: 'pointer' }}>
                      <Eye size={13} />
                    </button>
                  )}
                  <span style={{ color: t.type === 'RECETTE' ? '#065F46' : '#B91C1C', fontSize: 14, fontWeight: 700, flexShrink: 0, minWidth: 100, textAlign: 'right' }}>
                    {t.type === 'RECETTE' ? '+' : '-'}{formatXof(t.amountXof)}
                  </span>
                  <button onClick={() => handleDelete(t.id)} title="Supprimer" className="flex-shrink-0"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 2 }}>
                    <Trash2 size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {showAddDepense && (
        <TransactionModal type="DEPENSE" onClose={() => setShowAddDepense(false)}
          onSave={(data, file) => handleCreate('DEPENSE', data, file)} />
      )}
      {showAddRecette && (
        <TransactionModal type="RECETTE" onClose={() => setShowAddRecette(false)}
          onSave={(data, file) => handleCreate('RECETTE', data, file)} />
      )}
      {showBudgetEditor && (
        <BudgetEditorModal initial={budgetInitial} onClose={() => setShowBudgetEditor(false)} onSave={handleSaveBudget} />
      )}
    </div>
  );
}
