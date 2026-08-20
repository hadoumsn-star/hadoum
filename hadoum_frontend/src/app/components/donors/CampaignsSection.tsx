import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Target, Eye } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { campaignsApi, type ApiCampaign, type ApiCampaignStatus, type CreateCampaignInput } from '../../services/campaigns.api';
import { CAMPAIGN_STATUS_LABELS, CAMPAIGN_STATUS_STYLE } from '../../config/donors.config';
import { CampaignFormModal } from './CampaignFormModal';
import { CampaignDetailModal } from './CampaignDetailModal';
import { CampaignProgressBar } from './CampaignProgressBar';

type StatusFilter = ApiCampaignStatus | 'all';

export function CampaignsSection() {
  const { user } = useAuth();
  const isDirector = user?.role === 'director';

  const [campaigns, setCampaigns] = useState<ApiCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<ApiCampaign | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = () =>
    campaignsApi.list({ status: statusFilter === 'all' ? undefined : statusFilter, pageSize: 100 })
      .then((res) => setCampaigns(res.data))
      .catch(() => toast.error('Erreur lors du chargement des cagnottes.'));

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function handleCreate(data: CreateCampaignInput) {
    const created = await campaignsApi.create(data);
    setCampaigns((prev) => [created, ...prev]);
    setShowCreate(false);
    toast.success('Cagnotte créée en brouillon.');
  }

  async function handleUpdate(data: CreateCampaignInput) {
    if (!editTarget) return;
    const updated = await campaignsApi.update(editTarget.id, data);
    setCampaigns((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setEditTarget(null);
    toast.success('Cagnotte modifiée.');
  }

  const STATUS_OPTIONS: StatusFilter[] = ['all', 'BROUILLON', 'ACTIVE', 'TERMINEE', 'ANNULEE'];

  return (
    <div className="space-y-4" data-testid="donor-section-campaigns">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 style={{ color: '#1A1A1A', fontSize: 18, fontWeight: 700 }}>Cagnottes</h3>
          <p style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>{campaigns.length} au total sur ce filtre</p>
        </div>
        {isDirector && (
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-lg self-start"
            style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
            <Plus size={16} /> Nouvelle cagnotte
          </button>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        {STATUS_OPTIONS.map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} className="px-3 py-2 rounded-lg"
            style={{
              background: statusFilter === s ? '#3E5A78' : '#FFFFFF',
              color: statusFilter === s ? '#FFFFFF' : '#374151',
              fontSize: 13, fontWeight: 500,
              border: `1px solid ${statusFilter === s ? 'transparent' : '#E5E7EB'}`,
              cursor: 'pointer',
            }}>
            {s === 'all' ? 'Toutes' : CAMPAIGN_STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {loading ? (
          <p style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Chargement…</p>
        ) : campaigns.length === 0 ? (
          <div className="py-12 text-center rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
            <Target size={28} style={{ color: '#9CA3AF', margin: '0 auto 8px' }} />
            <p style={{ color: '#374151', fontSize: 14, fontWeight: 500 }}>Aucune cagnotte dans cette catégorie</p>
          </div>
        ) : campaigns.map((campaign) => {
          const statusStyle = CAMPAIGN_STATUS_STYLE[campaign.status];
          return (
            <div key={campaign.id} className="rounded-xl p-5 cursor-pointer hover:shadow-md transition-shadow"
              style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}
              onClick={() => setDetailId(campaign.id)}>
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1 min-w-0">
                  <span className="inline-block px-2 py-0.5 rounded-full mb-1.5" style={{ background: statusStyle.bg, color: statusStyle.color, fontSize: 10, fontWeight: 700 }}>
                    {CAMPAIGN_STATUS_LABELS[campaign.status].toUpperCase()}
                  </span>
                  <p style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600 }}>{campaign.title}</p>
                  <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>
                    Du {new Date(campaign.startDate).toLocaleDateString('fr-FR')}
                    {campaign.endDate && ` au ${new Date(campaign.endDate).toLocaleDateString('fr-FR')}`}
                  </p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); setDetailId(campaign.id); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg flex-shrink-0"
                  style={{ background: '#F3F4F6', color: '#374151', fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
                  <Eye size={13} /> Voir
                </button>
              </div>
              <CampaignProgressBar campaign={campaign} />
            </div>
          );
        })}
      </div>

      {showCreate && <CampaignFormModal onSave={handleCreate} onClose={() => setShowCreate(false)} />}
      {editTarget && <CampaignFormModal initial={editTarget} onSave={handleUpdate} onClose={() => setEditTarget(null)} />}
      {detailId && (
        <CampaignDetailModal
          campaignId={detailId}
          isDirector={isDirector}
          onClose={() => setDetailId(null)}
          onEdit={(c) => { setEditTarget(c); setDetailId(null); }}
          onChanged={load}
        />
      )}
    </div>
  );
}
