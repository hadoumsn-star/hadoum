import { useEffect, useRef, useState } from 'react';
import { X, Loader2, AlertTriangle } from 'lucide-react';
import { donorProfilesApi, type ApiDonorProfile } from '../../services/donorProfiles.api';
import { campaignsApi, type ApiCampaign } from '../../services/campaigns.api';
import type { CreateDonationInput } from '../../services/donations.api';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS, type ApiPaymentMethod } from '../../config/financeCategories.config';
import { generateIdempotencyKey } from '../../utils/idempotency';

const INPUT: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid #E5E7EB', background: '#FFFFFF',
  color: '#1A1A1A', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};
const LABEL: React.CSSProperties = {
  color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5,
};

export interface DonationFormModalProps {
  /** Preselects and locks the donor — used when opened from a donor's own detail view. */
  fixedDonorProfileId?: string;
  /** Preselects and locks the campaign — used when opened from a campaign's own detail view. */
  fixedCampaignId?: string;
  onSave: (data: CreateDonationInput) => Promise<void>;
  onClose: () => void;
}

export function DonationFormModal({ fixedDonorProfileId, fixedCampaignId, onSave, onClose }: DonationFormModalProps) {
  const [donors, setDonors] = useState<ApiDonorProfile[]>([]);
  const [activeCampaigns, setActiveCampaigns] = useState<ApiCampaign[]>([]);

  const [donorProfileId, setDonorProfileId] = useState(fixedDonorProfileId ?? '');
  const [campaignId, setCampaignId] = useState(fixedCampaignId ?? '');
  const [amountXof, setAmountXof] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<ApiPaymentMethod | ''>('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Exactly one key per "record this donation" action — generated once when
  // this modal mounts (i.e. the Director opens the form), never regenerated
  // on a retry of the same submission. A genuinely new donation action gets
  // a fresh key because it means closing this modal and opening a new one,
  // which re-mounts this component and re-runs this lazy initializer. See
  // utils/idempotency.ts.
  const idempotencyKeyRef = useRef(generateIdempotencyKey());

  useEffect(() => {
    // Backend caps pageSize at 100 (see QueryDonorProfilesDto) — 200 would
    // 400 and silently leave this select empty via the .catch below.
    donorProfilesApi.list({ active: true, pageSize: 100 }).then((res) => setDonors(res.data)).catch(() => {});
    campaignsApi.list({ status: 'ACTIVE', pageSize: 100 }).then((res) => setActiveCampaigns(res.data)).catch(() => {});
  }, []);

  const parrains = donors.filter((d) => d.type === 'PARRAIN');
  const donateurs = donors.filter((d) => d.type === 'DONATEUR_PONCTUEL');

  const amountValue = parseInt(amountXof, 10);
  const canSave = !!donorProfileId && amountXof.trim().length > 0 && amountValue > 0 && date.length > 0;

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    setApiError(null);
    try {
      await onSave({
        donorProfileId,
        campaignId: campaignId || undefined,
        amountXof: amountValue,
        date,
        paymentMethod: paymentMethod || undefined,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        idempotencyKey: idempotencyKeyRef.current,
      });
      // On success the caller closes/resets the form (see DonationsSection) —
      // this component doesn't need its own new key, it's about to unmount.
    } catch (e) {
      setApiError(e instanceof Error ? e.message : "Erreur lors de l'enregistrement du don.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      data-testid="donation-form-modal"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FFFFFF', maxHeight: '92vh' }}>
        <div className="flex items-center justify-between px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>Enregistrer un don</h3>
          <button onClick={onClose} aria-label="Fermer"><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div>
            <label style={LABEL} htmlFor="donation-form-donor">Donateur *</label>
            <select
              id="donation-form-donor"
              value={donorProfileId}
              disabled={!!fixedDonorProfileId}
              onChange={(e) => setDonorProfileId(e.target.value)}
              style={{ ...INPUT, cursor: fixedDonorProfileId ? 'not-allowed' : 'pointer' }}
            >
              <option value="">Sélectionner un donateur…</option>
              {parrains.length > 0 && (
                <optgroup label="Parrains">
                  {parrains.map((d) => <option key={d.id} value={d.id}>{d.contact.fullName}</option>)}
                </optgroup>
              )}
              {donateurs.length > 0 && (
                <optgroup label="Donateurs ponctuels">
                  {donateurs.map((d) => <option key={d.id} value={d.id}>{d.contact.fullName}</option>)}
                </optgroup>
              )}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={LABEL} htmlFor="donation-form-amount">Montant (FCFA) *</label>
              <input id="donation-form-amount" type="number" min={1} value={amountXof} onChange={(e) => setAmountXof(e.target.value)} placeholder="15000" style={INPUT} autoFocus />
            </div>
            <div>
              <label style={LABEL} htmlFor="donation-form-date">Date *</label>
              <input id="donation-form-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={INPUT} />
            </div>
          </div>

          <div>
            <label style={LABEL} htmlFor="donation-form-campaign">Cagnotte (optionnel)</label>
            <select
              id="donation-form-campaign"
              value={campaignId}
              disabled={!!fixedCampaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              style={{ ...INPUT, cursor: fixedCampaignId ? 'not-allowed' : 'pointer' }}
            >
              <option value="">Aucune — don libre</option>
              {activeCampaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            {activeCampaigns.length === 0 && (
              <p style={{ color: '#9CA3AF', fontSize: 11, marginTop: 4 }}>Aucune cagnotte active en ce moment.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={LABEL} htmlFor="donation-form-payment">Mode de paiement</label>
              <select id="donation-form-payment" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as ApiPaymentMethod | '')} style={{ ...INPUT, cursor: 'pointer' }}>
                <option value="">—</option>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}
              </select>
            </div>
            <div>
              <label style={LABEL} htmlFor="donation-form-reference">Référence</label>
              <input id="donation-form-reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="N° reçu, transaction…" style={INPUT} />
            </div>
          </div>

          <div>
            <label style={LABEL} htmlFor="donation-form-notes">Notes</label>
            <textarea id="donation-form-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...INPUT, resize: 'none' }} />
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
            data-testid="donation-form-submit"
            disabled={saving || !canSave}
            onClick={handleSave}
            className="flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2"
            style={{
              background: saving || !canSave ? '#E5E7EB' : '#3E5A78',
              color: saving || !canSave ? '#9CA3AF' : '#FFFFFF',
              fontSize: 13, fontWeight: 600, border: 'none',
              // Visual double-click prevention only — the real safety net is
              // the stable idempotencyKey above, not this disabled state.
              cursor: saving || !canSave ? 'not-allowed' : 'pointer',
            }}
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Enregistrer le don
          </button>
        </div>
      </div>
    </div>
  );
}
