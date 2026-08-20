import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  X, FileText, Download, Eye, Send, RefreshCw, Upload, Trash2, CheckCircle2, ImageOff, ShieldCheck,
} from 'lucide-react';
import {
  donorReportsApi, type ApiDonorReport, type ApiDonorReportPhoto,
} from '../../services/donorReports.api';
import { PERIOD_TYPE_LABELS, REPORT_STATUS_LABELS, REPORT_STATUS_STYLE } from '../../config/donors.config';
import { formatXof } from '../../config/financeCategories.config';

const LABEL: React.CSSProperties = {
  color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 6,
};

export interface DonorReportDetailModalProps {
  reportId: string;
  isDirector: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export function DonorReportDetailModal({ reportId, isDirector, onClose, onChanged }: DonorReportDetailModalProps) {
  const [report, setReport] = useState<ApiDonorReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [narrative, setNarrative] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);

  const load = () =>
    donorReportsApi.get(reportId).then((r) => { setReport(r); setNarrative(r.activitiesNarrative ?? ''); })
      .catch(() => toast.error('Erreur lors du chargement du rapport.'));

  useEffect(() => { load().finally(() => setLoading(false)); }, [reportId]);

  const editable = isDirector && report?.status !== 'SENT';

  async function handleGenerate() {
    if (!report) return;
    setBusy(true);
    try {
      const updated = await donorReportsApi.generate(report.id, narrative.trim() || undefined);
      setReport(updated);
      toast.success(report.status === 'DRAFT' ? 'PDF généré.' : 'PDF régénéré.');
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur lors de la génération du PDF.');
    } finally {
      setBusy(false);
    }
  }

  async function handleMarkSent() {
    if (!report) return;
    setBusy(true);
    try {
      const updated = await donorReportsApi.markSent(report.id);
      setReport(updated);
      setConfirmSend(false);
      toast.success('Rapport marqué comme envoyé.');
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors du marquage comme envoyé.");
      setConfirmSend(false);
    } finally {
      setBusy(false);
    }
  }

  async function handlePreview() {
    if (!report) return;
    try {
      const { url } = await donorReportsApi.getFileUrl(report.id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error("Impossible d'ouvrir le PDF.");
    }
  }

  async function handleDownload() {
    if (!report) return;
    try {
      const { url } = await donorReportsApi.getFileUrl(report.id);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rapport-${report.donorProfile.contact.fullName}-${report.periodStart}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      toast.error('Impossible de télécharger le PDF.');
    }
  }

  async function handleUploadPhoto(file: File) {
    if (!report) return;
    setUploadingPhoto(true);
    try {
      // PR 19: pass the original filename as the caption — without it every
      // row in the list below fell back to the generic "Photo" text,
      // making multiple uploads indistinguishable from one another.
      await donorReportsApi.uploadPhoto(report.id, file, file.name);
      await load();
      toast.success('Photo ajoutée.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'envoi de la photo.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleApprovePhoto(photo: ApiDonorReportPhoto) {
    if (!report) return;
    try {
      await donorReportsApi.approvePhoto(report.id, photo.id);
      await load();
      toast.success('Photo approuvée pour le rapport.');
    } catch {
      toast.error("Erreur lors de l'approbation de la photo.");
    }
  }

  async function handleDeletePhoto(photo: ApiDonorReportPhoto) {
    if (!report) return;
    if (!window.confirm('Supprimer cette photo ?')) return;
    try {
      await donorReportsApi.deletePhoto(report.id, photo.id);
      await load();
    } catch {
      toast.error('Erreur lors de la suppression de la photo.');
    }
  }

  async function handleViewPhoto(photo: ApiDonorReportPhoto) {
    if (!report) return;
    try {
      const { url } = await donorReportsApi.getPhotoUrl(report.id, photo.id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error("Impossible d'ouvrir la photo.");
    }
  }

  if (loading || !report) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
        <div className="rounded-2xl flex items-center justify-center" style={{ background: '#FFFFFF', width: 400, height: 300 }}>
          <p style={{ color: '#9CA3AF', fontSize: 13 }}>Chargement…</p>
        </div>
      </div>
    );
  }

  const statusStyle = REPORT_STATUS_STYLE[report.status];
  const snapshot = report.financialSummarySnapshot;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        data-testid="donor-report-detail-modal"
        style={{ background: 'rgba(0,0,0,0.45)' }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FFFFFF', maxHeight: '90vh' }}>
          <div className="flex items-start justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
            <div className="flex-1 min-w-0 pr-3">
              <span className="inline-block px-2 py-0.5 rounded-full mb-1.5" style={{ background: statusStyle.bg, color: statusStyle.color, fontSize: 10, fontWeight: 700 }}>
                {REPORT_STATUS_LABELS[report.status].toUpperCase()}
              </span>
              <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>{report.donorProfile.contact.fullName}</h3>
              <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>
                {PERIOD_TYPE_LABELS[report.periodType]} · Du {new Date(report.periodStart).toLocaleDateString('fr-FR')} au {new Date(report.periodEnd).toLocaleDateString('fr-FR')}
              </p>
            </div>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100 flex-shrink-0" aria-label="Fermer">
              <X size={18} style={{ color: '#9CA3AF' }} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {snapshot && (
              <div>
                <p style={LABEL}>RÉSUMÉ FINANCIER (au moment de la génération)</p>
                <div className="rounded-xl p-3.5 space-y-1.5" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
                  <div className="flex justify-between">
                    <span style={{ color: '#374151', fontSize: 13 }}>Contributions de ce donateur</span>
                    <span style={{ color: '#065F46', fontSize: 13, fontWeight: 700 }}>{formatXof(snapshot.donorContributionXof)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: '#374151', fontSize: 13 }}>Nombre de dons</span>
                    <span style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 600 }}>{snapshot.donorContributionCount}</span>
                  </div>
                  {snapshot.campaignContributions.length > 0 && (
                    <div className="pt-1.5 mt-1.5" style={{ borderTop: '1px solid #E5E7EB' }}>
                      {snapshot.campaignContributions.map((c) => (
                        <div key={c.campaignTitle} className="flex justify-between">
                          <span style={{ color: '#6B7280', fontSize: 12 }}>{c.campaignTitle}</span>
                          <span style={{ color: '#6B7280', fontSize: 12 }}>{formatXof(c.amountXof)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div>
              <p style={LABEL}>RÉSUMÉ DES ACTIVITÉS</p>
              {editable ? (
                <textarea
                  value={narrative}
                  onChange={(e) => setNarrative(e.target.value)}
                  rows={3}
                  placeholder="Texte libre décrivant la période…"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', color: '#1A1A1A', fontSize: 13, resize: 'none', boxSizing: 'border-box' }}
                />
              ) : (
                <p style={{ color: '#374151', fontSize: 13, lineHeight: 1.6 }}>{report.activitiesNarrative || 'Aucun résumé fourni.'}</p>
              )}
            </div>

            <div>
              <p style={LABEL}>PHOTOS ({report.photos.length})</p>
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg mb-3" style={{ background: '#EEF2F7', color: '#3E5A78' }}>
                <ShieldCheck size={15} style={{ flexShrink: 0 }} />
                <p style={{ fontSize: 12, fontWeight: 500 }}>Seules les photos approuvées seront incluses dans le rapport envoyé au parrain.</p>
              </div>

              {report.photos.length === 0 ? (
                <div className="flex items-center gap-2 py-4 justify-center" style={{ color: '#9CA3AF' }}>
                  <ImageOff size={16} /> <span style={{ fontSize: 13 }}>Aucune photo</span>
                </div>
              ) : (
                <div className="space-y-2 mb-3">
                  {report.photos.map((p) => (
                    <div key={p.id} className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
                      <button onClick={() => handleViewPhoto(p)} title="Voir" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3E5A78', flexShrink: 0 }}>
                        <Eye size={14} />
                      </button>
                      <p className="flex-1 min-w-0" style={{ color: '#374151', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.caption || 'Photo'}
                      </p>
                      <span
                        className="px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{
                          background: p.approvedForDonorReport ? '#D1FAE5' : '#F3F4F6',
                          color: p.approvedForDonorReport ? '#065F46' : '#6B7280',
                          fontSize: 10, fontWeight: 700,
                        }}
                      >
                        {p.approvedForDonorReport ? 'Approuvée' : 'En attente'}
                      </span>
                      {editable && !p.approvedForDonorReport && (
                        <button onClick={() => handleApprovePhoto(p)} title="Approuver" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#065F46', flexShrink: 0 }}>
                          <CheckCircle2 size={14} />
                        </button>
                      )}
                      {editable && (
                        <button onClick={() => handleDeletePhoto(p)} title="Supprimer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B91C1C', flexShrink: 0 }}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {editable && (
                <label className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer" style={{ border: '1px solid #E5E7EB', background: '#FAFAFA' }}>
                  <Upload size={14} style={{ color: '#9CA3AF', flexShrink: 0 }} />
                  <span style={{ flex: 1, color: '#6B7280', fontSize: 13 }}>{uploadingPhoto ? 'Envoi en cours…' : 'Ajouter une photo (JPEG, PNG)…'}</span>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/jpeg,image/png"
                    disabled={uploadingPhoto}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadPhoto(f); e.target.value = ''; }}
                  />
                </label>
              )}
            </div>
          </div>

          <div className="px-6 py-4 flex flex-wrap items-center gap-2" style={{ borderTop: '1px solid #F3F4F6', background: '#F9F7F3' }}>
            {report.status === 'DRAFT' && isDirector && (
              <button disabled={busy} onClick={handleGenerate} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 600, border: 'none', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1 }}>
                <FileText size={13} /> Générer le PDF
              </button>
            )}

            {report.status === 'GENERATED' && (
              <>
                <button onClick={handlePreview} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                  style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                  <Eye size={13} /> Aperçu
                </button>
                <button onClick={handleDownload} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                  style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                  <Download size={13} /> Télécharger
                </button>
                {isDirector && (
                  <>
                    <button disabled={busy} onClick={handleGenerate} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                      style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1 }}>
                      <RefreshCw size={13} /> Régénérer
                    </button>
                    <button onClick={() => setConfirmSend(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                      style={{ background: '#065F46', color: '#FFFFFF', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                      <Send size={13} /> Marquer comme envoyé
                    </button>
                  </>
                )}
              </>
            )}

            {report.status === 'SENT' && (
              <>
                <button onClick={handlePreview} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                  style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                  <Eye size={13} /> Aperçu
                </button>
                <button onClick={handleDownload} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                  style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                  <Download size={13} /> Télécharger
                </button>
                <p style={{ color: '#9CA3AF', fontSize: 12 }}>Rapport envoyé — plus de modification possible.</p>
              </>
            )}
          </div>
        </div>
      </div>

      {confirmSend && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmSend(false); }}>
          <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl" style={{ background: '#FFFFFF' }}>
            <div className="px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
              <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>Marquer ce rapport comme envoyé ?</h3>
            </div>
            <div className="px-6 py-5">
              <p style={{ color: '#6B7280', fontSize: 13 }}>
                Cette action est définitive : après envoi, les photos ne pourront plus être modifiées.
              </p>
            </div>
            <div className="flex gap-2 px-6 py-4" style={{ borderTop: '1px solid #F3F4F6' }}>
              <button onClick={() => setConfirmSend(false)} className="flex-1 py-2.5 rounded-lg"
                style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                Retour
              </button>
              <button disabled={busy} onClick={handleMarkSent} className="flex-1 py-2.5 rounded-lg"
                style={{ background: '#065F46', color: '#FFFFFF', fontSize: 13, fontWeight: 600, border: 'none', cursor: busy ? 'not-allowed' : 'pointer' }}>
                Confirmer l'envoi
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
