import { useState } from 'react';
import { X, Loader2, AlertTriangle } from 'lucide-react';
import type { ApiCampaign, CreateCampaignInput } from '../../services/campaigns.api';

const INPUT: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid #E5E7EB', background: '#FFFFFF',
  color: '#1A1A1A', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};
const LABEL: React.CSSProperties = {
  color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5,
};

export interface CampaignFormModalProps {
  initial?: ApiCampaign;
  onSave: (data: CreateCampaignInput) => Promise<void>;
  onClose: () => void;
}

export function CampaignFormModal({ initial, onSave, onClose }: CampaignFormModalProps) {
  const isEdit = !!initial;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [targetAmountXof, setTargetAmountXof] = useState(initial ? String(initial.targetAmountXof) : '');
  const [startDate, setStartDate] = useState(initial?.startDate.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(initial?.endDate?.slice(0, 10) ?? '');
  const [utilizationReport, setUtilizationReport] = useState(initial?.utilizationReport ?? '');
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const targetValue = parseInt(targetAmountXof, 10);
  const canSave = title.trim().length > 0 && startDate.length > 0 && targetAmountXof.trim().length > 0 && targetValue > 0;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setApiError(null);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || undefined,
        targetAmountXof: targetValue,
        startDate,
        endDate: endDate || undefined,
        utilizationReport: utilizationReport.trim() || undefined,
      });
    } catch (e) {
      setApiError(e instanceof Error ? e.message : 'Erreur lors de la sauvegarde de la cagnotte.');
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      data-testid="campaign-form-modal"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FFFFFF', maxHeight: '92vh' }}>
        <div className="flex items-center justify-between px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>{isEdit ? 'Modifier la cagnotte' : 'Nouvelle cagnotte'}</h3>
          <button onClick={onClose} aria-label="Fermer"><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div>
            <label style={LABEL} htmlFor="campaign-form-title">Titre / objet *</label>
            <input id="campaign-form-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex : Rentrée scolaire 2026" style={INPUT} />
          </div>
          <div>
            <label style={LABEL} htmlFor="campaign-form-description">Description</label>
            <textarea id="campaign-form-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} style={{ ...INPUT, resize: 'none' }} />
          </div>
          <div>
            <label style={LABEL} htmlFor="campaign-form-target">Montant cible (FCFA) *</label>
            <input id="campaign-form-target" type="number" min={1} value={targetAmountXof} onChange={(e) => setTargetAmountXof(e.target.value)} placeholder="500000" style={INPUT} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={LABEL} htmlFor="campaign-form-start">Date de début *</label>
              <input id="campaign-form-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={INPUT} />
            </div>
            <div>
              <label style={LABEL} htmlFor="campaign-form-end">Date de fin</label>
              <input id="campaign-form-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={INPUT} />
            </div>
          </div>
          <div>
            <label style={LABEL} htmlFor="campaign-form-utilization">Utilisation / rapport prévu</label>
            <textarea id="campaign-form-utilization" value={utilizationReport} onChange={(e) => setUtilizationReport(e.target.value)} rows={2} placeholder="À quoi serviront les fonds…" style={{ ...INPUT, resize: 'none' }} />
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
