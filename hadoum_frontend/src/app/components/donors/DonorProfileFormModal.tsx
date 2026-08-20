import { useState } from 'react';
import { X, Loader2, AlertTriangle } from 'lucide-react';
import { ContactAutocomplete } from '../contacts/ContactAutocomplete';
import type { ApiContactLike } from '../../types/contacts.types';
import type {
  ApiDonorProfile, ApiDonorType,
  CreateDonorProfileInput, UpdateDonorProfileInput,
} from '../../services/donorProfiles.api';

const INPUT: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid #E5E7EB', background: '#FFFFFF',
  color: '#1A1A1A', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};
const LABEL: React.CSSProperties = {
  color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5,
};
// Every Contact created/selected through this form is scoped to these two
// categories via ContactAutocomplete's own categoryKeys filter — the
// underlying business distinction is DonorProfile.type, not the category
// (see the backend's own schema comment); this is purely so the picker
// doesn't surface unrelated suppliers/staff contacts.
const DONOR_CATEGORY_KEYS = ['PARRAIN', 'DONATEUR_PONCTUEL'];

export interface DonorProfileFormModalProps {
  mode: 'create' | 'edit';
  /** Fixed for the whole form — this modal never lets the user switch type (see PR 18 plan). */
  type: ApiDonorType;
  initial?: ApiDonorProfile;
  onSave: (data: CreateDonorProfileInput | UpdateDonorProfileInput) => Promise<void>;
  onClose: () => void;
}

export function DonorProfileFormModal({ mode, type, initial, onSave, onClose }: DonorProfileFormModalProps) {
  const isEdit = mode === 'edit';
  const isParrain = type === 'PARRAIN';

  const [contactId, setContactId] = useState<string | null>(initial?.contact.id ?? null);
  // initial?.contact is the reduced ApiDonorContact projection (id/fullName/…,
  // no category) — ContactAutocomplete's selectedContact prop only ever reads
  // fullName/active off it, so it's a valid ApiContactLike-or-summary value.
  const [contact, setContact] = useState<ApiContactLike | { fullName: string; active: boolean } | null>(initial?.contact ?? null);
  const [country, setCountry] = useState(initial?.country ?? '');
  const [engagementStartDate, setEngagementStartDate] = useState(
    initial?.engagementStartDate?.slice(0, 10) ?? '',
  );
  const [monthlyContributionXof, setMonthlyContributionXof] = useState(
    initial?.monthlyContributionXof != null ? String(initial.monthlyContributionXof) : '',
  );
  const [notes, setNotes] = useState(initial?.notes ?? '');

  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);

  const canSave = isEdit || !!contactId;

  async function handleSave() {
    if (!isEdit && !contactId) {
      setContactError('Sélectionnez ou créez un contact.');
      return;
    }
    setSaving(true);
    setApiError(null);
    try {
      if (isEdit) {
        const payload: UpdateDonorProfileInput = {
          country: country.trim() || undefined,
          notes: notes.trim() || undefined,
          ...(isParrain
            ? {
                // Explicit value-or-null on every save — this is exactly
                // what lets a Director clear a recurring field (empty the
                // input, save) rather than there being no way to signal
                // "clear this" through a plain controlled form.
                engagementStartDate: engagementStartDate || null,
                monthlyContributionXof: monthlyContributionXof
                  ? parseInt(monthlyContributionXof, 10)
                  : null,
              }
            : {}),
        };
        await onSave(payload);
      } else {
        const payload: CreateDonorProfileInput = {
          contactId: contactId as string,
          type,
          country: country.trim() || undefined,
          notes: notes.trim() || undefined,
          ...(isParrain
            ? {
                engagementStartDate: engagementStartDate || undefined,
                monthlyContributionXof: monthlyContributionXof
                  ? parseInt(monthlyContributionXof, 10)
                  : undefined,
              }
            : {}),
        };
        await onSave(payload);
      }
    } catch (e) {
      setApiError(e instanceof Error ? e.message : 'Erreur lors de la sauvegarde.');
    } finally {
      setSaving(false);
    }
  }

  const title = isEdit
    ? `Modifier ${isParrain ? 'le parrain' : 'le donateur'}`
    : `Nouveau ${isParrain ? 'parrain' : 'donateur ponctuel'}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      data-testid="donor-profile-form-modal"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FFFFFF', maxHeight: '92vh' }}>
        <div className="flex items-center justify-between px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} aria-label="Fermer"><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div>
            <ContactAutocomplete
              label="Contact *"
              placeholder="Rechercher ou créer un contact"
              value={contactId}
              selectedContact={contact}
              onChange={(c) => { setContact(c); setContactId(c?.id ?? null); setContactError(null); }}
              allowCreate
              categoryKeys={DONOR_CATEGORY_KEYS}
              disabled={isEdit}
              required
              error={contactError ?? undefined}
              helperText={isEdit ? 'Le contact lié ne peut pas être modifié ici.' : undefined}
            />
          </div>

          <div>
            <label style={LABEL} htmlFor="donor-form-country">Pays</label>
            <input id="donor-form-country" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Ex : Sénégal" style={INPUT} />
          </div>

          {isParrain && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label style={LABEL} htmlFor="donor-form-engagement">Date d'engagement</label>
                <input
                  id="donor-form-engagement"
                  type="date"
                  value={engagementStartDate}
                  onChange={(e) => setEngagementStartDate(e.target.value)}
                  style={INPUT}
                />
              </div>
              <div>
                <label style={LABEL} htmlFor="donor-form-monthly">Engagement mensuel (FCFA)</label>
                <input
                  id="donor-form-monthly"
                  type="number"
                  min={0}
                  value={monthlyContributionXof}
                  onChange={(e) => setMonthlyContributionXof(e.target.value)}
                  placeholder="0"
                  style={INPUT}
                />
              </div>
              {isEdit && (engagementStartDate || monthlyContributionXof) && (
                <button
                  type="button"
                  onClick={() => { setEngagementStartDate(''); setMonthlyContributionXof(''); }}
                  className="col-span-2 text-left"
                  style={{ background: 'none', border: 'none', color: '#B91C1C', fontSize: 12, cursor: 'pointer', padding: 0 }}
                >
                  Effacer la date et le montant d'engagement
                </button>
              )}
            </div>
          )}

          <div>
            <label style={LABEL} htmlFor="donor-form-notes">Notes</label>
            <textarea id="donor-form-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...INPUT, resize: 'none' }} />
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
            {isEdit ? 'Enregistrer' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  );
}
