import { useEffect, useState } from 'react';
import { X, Loader2, AlertTriangle } from 'lucide-react';
import { donorProfilesApi, type ApiDonorProfile } from '../../services/donorProfiles.api';
import type { CreateDonorReportInput, ApiDonorReportPeriodType } from '../../services/donorReports.api';
import { PERIOD_TYPE_LABELS } from '../../config/donors.config';

const INPUT: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid #E5E7EB', background: '#FFFFFF',
  color: '#1A1A1A', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};
const LABEL: React.CSSProperties = {
  color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5,
};

export interface DonorReportFormModalProps {
  fixedDonorProfileId?: string;
  onSave: (data: CreateDonorReportInput) => Promise<void>;
  onClose: () => void;
}

// Only PARRAIN profiles are ever offered here — a DONATEUR_PONCTUEL is
// never silently enrolled into periodic reporting (see DonorReportsService
// on the backend; this mirrors that rule at the UI level).
export function DonorReportFormModal({ fixedDonorProfileId, onSave, onClose }: DonorReportFormModalProps) {
  const [sponsors, setSponsors] = useState<ApiDonorProfile[]>([]);
  const [donorProfileId, setDonorProfileId] = useState(fixedDonorProfileId ?? '');
  const [periodType, setPeriodType] = useState<ApiDonorReportPeriodType>('TRIMESTRIEL');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [activitiesNarrative, setActivitiesNarrative] = useState('');
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    // Backend caps pageSize at 100 (see QueryDonorProfilesDto) — 200 would
    // 400 and silently leave this select empty via the .catch below.
    donorProfilesApi.list({ type: 'PARRAIN', active: true, pageSize: 100 }).then((res) => setSponsors(res.data)).catch(() => {});
  }, []);

  const canSave = !!donorProfileId && periodStart.length > 0 && periodEnd.length > 0 && periodEnd >= periodStart;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setApiError(null);
    try {
      await onSave({
        donorProfileId,
        periodType,
        periodStart,
        periodEnd,
        activitiesNarrative: activitiesNarrative.trim() || undefined,
      });
    } catch (e) {
      setApiError(e instanceof Error ? e.message : 'Erreur lors de la création du rapport.');
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      data-testid="donor-report-form-modal"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FFFFFF', maxHeight: '92vh' }}>
        <div className="flex items-center justify-between px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>Nouveau rapport donateur</h3>
          <button onClick={onClose} aria-label="Fermer"><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div>
            <label style={LABEL} htmlFor="report-form-sponsor">Parrain *</label>
            <select id="report-form-sponsor" value={donorProfileId} disabled={!!fixedDonorProfileId}
              onChange={(e) => setDonorProfileId(e.target.value)} style={{ ...INPUT, cursor: fixedDonorProfileId ? 'not-allowed' : 'pointer' }}>
              <option value="">Sélectionner un parrain…</option>
              {sponsors.map((s) => <option key={s.id} value={s.id}>{s.contact.fullName}</option>)}
            </select>
            {sponsors.length === 0 && (
              <p style={{ color: '#9CA3AF', fontSize: 11, marginTop: 4 }}>Aucun parrain actif. Les rapports périodiques ne concernent que les parrains.</p>
            )}
          </div>

          <div>
            <label style={LABEL} htmlFor="report-form-period-type">Type de période *</label>
            <select id="report-form-period-type" value={periodType} onChange={(e) => setPeriodType(e.target.value as ApiDonorReportPeriodType)} style={{ ...INPUT, cursor: 'pointer' }}>
              <option value="MENSUEL">{PERIOD_TYPE_LABELS.MENSUEL}</option>
              <option value="TRIMESTRIEL">{PERIOD_TYPE_LABELS.TRIMESTRIEL}</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={LABEL} htmlFor="report-form-start">Début de période *</label>
              <input id="report-form-start" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} style={INPUT} />
            </div>
            <div>
              <label style={LABEL} htmlFor="report-form-end">Fin de période *</label>
              <input id="report-form-end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} style={INPUT} />
            </div>
          </div>

          <div>
            <label style={LABEL} htmlFor="report-form-narrative">Résumé des activités (optionnel)</label>
            <textarea id="report-form-narrative" value={activitiesNarrative} onChange={(e) => setActivitiesNarrative(e.target.value)}
              rows={3} placeholder="Texte libre décrivant la période (aucune information nominative sur un enfant)…" style={{ ...INPUT, resize: 'none' }} />
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
            Créer
          </button>
        </div>
      </div>
    </div>
  );
}
