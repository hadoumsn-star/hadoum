import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { FileText, Download, Eye, Search, Check, Loader2, Upload, X, Trash2 } from 'lucide-react';
import { reportsApi, type ApiReport } from '../services/reports.api';

type ReportType = 'all' | 'Mensuel' | 'Trimestriel' | 'Annuel' | 'Financier' | 'Audit';
type UploadType = 'Mensuel' | 'Trimestriel' | 'Annuel' | 'Audit';

const TYPE_COLOR: Record<string, { bg: string; color: string }> = {
  Mensuel:     { bg: '#EEF2F7', color: '#3E5A78' },
  Trimestriel: { bg: '#F5F3FF', color: '#7C3AED' },
  Annuel:      { bg: '#ECFDF5', color: '#065F46' },
  Financier:   { bg: '#FFFBEB', color: '#D97706' },
  Audit:       { bg: '#FEF2F2', color: '#B91C1C' },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────

export function UploadModal({ onClose, onUploaded, initialType = 'Mensuel' }: {
  onClose: () => void;
  onUploaded: (report: ApiReport) => void;
  initialType?: UploadType;
}) {
  const [title,      setTitle]      = useState('');
  const [type,       setType]       = useState<UploadType>(initialType);
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [file,       setFile]       = useState<File | null>(null);
  const [uploading,  setUploading]  = useState(false);
  const [error,      setError]      = useState('');

  const canSave = title.trim() && reportDate && file;

  const handleSave = async () => {
    if (!canSave) return;
    setUploading(true);
    setError('');
    try {
      const report = await reportsApi.upload(file!, title.trim(), type, reportDate);
      onUploaded(report);
    } catch (err: any) {
      setError(err.message ?? 'Erreur lors de l\'envoi.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(26,26,26,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-xl" style={{ background: '#FFFFFF' }}>

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
            <input value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Ex : Rapport mensuel — Mai 2026"
              autoFocus
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#FFFFFF', color: '#1A1A1A', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
          </div>

          {/* Type */}
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Type</label>
            <select value={type} onChange={e => setType(e.target.value as UploadType)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#FFFFFF', color: '#1A1A1A', fontSize: 13, outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }}>
              <option value="Mensuel">Mensuel</option>
              <option value="Trimestriel">Trimestriel</option>
              <option value="Annuel">Annuel</option>
              <option value="Audit">Audit</option>
            </select>
          </div>

          {/* Date */}
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>
              Date du rapport <span style={{ color: '#B91C1C' }}>*</span>
            </label>
            <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#FFFFFF', color: '#1A1A1A', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
          </div>

          {/* File picker */}
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>
              Fichier (PDF ou Word) <span style={{ color: '#B91C1C' }}>*</span>
            </label>
            <label className="w-full flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer"
              style={{ background: file ? '#ECFDF5' : '#F9F7F3', border: `1.5px dashed ${file ? '#A7F3D0' : '#D1D5DB'}` }}>
              <Upload size={16} style={{ color: file ? '#065F46' : '#9CA3AF', flexShrink: 0 }} />
              <span style={{ color: file ? '#065F46' : '#6B7280', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {file ? file.name : 'Sélectionner un fichier…'}
              </span>
              {file && <Check size={15} style={{ color: '#065F46', flexShrink: 0 }} />}
              <input type="file" className="hidden"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={e => setFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>

          {error && <p style={{ color: '#B91C1C', fontSize: 12 }}>{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-6 py-4" style={{ borderTop: '1px solid #F3F4F6', background: '#F9F7F3' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Annuler
          </button>
          <button onClick={handleSave} disabled={!canSave || uploading}
            className="flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2"
            style={{ background: canSave ? '#3E5A78' : '#E5E7EB', color: canSave ? '#FFFFFF' : '#9CA3AF', fontSize: 13, fontWeight: 600, border: 'none', cursor: canSave ? 'pointer' : 'not-allowed' }}>
            {uploading
              ? <><Loader2 size={14} className="animate-spin" /> Envoi…</>
              : <><Check size={14} /> Enregistrer</>}
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

  const [reports,     setReports]     = useState<ApiReport[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [typeFilter,  setTypeFilter]  = useState<ReportType>('all');
  const [showUpload,  setShowUpload]  = useState(false);
  const [actionId,    setActionId]    = useState<string | null>(null);
  const [confirmId,   setConfirmId]   = useState<string | null>(null);
  const [deleting,    setDeleting]    = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    setConfirmId(null);
    try {
      await reportsApi.delete(id);
      setReports(prev => prev.filter(r => r.id !== id));
    } catch {
      alert('Erreur lors de la suppression du rapport.');
    } finally {
      setDeleting(null);
    }
  };

  useEffect(() => {
    reportsApi.list()
      .then(setReports)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = reports
    .filter(r => {
      const q = search.toLowerCase();
      return (!q || r.title.toLowerCase().includes(q))
        && (typeFilter === 'all' || r.type === typeFilter);
    })
    .sort((a, b) => new Date(b.reportDate).getTime() - new Date(a.reportDate).getTime());

  const openPresigned = async (id: string, download = false) => {
    setActionId(id);
    try {
      const { url } = await reportsApi.getUrl(id);
      if (download) {
        const a = document.createElement('a');
        a.href = url;
        a.download = '';
        a.click();
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch {
      alert('Impossible d\'accéder au fichier.');
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="px-4 md:px-6 py-6 space-y-5" style={{ maxWidth: 1000 }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>Rapports</h2>
          <p style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>
            {reports.length} rapport{reports.length !== 1 ? 's' : ''} disponible{reports.length !== 1 ? 's' : ''}
            {!canUpload && <span style={{ color: '#9CA3AF' }}> · Consultation uniquement</span>}
          </p>
        </div>
        {canUpload && (
          <button onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg self-start"
            style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
            <Upload size={16} /> Charger un rapport
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1" style={{ minWidth: 200 }}>
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un rapport…"
            className="w-full pl-9 py-2 rounded-lg outline-none"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#1A1A1A', fontSize: 13, paddingRight: 12 }} />
        </div>
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid #E5E7EB' }}>
          {(['all', 'Mensuel', 'Trimestriel', 'Annuel', 'Financier', 'Audit'] as ReportType[]).map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className="px-3 py-2"
              style={{ background: typeFilter === t ? '#3E5A78' : '#FFFFFF', color: typeFilter === t ? '#FFFFFF' : '#374151', fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {t === 'all' ? 'Tous' : t}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin" style={{ color: '#9CA3AF' }} />
          </div>
        ) : (
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
              {filtered.map(r => {
                const tc = TYPE_COLOR[r.type] ?? { bg: '#F3F4F6', color: '#374151' };
                const busy = actionId === r.id;
                return (
                  <tr key={r.id} className="hover:bg-gray-50" style={{ borderTop: '1px solid #F3F4F6' }}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center rounded-lg flex-shrink-0"
                          style={{ width: 32, height: 32, background: '#EEF2F7' }}>
                          <FileText size={14} style={{ color: '#3E5A78' }} />
                        </div>
                        <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 500 }}>{r.title}</p>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="px-2 py-0.5 rounded-full"
                        style={{ background: tc.bg, color: tc.color, fontSize: 11, fontWeight: 600 }}>
                        {r.type.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span style={{ color: '#6B7280', fontSize: 13 }}>{fmtDate(r.reportDate)}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="px-2 py-0.5 rounded-full"
                        style={{ background: '#ECFDF5', color: '#065F46', fontSize: 11, fontWeight: 600 }}>
                        DISPONIBLE
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {/* Inline delete confirmation */}
                        {canUpload && confirmId === r.id ? (
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
                            style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
                            <span style={{ color: '#B91C1C', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>Supprimer ?</span>
                            <button
                              onClick={() => handleDelete(r.id)}
                              className="px-2 py-0.5 rounded"
                              style={{ background: '#B91C1C', color: '#FFFFFF', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                              Oui
                            </button>
                            <button
                              onClick={() => setConfirmId(null)}
                              className="px-2 py-0.5 rounded hover:bg-red-100"
                              style={{ background: 'transparent', color: '#6B7280', fontSize: 11, border: 'none', cursor: 'pointer' }}>
                              Non
                            </button>
                          </div>
                        ) : (
                          <>
                            {/* Download */}
                            <button onClick={() => openPresigned(r.id, true)} disabled={busy || deleting === r.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
                              style={{ background: '#EEF2F7', color: '#3E5A78', fontSize: 12, fontWeight: 500, border: 'none', cursor: busy ? 'wait' : 'pointer' }}>
                              {busy ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                              Télécharger
                            </button>
                            {/* View */}
                            <button onClick={() => openPresigned(r.id, false)} disabled={busy || deleting === r.id}
                              className="flex items-center justify-center rounded-lg hover:bg-gray-100" title="Voir le rapport"
                              style={{ width: 30, height: 30, border: 'none', cursor: busy ? 'wait' : 'pointer', background: 'transparent' }}>
                              <Eye size={14} style={{ color: '#6B7280' }} />
                            </button>
                            {/* Delete — directors only */}
                            {canUpload && (
                              <button onClick={() => setConfirmId(r.id)} disabled={deleting === r.id}
                                className="p-1.5 rounded-lg hover:bg-red-50" title="Supprimer"
                                style={{ border: 'none', cursor: 'pointer', background: 'transparent' }}>
                                {deleting === r.id
                                  ? <Loader2 size={13} className="animate-spin" style={{ color: '#B91C1C' }} />
                                  : <Trash2 size={13} style={{ color: '#B91C1C' }} />}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!loading && filtered.length === 0 && (
          <div className="px-5 py-12 text-center">
            <p style={{ color: '#9CA3AF', fontSize: 14 }}>
              {reports.length === 0 ? 'Aucun rapport chargé pour l\'instant.' : 'Aucun rapport trouvé.'}
            </p>
          </div>
        )}
      </div>

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onUploaded={report => {
            setReports(prev => [report, ...prev]);
            setShowUpload(false);
          }}
        />
      )}
    </div>
  );
}
