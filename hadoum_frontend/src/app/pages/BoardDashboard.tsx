import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { boardReports, monthlyTrendData } from '../data/mockData';
import { UploadModal } from './ReportsPage';
import { useNavigate } from 'react-router';
import {
  Download, TrendingUp, TrendingDown, FileText,
  ExternalLink, ChevronRight, Clock, CheckCircle2,
  AlertCircle, Loader2, DollarSign,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';

// ─── Data ─────────────────────────────────────────────────────────────────────
// Strictly document-based: no meetings, no planning modules — CA consults only

const governanceIndicators = [
  { label: 'Taux de présence',  value: '92%',  trend: '+2%', positive: true,  period: 'Ce mois' },
  { label: 'Enfants suivis',    value: '87',    trend: '+2',  positive: true,  period: 'Ce mois' },
  { label: 'Budget consommé',   value: '78%',  trend: '-4%', positive: true,  period: 'Ce mois' },
];

// Point 8b : Le CA ne prépare pas de rapports — statuts remplacés par "disponible" / "en consultation"
const documentDeadlines = [
  { id: 1, title: 'Rapport mensuel — Avril 2026',       type: 'Mensuel',     dueDate: '01 Mai 2026',  daysLeft: 0,   status: 'disponible' as const },
  { id: 2, title: 'Rapport trimestriel — T1 2026',      type: 'Trimestriel', dueDate: '01 Avr 2026',  daysLeft: 0,   status: 'disponible' as const },
  { id: 3, title: 'Rapport mensuel — Mai 2026',         type: 'Mensuel',     dueDate: '01 Juin 2026', daysLeft: 29,  status: 'en consultation' as const },
  { id: 4, title: 'Rapport annuel 2026',                type: 'Annuel',      dueDate: '15 Jan 2027',  daysLeft: 257, status: 'en consultation' as const },
];

const STATUS_STYLE = {
  'disponible':      { bg: '#ECFDF5', color: '#065F46', icon: CheckCircle2 },
  'en consultation': { bg: '#EEF2F7', color: '#3E5A78', icon: Clock },
  'soumis':          { bg: '#ECFDF5', color: '#065F46', icon: CheckCircle2 },
  // Legacy aliases — kept for type safety
  'à soumettre':     { bg: '#FEF2F2', color: '#B91C1C', icon: AlertCircle },
  'à préparer':      { bg: '#FFFBEB', color: '#D97706', icon: Clock },
  'en cours':        { bg: '#EEF2F7', color: '#3E5A78', icon: Clock },
};

function LineTooltip({ active, payload, label }: any) {
  if (active && payload?.length) {
    return (
      <div className="rounded-lg px-3 py-2 shadow-lg" style={{ background: '#1A1A1A' }}>
        <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 2 }}>{label}</p>
        <p style={{ color: '#FFFFFF', fontSize: 13 }}>Taux : {payload[0].value}%</p>
      </div>
    );
  }
  return null;
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
// Question centrale : "L'orphelinat est-il sur la bonne trajectoire ?"

export function BoardDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showToast, setShowToast] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  // Only surface truly urgent document if due within 30 days
  const urgentDoc = documentDeadlines.find((d) => d.daysLeft <= 30);

  const handleExport = () => {
    setShowToast(true);
  };

  return (
    <div className="px-4 md:px-6 py-6 space-y-5" style={{ maxWidth: 1100 }}>

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>
            Bonjour, {user?.name.split(' ')[0]}
          </h2>
          <p style={{ color: '#6B7280', fontSize: 13, marginTop: 3, textTransform: 'capitalize' }}>
            {today} · Vue Conseil d'Administration
          </p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 rounded-lg self-start sm:self-auto transition-all"
          style={{
            background: '#3E5A78',
            color: '#FFFFFF', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer',
          }}
        >
          <Download size={14} /> Exporter la synthèse
        </button>
      </div>

      {/* ── Urgent document banner (only if ≤30 days) ── */}
      {urgentDoc && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl"
          style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}
        >
          <AlertCircle size={15} style={{ color: '#B91C1C', flexShrink: 0 }} />
          <div className="flex-1 min-w-0">
            <span style={{ color: '#1A1A1A', fontSize: 13 }}>
              <strong>{urgentDoc.title}</strong>
              {' '}— à soumettre dans <strong>{urgentDoc.daysLeft} jours</strong> ({urgentDoc.dueDate})
            </span>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1 flex-shrink-0"
            style={{ color: '#B91C1C', fontSize: 12, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Préparer <ChevronRight size={12} />
          </button>
        </div>
      )}

      {/* ── Strategic KPIs ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {governanceIndicators.map((ind) => (
          <div key={ind.label} className="rounded-xl p-5" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
            <div className="flex items-center justify-between mb-3">
              <span style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em' }}>
                {ind.period.toUpperCase()}
              </span>
              <span
                className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                style={{
                  background: ind.positive ? '#ECFDF5' : '#FEF2F2',
                  color: ind.positive ? '#065F46' : '#B91C1C',
                  fontSize: 10, fontWeight: 600,
                }}
              >
                {ind.positive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                {ind.trend}
              </span>
            </div>
            <p style={{ color: '#1A1A1A', fontSize: 26, fontWeight: 700 }}>{ind.value}</p>
            <p style={{ color: '#374151', fontSize: 12, marginTop: 4 }}>{ind.label}</p>
          </div>
        ))}
      </div>

      {/* ── Budget block (lecture seule) ── */}
      <div className="rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
        <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <DollarSign size={16} style={{ color: '#3E5A78' }} />
          <h3 style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600 }}>Budget</h3>
          <span className="ml-auto px-2 py-0.5 rounded-full" style={{ background: '#F3F4F6', color: '#9CA3AF', fontSize: 10, fontWeight: 600 }}>LECTURE SEULE</span>
        </div>
        <div className="px-5 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: 'Budget alloué',   value: '840 000 DA', color: '#3E5A78', bg: '#EEF2F7', icon: DollarSign },
              { label: 'Budget consommé', value: '653 400 DA', color: '#D97706', bg: '#FFFBEB', icon: TrendingUp },
              { label: 'Budget restant',  value: '186 600 DA', color: '#065F46', bg: '#ECFDF5', icon: CheckCircle2 },
            ].map(k => {
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
        </div>
      </div>

      {/* ── Row : Trend chart + Document deadlines ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Presence trend */}
        <div className="lg:col-span-3 rounded-xl p-5" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
          <div className="mb-4">
            <h3 style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600 }}>Évolution du taux de présence</h3>
            <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>Sept. 2025 – Mai 2026</p>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={monthlyTrendData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid key="grid" strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis key="xaxis" dataKey="mois" tick={{ fill: '#9CA3AF', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis key="yaxis" domain={[80, 100]} tick={{ fill: '#9CA3AF', fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip key="tooltip" content={<LineTooltip />} cursor={{ stroke: '#E5E7EB', strokeWidth: 1 }} />
              <Line key="line-taux" type="monotone" dataKey="taux" stroke="#3E5A78" strokeWidth={2.5}
                dot={{ fill: '#3E5A78', r: 3, strokeWidth: 0 }} activeDot={{ r: 5, fill: '#3E5A78' }}
                isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Document deadlines — CA view: consult only */}
        <div className="lg:col-span-2 rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
          <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: '1px solid #F3F4F6' }}>
            <FileText size={15} style={{ color: '#3E5A78' }} />
            <h3 style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600 }}>Rapports disponibles</h3>
          </div>
          <ul>
            {documentDeadlines.map((doc, i) => {
              const st = STATUS_STYLE[doc.status] ?? STATUS_STYLE['disponible'];
              const Icon = st.icon;
              return (
                <li
                  key={doc.id}
                  className="flex items-start gap-3 px-5 py-3.5 hover:bg-gray-50 cursor-pointer"
                  style={{ borderBottom: i < documentDeadlines.length - 1 ? '1px solid #F9F7F3' : 'none' }}
                  onClick={() => navigate('/app/reports')}
                >
                  <Icon size={14} style={{ color: st.color, marginTop: 2, flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <p style={{ color: '#1A1A1A', fontSize: 12, fontWeight: 600 }} className="truncate">{doc.title}</p>
                    <p style={{ color: '#9CA3AF', fontSize: 11, marginTop: 1 }}>{doc.dueDate}</p>
                  </div>
                  <span
                    className="px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ background: st.bg, color: st.color, fontSize: 10, fontWeight: 600 }}
                  >
                    {doc.status.toUpperCase()}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="px-5 py-3" style={{ borderTop: '1px solid #F3F4F6' }}>
            <button onClick={() => navigate('/app/reports')}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg"
              style={{ background: '#EEF2F7', color: '#3E5A78', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
              Consulter tous les rapports <ChevronRight size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Latest reports ── */}
      <div className="rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600 }}>Rapports disponibles</h3>
          <button className="flex items-center gap-1" style={{ color: '#3E5A78', fontSize: 12, fontWeight: 500 }}>
            Voir tous <ChevronRight size={13} />
          </button>
        </div>
        <ul>
          {boardReports.slice(0, 3).map((report, i) => (
            <li
              key={report.id}
              className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 cursor-pointer"
              style={{ borderBottom: i < 2 ? '1px solid #F9F7F3' : 'none' }}
            >
              <div
                className="flex items-center justify-center rounded-lg flex-shrink-0"
                style={{ width: 32, height: 32, background: '#EEF2F7' }}
              >
                <FileText size={14} style={{ color: '#3E5A78' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 500 }}>{report.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="px-2 py-0.5 rounded-full" style={{ background: '#F3F4F6', color: '#374151', fontSize: 10, fontWeight: 600 }}>
                    {report.type.toUpperCase()}
                  </span>
                  <span style={{ color: '#9CA3AF', fontSize: 11 }}>{report.date}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className="px-2 py-0.5 rounded-full" style={{ background: '#ECFDF5', color: '#065F46', fontSize: 10, fontWeight: 600 }}>
                  DISPONIBLE
                </span>
                <button className="p-1.5 rounded-lg hover:bg-gray-100 ml-1" title="Télécharger">
                  <Download size={13} style={{ color: '#6B7280' }} />
                </button>
                <button className="p-1.5 rounded-lg hover:bg-gray-100" title="Ouvrir">
                  <ExternalLink size={13} style={{ color: '#6B7280' }} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div style={{ height: 24 }} />

      {/* Toast export */}
      {showToast && <ExportToast onDone={() => setShowToast(false)} />}

      {/* Modale chargement rapport — réutilise UploadModal de ReportsPage */}
      {showUpload && (
        <UploadModal
          initialType="Mensuel"
          onClose={() => setShowUpload(false)}
          onUploaded={() => setShowUpload(false)}
        />
      )}
    </div>
  );
}

// ─── Toast simple ─────────────────────────────────────────────────────────────

function ExportToast({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-lg"
      style={{ background: '#1A1A1A', color: '#FFFFFF', maxWidth: 380 }}
    >
      <div className="w-2 h-2 rounded-full animate-pulse flex-shrink-0" style={{ background: '#065F46' }} />
      <p style={{ fontSize: 13, lineHeight: 1.5 }}>
        <strong>Export en cours…</strong> Le fichier sera disponible dans quelques secondes.
      </p>
    </div>
  );
}