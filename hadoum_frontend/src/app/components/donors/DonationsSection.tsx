import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Receipt } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { donationsApi, type ApiDonation, type CreateDonationInput } from '../../services/donations.api';
import { donorProfilesApi, type ApiDonorProfile } from '../../services/donorProfiles.api';
import { campaignsApi, type ApiCampaign } from '../../services/campaigns.api';
import { PAYMENT_METHOD_LABELS } from '../../config/financeCategories.config';
import { formatXof } from '../../config/financeCategories.config';
import { DonationFormModal } from './DonationFormModal';

const INPUT: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid #E5E7EB', background: '#FFFFFF',
  color: '#1A1A1A', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

export function DonationsSection() {
  const { user } = useAuth();
  const isDirector = user?.role === 'director';

  const [donations, setDonations] = useState<ApiDonation[]>([]);
  const [loading, setLoading] = useState(true);
  const [donorFilter, setDonorFilter] = useState('');
  const [campaignFilter, setCampaignFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showForm, setShowForm] = useState(false);

  const [donors, setDonors] = useState<ApiDonorProfile[]>([]);
  const [campaigns, setCampaigns] = useState<ApiCampaign[]>([]);

  const load = () =>
    donationsApi
      .list({
        donorProfileId: donorFilter || undefined,
        campaignId: campaignFilter || undefined,
        from: from || undefined,
        to: to || undefined,
        pageSize: 100,
      })
      .then((res) => setDonations(res.data))
      .catch(() => toast.error('Erreur lors du chargement des dons.'));

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [donorFilter, campaignFilter, from, to]);

  useEffect(() => {
    // Backend caps pageSize at 100 (see QueryDonorProfilesDto) — 200 would
    // 400 and silently leave this select empty via the .catch below.
    donorProfilesApi.list({ pageSize: 100 }).then((res) => setDonors(res.data)).catch(() => {});
    campaignsApi.list({ pageSize: 100 }).then((res) => setCampaigns(res.data)).catch(() => {});
  }, []);

  async function handleCreate(data: CreateDonationInput) {
    const created = await donationsApi.create(data);
    setDonations((prev) => [created, ...prev]);
    setShowForm(false);
    toast.success('Don enregistré.');
    // Refresh so the linked campaign's aggregate (if any) picks up the new
    // donation next time it's fetched, and the donor list stays consistent —
    // no local recomputation of totals.
    await load();
  }

  const totalXof = donations.reduce((sum, d) => sum + d.amountXof, 0);

  return (
    <div className="space-y-4" data-testid="donor-section-donations">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 style={{ color: '#1A1A1A', fontSize: 18, fontWeight: 700 }}>Dons</h3>
          <p style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>{donations.length} don(s) · {formatXof(totalXof)} sur ce filtre</p>
        </div>
        {isDirector && (
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-lg self-start"
            style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
            <Plus size={16} /> Enregistrer un don
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <select value={donorFilter} onChange={(e) => setDonorFilter(e.target.value)} style={{ ...INPUT, cursor: 'pointer' }}>
          <option value="">Tous les donateurs</option>
          {donors.map((d) => <option key={d.id} value={d.id}>{d.contact.fullName}</option>)}
        </select>
        <select value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)} style={{ ...INPUT, cursor: 'pointer' }}>
          <option value="">Toutes les cagnottes</option>
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={INPUT} aria-label="Du" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={INPUT} aria-label="Au" />
      </div>

      <div className="space-y-2">
        {loading ? (
          <p style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Chargement…</p>
        ) : donations.length === 0 ? (
          <div className="py-12 text-center rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
            <Receipt size={28} style={{ color: '#9CA3AF', margin: '0 auto 8px' }} />
            <p style={{ color: '#374151', fontSize: 14, fontWeight: 500 }}>Aucun don sur ce filtre</p>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #E5E7EB', background: '#FFFFFF' }}>
            {donations.map((d, i) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                style={{ borderTop: i === 0 ? 'none' : '1px solid #F3F4F6' }}>
                <div className="min-w-0">
                  <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 600 }}>{d.donorProfile.contact.fullName}</p>
                  <p style={{ color: '#9CA3AF', fontSize: 11, marginTop: 1 }}>
                    {new Date(d.date).toLocaleDateString('fr-FR')}
                    {d.campaign && ` · ${d.campaign.title}`}
                    {d.paymentMethod && ` · ${PAYMENT_METHOD_LABELS[d.paymentMethod]}`}
                    {d.reference && ` · Réf. ${d.reference}`}
                  </p>
                </div>
                <p style={{ color: '#065F46', fontSize: 14, fontWeight: 700 }}>{formatXof(d.amountXof)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <DonationFormModal onSave={handleCreate} onClose={() => setShowForm(false)} />
      )}
    </div>
  );
}
