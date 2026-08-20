import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { X, Pencil, PlayCircle, CheckCircle2, Ban, Upload, Paperclip, Trash2, Eye } from 'lucide-react';
import { campaignsApi, type ApiCampaign, type ApiCampaignDocument } from '../../services/campaigns.api';
import { donationsApi, type ApiDonation } from '../../services/donations.api';
import { CAMPAIGN_STATUS_LABELS, CAMPAIGN_STATUS_STYLE } from '../../config/donors.config';
import { formatXof } from '../../config/financeCategories.config';
import { CampaignProgressBar } from './CampaignProgressBar';

export interface CampaignDetailModalProps {
  campaignId: string;
  isDirector: boolean;
  onClose: () => void;
  onEdit: (campaign: ApiCampaign) => void;
  onChanged: () => void;
}

export function CampaignDetailModal({ campaignId, isDirector, onClose, onEdit, onChanged }: CampaignDetailModalProps) {
  const [campaign, setCampaign] = useState<ApiCampaign | null>(null);
  const [donations, setDonations] = useState<ApiDonation[]>([]);
  const [documents, setDocuments] = useState<ApiCampaignDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'terminate' | 'cancel' | null>(null);

  const load = () =>
    Promise.all([
      campaignsApi.get(campaignId),
      donationsApi.list({ campaignId, pageSize: 50 }),
      campaignsApi.listDocuments(campaignId),
    ]).then(([c, don, docs]) => { setCampaign(c); setDonations(don.data); setDocuments(docs); })
      .catch(() => toast.error('Erreur lors du chargement de la cagnotte.'));

  useEffect(() => { load().finally(() => setLoading(false)); }, [campaignId]);

  async function handleTransition(action: 'activate' | 'terminate' | 'cancel') {
    try {
      const updated = await (action === 'activate' ? campaignsApi.activate(campaignId)
        : action === 'terminate' ? campaignsApi.terminate(campaignId)
        : campaignsApi.cancel(campaignId));
      setCampaign(updated);
      toast.success('Statut de la cagnotte mis à jour.');
      setConfirmAction(null);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Transition impossible dans cet état.');
      setConfirmAction(null);
    }
  }

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      // PR 19: pass the original filename as the label — without it every
      // row in the list below fell back to the generic "Document" text,
      // making multiple uploads indistinguishable from one another.
      await campaignsApi.uploadDocument(campaignId, file, file.name);
      await load();
      toast.success('Document ajouté.');
    } catch {
      toast.error("Erreur lors de l'envoi du document.");
    } finally {
      setUploading(false);
    }
  }

  async function handleViewDocument(documentId: string) {
    try {
      const { url } = await campaignsApi.getDocumentUrl(campaignId, documentId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error("Impossible d'ouvrir le document.");
    }
  }

  async function handleDeleteDocument(documentId: string) {
    if (!window.confirm('Supprimer ce document ?')) return;
    try {
      await campaignsApi.deleteDocument(campaignId, documentId);
      await load();
    } catch {
      toast.error('Erreur lors de la suppression.');
    }
  }

  if (loading || !campaign) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
        <div className="rounded-2xl flex items-center justify-center" style={{ background: '#FFFFFF', width: 400, height: 300 }}>
          <p style={{ color: '#9CA3AF', fontSize: 13 }}>Chargement…</p>
        </div>
      </div>
    );
  }

  const statusStyle = CAMPAIGN_STATUS_STYLE[campaign.status];

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        data-testid="campaign-detail-modal"
        style={{ background: 'rgba(0,0,0,0.45)' }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FFFFFF', maxHeight: '90vh' }}>
          <div className="flex items-start justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
            <div className="flex-1 min-w-0 pr-3">
              <span className="inline-block px-2 py-0.5 rounded-full mb-1.5" style={{ background: statusStyle.bg, color: statusStyle.color, fontSize: 10, fontWeight: 700 }}>
                {CAMPAIGN_STATUS_LABELS[campaign.status].toUpperCase()}
              </span>
              <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>{campaign.title}</h3>
            </div>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100 flex-shrink-0" aria-label="Fermer">
              <X size={18} style={{ color: '#9CA3AF' }} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            <CampaignProgressBar campaign={campaign} />

            {campaign.description && (
              <div>
                <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 6 }}>DESCRIPTION</p>
                <p style={{ color: '#374151', fontSize: 13, lineHeight: 1.6 }}>{campaign.description}</p>
              </div>
            )}

            <div>
              <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 6 }}>PÉRIODE</p>
              <p style={{ color: '#374151', fontSize: 13 }}>
                Du {new Date(campaign.startDate).toLocaleDateString('fr-FR')}
                {campaign.endDate && ` au ${new Date(campaign.endDate).toLocaleDateString('fr-FR')}`}
              </p>
            </div>

            {campaign.utilizationReport && (
              <div>
                <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 6 }}>UTILISATION DES FONDS</p>
                <p style={{ color: '#374151', fontSize: 13, lineHeight: 1.6 }}>{campaign.utilizationReport}</p>
              </div>
            )}

            <div>
              <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 8 }}>DONS ({donations.length})</p>
              {donations.length === 0 ? (
                <p style={{ color: '#9CA3AF', fontSize: 13 }}>Aucun don reçu pour cette cagnotte.</p>
              ) : (
                <div className="space-y-2">
                  {donations.map((d) => (
                    <div key={d.id} className="flex items-center justify-between rounded-xl px-3.5 py-2.5" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
                      <div>
                        <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 600 }}>{d.donorProfile.contact.fullName}</p>
                        <p style={{ color: '#9CA3AF', fontSize: 11, marginTop: 1 }}>{new Date(d.date).toLocaleDateString('fr-FR')}</p>
                      </div>
                      <p style={{ color: '#065F46', fontSize: 13, fontWeight: 700 }}>{formatXof(d.amountXof)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 8 }}>DOCUMENTS</p>
              {documents.length > 0 && (
                <div className="space-y-2 mb-3">
                  {documents.map((doc) => (
                    <div key={doc.id} className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
                      <Paperclip size={13} style={{ color: '#6B7280', flexShrink: 0 }} />
                      <p className="flex-1 min-w-0" style={{ color: '#374151', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {doc.label || 'Document'}
                      </p>
                      <button onClick={() => handleViewDocument(doc.id)} title="Voir" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3E5A78', flexShrink: 0 }}>
                        <Eye size={14} />
                      </button>
                      {isDirector && (
                        <button onClick={() => handleDeleteDocument(doc.id)} title="Supprimer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B91C1C', flexShrink: 0 }}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {isDirector && (
                <label className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer" style={{ border: '1px solid #E5E7EB', background: '#FAFAFA' }}>
                  <Upload size={14} style={{ color: '#9CA3AF', flexShrink: 0 }} />
                  <span style={{ flex: 1, color: '#6B7280', fontSize: 13 }}>{uploading ? 'Envoi en cours…' : 'Ajouter un document…'}</span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                    disabled={uploading}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }}
                  />
                </label>
              )}
            </div>
          </div>

          {isDirector && (
            <div className="px-6 py-4 flex flex-wrap items-center gap-2" style={{ borderTop: '1px solid #F3F4F6', background: '#F9F7F3' }}>
              {campaign.status === 'BROUILLON' && (
                <>
                  <button onClick={() => onEdit(campaign)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                    style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                    <Pencil size={13} /> Modifier
                  </button>
                  <button onClick={() => handleTransition('activate')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                    style={{ background: '#065F46', color: '#FFFFFF', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                    <PlayCircle size={13} /> Activer
                  </button>
                  <button onClick={() => setConfirmAction('cancel')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                    style={{ background: '#FFFFFF', border: '1px solid #FECACA', color: '#B91C1C', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                    <Ban size={13} /> Annuler
                  </button>
                </>
              )}
              {campaign.status === 'ACTIVE' && (
                <>
                  <button onClick={() => onEdit(campaign)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                    style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                    <Pencil size={13} /> Modifier
                  </button>
                  <button onClick={() => setConfirmAction('terminate')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                    style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                    <CheckCircle2 size={13} /> Terminer
                  </button>
                  <button onClick={() => setConfirmAction('cancel')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                    style={{ background: '#FFFFFF', border: '1px solid #FECACA', color: '#B91C1C', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                    <Ban size={13} /> Annuler
                  </button>
                </>
              )}
              {(campaign.status === 'TERMINEE' || campaign.status === 'ANNULEE') && (
                <p style={{ color: '#9CA3AF', fontSize: 13 }}>Cette cagnotte est clôturée — aucune action supplémentaire.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {confirmAction && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmAction(null); }}>
          <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl" style={{ background: '#FFFFFF' }}>
            <div className="px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
              <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>
                {confirmAction === 'cancel' ? 'Annuler la cagnotte ?' : 'Terminer la cagnotte ?'}
              </h3>
            </div>
            <div className="px-6 py-5">
              <p style={{ color: '#6B7280', fontSize: 13 }}>
                {confirmAction === 'cancel'
                  ? 'Cette action est définitive : la cagnotte sera annulée et ne pourra plus recevoir de dons.'
                  : 'Cette action est définitive : la cagnotte sera marquée comme terminée et ne pourra plus recevoir de dons.'}
              </p>
            </div>
            <div className="flex gap-2 px-6 py-4" style={{ borderTop: '1px solid #F3F4F6' }}>
              <button onClick={() => setConfirmAction(null)} className="flex-1 py-2.5 rounded-lg"
                style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                Retour
              </button>
              <button onClick={() => handleTransition(confirmAction)} className="flex-1 py-2.5 rounded-lg"
                style={{ background: '#B91C1C', color: '#FFFFFF', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
