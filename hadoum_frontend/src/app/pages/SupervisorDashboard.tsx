import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../context/AppDataContext';
import { Link } from 'react-router';
import {
  ShieldCheck, AlertTriangle, CheckCircle2, XCircle,
  ChevronRight, Clock, Activity, TrendingUp, DollarSign, X,
} from 'lucide-react';
import { financesApi, type ApiDashboard } from '../services/finances.api';
import { incidentsApi } from '../services/incidents.api';
import { validationsApi, type ApiPendingValidation } from '../services/validations.api';
import { formatXof } from '../config/financeCategories.config';

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  MAINTENANCE_TICKET: 'Ticket',
  SUPPLIER_CONTRACT: 'Contrat',
  ADMINISTRATIVE_PROCEDURE: 'Démarche',
  STOCK_ITEM: 'Stock',
  INVENTORY_ASSET: 'Bien',
  ENTRY_LOG: 'Registre',
  GOODS_MOVEMENT_LOG: 'Mouvement',
};

const RESOURCE_TYPE_LINKS: Record<string, string> = {
  MAINTENANCE_TICKET: '/app/tickets-maintenance',
  SUPPLIER_CONTRACT: '/app/contrats-fournisseurs',
  ADMINISTRATIVE_PROCEDURE: '/app/demarches-administratives',
  STOCK_ITEM: '/app/stocks-inventaire',
  INVENTORY_ASSET: '/app/stocks-inventaire',
  ENTRY_LOG: '/app/registre-entrees-sorties',
  GOODS_MOVEMENT_LOG: '/app/registre-entrees-sorties',
};

const LATE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

function pendingValidationLabel(v: ApiPendingValidation): string {
  if (!v.resource) return RESOURCE_TYPE_LABELS[v.resourceType] ?? v.resourceType;
  if (v.resourceType === 'SUPPLIER_CONTRACT') {
    return [v.resource.contractName, v.resource.supplierName].filter(Boolean).join(' — ');
  }
  if (v.resourceType === 'ADMINISTRATIVE_PROCEDURE') {
    return [v.resource.title, v.resource.authority].filter(Boolean).join(' — ');
  }
  if (v.resourceType === 'STOCK_ITEM') {
    const qty = v.resource.pendingValidationPayload?.quantity;
    return [v.resource.name, qty != null ? `${qty} ${v.resource.unit ?? ''}`.trim() : null].filter(Boolean).join(' — ');
  }
  if (v.resourceType === 'INVENTORY_ASSET') {
    return [v.resource.name, v.resource.assetCode].filter(Boolean).join(' — ');
  }
  if (v.resourceType === 'ENTRY_LOG') {
    return [v.resource.fullName, v.resource.organization].filter(Boolean).join(' — ');
  }
  if (v.resourceType === 'GOODS_MOVEMENT_LOG') {
    return [v.resource.description, v.resource.destination].filter(Boolean).join(' — ');
  }
  return v.resource.title ?? RESOURCE_TYPE_LABELS[v.resourceType] ?? v.resourceType;
}

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
  const [dashboard, setDashboard] = useState<ApiDashboard | null>(null);

  useEffect(() => {
    financesApi.getDashboard().then(setDashboard).catch(() => {});
  }, []);

  const pendingFunds = fundRequests.filter(r => r.status === 'en attente');

  const alloue   = dashboard ? dashboard.byCategory.reduce((s, c) => s + (c.budgetXof ?? 0), 0) : 0;
  const consomme = dashboard ? dashboard.byCategory.reduce((s, c) => s + c.realizedXof, 0) : 0;
  const restant  = alloue - consomme;
  const pct      = alloue > 0 ? Math.round((consomme / alloue) * 100) : 0;

  const kpis = [
    { label: 'Budget alloué',   value: formatXof(alloue),   color: '#3E5A78', bg: '#EEF2F7', icon: DollarSign },
    { label: 'Budget consommé', value: formatXof(consomme), color: '#D97706', bg: '#FFFBEB', icon: TrendingUp },
    { label: 'Budget restant',  value: formatXof(restant),  color: '#065F46', bg: '#ECFDF5', icon: CheckCircle2 },
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
  const [openCount, setOpenCount] = useState(0);
  const [lateCount, setLateCount] = useState(0);
  const [pendingValidations, setPendingValidations] = useState<ApiPendingValidation[]>([]);

  useEffect(() => {
    incidentsApi.list().then(data => {
      setOpenCount(data.filter(i => i.status !== 'RESOLU').length);
      setLateCount(data.filter(i => i.status === 'EN_RETARD').length);
    }).catch(() => {});
    validationsApi.pending().then(setPendingValidations).catch(() => {});
  }, []);

  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  const now = Date.now();
  const pending = [...pendingValidations].sort(
    (a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime(),
  );
  const lateValidationsCount = pending.filter(
    v => now - new Date(v.submittedAt).getTime() > LATE_THRESHOLD_MS,
  ).length;

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

      {/* ── Decision focus card — hidden when all handled ── */}
      {pending.length > 0 ? (
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 px-5 py-5 rounded-xl"
          style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
          <div className="flex items-center gap-4 flex-1">
            <div className="flex items-center justify-center rounded-xl flex-shrink-0"
              style={{ width: 52, height: 52, background: '#B91C1C' }}>
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
                {lateValidationsCount > 0
                  ? `${lateValidationsCount} en retard · action immédiate requise`
                  : 'Aucune demande en retard en ce moment'
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
      ) : (
        <div className="flex items-center gap-3 px-5 py-3.5 rounded-xl"
          style={{ background: '#ECFDF5', border: '1px solid #A7F3D0' }}>
          <CheckCircle2 size={18} style={{ color: '#065F46', flexShrink: 0 }} />
          <p style={{ color: '#065F46', fontSize: 14, fontWeight: 500 }}>
            Toutes les demandes ont été traitées. Bonne journée !
          </p>
        </div>
      )}

      {/* ── Top validations ── */}
      <div className="rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600 }}>Demandes à traiter</h3>
          <span style={{ color: '#9CA3AF', fontSize: 12 }}>{pending.length} au total</span>
        </div>
        {pending.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <CheckCircle2 size={28} style={{ color: '#065F46', margin: '0 auto 8px' }} />
            <p style={{ color: '#374151', fontSize: 14, fontWeight: 500 }}>Aucune demande en attente</p>
            <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>Bonne journée !</p>
          </div>
        ) : (
          <ul>
            {pending.map((v, i) => {
              const isLate = now - new Date(v.submittedAt).getTime() > LATE_THRESHOLD_MS;
              return (
                <li key={v.id} className="flex items-start gap-4 px-5 py-4 hover:bg-gray-50"
                  style={{ borderBottom: i < pending.length - 1 ? '1px solid #F9F7F3' : 'none' }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="px-2 py-0.5 rounded-full" style={{ background: '#F3F4F6', color: '#374151', fontSize: 10, fontWeight: 600 }}>
                        {(RESOURCE_TYPE_LABELS[v.resourceType] ?? v.resourceType).toUpperCase()}
                      </span>
                      {isLate && (
                        <span className="px-2 py-0.5 rounded-full" style={{ background: '#FEF2F2', color: '#B91C1C', fontSize: 10, fontWeight: 600 }}>
                          EN RETARD
                        </span>
                      )}
                    </div>
                    <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 500 }}>{pendingValidationLabel(v)}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span style={{ color: '#6B7280', fontSize: 11 }}>Par {v.submittedBy.name}</span>
                      <span style={{ color: '#9CA3AF', fontSize: 11 }}>
                        · <Clock size={9} style={{ display: 'inline', verticalAlign: 'middle' }} /> {new Date(v.submittedAt).toLocaleDateString('fr-FR')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Link to={RESOURCE_TYPE_LINKS[v.resourceType] ?? '/app/dashboard'}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
                      style={{ background: '#EEF2F7', color: '#3E5A78', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                      Voir <ChevronRight size={13} />
                    </Link>
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
            {openCount > 0
              ? <>
                  {openCount} incident{openCount > 1 ? 's' : ''} ouvert{openCount > 1 ? 's' : ''}
                  {lateCount > 0 && (
                    <span style={{ color: '#B91C1C', fontWeight: 600 }}> · {lateCount} en retard</span>
                  )}
                </>
              : 'Aucun incident ouvert.'
            }
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