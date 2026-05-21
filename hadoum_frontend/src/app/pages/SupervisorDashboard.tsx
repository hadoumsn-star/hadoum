import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../context/AppDataContext';
import { pendingValidations, openIncidents } from '../data/mockData';
import { Link } from 'react-router';
import {
  ShieldCheck, AlertTriangle, CheckCircle2, XCircle,
  ChevronRight, Clock, Activity, TrendingUp, DollarSign, X,
} from 'lucide-react';

const URGENCY_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  haute:   { bg: '#FEF2F2', color: '#B91C1C', label: 'Urgente' },
  normale: { bg: '#EEF2F7', color: '#3E5A78', label: 'Normale' },
  basse:   { bg: '#F9F7F3', color: '#6B7280', label: 'Basse' },
};

const SEVERITY_STYLE: Record<string, { bg: string; color: string }> = {
  'élevé': { bg: '#FEF2F2', color: '#B91C1C' },
  moyen:   { bg: '#FFFBEB', color: '#D97706' },
  faible:  { bg: '#ECFDF5', color: '#065F46' },
};

// ─── Vue économique ───────────────────────────────────────────────────────────

function VueEconomique() {
  const { fundRequests, validateFund, refuseFund } = useAppData();
  const [refuseNote, setRefuseNote] = useState('');
  const [refuseTarget, setRefuseTarget] = useState<number | null>(null);

  const pendingFunds = fundRequests.filter(r => r.status === 'en attente');

  const BUDGET = { alloue: 840000, consomme: 653400 };
  const restant = BUDGET.alloue - BUDGET.consomme;
  const pct = Math.round((BUDGET.consomme / BUDGET.alloue) * 100);

  const kpis = [
    { label: 'Budget alloué',   value: `${(BUDGET.alloue / 1000).toFixed(0)} 000 DA`, color: '#3E5A78', bg: '#EEF2F7', icon: DollarSign },
    { label: 'Budget consommé', value: `${(BUDGET.consomme / 1000).toFixed(0)} 000 DA`, color: '#D97706', bg: '#FFFBEB', icon: TrendingUp },
    { label: 'Budget restant',  value: `${(restant / 1000).toFixed(0)} 000 DA`, color: '#065F46', bg: '#ECFDF5', icon: CheckCircle2 },
  ];

  return (
    <div className="rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
      <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: '1px solid #F3F4F6' }}>
        <DollarSign size={16} style={{ color: '#3E5A78' }} />
        <h3 style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600 }}>Vue économique</h3>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {kpis.map(k => {
            const Icon = k.icon;
            return (
              <div key={k.label} className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: k.bg }}>
                <div className="flex items-center justify-center rounded-lg" style={{ width: 34, height: 34, background: 'rgba(255,255,255,0.75)' }}>
                  <Icon size={15} style={{ color: k.color }} />
                </div>
                <div>
                  <p style={{ color: k.color, fontSize: 16, fontWeight: 700, lineHeight: 1 }}>{k.value}</p>
                  <p style={{ color: '#6B7280', fontSize: 11, marginTop: 2 }}>{k.label}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span style={{ color: '#374151', fontSize: 12 }}>Taux de consommation</span>
            <span style={{ color: pct > 80 ? '#B91C1C' : '#374151', fontSize: 12, fontWeight: 600 }}>{pct}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: '#F3F4F6' }}>
            <div className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, background: pct > 80 ? '#B91C1C' : pct > 60 ? '#D97706' : '#065F46' }} />
          </div>
        </div>

        {/* Pending fund requests */}
        {pendingFunds.length > 0 && (
          <div>
            <p style={{ color: '#374151', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              Demandes de fonds ({pendingFunds.length})
            </p>
            <div className="space-y-2">
              {pendingFunds.map(r => (
                <div key={r.id} className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl"
                  style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
                  <div className="flex-1 min-w-0">
                    <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 600 }}>{r.montant} DA</p>
                    <p style={{ color: '#6B7280', fontSize: 12, marginTop: 1 }}>{r.motif} · {r.requestedBy}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => validateFund(r.id, 'Approuvé par le superviseur')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
                      style={{ background: '#ECFDF5', color: '#065F46', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                      <CheckCircle2 size={13} /> Valider
                    </button>
                    <button onClick={() => setRefuseTarget(r.id)}
                      className="p-1.5 rounded-lg"
                      style={{ background: '#F3F4F6', border: 'none', cursor: 'pointer' }}>
                      <XCircle size={15} style={{ color: '#6B7280' }} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Refus modal */}
      {refuseTarget !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={e => { if (e.target === e.currentTarget) setRefuseTarget(null); }}>
          <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl" style={{ background: '#FFFFFF' }}>
            <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
              <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>Refuser la demande</h3>
              <button onClick={() => setRefuseTarget(null)}><X size={18} style={{ color: '#9CA3AF' }} /></button>
            </div>
            <div className="px-6 py-5">
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Note de refus *</label>
              <textarea value={refuseNote} onChange={e => setRefuseNote(e.target.value)} rows={3}
                placeholder="Motif du refus…"
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#FFFFFF', color: '#1A1A1A', fontSize: 13, outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
            </div>
            <div className="flex gap-2 px-6 pb-6">
              <button onClick={() => setRefuseTarget(null)} className="flex-1 py-2.5 rounded-lg"
                style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, cursor: 'pointer' }}>Annuler</button>
              <button disabled={!refuseNote.trim()} onClick={() => { if (refuseNote.trim()) { refuseFund(refuseTarget, refuseNote); setRefuseTarget(null); setRefuseNote(''); } }}
                className="flex-1 py-2.5 rounded-lg"
                style={{ background: refuseNote.trim() ? '#B91C1C' : '#E5E7EB', color: refuseNote.trim() ? '#FFFFFF' : '#9CA3AF', fontSize: 13, fontWeight: 600, border: 'none', cursor: refuseNote.trim() ? 'pointer' : 'not-allowed' }}>
                Refuser
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export function SupervisorDashboard() {
  const { user } = useAuth();
  const [validated, setValidated] = useState<number[]>([]);
  const [rejected,  setRejected]  = useState<number[]>([]);

  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  const pending = pendingValidations.filter((v) => !validated.includes(v.id) && !rejected.includes(v.id));
  const urgentCount = pending.filter((v) => v.urgency === 'haute').length;
  const openCount   = openIncidents.filter((i) => i.status === 'en cours').length;

  const sortedPending = [...pending].sort((a, b) => {
    const ord = { haute: 0, normale: 1, basse: 2 };
    return ord[a.urgency] - ord[b.urgency];
  }).slice(0, 3);

  return (
    <div className="px-4 md:px-6 py-6 space-y-5" style={{ maxWidth: 1100 }}>

      {/* ── Header ── */}
      <div>
        <h2 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>
          Bonjour, {user?.name.split(' ')[0]} 👋
        </h2>
        <p style={{ color: '#6B7280', fontSize: 13, marginTop: 3, textTransform: 'capitalize' }}>
          {today} · Vue supervision
        </p>
      </div>

      {/* ── Decision focus card ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 px-5 py-5 rounded-xl"
        style={{ background: pending.length > 0 ? '#FEF2F2' : '#ECFDF5', border: `1px solid ${pending.length > 0 ? '#FECACA' : '#A7F3D0'}` }}>
        <div className="flex items-center gap-4 flex-1">
          <div className="flex items-center justify-center rounded-xl flex-shrink-0"
            style={{ width: 52, height: 52, background: pending.length > 0 ? '#B91C1C' : '#065F46' }}>
            <ShieldCheck size={26} style={{ color: '#FFFFFF' }} />
          </div>
          <div>
            <p style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700, lineHeight: 1 }}>
              {pending.length}
              <span style={{ fontSize: 15, fontWeight: 400, color: '#6B7280', marginLeft: 6 }}>
                demande{pending.length > 1 ? 's' : ''} en attente
              </span>
            </p>
            <p style={{ color: '#6B7280', fontSize: 13, marginTop: 4 }}>
              {urgentCount > 0
                ? `${urgentCount} urgente${urgentCount > 1 ? 's' : ''} · action immédiate requise`
                : pending.length === 0 ? 'Toutes les demandes ont été traitées ✓' : 'Aucune demande urgente en ce moment'
              }
            </p>
          </div>
        </div>
        {openCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl flex-shrink-0"
            style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
            <AlertTriangle size={15} style={{ color: '#D97706' }} />
            <span style={{ color: '#D97706', fontSize: 13, fontWeight: 600 }}>
              {openCount} incident{openCount > 1 ? 's' : ''} ouvert{openCount > 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* ── Top validations ── */}
      <div className="rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600 }}>Demandes à traiter</h3>
          {pending.length > 3 && (
            <button className="flex items-center gap-1" style={{ color: '#3E5A78', fontSize: 12, fontWeight: 500 }}>
              Voir tout ({pending.length}) <ChevronRight size={13} />
            </button>
          )}
        </div>
        {sortedPending.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <CheckCircle2 size={28} style={{ color: '#065F46', margin: '0 auto 8px' }} />
            <p style={{ color: '#374151', fontSize: 14, fontWeight: 500 }}>Aucune demande en attente</p>
            <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>Bonne journée !</p>
          </div>
        ) : (
          <ul>
            {sortedPending.map((v, i) => {
              const urg = URGENCY_STYLE[v.urgency];
              return (
                <li key={v.id} className="flex items-start gap-4 px-5 py-4 hover:bg-gray-50"
                  style={{ borderBottom: i < sortedPending.length - 1 ? '1px solid #F9F7F3' : 'none' }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="px-2 py-0.5 rounded-full" style={{ background: '#F3F4F6', color: '#374151', fontSize: 10, fontWeight: 600 }}>
                        {v.type.toUpperCase()}
                      </span>
                      <span className="px-2 py-0.5 rounded-full" style={{ background: urg.bg, color: urg.color, fontSize: 10, fontWeight: 600 }}>
                        {urg.label.toUpperCase()}
                      </span>
                    </div>
                    <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 500 }}>{v.description}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span style={{ color: '#6B7280', fontSize: 11 }}>Par {v.submittedBy}</span>
                      <span style={{ color: '#9CA3AF', fontSize: 11 }}>· <Clock size={9} style={{ display: 'inline', verticalAlign: 'middle' }} /> {v.date}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => setValidated(p => [...p, v.id])}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
                      style={{ background: '#ECFDF5', color: '#065F46', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                      <CheckCircle2 size={13} /> Valider
                    </button>
                    <button onClick={() => setRejected(p => [...p, v.id])} className="p-1.5 rounded-lg"
                      style={{ background: '#F3F4F6', border: 'none', cursor: 'pointer' }} title="Refuser">
                      <XCircle size={15} style={{ color: '#6B7280' }} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Vue économique ── */}
      <VueEconomique />

      {/* ── Lien incidents ── */}
      <div className="rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <div className="flex items-center gap-2">
            <Activity size={16} style={{ color: '#3E5A78' }} />
            <h3 style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600 }}>Suivi des incidents</h3>
          </div>
        </div>
        <div className="px-5 py-6 flex items-center justify-between">
          <p style={{ color: '#6B7280', fontSize: 13 }}>
            Consultez et signalez les incidents en cours.
          </p>
          <Link to="/app/incidents"
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg flex-shrink-0 ml-4"
            style={{ background: '#EEF2F7', color: '#3E5A78', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
            Voir les incidents <ChevronRight size={13} />
          </Link>
        </div>
      </div>

      <div style={{ height: 24 }} />
    </div>
  );
}