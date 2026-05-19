import { useState } from 'react';
import { boardReports } from '../data/mockData';
import { useAuth } from '../context/AuthContext';
import { FileText, Download, ExternalLink, Plus, Search, Check, Loader2, Upload, X } from 'lucide-react';

type ReportType = 'all' | 'Mensuel' | 'Trimestriel' | 'Annuel' | 'Financier';

const TYPE_COLOR: Record<string, { bg: string; color: string }> = {
  Mensuel:     { bg: '#EEF2F7', color: '#3E5A78' },
  Trimestriel: { bg: '#F5F3FF', color: '#7C3AED' },
  Annuel:      { bg: '#ECFDF5', color: '#065F46' },
  Financier:   { bg: '#FFFBEB', color: '#D97706' },
  Audit:       { bg: '#FEF2F2', color: '#B91C1C' },
};

const ALL_REPORTS = [
  ...boardReports,
  { id: 5, title: 'Rapport mensuel — Mars 2026',   date: '01 Avr 2026', status: 'disponible' as const, type: 'Mensuel' },
  { id: 6, title: 'Rapport mensuel — Fév 2026',    date: '01 Mar 2026', status: 'disponible' as const, type: 'Mensuel' },
  { id: 7, title: 'Rapport trimestriel — T4 2025', date: '01 Jan 2026', status: 'disponible' as const, type: 'Trimestriel' },
  { id: 8, title: 'Rapport mensuel — Jan 2026',    date: '01 Fév 2026', status: 'disponible' as const, type: 'Mensuel' },
];

// ─── Upload Modal ─────────────────────────────────────────────────────────────

type UploadType = 'Mensuel' | 'Trimestriel' | 'Annuel' | 'Audit';

export function UploadModal({ onClose, onSave, initialType = 'Mensuel' }: {
  onClose: () => void;
  onSave: (title: string, type: UploadType, fileName: string | null) => void;
  initialType?: UploadType;
}) {
  const [title,    setTitle]    = useState('');
  const [type,     setType]     = useState<UploadType>(initialType);
  const [fileName, setFileName] = useState<string | null>(null);
  const [reportDate, setReportDate] = useState('');

  const canSave = title.trim().length > 0 && !!reportDate;

  const handleFileClick = () => {
    setFileName('rapport-' + type.toLowerCase() + '-2026.pdf');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(26,26,26,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm sm:max-w-md rounded-2xl overflow-hidden shadow-xl" style={{ background: '#FFFFFF' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 17, fontWeight: 700 }}>Charger un rapport</h3>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100">
            <X size={18} style={{ color: '#9CA3AF' }} />
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-4">
          {/* Title */}
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>
              Titre du rapport <span style={{ color: '#B91C1C' }}>*</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex : Rapport mensuel — Mai 2026"
              style={{
                width: '100%', padding: '9px 12px', borderRadius: 8,
                border: `1px solid ${!title.trim() ? '#FECACA' : '#E5E7EB'}`,
                background: '#FFFFFF', color: '#1A1A1A', fontSize: 13,
                outline: 'none', boxSizing: 'border-box',
              }}
              autoFocus
            />
            {!title.trim() && (
              <p style={{ color: '#B91C1C', fontSize: 11, marginTop: 4 }}>Le titre est obligatoire.</p>
            )}
          </div>

          {/* Type */}
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>
              Type de rapport
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as UploadType)}
              style={{
                width: '100%', padding: '9px 12px', borderRadius: 8,
                border: '1px solid #E5E7EB', background: '#FFFFFF', color: '#1A1A1A',
                fontSize: 13, outline: 'none', cursor: 'pointer', boxSizing: 'border-box',
              }}
            >
              <option value="Mensuel">Mensuel</option>
              <option value="Trimestriel">Trimestriel</option>
              <option value="Annuel">Annuel</option>
              <option value="Audit">Audit</option>
            </select>
          </div>

          {/* Date du rapport */}
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>
              Date du rapport <span style={{ color: '#B91C1C' }}>*</span>
            </label>
            <input
              type="date"
              value={reportDate}
              onChange={e => setReportDate(e.target.value)}
              style={{
                width: '100%', padding: '9px 12px', borderRadius: 8,
                border: `1px solid ${!reportDate ? '#FECACA' : '#E5E7EB'}`,
                background: '#FFFFFF', color: '#1A1A1A', fontSize: 13,
                outline: 'none', boxSizing: 'border-box',
              }}
            />
            {!reportDate && (
              <p style={{ color: '#B91C1C', fontSize: 11, marginTop: 4 }}>La date est obligatoire.</p>
            )}
          </div>

          {/* File upload */}
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>
              Fichier (PDF ou Word)
            </label>
            <button
              type="button"
              onClick={handleFileClick}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
              style={{
                background: fileName ? '#ECFDF5' : '#F9F7F3',
                border: `1.5px dashed ${fileName ? '#A7F3D0' : '#D1D5DB'}`,
                cursor: 'pointer',
              }}
            >
              <Upload size={16} style={{ color: fileName ? '#065F46' : '#9CA3AF', flexShrink: 0 }} />
              <span style={{ color: fileName ? '#065F46' : '#6B7280', fontSize: 13 }}>
                {fileName ?? 'Sélectionner un fichier…'}
              </span>
              {fileName && <Check size={15} style={{ color: '#065F46', marginLeft: 'auto' }} />}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-6 py-4" style={{ borderTop: '1px solid #F3F4F6', background: '#F9F7F3' }}>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
          >
            Annuler
          </button>
          <button
            onClick={() => canSave && onSave(title.trim(), type, fileName)}
            disabled={!canSave}
            className="flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2"
            style={{
              background: canSave ? '#3E5A78' : '#E5E7EB',
              color: canSave ? '#FFFFFF' : '#9CA3AF',
              fontSize: 13, fontWeight: 600, border: 'none',
              cursor: canSave ? 'pointer' : 'not-allowed',
            }}
          >
            <Check size={14} /> Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ReportsPage() {
  const { user } = useAuth();
  const canUpload = user?.role === 'director';

  const [reports, setReports]       = useState(ALL_REPORTS);
  const [search, setSearch]         = useState('');
  const [typeFilter, setTypeFilter] = useState<ReportType>('all');
  const [downloading, setDownloading] = useState<number | null>(null);
  const [downloaded, setDownloaded]   = useState<number[]>([]);
  const [showUpload, setShowUpload]   = useState(false);

  const filtered = reports.filter((r) => {
    const q = search.toLowerCase();
    return (!q || r.title.toLowerCase().includes(q))
      && (typeFilter === 'all' || r.type === typeFilter);
  });

  const handleDownload = (id: number) => {
    setDownloading(id);
    setTimeout(() => {
      setDownloading(null);
      setDownloaded((prev) => [...prev, id]);
      setTimeout(() => setDownloaded((prev) => prev.filter((x) => x !== id)), 3000);
    }, 1200);
  };

  const handleSaveReport = (title: string, type: UploadType, _fileName: string | null) => {
    const newReport = {
      id: Math.max(...reports.map((r) => r.id)) + 1,
      title,
      date: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }),
      status: 'disponible' as const,
      type,
    };
    setReports((prev) => [newReport, ...prev]);
    setShowUpload(false);
  };

  return (
    <div className="px-4 md:px-6 py-6 space-y-5" style={{ maxWidth: 1000 }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>Rapports</h2>
          <p style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>
            {reports.length} rapports disponibles
            {!canUpload && <span style={{ color: '#9CA3AF' }}> · Consultation et téléchargement uniquement</span>}
          </p>
        </div>
        {canUpload && (
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg self-start"
            style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer' }}
          >
            <Upload size={16} /> Charger un rapport
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-start gap-3 flex-wrap">
        <div className="relative flex-1" style={{ minWidth: 200 }}>
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un rapport…"
            className="w-full pl-9 py-2 rounded-lg outline-none"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#1A1A1A', fontSize: 13, paddingRight: 12 }} />
        </div>
        <div className="flex rounded-lg" style={{ border: '1px solid #E5E7EB', overflowX: 'auto', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', flexShrink: 0 }}>
          {(['all', 'Mensuel', 'Trimestriel', 'Annuel', 'Financier', 'Audit'] as (ReportType | 'Audit')[]).map((t) => (
            <button key={t} onClick={() => setTypeFilter(t as ReportType)}
              className="px-3 py-2 flex-shrink-0"
              style={{ background: typeFilter === t ? '#3E5A78' : '#FFFFFF', color: typeFilter === t ? '#FFFFFF' : '#374151', fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', scrollSnapAlign: 'start' }}>
              {t === 'all' ? 'Tous' : t}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F9F7F3' }}>
              {['Rapport', 'Type', 'Date', 'Statut', ''].map((h, i) => (
                <th key={i} className={`text-left px-5 py-3 ${i === 4 ? 'text-right' : ''}`}
                  style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em' }}>
                  {h.toUpperCase()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const tc = TYPE_COLOR[r.type] ?? { bg: '#F3F4F6', color: '#374151' };
              const isDl = downloading === r.id;
              const isDone = downloaded.includes(r.id);
              return (
                <tr key={r.id} className="hover:bg-gray-50" style={{ borderTop: '1px solid #F3F4F6' }}>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center rounded-lg flex-shrink-0" style={{ width: 32, height: 32, background: '#EEF2F7' }}>
                        <FileText size={14} style={{ color: '#3E5A78' }} />
                      </div>
                      <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 500 }}>{r.title}</p>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className="px-2 py-0.5 rounded-full" style={{ background: tc.bg, color: tc.color, fontSize: 11, fontWeight: 600 }}>
                      {r.type.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-5 py-4"><span style={{ color: '#6B7280', fontSize: 13 }}>{r.date}</span></td>
                  <td className="px-5 py-4">
                    <span className="px-2 py-0.5 rounded-full" style={{ background: '#ECFDF5', color: '#065F46', fontSize: 11, fontWeight: 600 }}>
                      DISPONIBLE
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => handleDownload(r.id)} disabled={isDl}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all"
                        style={{
                          background: isDone ? '#ECFDF5' : '#EEF2F7',
                          color: isDone ? '#065F46' : '#3E5A78',
                          fontSize: 12, fontWeight: 500, border: 'none', cursor: isDl ? 'wait' : 'pointer',
                        }}>
                        {isDl ? <Loader2 size={12} className="animate-spin" /> : isDone ? <Check size={12} /> : <Download size={12} />}
                        {isDl ? 'Export…' : isDone ? 'Téléchargé' : 'Télécharger'}
                      </button>
                      <button className="p-1.5 rounded-lg hover:bg-gray-100" title="Ouvrir">
                        <ExternalLink size={13} style={{ color: '#6B7280' }} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="px-5 py-12 text-center">
            <p style={{ color: '#9CA3AF', fontSize: 14 }}>Aucun rapport trouvé.</p>
          </div>
        )}
      </div>

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onSave={handleSaveReport}
        />
      )}
    </div>
  );
}