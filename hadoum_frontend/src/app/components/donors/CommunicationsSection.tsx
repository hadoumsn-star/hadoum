import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, MessageSquare } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { communicationsApi, type ApiCommunication, type CreateCommunicationInput } from '../../services/communications.api';
import { donorProfilesApi, type ApiDonorProfile } from '../../services/donorProfiles.api';
import { COMMUNICATION_TYPE_LABELS, COMMUNICATION_DIRECTION_LABELS } from '../../config/donors.config';
import { CommunicationFormModal } from './CommunicationFormModal';

const INPUT: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid #E5E7EB', background: '#FFFFFF',
  color: '#1A1A1A', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

export function CommunicationsSection() {
  const { user } = useAuth();
  const isDirector = user?.role === 'director';

  const [communications, setCommunications] = useState<ApiCommunication[]>([]);
  const [donors, setDonors] = useState<ApiDonorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [donorFilter, setDonorFilter] = useState('');
  const [showForm, setShowForm] = useState(false);

  const load = () =>
    communicationsApi.list({ donorProfileId: donorFilter || undefined, pageSize: 100 })
      .then((res) => setCommunications(res.data))
      .catch(() => toast.error('Erreur lors du chargement des communications.'));

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [donorFilter]);

  useEffect(() => {
    // Backend caps pageSize at 100 (see QueryDonorProfilesDto) — 200 would
    // 400 and silently leave this select empty via the .catch below.
    donorProfilesApi.list({ pageSize: 100 }).then((res) => setDonors(res.data)).catch(() => {});
  }, []);

  async function handleCreate(data: CreateCommunicationInput) {
    const created = await communicationsApi.create(data);
    setCommunications((prev) => [created, ...prev]);
    setShowForm(false);
    toast.success('Communication enregistrée.');
  }

  return (
    <div className="space-y-4" data-testid="donor-section-communications">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 style={{ color: '#1A1A1A', fontSize: 18, fontWeight: 700 }}>Communications</h3>
          <p style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>{communications.length} entrée(s)</p>
        </div>
        {isDirector && (
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-lg self-start"
            style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
            <Plus size={16} /> Enregistrer une communication
          </button>
        )}
      </div>

      <select value={donorFilter} onChange={(e) => setDonorFilter(e.target.value)} style={{ ...INPUT, width: 'auto', cursor: 'pointer' }}>
        <option value="">Tous les donateurs</option>
        {donors.map((d) => <option key={d.id} value={d.id}>{d.contact.fullName}</option>)}
      </select>

      <div className="space-y-2">
        {loading ? (
          <p style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Chargement…</p>
        ) : communications.length === 0 ? (
          <div className="py-12 text-center rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
            <MessageSquare size={28} style={{ color: '#9CA3AF', margin: '0 auto 8px' }} />
            <p style={{ color: '#374151', fontSize: 14, fontWeight: 500 }}>Aucune communication enregistrée</p>
          </div>
        ) : communications.map((c) => (
          <div key={c.id} data-testid="communication-card" className="rounded-xl p-4" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
            <div className="flex items-start justify-between gap-3 mb-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-full" style={{ background: '#EEF2F7', color: '#3E5A78', fontSize: 10, fontWeight: 700 }}>
                  {COMMUNICATION_TYPE_LABELS[c.type].toUpperCase()}
                </span>
                {c.direction && (
                  <span className="px-2 py-0.5 rounded-full" style={{ background: '#F3F4F6', color: '#6B7280', fontSize: 10, fontWeight: 600 }}>
                    {COMMUNICATION_DIRECTION_LABELS[c.direction]}
                  </span>
                )}
              </div>
              <span style={{ color: '#9CA3AF', fontSize: 12, flexShrink: 0 }}>{new Date(c.date).toLocaleDateString('fr-FR')}</span>
            </div>
            <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 600 }}>{c.donorProfile.contact.fullName} — {c.subject}</p>
            {c.content && (
              <p style={{ color: '#6B7280', fontSize: 12, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {c.content}
              </p>
            )}
          </div>
        ))}
      </div>

      {showForm && <CommunicationFormModal onSave={handleCreate} onClose={() => setShowForm(false)} />}
    </div>
  );
}
