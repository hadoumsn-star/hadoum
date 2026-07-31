import { useState } from 'react';
import { useAppData } from '../context/AppDataContext';
import { CheckCircle2, XCircle, Clock, ShieldCheck, X } from 'lucide-react';

const URG = {
  haute:   { bg: '#FEF2F2', color: '#B91C1C', label: 'Urgente'  },
  normale: { bg: '#EEF2F7', color: '#3E5A78', label: 'Normale'  },
  basse:   { bg: '#F9F7F3', color: '#6B7280', label: 'Basse'    },
};

type StatusFilter = 'all' | 'pending' | 'validated' | 'rejected';

function NoteModal({ onConfirm, onClose, action }: { onConfirm: (note: string) => void; onClose: () => void; action: 'validate' | 'reject' }) {
  const [note, setNote] = useState('');
  const isReject = action === 'reject';
  const canConfirm = !isReject || note.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl" style={{ background: '#FFFFFF' }}>
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>
            {isReject ? 'Refuser la demande' : 'Valider la demande'}
          </h3>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>
        <div className="px-6 py-5">
          <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 6 }}>
            {isReject
              ? <>Raison du refus <span style={{ color: '#B91C1C' }}>*</span></>
              : 'Note / commentaire (optionnel)'
            }
          </label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={isReject ? 'Indiquez la raison du refus…' : 'Validé. Aucune réserve.'}
            rows={3}
            className="w-full px-3 py-2 rounded-lg outline-none resize-none"
            style={{ background: '#F9F7F3', border: `1px solid ${isReject && !note.trim() ? '#FECACA' : '#E5E7EB'}`, color: '#1A1A1A', fontSize: 13, width: '100%', boxSizing: 'border-box' }} />
          {isReject && (
            <p style={{ color: note.trim() ? '#9CA3AF' : '#B91C1C', fontSize: 11, marginTop: 5 }}>
              Merci d'indiquer la raison du refus.
            </p>
          )}
        </div>
        <div className="flex gap-2 px-6 pb-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Annuler
          </button>
          <button
            onClick={() => canConfirm && onConfirm(note)}
            disabled={!canConfirm}
            className="flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2"
            style={{
              background: !canConfirm ? '#E5E7EB' : isReject ? '#B91C1C' : '#065F46',
              color: !canConfirm ? '#9CA3AF' : '#FFFFFF',
              fontSize: 13, fontWeight: 600, border: 'none',
              cursor: canConfirm ? 'pointer' : 'not-allowed',
            }}>
            {isReject ? <><XCircle size={14} /> Confirmer le refus</> : <><CheckCircle2 size={14} /> Valider</>}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ValidationsPage() {
  const { validations, validateRequest, refuseRequest } = useAppData();
  const [filter, setFilter] = useState<StatusFilter>('pending');
  const [noteModal, setNoteModal] = useState<{ id: number; action: 'validate' | 'reject' } | null>(null);

  const data = validations.filter((v) => {
    if (filter === 'pending')   return v.status === 'en attente';
    if (filter === 'validated') return v.status === 'validée';
    if (filter === 'rejected')  return v.status === 'refusée';
    return true;
  });

  const counts = {
    all: validations.length,
    pending:   validations.filter(v => v.status === 'en attente').length,
    validated: validations.filter(v => v.status === 'validée').length,
    rejected:  validations.filter(v => v.status === 'refusée').length,
  };

  const handleConfirm = (note: string) => {
    if (!noteModal) return;
    if (noteModal.action === 'validate') validateRequest(noteModal.id, note || 'Validé');
    else refuseRequest(noteModal.id, note || 'Refusé');
    setNoteModal(null);
  };

  return (
    <div className="px-4 md:px-6 py-6 space-y-5" style={{ maxWidth: 1000 }}>
      <div>
        <h2 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>Validations en attente</h2>
        <p style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>Demandes nécessitant votre décision</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {([
          ['all', 'Toutes', counts.all],
          ['pending', 'En attente', counts.pending],
          ['validated', 'Validées', counts.validated],
          ['rejected', 'Refusées', counts.rejected],
        ] as [StatusFilter, string, number][]).map(([f, label, n]) => (
          <button key={f} onClick={() => setFilter(f)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all"
            style={{
              background: filter === f ? '#3E5A78' : '#FFFFFF',
              color: filter === f ? '#FFFFFF' : '#374151',
              fontSize: 13, fontWeight: 500, border: `1px solid ${filter === f ? '#3E5A78' : '#E5E7EB'}`, cursor: 'pointer',
            }}>
            {label}
            <span className="px-1.5 py-0.5 rounded-full"
              style={{ background: filter === f ? 'rgba(255,255,255,0.25)' : '#F3F4F6', color: filter === f ? '#FFFFFF' : '#6B7280', fontSize: 11, fontWeight: 600 }}>
              {n}
            </span>
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-3">
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
            <ShieldCheck size={32} style={{ color: '#065F46', marginBottom: 12 }} />
            <p style={{ color: '#374151', fontSize: 15, fontWeight: 500 }}>
              {filter === 'pending' ? 'Aucune demande en attente' : 'Aucun élément'}
            </p>
          </div>
        ) : (
          data.map((v) => {
            const urg = URG[v.urgency];
            const isVal = v.status === 'validée';
            const isRej = v.status === 'refusée';
            return (
              <div key={v.id} className="rounded-xl p-5" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', opacity: isVal || isRej ? 0.7 : 1 }}>
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded-full" style={{ background: '#F3F4F6', color: '#374151', fontSize: 10, fontWeight: 600 }}>
                        {v.type.toUpperCase()}
                      </span>
                      <span className="px-2 py-0.5 rounded-full" style={{ background: urg.bg, color: urg.color, fontSize: 10, fontWeight: 600 }}>
                        {urg.label.toUpperCase()}
                      </span>
                      {isVal && <span className="px-2 py-0.5 rounded-full" style={{ background: '#ECFDF5', color: '#065F46', fontSize: 10, fontWeight: 600 }}>VALIDÉE</span>}
                      {isRej && <span className="px-2 py-0.5 rounded-full" style={{ background: '#FEF2F2', color: '#B91C1C', fontSize: 10, fontWeight: 600 }}>REFUSÉE</span>}
                    </div>
                    <p style={{ color: '#1A1A1A', fontSize: 14, fontWeight: 600 }}>{v.description}</p>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span style={{ color: '#6B7280', fontSize: 12 }}>Soumis par {v.submittedBy}</span>
                      <span style={{ color: '#9CA3AF', fontSize: 12 }}>·</span>
                      <span className="flex items-center gap-1" style={{ color: '#9CA3AF', fontSize: 12 }}>
                        <Clock size={11} /> {v.date}
                      </span>
                    </div>
                    {(isVal || isRej) && v.note && (
                      <p style={{ color: '#6B7280', fontSize: 12, marginTop: 6, fontStyle: 'italic' }}>
                        Note : {v.note}
                      </p>
                    )}
                  </div>
                  {!isVal && !isRej && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => setNoteModal({ id: v.id, action: 'validate' })}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                        style={{ background: '#ECFDF5', color: '#065F46', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                        <CheckCircle2 size={14} /> Valider
                      </button>
                      <button onClick={() => setNoteModal({ id: v.id, action: 'reject' })}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                        style={{ background: '#FEF2F2', color: '#B91C1C', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                        <XCircle size={14} /> Refuser
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {noteModal && (
        <NoteModal
          action={noteModal.action}
          onConfirm={handleConfirm}
          onClose={() => setNoteModal(null)}
        />
      )}
    </div>
  );
}