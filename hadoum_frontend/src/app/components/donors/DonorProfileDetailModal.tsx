import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { X, Pencil, Power, PowerOff, Globe2, CalendarClock, Wallet } from 'lucide-react';
import { donorProfilesApi, type ApiDonorProfile } from '../../services/donorProfiles.api';
import { donationsApi, type ApiDonation } from '../../services/donations.api';
import { DONOR_TYPE_LABELS } from '../../config/donors.config';
import { formatXof } from '../../config/financeCategories.config';

export interface DonorProfileDetailModalProps {
  donorId: string;
  isDirector: boolean;
  onClose: () => void;
  onEdit: (donor: ApiDonorProfile) => void;
  onChanged: () => void;
}

export function DonorProfileDetailModal({ donorId, isDirector, onClose, onEdit, onChanged }: DonorProfileDetailModalProps) {
  const [donor, setDonor] = useState<ApiDonorProfile | null>(null);
  const [donations, setDonations] = useState<ApiDonation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = () =>
    Promise.all([
      donorProfilesApi.get(donorId),
      donationsApi.list({ donorProfileId: donorId, pageSize: 20 }),
    ]).then(([d, don]) => { setDonor(d); setDonations(don.data); })
      .catch(() => toast.error('Erreur lors du chargement du profil donateur.'));

  useEffect(() => { load().finally(() => setLoading(false)); }, [donorId]);

  async function handleToggleActive() {
    if (!donor) return;
    const action = donor.active ? 'désactiver' : 'réactiver';
    if (!window.confirm(`Confirmez-vous vouloir ${action} ce profil ?`)) return;
    setBusy(true);
    try {
      const updated = donor.active
        ? await donorProfilesApi.deactivate(donor.id)
        : await donorProfilesApi.reactivate(donor.id);
      setDonor(updated);
      toast.success(donor.active ? 'Profil désactivé.' : 'Profil réactivé.');
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur lors de la mise à jour.');
    } finally {
      setBusy(false);
    }
  }

  if (loading || !donor) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
        <div className="rounded-2xl flex items-center justify-center" style={{ background: '#FFFFFF', width: 400, height: 260 }}>
          <p style={{ color: '#9CA3AF', fontSize: 13 }}>Chargement…</p>
        </div>
      </div>
    );
  }

  const totalReceived = donations.reduce((sum, d) => sum + d.amountXof, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      data-testid="donor-detail-modal"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FFFFFF', maxHeight: '90vh' }}>
        <div className="flex items-start justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <div className="flex-1 min-w-0 pr-3">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="px-2 py-0.5 rounded-full" style={{ background: '#EEF2F7', color: '#3E5A78', fontSize: 10, fontWeight: 700 }}>
                {DONOR_TYPE_LABELS[donor.type].toUpperCase()}
              </span>
              <span className="px-2 py-0.5 rounded-full" style={{ background: donor.active ? '#ECFDF5' : '#F3F4F6', color: donor.active ? '#065F46' : '#6B7280', fontSize: 10, fontWeight: 700 }}>
                {donor.active ? 'ACTIF' : 'INACTIF'}
              </span>
            </div>
            <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>{donor.contact.fullName}</h3>
            {donor.contact.organization && <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>{donor.contact.organization}</p>}
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100 flex-shrink-0" aria-label="Fermer">
            <X size={18} style={{ color: '#9CA3AF' }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 8 }}>COORDONNÉES</p>
            <div className="space-y-1.5">
              {donor.contact.phone && <p style={{ color: '#374151', fontSize: 13 }}>Tél : {donor.contact.phone}</p>}
              {donor.contact.email && <p style={{ color: '#374151', fontSize: 13 }}>{donor.contact.email}</p>}
              {donor.country && (
                <p className="flex items-center gap-1.5" style={{ color: '#374151', fontSize: 13 }}>
                  <Globe2 size={13} style={{ color: '#9CA3AF' }} /> {donor.country}
                </p>
              )}
              {!donor.contact.phone && !donor.contact.email && !donor.country && (
                <p style={{ color: '#9CA3AF', fontSize: 13 }}>Aucune coordonnée renseignée.</p>
              )}
            </div>
          </div>

          {donor.type === 'PARRAIN' && (
            <div>
              <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 8 }}>ENGAGEMENT</p>
              <div className="space-y-1.5">
                {donor.engagementStartDate && (
                  <p className="flex items-center gap-1.5" style={{ color: '#374151', fontSize: 13 }}>
                    <CalendarClock size={13} style={{ color: '#9CA3AF' }} /> Depuis le {new Date(donor.engagementStartDate).toLocaleDateString('fr-FR')}
                  </p>
                )}
                {donor.monthlyContributionXof != null && (
                  <p className="flex items-center gap-1.5" style={{ color: '#374151', fontSize: 13 }}>
                    <Wallet size={13} style={{ color: '#9CA3AF' }} /> {formatXof(donor.monthlyContributionXof)} / mois
                  </p>
                )}
                {!donor.engagementStartDate && donor.monthlyContributionXof == null && (
                  <p style={{ color: '#9CA3AF', fontSize: 13 }}>Aucun engagement récurrent renseigné.</p>
                )}
              </div>
            </div>
          )}

          {donor.notes && (
            <div>
              <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 6 }}>NOTES</p>
              <p style={{ color: '#374151', fontSize: 13, lineHeight: 1.6 }}>{donor.notes}</p>
            </div>
          )}

          <div>
            <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 8 }}>
              HISTORIQUE DES DONS {donations.length > 0 && `(${formatXof(totalReceived)} au total)`}
            </p>
            {donations.length === 0 ? (
              <p style={{ color: '#9CA3AF', fontSize: 13 }}>Aucun don enregistré pour ce donateur.</p>
            ) : (
              <div className="space-y-2">
                {donations.map((d) => (
                  <div key={d.id} className="flex items-center justify-between rounded-xl px-3.5 py-2.5" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
                    <div>
                      <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 600 }}>{formatXof(d.amountXof)}</p>
                      <p style={{ color: '#9CA3AF', fontSize: 11, marginTop: 1 }}>
                        {new Date(d.date).toLocaleDateString('fr-FR')}
                        {d.campaign && ` · ${d.campaign.title}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {isDirector && (
          <div className="px-6 py-4 flex flex-wrap items-center gap-2" style={{ borderTop: '1px solid #F3F4F6', background: '#F9F7F3' }}>
            <button
              onClick={() => onEdit(donor)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
              style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
            >
              <Pencil size={13} /> Modifier
            </button>
            <button
              disabled={busy}
              onClick={handleToggleActive}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
              style={{
                background: '#FFFFFF',
                border: `1px solid ${donor.active ? '#FECACA' : '#A7D9C6'}`,
                color: donor.active ? '#B91C1C' : '#065F46',
                fontSize: 13, fontWeight: 500, cursor: busy ? 'not-allowed' : 'pointer',
              }}
            >
              {donor.active ? <PowerOff size={13} /> : <Power size={13} />}
              {donor.active ? 'Désactiver' : 'Réactiver'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
