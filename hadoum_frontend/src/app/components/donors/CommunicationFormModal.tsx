import { useEffect, useState } from 'react';
import { X, Loader2, AlertTriangle } from 'lucide-react';
import { donorProfilesApi, type ApiDonorProfile } from '../../services/donorProfiles.api';
import type { CreateCommunicationInput } from '../../services/communications.api';
import {
  COMMUNICATION_TYPE_LABELS, COMMUNICATION_TYPE_OPTIONS, COMMUNICATION_DIRECTION_LABELS,
} from '../../config/donors.config';

const INPUT: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid #E5E7EB', background: '#FFFFFF',
  color: '#1A1A1A', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};
const LABEL: React.CSSProperties = {
  color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5,
};

export interface CommunicationFormModalProps {
  fixedDonorProfileId?: string;
  onSave: (data: CreateCommunicationInput) => Promise<void>;
  onClose: () => void;
}

export function CommunicationFormModal({ fixedDonorProfileId, onSave, onClose }: CommunicationFormModalProps) {
  const [donors, setDonors] = useState<ApiDonorProfile[]>([]);
  const [donorProfileId, setDonorProfileId] = useState(fixedDonorProfileId ?? '');
  const [type, setType] = useState<CreateCommunicationInput['type']>('MESSAGE_SENT');
  const [direction, setDirection] = useState<CreateCommunicationInput['direction'] | ''>('OUTGOING');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    // Backend caps pageSize at 100 (see QueryDonorProfilesDto) — 200 would
    // 400 and silently leave this select empty via the .catch below.
    donorProfilesApi.list({ pageSize: 100 }).then((res) => setDonors(res.data)).catch(() => {});
  }, []);

  const canSave = !!donorProfileId && subject.trim().length > 0 && date.length > 0;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setApiError(null);
    try {
      await onSave({
        donorProfileId,
        type,
        direction: direction || undefined,
        date,
        subject: subject.trim(),
        content: content.trim() || undefined,
      });
    } catch (e) {
      setApiError(e instanceof Error ? e.message : "Erreur lors de l'enregistrement.");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      data-testid="communication-form-modal"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FFFFFF', maxHeight: '92vh' }}>
        <div className="flex items-center justify-between px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>Enregistrer une communication</h3>
          <button onClick={onClose} aria-label="Fermer"><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div>
            <label style={LABEL} htmlFor="comm-form-donor">Donateur *</label>
            <select id="comm-form-donor" value={donorProfileId} disabled={!!fixedDonorProfileId}
              onChange={(e) => setDonorProfileId(e.target.value)} style={{ ...INPUT, cursor: fixedDonorProfileId ? 'not-allowed' : 'pointer' }}>
              <option value="">Sélectionner un donateur…</option>
              {donors.map((d) => <option key={d.id} value={d.id}>{d.contact.fullName}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={LABEL} htmlFor="comm-form-type">Type *</label>
              <select id="comm-form-type" value={type} onChange={(e) => setType(e.target.value as CreateCommunicationInput['type'])} style={{ ...INPUT, cursor: 'pointer' }}>
                {COMMUNICATION_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{COMMUNICATION_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label style={LABEL} htmlFor="comm-form-direction">Sens</label>
              <select id="comm-form-direction" value={direction} onChange={(e) => setDirection(e.target.value as CreateCommunicationInput['direction'] | '')} style={{ ...INPUT, cursor: 'pointer' }}>
                <option value="">—</option>
                <option value="OUTGOING">{COMMUNICATION_DIRECTION_LABELS.OUTGOING}</option>
                <option value="INCOMING">{COMMUNICATION_DIRECTION_LABELS.INCOMING}</option>
              </select>
            </div>
          </div>

          <div>
            <label style={LABEL} htmlFor="comm-form-date">Date *</label>
            <input id="comm-form-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={INPUT} />
          </div>

          <div>
            <label style={LABEL} htmlFor="comm-form-subject">Objet *</label>
            <input id="comm-form-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ex : Appel de remerciement" style={INPUT} />
          </div>

          <div>
            <label style={LABEL} htmlFor="comm-form-content">Contenu</label>
            <textarea id="comm-form-content" value={content} onChange={(e) => setContent(e.target.value)} rows={3} style={{ ...INPUT, resize: 'none' }} />
          </div>

          {apiError && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg" style={{ background: '#FEF2F2', color: '#B91C1C', fontSize: 12 }}>
              <AlertTriangle size={14} /> {apiError}
            </div>
          )}
        </div>

        <div className="flex gap-2 px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid #F3F4F6' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Annuler
          </button>
          <button
            disabled={saving || !canSave}
            onClick={handleSave}
            className="flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2"
            style={{
              background: saving || !canSave ? '#E5E7EB' : '#3E5A78',
              color: saving || !canSave ? '#9CA3AF' : '#FFFFFF',
              fontSize: 13, fontWeight: 600, border: 'none',
              cursor: saving || !canSave ? 'not-allowed' : 'pointer',
            }}
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
