import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Search, Users, Eye, Globe2, CalendarClock, Wallet } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  donorProfilesApi, type ApiDonorProfile, type ApiDonorType,
  type CreateDonorProfileInput, type UpdateDonorProfileInput,
} from '../../services/donorProfiles.api';
import { formatXof } from '../../config/financeCategories.config';
import { DonorProfileFormModal } from './DonorProfileFormModal';
import { DonorProfileDetailModal } from './DonorProfileDetailModal';

const INPUT: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid #E5E7EB', background: '#FFFFFF',
  color: '#1A1A1A', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

export interface DonorProfileListSectionProps {
  type: ApiDonorType;
  title: string;
  createLabel: string;
  emptyLabel: string;
  searchPlaceholder: string;
}

export function DonorProfileListSection({ type, title, createLabel, emptyLabel, searchPlaceholder }: DonorProfileListSectionProps) {
  const { user } = useAuth();
  const isDirector = user?.role === 'director';

  const [donors, setDonors] = useState<ApiDonorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<ApiDonorProfile | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = () =>
    donorProfilesApi
      .list({ type, active: activeFilter === 'all' ? undefined : activeFilter === 'active', search: search || undefined, pageSize: 100 })
      .then((res) => setDonors(res.data))
      .catch(() => toast.error('Erreur lors du chargement.'));

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, activeFilter, search]);

  async function handleCreate(data: CreateDonorProfileInput | UpdateDonorProfileInput) {
    const created = await donorProfilesApi.create(data as CreateDonorProfileInput);
    setDonors((prev) => [created, ...prev]);
    setShowCreate(false);
    toast.success(`${type === 'PARRAIN' ? 'Parrain' : 'Donateur'} créé.`);
  }

  async function handleUpdate(data: CreateDonorProfileInput | UpdateDonorProfileInput) {
    if (!editTarget) return;
    const updated = await donorProfilesApi.update(editTarget.id, data as UpdateDonorProfileInput);
    setDonors((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    setEditTarget(null);
    toast.success('Profil mis à jour.');
  }

  return (
    <div className="space-y-4" data-testid={`donor-section-${type.toLowerCase()}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 style={{ color: '#1A1A1A', fontSize: 18, fontWeight: 700 }}>{title}</h3>
          <p style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>{donors.length} au total sur ce filtre</p>
        </div>
        {isDirector && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg self-start"
            style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer' }}
          >
            <Plus size={16} /> {createLabel}
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={searchPlaceholder} style={{ ...INPUT, paddingLeft: 32 }} />
        </div>
        <select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value as typeof activeFilter)} style={{ ...INPUT, width: 'auto', cursor: 'pointer' }}>
          <option value="active">Actifs</option>
          <option value="inactive">Inactifs</option>
          <option value="all">Tous</option>
        </select>
      </div>

      <div className="space-y-3">
        {loading ? (
          <p style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Chargement…</p>
        ) : donors.length === 0 ? (
          <div className="py-12 text-center rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
            <Users size={28} style={{ color: '#9CA3AF', margin: '0 auto 8px' }} />
            <p style={{ color: '#374151', fontSize: 14, fontWeight: 500 }}>{emptyLabel}</p>
          </div>
        ) : donors.map((donor) => (
          <div
            key={donor.id}
            data-testid="donor-card"
            className="rounded-xl p-4 cursor-pointer hover:shadow-md transition-shadow"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}
            onClick={() => setDetailId(donor.id)}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <span style={{ color: '#1A1A1A', fontSize: 14, fontWeight: 600 }}>{donor.contact.fullName}</span>
                  {!donor.active && (
                    <span className="px-2 py-0.5 rounded-full" style={{ background: '#F3F4F6', color: '#6B7280', fontSize: 10, fontWeight: 700 }}>INACTIF</span>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-wrap" style={{ color: '#9CA3AF', fontSize: 12 }}>
                  {donor.country && (
                    <span className="flex items-center gap-1"><Globe2 size={12} /> {donor.country}</span>
                  )}
                  {type === 'PARRAIN' && donor.engagementStartDate && (
                    <span className="flex items-center gap-1"><CalendarClock size={12} /> depuis {new Date(donor.engagementStartDate).toLocaleDateString('fr-FR')}</span>
                  )}
                  {type === 'PARRAIN' && donor.monthlyContributionXof != null && (
                    <span className="flex items-center gap-1"><Wallet size={12} /> {formatXof(donor.monthlyContributionXof)}/mois</span>
                  )}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setDetailId(donor.id); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg flex-shrink-0"
                style={{ background: '#F3F4F6', color: '#374151', fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer' }}
              >
                <Eye size={13} /> Voir
              </button>
            </div>
          </div>
        ))}
      </div>

      {showCreate && (
        <DonorProfileFormModal mode="create" type={type} onSave={handleCreate} onClose={() => setShowCreate(false)} />
      )}
      {editTarget && (
        <DonorProfileFormModal mode="edit" type={type} initial={editTarget} onSave={handleUpdate} onClose={() => setEditTarget(null)} />
      )}
      {detailId && (
        <DonorProfileDetailModal
          donorId={detailId}
          isDirector={isDirector}
          onClose={() => setDetailId(null)}
          onEdit={(d) => { setEditTarget(d); setDetailId(null); }}
          onChanged={load}
        />
      )}
    </div>
  );
}
