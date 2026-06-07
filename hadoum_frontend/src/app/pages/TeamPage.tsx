import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { TeamMember, Candidat, FormerMember } from '../data/mockData';
import {
  Plus, Search, X, Edit3, Check,
  UserMinus, UserCheck, Upload, ArrowUpRight,
  Paperclip, Loader2, CalendarClock, Trash2, Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  teamApi, mapStaff, mapCandidate, mapFormer,
  type ApiStaffStatus, type ApiCandidateStatus,
} from '../services/team.api';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS = {
  present: { bg: '#ECFDF5', color: '#065F46', label: 'Présent' },
  absent:  { bg: '#FEF2F2', color: '#B91C1C', label: 'Absent' },
  conge:   { bg: '#FFFBEB', color: '#D97706', label: 'En congé' },
};

// Couleurs de fonction pour fond de carte + bordure gauche (point 2)
const FUNCTION_CARD_COLOR: Record<string, string> = {
  'Éducateur':     '#065F46',
  'Éducatrice':    '#065F46',
  'Auxiliaire':    '#3E5A78',
  'Comptable':     '#D97706',
  'Infirmière':    '#7C3AED',
  'Infirmier':     '#7C3AED',
  'Direction':     '#7C3AED',
  'Dame de charge':'#3E5A78',
};
function getFunctionColor(role: string): string {
  return FUNCTION_CARD_COLOR[role] ?? '#9CA3AF';
}

// Badge de rôle (texte)
const ROLE_COLOR: Record<string, { bg: string; color: string }> = {
  'Éducateur':  { bg: '#ECFDF5', color: '#065F46' },
  'Éducatrice': { bg: '#ECFDF5', color: '#065F46' },
  'Auxiliaire': { bg: '#EEF2F7', color: '#3E5A78' },
  'Comptable':  { bg: '#FFFBEB', color: '#D97706' },
  'Infirmière': { bg: '#F5F3FF', color: '#7C3AED' },
  'Infirmier':  { bg: '#F5F3FF', color: '#7C3AED' },
  'Direction':  { bg: '#F5F3FF', color: '#7C3AED' },
};
function getRoleStyle(role: string) {
  return ROLE_COLOR[role] ?? { bg: '#F3F4F6', color: '#374151' };
}

const STATUT_CANDIDAT: Record<Candidat['statut'], { bg: string; color: string; label: string }> = {
  'nouveau':         { bg: '#EEF2F7', color: '#3E5A78',  label: 'Nouveau' },
  'présélectionné':  { bg: '#FFFBEB', color: '#D97706',  label: 'Présélectionné' },
  'entretien fait':  { bg: '#ECFDF5', color: '#065F46',  label: 'Entretien fait' },
};

type Tab = 'active' | 'candidates' | 'former';

const INPUT: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1px solid #E5E7EB', background: '#FFFFFF',
  color: '#1A1A1A', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

// ─── Exit Modal (active member) ───────────────────────────────────────────────

function ExitMemberModal({ member, onConfirm, onClose }: {
  member: TeamMember;
  onConfirm: (motif: string) => void;
  onClose: () => void;
}) {
  const [motif,        setMotif]        = useState('');
  const [mutEtabl,     setMutEtabl]     = useState('');
  const [mutDirecteur, setMutDirecteur] = useState('');
  const [dispoText,    setDispoText]    = useState('');
  const [dispoIso,     setDispoIso]     = useState('');

  const isMutation = motif === 'Mutation';

  const handleDispoText = (val: string) => {
    setDispoText(val);
    const m = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) setDispoIso(`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`);
    else if (!val) setDispoIso('');
  };

  const canConfirm = !!motif && (!isMutation || (!!mutEtabl && !!dispoIso));

  const handleConfirm = () => {
    if (!canConfirm) return;
    const fullMotif = isMutation
      ? `Mutation — ${mutEtabl}${mutDirecteur ? ` (${mutDirecteur})` : ''}${dispoIso ? ` — dispo. ${dispoIso}` : ''}`
      : motif;
    onConfirm(fullMotif);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(26,26,26,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FFFFFF', maxHeight: '90vh' }}>
        <div className="flex items-center justify-between px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>Marquer comme sorti</h3>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <p style={{ color: '#374151', fontSize: 13 }}>
            Confirmer la sortie de <strong>{member.name}</strong> de l'équipe active.
          </p>
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Motif de départ *</label>
            <select value={motif} onChange={e => setMotif(e.target.value)} style={{ ...INPUT, cursor: 'pointer' }}>
              <option value="">— Sélectionner —</option>
              <option>Fin de contrat</option>
              <option>Démission</option>
              <option>Départ à la retraite</option>
              <option>Licenciement</option>
              <option>Mutation</option>
              <option>Autre</option>
            </select>
          </div>

          {isMutation && (
            <div className="rounded-xl p-4 space-y-3" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
              <p style={{ color: '#374151', fontSize: 12, fontWeight: 600 }}>Détails de la mutation</p>
              <div>
                <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Établissement de destination *</label>
                <input value={mutEtabl} onChange={e => setMutEtabl(e.target.value)}
                  placeholder="Nom de l'établissement" style={INPUT} />
              </div>
              <div>
                <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Contact du directeur</label>
                <input value={mutDirecteur} onChange={e => setMutDirecteur(e.target.value)}
                  placeholder="Nom — +221 XX XXX XX XX" style={INPUT} />
              </div>
              <div>
                <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Date de départ *</label>
                <div className="flex gap-2 items-center">
                  <input value={dispoText} onChange={e => handleDispoText(e.target.value)}
                    placeholder="JJ/MM/AAAA" style={{ ...INPUT, flex: 1 }} />
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <button type="button"
                      onClick={() => (document.getElementById('exit-dispo-picker') as HTMLInputElement)?.showPicker?.()}
                      className="flex items-center justify-center rounded-lg"
                      style={{ width: 34, height: 34, background: '#F3F4F6', border: '1px solid #E5E7EB', cursor: 'pointer' }}>
                      📅
                    </button>
                    <input id="exit-dispo-picker" type="date" value={dispoIso}
                      onChange={e => { setDispoIso(e.target.value); setDispoText(e.target.value.split('-').reverse().join('/')); }}
                      style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-2 px-6 pb-6 pt-4 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, cursor: 'pointer' }}>
            Annuler
          </button>
          <button disabled={!canConfirm} onClick={handleConfirm} className="flex-1 py-2.5 rounded-lg"
            style={{ background: canConfirm ? '#B91C1C' : '#E5E7EB', color: canConfirm ? '#FFFFFF' : '#9CA3AF', fontSize: 13, fontWeight: 600, border: 'none', cursor: canConfirm ? 'pointer' : 'not-allowed' }}>
            Confirmer la sortie
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Member Modal (modifier fiche existante) ─────────────────────────────

interface EditForm { nom: string; prenom: string; poste: string; statut: TeamMember['status']; }

function ExistingFileRow({ label, hasFile, apiId, type, docId, onReplace, newFile, accept }: {
  label: string; hasFile: boolean; apiId: string;
  type?: 'cv' | 'schedule'; docId?: string;
  onReplace: (f: File | null) => void; newFile: File | null;
  accept?: string;
}) {
  const openExisting = async () => {
    try {
      const { url } = docId
        ? await teamApi.getStaffDocUrl(apiId, docId)
        : await teamApi.getStaffFileUrl(apiId, type!);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch { toast.error('Impossible d\'ouvrir le fichier.'); }
  };

  if (newFile) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
        style={{ border: '1px solid #D1FAE5', background: 'rgba(6,95,70,0.03)' }}>
        <Check size={12} style={{ color: '#065F46', flexShrink: 0 }} />
        <span style={{ flex: 1, color: '#065F46', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{newFile.name}</span>
        <button type="button" onClick={() => onReplace(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B91C1C', padding: 0 }}><X size={13} /></button>
      </div>
    );
  }
  if (hasFile) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
        style={{ border: '1px solid #D1FAE5', background: 'rgba(6,95,70,0.03)' }}>
        <Check size={12} style={{ color: '#065F46', flexShrink: 0 }} />
        <span style={{ flex: 1, color: '#065F46', fontSize: 12 }}>{label} — déjà enregistré</span>
        <button type="button" onClick={openExisting} title="Voir le document"
          className="flex items-center justify-center rounded"
          style={{ width: 26, height: 26, background: '#EEF2F7', color: '#3E5A78', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
          <Eye size={13} />
        </button>
        <label className="flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer flex-shrink-0"
          style={{ background: '#F3F4F6', color: '#374151', fontSize: 11, fontWeight: 600 }}>
          Remplacer
          <input type="file" className="hidden" accept={accept ?? '.pdf,.doc,.docx'} onChange={e => onReplace(e.target.files?.[0] ?? null)} />
        </label>
      </div>
    );
  }
  return <FilePicker label={`Joindre ${label.toLowerCase()}…`} file={null} onChange={onReplace} accept={accept} />;
}

function ExistingDocRow({ doc, apiId, onDelete }: {
  doc: { id: string; label: string };
  apiId: string;
  onDelete: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const open = async () => {
    try {
      const { url } = await teamApi.getStaffDocUrl(apiId, doc.id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch { toast.error('Impossible d\'ouvrir le document.'); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await teamApi.deleteStaffDoc(apiId, doc.id);
      onDelete(doc.id);
    } catch { toast.error('Erreur lors de la suppression.'); }
    finally { setDeleting(false); }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
      style={{ border: '1px solid #D1FAE5', background: 'rgba(6,95,70,0.03)', opacity: deleting ? 0.5 : 1 }}>
      <Check size={12} style={{ color: '#065F46', flexShrink: 0 }} />
      <span style={{ flex: 1, color: '#065F46', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {doc.label}
      </span>
      <button type="button" onClick={open} title="Voir le document"
        className="flex items-center justify-center rounded"
        style={{ width: 26, height: 26, background: '#EEF2F7', color: '#3E5A78', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
        <Eye size={13} />
      </button>
      <button type="button" onClick={handleDelete} disabled={deleting}
        style={{ background: 'none', border: 'none', cursor: deleting ? 'not-allowed' : 'pointer', padding: 2, color: '#B91C1C', flexShrink: 0 }}>
        {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
      </button>
    </div>
  );
}

function MemberEditModal({ member, onSave, onClose }: {
  member: TeamMember & { apiId: string; cvKey?: string | null; scheduleKey?: string | null; scheduleJson?: string | null; notes?: string };
  onSave: (form: EditForm & { cinFile?: File; cvFile?: File; planning: WeekPlan; extraFiles: File[]; remarques: string }) => void;
  onClose: () => void;
}) {
  const parts = member.name.split(' ');
  const [form, setForm]        = useState<EditForm>({ prenom: parts[0] ?? '', nom: parts.slice(1).join(' ') ?? '', poste: member.role, statut: member.status });
  const [cinFile,  setCinFile] = useState<File | null>(null);
  const [cvFile,   setCvFile]  = useState<File | null>(null);
  const [planning, setPlanning] = useState<WeekPlan>(() => parsePlanning((member as any).scheduleJson));
  const [extraFiles, setExtraFiles] = useState<File[]>([]);
  const [remarques,  setRemarques]  = useState((member as any).notes ?? '');
  const [existingDocs, setExistingDocs] = useState<{ id: string; label: string }[]>([]);
  const set = (k: keyof EditForm, v: string) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    teamApi.listStaffDocs(member.apiId).then(setExistingDocs).catch(() => {});
  }, [member.apiId]);

  const cinDocs   = existingDocs.filter(d => d.label === "Carte d'identité nationale");
  const extraDocs = existingDocs.filter(d => d.label !== "Carte d'identité nationale");

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(26,26,26,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FFFFFF', maxHeight: '92vh' }}>
        <div className="flex items-center justify-between px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 17, fontWeight: 700 }}>Modifier la fiche</h3>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* Identité */}
          <div className="space-y-3">
            <SectionTitle>Identité</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Prénom</label>
                <input value={form.prenom} onChange={e => set('prenom', e.target.value)} placeholder="Amine" style={INPUT} autoFocus />
              </div>
              <div>
                <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Nom</label>
                <input value={form.nom} onChange={e => set('nom', e.target.value)} placeholder="Belarbi" style={INPUT} />
              </div>
            </div>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Carte d'identité</label>
              <ExistingFileRow
                label="Carte d'identité"
                hasFile={cinDocs.length > 0}
                apiId={member.apiId}
                docId={cinDocs[0]?.id}
                onReplace={setCinFile}
                newFile={cinFile}
                accept=".pdf,.jpg,.jpeg,.png"
              />
            </div>
          </div>

          {/* Poste */}
          <div className="space-y-3">
            <SectionTitle>Poste</SectionTitle>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Poste</label>
              <input value={form.poste} onChange={e => set('poste', e.target.value)} placeholder="Éducateur, Auxiliaire…" style={INPUT} />
            </div>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Emploi du temps</label>
              <WeeklyPlanning value={planning} onChange={setPlanning} />
            </div>
          </div>

          {/* Documents */}
          <div className="space-y-3">
            <SectionTitle>Documents</SectionTitle>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>CV</label>
              <ExistingFileRow label="CV" hasFile={!!member.cvKey} apiId={member.apiId} type="cv" onReplace={setCvFile} newFile={cvFile} />
            </div>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Documents complémentaires</label>
              <div className="space-y-1.5">
                {extraDocs.map(doc => <ExistingDocRow key={doc.id} doc={doc} apiId={member.apiId} onDelete={id => setExistingDocs(prev => prev.filter(d => d.id !== id))} />)}
                {extraFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg"
                    style={{ border: '1px solid #D1FAE5', background: 'rgba(6,95,70,0.03)' }}>
                    <Check size={12} style={{ color: '#065F46', flexShrink: 0 }} />
                    <span style={{ flex: 1, color: '#1A1A1A', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    <button type="button" onClick={() => setExtraFiles(prev => prev.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B91C1C', padding: 0 }}>
                      <X size={13} />
                    </button>
                  </div>
                ))}
                <label className="w-full flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer"
                  style={{ border: '1.5px dashed #D1D5DB', background: '#FAFAFA' }}>
                  <Upload size={13} style={{ color: '#9CA3AF', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: '#9CA3AF' }}>Ajouter un document…</span>
                  <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    onChange={e => { const f = e.target.files?.[0]; if (f) setExtraFiles(prev => [...prev, f]); e.target.value = ''; }} />
                </label>
              </div>
            </div>
          </div>

          {/* Remarques */}
          <div className="space-y-3">
            <SectionTitle>Remarques</SectionTitle>
            <textarea value={remarques} onChange={e => setRemarques(e.target.value)} rows={3}
              placeholder="Notes libres, observations…"
              style={{ ...INPUT, resize: 'none' }} />
          </div>
        </div>

        <div className="flex gap-2 px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid #F3F4F6', background: '#F9F7F3' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, cursor: 'pointer' }}>
            Annuler
          </button>
          <button onClick={() => onSave({ ...form, cinFile: cinFile ?? undefined, cvFile: cvFile ?? undefined, planning, extraFiles, remarques })}
            className="flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2"
            style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
            <Check size={14} /> Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Member Modal (nouveau membre riche) ───────────────────────────────────

function AddMemberModal({ onSave, onClose }: {
  onSave: (form: EditForm & { cinFile?: File; cvFile?: File; planning: WeekPlan; extraFiles: File[]; remarques: string }) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<EditForm>({ prenom: '', nom: '', poste: '', statut: 'present' });
  const [cinFile,  setCinFile]  = useState<File | null>(null);
  const [cvFile,   setCvFile]   = useState<File | null>(null);
  const [planning, setPlanning] = useState<WeekPlan>(emptyPlan);
  const [extraFiles, setExtraFiles] = useState<File[]>([]);
  const [remarques,  setRemarques]  = useState('');
  const set = (k: keyof EditForm, v: string) => setForm(f => ({ ...f, [k]: v }));
  const canSave = form.prenom.trim() && form.nom.trim();

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(26,26,26,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FFFFFF', maxHeight: '92vh' }}>
        <div className="flex items-center justify-between px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 17, fontWeight: 700 }}>Nouveau membre</h3>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* Identité */}
          <div className="space-y-3">
            <SectionTitle>Identité</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Prénom *</label>
                <input value={form.prenom} onChange={e => set('prenom', e.target.value)} placeholder="Amine" style={INPUT} autoFocus />
              </div>
              <div>
                <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Nom *</label>
                <input value={form.nom} onChange={e => set('nom', e.target.value)} placeholder="Belarbi" style={INPUT} />
              </div>
            </div>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Carte d'identité</label>
              <FilePicker label="Joindre la CIN…" file={cinFile} onChange={setCinFile} accept=".pdf,.jpg,.jpeg,.png" />
            </div>
          </div>

          {/* Poste */}
          <div className="space-y-3">
            <SectionTitle>Poste</SectionTitle>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Poste</label>
              <input value={form.poste} onChange={e => set('poste', e.target.value)} placeholder="Éducateur, Auxiliaire…" style={INPUT} />
            </div>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Emploi du temps</label>
              <WeeklyPlanning value={planning} onChange={setPlanning} />
            </div>
          </div>

          {/* Documents */}
          <div className="space-y-3">
            <SectionTitle>Documents</SectionTitle>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>CV</label>
              <FilePicker label="Joindre un CV…" file={cvFile} onChange={setCvFile} />
            </div>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Documents complémentaires</label>
              <div className="space-y-1.5">
                {extraFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg"
                    style={{ border: '1px solid #D1FAE5', background: 'rgba(6,95,70,0.03)' }}>
                    <Check size={12} style={{ color: '#065F46', flexShrink: 0 }} />
                    <span style={{ flex: 1, color: '#1A1A1A', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    <button type="button" onClick={() => setExtraFiles(prev => prev.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B91C1C', padding: 0 }}>
                      <X size={13} />
                    </button>
                  </div>
                ))}
                <label className="w-full flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer"
                  style={{ border: '1.5px dashed #D1D5DB', background: '#FAFAFA' }}>
                  <Upload size={13} style={{ color: '#9CA3AF', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: '#9CA3AF' }}>Ajouter un document…</span>
                  <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    onChange={e => { const f = e.target.files?.[0]; if (f) setExtraFiles(prev => [...prev, f]); e.target.value = ''; }} />
                </label>
              </div>
            </div>
          </div>

          {/* Remarques */}
          <div className="space-y-3">
            <SectionTitle>Remarques</SectionTitle>
            <textarea value={remarques} onChange={e => setRemarques(e.target.value)} rows={3}
              placeholder="Notes libres, observations…"
              style={{ ...INPUT, resize: 'none' }} />
          </div>
        </div>

        <div className="flex gap-2 px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid #F3F4F6', background: '#F9F7F3' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, cursor: 'pointer' }}>
            Annuler
          </button>
          <button disabled={!canSave} onClick={() => canSave && onSave({ ...form, cinFile: cinFile ?? undefined, cvFile: cvFile ?? undefined, planning, extraFiles, remarques })}
            className="flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2"
            style={{ background: canSave ? '#3E5A78' : '#E5E7EB', color: canSave ? '#FFFFFF' : '#9CA3AF', fontSize: 13, fontWeight: 600, border: 'none', cursor: canSave ? 'pointer' : 'not-allowed' }}>
            <Check size={14} /> Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Candidate Modal ───────────────────────────────────────────────────────

type TypeCandidature = 'spontanee' | 'recommandation' | 'ancien_membre' | 'mutation';

const TYPE_CAND_LABELS: Record<TypeCandidature, string> = {
  spontanee:      'Spontanée',
  recommandation: 'Recommandation',
  ancien_membre:  'Ancien membre',
  mutation:       'Mutation interne',
};

function FilePicker({ label, file, onChange, accept = '.pdf,.doc,.docx' }: {
  label: string; file: File | null; onChange: (f: File | null) => void; accept?: string;
}) {
  return (
    <label className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer"
      style={{ border: `1px solid ${file ? '#A7F3D0' : '#E5E7EB'}`, background: file ? 'rgba(6,95,70,0.04)' : '#FAFAFA' }}>
      <Upload size={14} style={{ color: file ? '#065F46' : '#9CA3AF', flexShrink: 0 }} />
      <span style={{ flex: 1, color: file ? '#065F46' : '#6B7280', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {file ? file.name : label}
      </span>
      {file && (
        <>
          <Check size={13} style={{ color: '#065F46', flexShrink: 0 }} />
          <button type="button" onClick={e => { e.preventDefault(); onChange(null); }}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#B91C1C', flexShrink: 0 }}>
            <X size={13} />
          </button>
        </>
      )}
      <input type="file" className="hidden" accept={accept}
        onChange={e => onChange(e.target.files?.[0] ?? null)} />
    </label>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ color: '#3E5A78', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: '1px solid #EEF2F7', paddingBottom: 4, marginBottom: 2 }}>
      {children}
    </p>
  );
}

// ─── Weekly Planning ──────────────────────────────────────────────────────────

export type PlanningSlot = { debut: string; fin: string; label: string };
export type WeekPlan = Record<string, PlanningSlot[]>;
const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'] as const;

export function emptyPlan(): WeekPlan {
  return Object.fromEntries(JOURS.map(j => [j, []]));
}

export function parsePlanning(json: string | null | undefined): WeekPlan {
  if (!json) return emptyPlan();
  try { return { ...emptyPlan(), ...JSON.parse(json) }; } catch { return emptyPlan(); }
}

const TIME_INPUT: React.CSSProperties = {
  padding: '5px 6px', borderRadius: 6, border: '1px solid #E5E7EB',
  fontSize: 11, color: '#1A1A1A', outline: 'none', width: 76, background: '#FFFFFF',
};

function WeeklyPlanning({ value, onChange, readOnly }: {
  value: WeekPlan;
  onChange: (v: WeekPlan) => void;
  readOnly?: boolean;
}) {
  const addSlot = (day: string) =>
    onChange({ ...value, [day]: [...(value[day] ?? []), { debut: '', fin: '', label: '' }] });

  const removeSlot = (day: string, idx: number) =>
    onChange({ ...value, [day]: (value[day] ?? []).filter((_, i) => i !== idx) });

  const updateSlot = (day: string, idx: number, field: keyof PlanningSlot, val: string) => {
    const slots = [...(value[day] ?? [])];
    slots[idx] = { ...slots[idx], [field]: val };
    onChange({ ...value, [day]: slots });
  };

  return (
    <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }}>
      {JOURS.map((day, di) => {
        const slots = value[day] ?? [];
        return (
          <div key={day} style={{ borderBottom: di < JOURS.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
            <div className="flex items-center justify-between px-3 py-2"
              style={{ background: slots.length > 0 ? '#EEF2F7' : '#F9F7F3' }}>
              <span style={{ color: '#1A1A1A', fontSize: 12, fontWeight: 600, width: 72 }}>{day}</span>
              {slots.length === 0 && (
                <span style={{ color: '#9CA3AF', fontSize: 11, flex: 1, paddingLeft: 8 }}>Aucun créneau</span>
              )}
              {!readOnly && (
                <button type="button" onClick={() => addSlot(day)}
                  style={{ color: '#3E5A78', fontSize: 11, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                  + Créneau
                </button>
              )}
            </div>
            {slots.length > 0 && (
              <div className="px-3 py-2 space-y-1.5" style={{ background: '#FFFFFF' }}>
                {slots.map((slot, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <input type="time" value={slot.debut} disabled={readOnly}
                      onChange={e => updateSlot(day, idx, 'debut', e.target.value)}
                      style={TIME_INPUT} />
                    <span style={{ color: '#9CA3AF', fontSize: 11 }}>→</span>
                    <input type="time" value={slot.fin} disabled={readOnly}
                      onChange={e => updateSlot(day, idx, 'fin', e.target.value)}
                      style={TIME_INPUT} />
                    <input type="text" value={slot.label} disabled={readOnly}
                      onChange={e => updateSlot(day, idx, 'label', e.target.value)}
                      placeholder="Activité…"
                      style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px solid #E5E7EB', fontSize: 11, color: '#1A1A1A', outline: 'none', background: '#FFFFFF' }} />
                    {!readOnly && (
                      <button type="button" onClick={() => removeSlot(day, idx)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B91C1C', padding: 0, flexShrink: 0 }}>
                        <X size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AddCandidateModal({ onSave, onClose }: {
  onSave: (c: Omit<Candidat, 'id'> & { _files: Record<string, File> }) => void;
  onClose: () => void;
}) {
  const [prenom,          setPrenom]          = useState('');
  const [nom,             setNom]             = useState('');
  const [telephone,       setTelephone]       = useState('');
  const [posteVise,       setPosteVise]       = useState('');
  const [typeCand,        setTypeCand]        = useState<TypeCandidature>('spontanee');
  const [disponibleText,  setDisponibleText]  = useState('');
  const [disponibleIso,   setDisponibleIso]   = useState('');
  const [entretien,       setEntretien]       = useState(false);
  const [remarques,       setRemarques]       = useState('');

  // Recommandation fields
  const [recNom,      setRecNom]      = useState('');
  const [recPrenom,   setRecPrenom]   = useState('');
  const [recTel,      setRecTel]      = useState('');
  const [recFonction, setRecFonction] = useState('');

  // Mutation fields
  const [mutEtabl,     setMutEtabl]     = useState('');
  const [mutDirecteur, setMutDirecteur] = useState('');

  // Files
  const [cvFile,          setCvFile]          = useState<File | null>(null);
  const [cinFile,         setCinFile]         = useState<File | null>(null);
  const [extraFiles,      setExtraFiles]      = useState<File[]>([]);

  const handlePhone = (val: string) => {
    const raw = val.replace(/^\+221\s?/, '').replace(/\D/g, '').slice(0, 9);
    const fmt = raw.length === 0 ? '' : raw.length <= 2 ? `+221 ${raw}` : raw.length <= 5 ? `+221 ${raw.slice(0,2)} ${raw.slice(2)}` : raw.length <= 7 ? `+221 ${raw.slice(0,2)} ${raw.slice(2,5)} ${raw.slice(5)}` : `+221 ${raw.slice(0,2)} ${raw.slice(2,5)} ${raw.slice(5,7)} ${raw.slice(7)}`;
    setTelephone(fmt);
  };
  const handleRecTel = (val: string) => {
    const raw = val.replace(/^\+221\s?/, '').replace(/\D/g, '').slice(0, 9);
    const fmt = raw.length === 0 ? '' : raw.length <= 2 ? `+221 ${raw}` : raw.length <= 5 ? `+221 ${raw.slice(0,2)} ${raw.slice(2)}` : raw.length <= 7 ? `+221 ${raw.slice(0,2)} ${raw.slice(2,5)} ${raw.slice(5)}` : `+221 ${raw.slice(0,2)} ${raw.slice(2,5)} ${raw.slice(5,7)} ${raw.slice(7)}`;
    setRecTel(fmt);
  };
  const handleDispoText = (val: string) => {
    setDisponibleText(val);
    const m = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) setDisponibleIso(`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`);
    else if (!val) setDisponibleIso('');
  };

  const canSave = prenom.trim() && nom.trim();

  const handleSubmit = () => {
    if (!canSave) return;
    const contactInfo = typeCand === 'recommandation'
      ? JSON.stringify({ nom: recNom, prenom: recPrenom, tel: recTel, fonction: recFonction })
      : typeCand === 'mutation'
      ? JSON.stringify({ etablissement: mutEtabl, contactDirecteur: mutDirecteur })
      : undefined;

    const files: Record<string, File> = {};
    if (cvFile)     files.cv         = cvFile;
    if (cinFile)    files.cin        = cinFile;
    extraFiles.forEach((f, i) => { files[`extra_${i}`] = f; });

    onSave({
      prenom, nom, telephone, posteVise,
      statut: entretien ? 'entretien fait' : 'nouveau',
      cvUploaded: !!cvFile,
      dateCandidate: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }),
      _typeCandidature: typeCand,
      _disponibleDe: disponibleIso || undefined,
      _contactInfo: contactInfo,
      _notes: remarques || undefined,
      _files: files,
    } as any);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(26,26,26,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FFFFFF', maxHeight: '92vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 17, fontWeight: 700 }}>Ajouter un candidat</h3>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* ── Identité ── */}
          <div className="space-y-3">
            <SectionTitle>Identité</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Prénom *</label>
                <input value={prenom} onChange={e => setPrenom(e.target.value)} placeholder="Sonia" style={INPUT} autoFocus />
              </div>
              <div>
                <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Nom *</label>
                <input value={nom} onChange={e => setNom(e.target.value)} placeholder="Benyahia" style={INPUT} />
              </div>
            </div>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Téléphone</label>
              <input type="tel" value={telephone} onChange={e => handlePhone(e.target.value)} placeholder="+221 77 123 45 67" style={INPUT} />
            </div>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Carte d'identité</label>
              <FilePicker label="Joindre la CIN…" file={cinFile} onChange={setCinFile} accept=".pdf,.jpg,.jpeg,.png" />
            </div>
          </div>

          {/* ── Candidature ── */}
          <div className="space-y-3">
            <SectionTitle>Candidature</SectionTitle>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Poste visé</label>
              <input value={posteVise} onChange={e => setPosteVise(e.target.value)} placeholder="Éducateur, Auxiliaire…" style={INPUT} />
            </div>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Type de candidature</label>
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.entries(TYPE_CAND_LABELS) as [TypeCandidature, string][]).map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setTypeCand(v)}
                    className="py-2 rounded-lg text-center"
                    style={{ background: typeCand === v ? '#3E5A78' : '#F9F7F3', color: typeCand === v ? '#FFFFFF' : '#374151', fontSize: 12, fontWeight: typeCand === v ? 600 : 400, border: `1px solid ${typeCand === v ? '#3E5A78' : '#E5E7EB'}`, cursor: 'pointer' }}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Recommandation */}
            {typeCand === 'recommandation' && (
              <div className="rounded-xl p-4 space-y-3" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
                <p style={{ color: '#374151', fontSize: 12, fontWeight: 600 }}>Contact intermédiaire</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Prénom</label>
                    <input value={recPrenom} onChange={e => setRecPrenom(e.target.value)} placeholder="Prénom" style={INPUT} />
                  </div>
                  <div>
                    <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Nom</label>
                    <input value={recNom} onChange={e => setRecNom(e.target.value)} placeholder="Nom" style={INPUT} />
                  </div>
                </div>
                <div>
                  <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Téléphone</label>
                  <input type="tel" value={recTel} onChange={e => handleRecTel(e.target.value)} placeholder="+221 77 123 45 67" style={INPUT} />
                </div>
                <div>
                  <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Fonction</label>
                  <input value={recFonction} onChange={e => setRecFonction(e.target.value)} placeholder="Directeur, Partenaire…" style={INPUT} />
                </div>
              </div>
            )}

            {/* Mutation */}
            {typeCand === 'mutation' && (
              <div className="rounded-xl p-4 space-y-3" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
                <p style={{ color: '#374151', fontSize: 12, fontWeight: 600 }}>Mutation interne</p>
                <div>
                  <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Établissement d'origine</label>
                  <input value={mutEtabl} onChange={e => setMutEtabl(e.target.value)} placeholder="Nom de l'établissement" style={INPUT} />
                </div>
                <div>
                  <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Contact du directeur d'établissement</label>
                  <input value={mutDirecteur} onChange={e => setMutDirecteur(e.target.value)} placeholder="Nom — +221 XX XXX XX XX" style={INPUT} />
                </div>
              </div>
            )}

            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Disponible à partir du</label>
              <div className="flex gap-2 items-center">
                <input value={disponibleText} onChange={e => handleDispoText(e.target.value)} placeholder="JJ/MM/AAAA" style={{ ...INPUT, flex: 1 }} />
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <button type="button" onClick={() => (document.getElementById('dispo-picker') as HTMLInputElement)?.showPicker?.()}
                    className="flex items-center justify-center rounded-lg"
                    style={{ width: 36, height: 36, background: '#F3F4F6', border: '1px solid #E5E7EB', cursor: 'pointer' }}>📅</button>
                  <input id="dispo-picker" type="date" value={disponibleIso}
                    onChange={e => { setDisponibleIso(e.target.value); setDisponibleText(e.target.value.split('-').reverse().join('/')); }}
                    style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }} />
                </div>
              </div>
            </div>

            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Entretien</label>
              <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid #E5E7EB', width: 'fit-content' }}>
                {([false, true] as const).map(v => (
                  <button key={String(v)} type="button" onClick={() => setEntretien(v)} className="px-4 py-2"
                    style={{ background: entretien === v ? '#3E5A78' : '#FFFFFF', color: entretien === v ? '#FFFFFF' : '#374151', fontSize: 12, fontWeight: entretien === v ? 600 : 400, border: 'none', cursor: 'pointer' }}>
                    {v ? 'Entretien fait' : 'Non fait'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Documents ── */}
          <div className="space-y-3">
            <SectionTitle>Documents</SectionTitle>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>CV</label>
              <FilePicker label="Joindre un CV…" file={cvFile} onChange={setCvFile} />
            </div>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Documents complémentaires</label>
              <div className="space-y-1.5">
                {extraFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg"
                    style={{ border: '1px solid #D1FAE5', background: 'rgba(6,95,70,0.03)' }}>
                    <Check size={12} style={{ color: '#065F46', flexShrink: 0 }} />
                    <span style={{ flex: 1, color: '#1A1A1A', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    <button type="button" onClick={() => setExtraFiles(prev => prev.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B91C1C', padding: 0 }}>
                      <X size={13} />
                    </button>
                  </div>
                ))}
                <label className="w-full flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer"
                  style={{ border: '1.5px dashed #D1D5DB', background: '#FAFAFA' }}>
                  <Upload size={13} style={{ color: '#9CA3AF', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: '#9CA3AF' }}>Ajouter un document…</span>
                  <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    onChange={e => { const f = e.target.files?.[0]; if (f) setExtraFiles(prev => [...prev, f]); e.target.value = ''; }} />
                </label>
              </div>
            </div>
          </div>

          {/* ── Remarques ── */}
          <div className="space-y-3">
            <SectionTitle>Remarques</SectionTitle>
            <textarea value={remarques} onChange={e => setRemarques(e.target.value)} rows={3}
              placeholder="Notes libres, observations…"
              style={{ ...INPUT, resize: 'none' }} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid #F3F4F6', background: '#F9F7F3' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, cursor: 'pointer' }}>
            Annuler
          </button>
          <button disabled={!canSave} onClick={handleSubmit}
            className="flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2"
            style={{ background: canSave ? '#3E5A78' : '#E5E7EB', color: canSave ? '#FFFFFF' : '#9CA3AF', fontSize: 13, fontWeight: 600, border: 'none', cursor: canSave ? 'pointer' : 'not-allowed' }}>
            <Check size={14} /> Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Candidate Modal ──────────────────────────────────────────────────────

function EditCandidateModal({ candidat, onSave, onClose }: {
  candidat: Candidat & { apiId: string };
  onSave: (updated: Candidat & { apiId: string }) => void;
  onClose: () => void;
}) {
  const [telephone,      setTelephone]      = useState((candidat as any).telephone ?? '');
  const [posteVise,      setPosteVise]      = useState((candidat as any).posteVise ?? '');
  const [statut,         setStatut]         = useState<Candidat['statut']>(candidat.statut);
  const [typeCand,       setTypeCand]       = useState<TypeCandidature>(((candidat as any).typeCandidature as TypeCandidature) ?? 'spontanee');
  const [disponibleText, setDisponibleText] = useState(() => {
    if (!(candidat as any).disponibleDe) return '';
    const d = new Date((candidat as any).disponibleDe);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  });
  const [disponibleIso,  setDisponibleIso]  = useState(() => {
    if (!(candidat as any).disponibleDe) return '';
    const d = new Date((candidat as any).disponibleDe);
    return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
  });
  const [remarques,      setRemarques]      = useState(((candidat as any).notes as string) ?? '');
  const [cvFile,         setCvFile]         = useState<File | null>(null);
  const [cinFile,        setCinFile]        = useState<File | null>(null);
  const [extraFiles,     setExtraFiles]     = useState<File[]>([]);
  const [existingDocs,   setExistingDocs]   = useState<{ id: string; label: string }[]>([]);
  const [saving,         setSaving]         = useState(false);

  // Parse contact info
  const parsedContact = (() => {
    try { return (candidat as any).typeCandidature && (candidat as any).contactInfo ? JSON.parse((candidat as any).contactInfo) : null; }
    catch { return null; }
  })();
  const [recNom,      setRecNom]      = useState(parsedContact?.nom ?? '');
  const [recPrenom,   setRecPrenom]   = useState(parsedContact?.prenom ?? '');
  const [recTel,      setRecTel]      = useState(parsedContact?.tel ?? '');
  const [recFonction, setRecFonction] = useState(parsedContact?.fonction ?? '');
  const [mutEtabl,    setMutEtabl]    = useState(parsedContact?.etablissement ?? '');
  const [mutDir,      setMutDir]      = useState(parsedContact?.contactDirecteur ?? '');

  useEffect(() => {
    teamApi.listCandidateDocs(candidat.apiId).then(setExistingDocs).catch(() => {});
  }, [candidat.apiId]);

  const handleDispoText = (val: string) => {
    setDisponibleText(val);
    const m = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) setDisponibleIso(`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`);
    else if (!val) setDisponibleIso('');
  };

  const handleSave = async () => {
    setSaving(true);
    const statusMap: Record<string, ApiCandidateStatus> = {
      'nouveau': 'NOUVEAU', 'présélectionné': 'PRESELECTIONNE', 'entretien fait': 'ENTRETIEN_FAIT',
    };
    const contactInfo = typeCand === 'recommandation'
      ? JSON.stringify({ nom: recNom, prenom: recPrenom, tel: recTel, fonction: recFonction })
      : typeCand === 'mutation'
      ? JSON.stringify({ etablissement: mutEtabl, contactDirecteur: mutDir })
      : undefined;
    try {
      const updated = await teamApi.updateCandidate(candidat.apiId, {
        status: statusMap[statut] as ApiCandidateStatus,
        targetRole: posteVise || undefined,
        phone: telephone || undefined,
        typeCandidature: typeCand,
        disponibleDe: disponibleIso || undefined,
        contactInfo,
        notes: remarques || undefined,
      });
      let final = updated;
      if (cvFile) final = await teamApi.uploadCv(candidat.apiId, cvFile);
      if (cinFile) {
        if (cinDocs[0]) await teamApi.deleteCandidateDoc(candidat.apiId, cinDocs[0].id);
        await teamApi.uploadCandidateDoc(candidat.apiId, cinFile, "Carte d'identité nationale");
      }
      await Promise.all(extraFiles.map(f => teamApi.uploadCandidateDoc(candidat.apiId, f, f.name)));
      onSave({ ...mapCandidate(final), apiId: candidat.apiId } as any);
    } catch { toast.error('Erreur lors de la mise à jour.'); }
    finally { setSaving(false); }
  };

  const cinDocs   = existingDocs.filter(d => d.label === "Carte d'identité nationale");
  const extraDocs = existingDocs.filter(d => d.label !== "Carte d'identité nationale");

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(26,26,26,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FFFFFF', maxHeight: '92vh' }}>
        <div className="flex items-center justify-between px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 17, fontWeight: 700 }}>Modifier le candidat</h3>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* Identité */}
          <div className="space-y-3">
            <SectionTitle>Identité</SectionTitle>
            <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: '#F9F7F3' }}>
              <div className="flex items-center justify-center rounded-full flex-shrink-0"
                style={{ width: 38, height: 38, background: '#EEF2F7', color: '#3E5A78', fontSize: 13, fontWeight: 700 }}>
                {(candidat.prenom[0] ?? '?').toUpperCase()}{(candidat.nom[0] ?? '?').toUpperCase()}
              </div>
              <p style={{ color: '#1A1A1A', fontSize: 14, fontWeight: 600 }}>{candidat.prenom} {candidat.nom}</p>
            </div>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Téléphone</label>
              <input value={telephone} onChange={e => setTelephone(e.target.value)} placeholder="+221 77 123 45 67" style={INPUT} />
            </div>
          </div>

          {/* Candidature */}
          <div className="space-y-3">
            <SectionTitle>Candidature</SectionTitle>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Poste visé</label>
              <input value={posteVise} onChange={e => setPosteVise(e.target.value)} placeholder="Éducateur, Auxiliaire…" style={INPUT} />
            </div>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Type de candidature</label>
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.entries(TYPE_CAND_LABELS) as [TypeCandidature, string][]).map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setTypeCand(v)}
                    className="py-2 rounded-lg text-center"
                    style={{ background: typeCand === v ? '#3E5A78' : '#F9F7F3', color: typeCand === v ? '#FFFFFF' : '#374151', fontSize: 12, fontWeight: typeCand === v ? 600 : 400, border: `1px solid ${typeCand === v ? '#3E5A78' : '#E5E7EB'}`, cursor: 'pointer' }}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            {typeCand === 'recommandation' && (
              <div className="rounded-xl p-4 space-y-3" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
                <p style={{ color: '#374151', fontSize: 12, fontWeight: 600 }}>Contact intermédiaire</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Prénom</label>
                    <input value={recPrenom} onChange={e => setRecPrenom(e.target.value)} placeholder="Prénom" style={INPUT} />
                  </div>
                  <div>
                    <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Nom</label>
                    <input value={recNom} onChange={e => setRecNom(e.target.value)} placeholder="Nom" style={INPUT} />
                  </div>
                </div>
                <div>
                  <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Téléphone</label>
                  <input value={recTel} onChange={e => setRecTel(e.target.value)} placeholder="+221 77 123 45 67" style={INPUT} />
                </div>
                <div>
                  <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Fonction</label>
                  <input value={recFonction} onChange={e => setRecFonction(e.target.value)} placeholder="Directeur, Partenaire…" style={INPUT} />
                </div>
              </div>
            )}
            {typeCand === 'mutation' && (
              <div className="rounded-xl p-4 space-y-3" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
                <p style={{ color: '#374151', fontSize: 12, fontWeight: 600 }}>Mutation interne</p>
                <div>
                  <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Établissement d'origine</label>
                  <input value={mutEtabl} onChange={e => setMutEtabl(e.target.value)} placeholder="Nom de l'établissement" style={INPUT} />
                </div>
                <div>
                  <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Contact du directeur</label>
                  <input value={mutDir} onChange={e => setMutDir(e.target.value)} placeholder="Nom — +221 XX XXX XX XX" style={INPUT} />
                </div>
              </div>
            )}
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Disponible à partir du</label>
              <div className="flex gap-2 items-center">
                <input value={disponibleText} onChange={e => handleDispoText(e.target.value)} placeholder="JJ/MM/AAAA" style={{ ...INPUT, flex: 1 }} />
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <button type="button" onClick={() => (document.getElementById('edit-cand-dispo') as HTMLInputElement)?.showPicker?.()}
                    className="flex items-center justify-center rounded-lg"
                    style={{ width: 36, height: 36, background: '#F3F4F6', border: '1px solid #E5E7EB', cursor: 'pointer' }}>📅</button>
                  <input id="edit-cand-dispo" type="date" value={disponibleIso}
                    onChange={e => { setDisponibleIso(e.target.value); setDisponibleText(e.target.value.split('-').reverse().join('/')); }}
                    style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }} />
                </div>
              </div>
            </div>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Entretien</label>
              <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid #E5E7EB', width: 'fit-content' }}>
                {([false, true] as const).map(v => {
                  const active = v ? statut === 'entretien fait' : statut !== 'entretien fait';
                  return (
                    <button key={String(v)} type="button"
                      onClick={() => setStatut(v ? 'entretien fait' : statut === 'entretien fait' ? 'nouveau' : statut)}
                      className="px-4 py-2"
                      style={{ background: active ? '#3E5A78' : '#FFFFFF', color: active ? '#FFFFFF' : '#374151', fontSize: 12, fontWeight: active ? 600 : 400, border: 'none', cursor: 'pointer' }}>
                      {v ? 'Entretien fait' : 'Non fait'}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Statut</label>
              <select value={statut} onChange={e => setStatut(e.target.value as Candidat['statut'])} style={{ ...INPUT, cursor: 'pointer' }}>
                <option value="nouveau">Nouveau</option>
                <option value="présélectionné">Présélectionné</option>
                <option value="entretien fait">Entretien fait</option>
              </select>
            </div>
          </div>

          {/* Documents */}
          <div className="space-y-3">
            <SectionTitle>Documents</SectionTitle>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Carte d'identité</label>
              <div className="space-y-1.5">
                {cinDocs[0] && !cinFile && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
                    style={{ border: '1px solid #D1FAE5', background: 'rgba(6,95,70,0.03)' }}>
                    <Check size={12} style={{ color: '#065F46', flexShrink: 0 }} />
                    <span style={{ flex: 1, color: '#065F46', fontSize: 12 }}>Carte d'identité — déjà enregistrée</span>
                    <button type="button" title="Voir le document" onClick={async () => {
                      try { const { url } = await teamApi.getCandidateDocUrl(candidat.apiId, cinDocs[0].id); window.open(url, '_blank', 'noopener,noreferrer'); }
                      catch { toast.error('Impossible d\'ouvrir le document.'); }
                    }}
                      className="flex items-center justify-center rounded"
                      style={{ width: 26, height: 26, background: '#EEF2F7', color: '#3E5A78', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                      <Eye size={13} />
                    </button>
                  </div>
                )}
                <FilePicker label={cinDocs[0] ? 'Remplacer la CIN…' : 'Joindre la CIN…'} file={cinFile} onChange={setCinFile} accept=".pdf,.jpg,.jpeg,.png" />
              </div>
            </div>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>CV</label>
              <div className="space-y-1.5">
                {candidat.cvUploaded && !cvFile && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
                    style={{ border: '1px solid #D1FAE5', background: 'rgba(6,95,70,0.03)' }}>
                    <Check size={12} style={{ color: '#065F46', flexShrink: 0 }} />
                    <span style={{ flex: 1, color: '#065F46', fontSize: 12 }}>CV — déjà enregistré</span>
                    <button type="button" title="Voir le CV" onClick={async () => {
                      try { const { url } = await teamApi.getCvUrl(candidat.apiId); window.open(url, '_blank', 'noopener,noreferrer'); }
                      catch { toast.error('Impossible d\'ouvrir le CV.'); }
                    }}
                      className="flex items-center justify-center rounded"
                      style={{ width: 26, height: 26, background: '#EEF2F7', color: '#3E5A78', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                      <Eye size={13} />
                    </button>
                  </div>
                )}
                <FilePicker label={candidat.cvUploaded ? 'Remplacer le CV…' : 'Joindre un CV…'} file={cvFile} onChange={setCvFile} />
              </div>
            </div>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Documents complémentaires</label>
              <div className="space-y-1.5">
                {extraDocs.map(doc => (
                  <div key={doc.id} className="flex items-center gap-2 px-3 py-2 rounded-lg"
                    style={{ border: '1px solid #D1FAE5', background: 'rgba(6,95,70,0.03)' }}>
                    <Check size={12} style={{ color: '#065F46', flexShrink: 0 }} />
                    <span style={{ flex: 1, color: '#065F46', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.label}</span>
                    <button type="button" title="Voir le document" onClick={async () => {
                      try { const { url } = await teamApi.getCandidateDocUrl(candidat.apiId, doc.id); window.open(url, '_blank', 'noopener,noreferrer'); }
                      catch { toast.error('Impossible d\'ouvrir le document.'); }
                    }}
                      className="flex items-center justify-center rounded"
                      style={{ width: 26, height: 26, background: '#EEF2F7', color: '#3E5A78', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                      <Eye size={13} />
                    </button>
                    <button type="button" onClick={async () => {
                      try { await teamApi.deleteCandidateDoc(candidat.apiId, doc.id); setExistingDocs(prev => prev.filter(d => d.id !== doc.id)); }
                      catch { toast.error('Erreur lors de la suppression.'); }
                    }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#B91C1C', flexShrink: 0 }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                {extraFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg"
                    style={{ border: '1px solid #D1FAE5', background: 'rgba(6,95,70,0.03)' }}>
                    <Check size={12} style={{ color: '#065F46', flexShrink: 0 }} />
                    <span style={{ flex: 1, color: '#1A1A1A', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    <button type="button" onClick={() => setExtraFiles(prev => prev.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B91C1C', padding: 0 }}>
                      <X size={13} />
                    </button>
                  </div>
                ))}
                <label className="w-full flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer"
                  style={{ border: '1.5px dashed #D1D5DB', background: '#FAFAFA' }}>
                  <Upload size={13} style={{ color: '#9CA3AF', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: '#9CA3AF' }}>Ajouter un document…</span>
                  <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    onChange={e => { const f = e.target.files?.[0]; if (f) setExtraFiles(prev => [...prev, f]); e.target.value = ''; }} />
                </label>
              </div>
            </div>
          </div>

          {/* Remarques */}
          <div className="space-y-3">
            <SectionTitle>Remarques</SectionTitle>
            <textarea value={remarques} onChange={e => setRemarques(e.target.value)} rows={3}
              placeholder="Notes libres, observations…"
              style={{ ...INPUT, resize: 'none' }} />
          </div>
        </div>

        <div className="flex gap-2 px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid #F3F4F6', background: '#F9F7F3' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, cursor: 'pointer' }}>
            Annuler
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2"
            style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 600, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Reintegration Modal (point 3) ────────────────────────────────────────────

function ReintegrationModal({ member, onConfirm, onClose }: {
  member: FormerMember;
  onConfirm: (poste: string, date: string, note: string, planning: WeekPlan) => void;
  onClose: () => void;
}) {
  const [poste,    setPoste]    = useState(member.role);
  const [dateText, setDateText] = useState('');
  const [dateIso,  setDateIso]  = useState('');
  const [note,     setNote]     = useState('');
  const [planning, setPlanning] = useState<WeekPlan>(emptyPlan);

  const handleDateText = (val: string) => {
    setDateText(val);
    const m = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) setDateIso(`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`);
    else if (!val) setDateIso('');
  };

  const canSave = !!dateIso;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(26,26,26,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl" style={{ background: '#FFFFFF' }}>
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>Réintégrer dans l'équipe</h3>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p style={{ color: '#374151', fontSize: 13 }}>
            <strong>{member.name}</strong> sera ajouté à l'équipe active avec le statut Présent.
          </p>
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Nouveau poste</label>
            <input value={poste} onChange={e => setPoste(e.target.value)} placeholder="Poste…" style={INPUT} />
          </div>
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Date de réintégration *</label>
            <div className="flex gap-2 items-center">
              <input value={dateText} onChange={e => handleDateText(e.target.value)}
                placeholder="JJ/MM/AAAA" style={{ ...INPUT, flex: 1 }} />
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <button type="button"
                  onClick={() => (document.getElementById('reintegrate-date-picker') as HTMLInputElement)?.showPicker?.()}
                  className="flex items-center justify-center rounded-lg"
                  style={{ width: 34, height: 34, background: '#F3F4F6', border: '1px solid #E5E7EB', cursor: 'pointer' }}>
                  📅
                </button>
                <input id="reintegrate-date-picker" type="date" value={dateIso}
                  onChange={e => { setDateIso(e.target.value); setDateText(e.target.value.split('-').reverse().join('/')); }}
                  style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }} />
              </div>
            </div>
          </div>
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Emploi du temps</label>
            <WeeklyPlanning value={planning} onChange={setPlanning} />
          </div>
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Note optionnelle</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
              placeholder="Informations complémentaires…"
              style={{ ...INPUT, resize: 'none' }} />
          </div>
        </div>
        <div className="flex gap-2 px-6 pb-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, cursor: 'pointer' }}>
            Annuler
          </button>
          <button disabled={!canSave} onClick={() => canSave && onConfirm(poste, dateIso, note, planning)}
            className="flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2"
            style={{ background: canSave ? '#065F46' : '#E5E7EB', color: canSave ? '#FFFFFF' : '#9CA3AF', fontSize: 13, fontWeight: 600, border: 'none', cursor: canSave ? 'pointer' : 'not-allowed' }}>
            <UserCheck size={14} /> Réintégrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Integration Modal (candidat → équipe active) ─────────────────────────────

function IntegrationModal({ candidat, onConfirm, onClose }: {
  candidat: Candidat & { apiId: string };
  onConfirm: (poste: string, date: string, planning: WeekPlan) => void;
  onClose: () => void;
}) {
  const [poste,    setPoste]    = useState((candidat as any).posteVise ?? '');
  const [dateText, setDateText] = useState('');
  const [dateIso,  setDateIso]  = useState('');
  const [planning, setPlanning] = useState<WeekPlan>(emptyPlan);

  const handleDateText = (val: string) => {
    setDateText(val);
    const m = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) setDateIso(`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`);
    else if (!val) setDateIso('');
  };

  const today = new Date().toISOString().split('T')[0];
  const isFuture = dateIso > today;
  const canSave  = !!dateIso;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(26,26,26,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FFFFFF', maxHeight: '90vh' }}>
        <div className="flex items-center justify-between px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>Intégrer ce membre</h3>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: '#F9F7F3' }}>
            <div className="flex items-center justify-center rounded-full flex-shrink-0"
              style={{ width: 36, height: 36, background: '#EEF2F7', color: '#3E5A78', fontSize: 12, fontWeight: 700 }}>
              {(candidat.prenom[0] ?? '?').toUpperCase()}{(candidat.nom[0] ?? '?').toUpperCase()}
            </div>
            <p style={{ color: '#1A1A1A', fontSize: 14, fontWeight: 600 }}>{candidat.prenom} {candidat.nom}</p>
          </div>
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Poste</label>
            <input value={poste} onChange={e => setPoste(e.target.value)} placeholder="Éducateur, Auxiliaire…" style={INPUT} />
          </div>
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Date d'intégration *</label>
            <div className="flex gap-2 items-center">
              <input value={dateText} onChange={e => handleDateText(e.target.value)}
                placeholder="JJ/MM/AAAA" style={{ ...INPUT, flex: 1 }} />
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <button type="button"
                  onClick={() => (document.getElementById('integration-date-picker') as HTMLInputElement)?.showPicker?.()}
                  className="flex items-center justify-center rounded-lg"
                  style={{ width: 34, height: 34, background: '#F3F4F6', border: '1px solid #E5E7EB', cursor: 'pointer' }}>
                  📅
                </button>
                <input id="integration-date-picker" type="date" value={dateIso}
                  onChange={e => { setDateIso(e.target.value); setDateText(e.target.value.split('-').reverse().join('/')); }}
                  style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }} />
              </div>
            </div>
            {dateIso && (
              <p style={{ fontSize: 11, marginTop: 5, color: isFuture ? '#D97706' : '#065F46', fontWeight: 500 }}>
                {isFuture
                  ? `Intégration programmée — le candidat restera dans "Candidats en cours"`
                  : 'Date atteinte — le membre sera intégré immédiatement dans l\'équipe active'}
              </p>
            )}
          </div>
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Emploi du temps</label>
            <WeeklyPlanning value={planning} onChange={setPlanning} />
          </div>
        </div>
        <div className="flex gap-2 px-6 pb-6 pt-4 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, cursor: 'pointer' }}>
            Annuler
          </button>
          <button disabled={!canSave} onClick={() => canSave && onConfirm(poste, dateIso, planning)}
            className="flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2"
            style={{ background: canSave ? (isFuture ? '#D97706' : '#065F46') : '#E5E7EB', color: canSave ? '#FFFFFF' : '#9CA3AF', fontSize: 13, fontWeight: 600, border: 'none', cursor: canSave ? 'pointer' : 'not-allowed' }}>
            <UserCheck size={14} />
            {isFuture ? 'Programmer l\'intégration' : 'Intégrer maintenant'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Attendance Modal ─────────────────────────────────────────────────────────

type AttendanceType = 'conge' | 'retard' | 'absence';

const ATTENDANCE_LABELS: Record<AttendanceType, { label: string; color: string; bg: string }> = {
  conge:   { label: 'Congé',   color: '#3E5A78', bg: '#EEF2F7' },
  retard:  { label: 'Retard',  color: '#D97706', bg: '#FFFBEB' },
  absence: { label: 'Absence', color: '#7C3AED', bg: '#F5F3FF' },
};

function computeEffectiveStatus(recs: { type: string; dateDebut: string; dateFin: string | null }[]): 'present' | 'absent' | 'conge' {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const r of recs) {
    if (r.type !== 'absence' && r.type !== 'conge') continue;
    const start = new Date(r.dateDebut);
    start.setHours(0, 0, 0, 0);
    const end = r.dateFin ? new Date(r.dateFin) : null;
    if (end) end.setHours(23, 59, 59, 999);
    if (start <= today && (!end || end >= today)) {
      return r.type === 'absence' ? 'absent' : 'conge';
    }
  }
  return 'present';
}

function AttendanceModal({ member, onClose, onMemberStatusChange }: {
  member: TeamMember & { apiId: string };
  onClose: () => void;
  onMemberStatusChange: (status: 'present' | 'absent' | 'conge') => void;
}) {
  const [activeView, setActiveView] = useState<'saisie' | 'mensuel'>('saisie');
  const [type,       setType]       = useState<AttendanceType>('absence');
  const [motif,      setMotif]      = useState('');
  const [debutText,  setDebutText]  = useState('');
  const [debutIso,   setDebutIso]   = useState('');
  const [finText,    setFinText]    = useState('');
  const [finIso,     setFinIso]     = useState('');
  const [justified,  setJustified]  = useState(false);
  const [justif,     setJustif]     = useState<File | null>(null);
  const [saving,      setSaving]      = useState(false);
  const [records,     setRecords]     = useState<{ id: string; type: string; motif: string | null; dateDebut: string; dateFin: string | null; justifKey: string | null }[]>([]);
  const [loadingRec,  setLoadingRec]  = useState(true);
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [editForm,    setEditForm]    = useState<{ type: AttendanceType; debutText: string; debutIso: string; finText: string; finIso: string; motif: string; justified: boolean }>({ type: 'absence', debutText: '', debutIso: '', finText: '', finIso: '', motif: '', justified: false });
  const [updating,      setUpdating]      = useState(false);
  const [editJustifFile, setEditJustifFile] = useState<File | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    teamApi.getAttendance(member.apiId)
      .then(setRecords)
      .catch(() => {})
      .finally(() => setLoadingRec(false));
  }, [member.apiId]);

  // Build monthly summary
  const monthlySummary = useMemo(() => {
    const map: Record<string, { retards: number; absJust: number; absNonJust: number; conges: number }> = {};
    records.forEach(r => {
      const d = new Date(r.dateDebut);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!map[key]) map[key] = { retards: 0, absJust: 0, absNonJust: 0, conges: 0 };
      if (r.type === 'retard')   map[key].retards++;
      if (r.type === 'conge')    map[key].conges++;
      if (r.type === 'absence')  (r.justified || !!r.justifKey) ? map[key].absJust++ : map[key].absNonJust++;
    });
    return Object.entries(map)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, v]) => ({ key, ...v }));
  }, [records]);

  const parseDate = (val: string, setIso: (v: string) => void) => {
    const m = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) setIso(`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`);
    else if (!val) setIso('');
  };

  const canSave = !!debutIso;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const created = await teamApi.createAttendance(member.apiId, {
        type, motif: motif || undefined, dateDebut: debutIso, dateFin: finIso || undefined,
        justified: type === 'absence' ? (justified || !!justif) : undefined,
      }, justif ?? undefined);
      const newRecords = [created, ...records];
      setRecords(newRecords);
      onMemberStatusChange(computeEffectiveStatus(newRecords));
      setMotif(''); setDebutText(''); setDebutIso(''); setFinText(''); setFinIso(''); setJustif(null); setJustified(false);
      toast.success('Enregistré.');
    } catch { toast.error('Erreur lors de l\'enregistrement.'); }
    finally { setSaving(false); }
  };

  const startEdit = (r: typeof records[0]) => {
    const toText = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const toIso  = (iso: string) => iso.split('T')[0];
    setEditForm({
      type:      (r.type as AttendanceType) || 'absence',
      debutText: toText(r.dateDebut),
      debutIso:  toIso(r.dateDebut),
      finText:   r.dateFin ? toText(r.dateFin) : '',
      finIso:    r.dateFin ? toIso(r.dateFin)  : '',
      motif:     r.motif ?? '',
      justified: r.justified || !!r.justifKey,
    });
    setEditingId(r.id);
    setEditJustifFile(null);
  };

  const handleUpdate = async () => {
    if (!editingId || !editForm.debutIso) return;
    setUpdating(true);
    try {
      let updated = await teamApi.updateAttendance(editingId, {
        type: editForm.type, motif: editForm.motif || undefined,
        dateDebut: editForm.debutIso, dateFin: editForm.finIso || null,
        justified: editForm.type === 'absence' ? (editForm.justified || !!editJustifFile) : undefined,
      });
      if (editJustifFile) {
        updated = { ...updated, ...await teamApi.uploadAttendanceJustif(editingId, editJustifFile) };
      }
      const newRecords = records.map(r => r.id === editingId ? updated : r);
      setRecords(newRecords);
      onMemberStatusChange(computeEffectiveStatus(newRecords));
      setEditingId(null);
      setEditJustifFile(null);
      toast.success('Modifié.');
    } catch { toast.error('Erreur lors de la modification.'); }
    finally { setUpdating(false); }
  };

  const handleDelete = async (id: string) => {
    setDeletingIds(prev => new Set(prev).add(id));
    try {
      await teamApi.deleteAttendance(id);
      const newRecords = records.filter(r => r.id !== id);
      setRecords(newRecords);
      onMemberStatusChange(computeEffectiveStatus(newRecords));
      if (editingId === id) setEditingId(null);
      toast.success('Supprimé.');
    } catch { toast.error('Erreur lors de la suppression.'); }
    finally { setDeletingIds(prev => { const s = new Set(prev); s.delete(id); return s; }); }
  };

  const parseEditDate = (val: string, field: 'debutText' | 'debutIso' | 'finText' | 'finIso') => {
    setEditForm(f => {
      const next = { ...f, [field]: val };
      if (field === 'debutText') {
        const m = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        next.debutIso = m ? `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` : (val ? f.debutIso : '');
      }
      if (field === 'finText') {
        const m = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        next.finIso = m ? `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` : (val ? f.finIso : '');
      }
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(26,26,26,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FFFFFF', maxHeight: '92vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <div>
            <h3 style={{ color: '#1A1A1A', fontSize: 17, fontWeight: 700 }}>Absences / Congés</h3>
            <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>{member.name}</p>
          </div>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>

        {/* Tab switcher */}
        <div className="flex flex-shrink-0 px-6 pt-3 gap-1" style={{ borderBottom: '1px solid #F3F4F6', paddingBottom: 0 }}>
          {([['saisie', 'Saisie'], ['mensuel', 'Suivi mensuel']] as const).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setActiveView(v)}
              className="px-4 py-2.5"
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: activeView === v ? 600 : 400, color: activeView === v ? '#3E5A78' : '#6B7280', borderBottom: activeView === v ? '2px solid #3E5A78' : '2px solid transparent', marginBottom: -1 }}>
              {l}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* Monthly summary view */}
          {activeView === 'mensuel' && (
            <div className="space-y-3">
              <SectionTitle>Suivi mensuel</SectionTitle>
              {loadingRec ? (
                <div className="flex justify-center py-6"><Loader2 size={16} className="animate-spin" style={{ color: '#9CA3AF' }} /></div>
              ) : monthlySummary.length === 0 ? (
                <p style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Aucun enregistrement.</p>
              ) : (
                <div className="space-y-2">
                  {/* Header row */}
                  <div className="grid grid-cols-5 gap-2 px-3 pb-1" style={{ borderBottom: '1px solid #F3F4F6' }}>
                    {['Mois', 'Retards', 'Abs. just.', 'Abs. n.j.', 'Congés'].map(h => (
                      <p key={h} style={{ color: '#9CA3AF', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em' }}>{h.toUpperCase()}</p>
                    ))}
                  </div>
                  {monthlySummary.map(row => {
                    const [year, month] = row.key.split('-');
                    const monthLabel = new Date(Number(year), Number(month) - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
                    const totalAbs = row.absJust + row.absNonJust;
                    return (
                      <div key={row.key} className="grid grid-cols-5 gap-2 px-3 py-2.5 rounded-lg items-center"
                        style={{ background: '#F9F7F3', border: '1px solid #F3F4F6' }}>
                        <p style={{ color: '#1A1A1A', fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>{monthLabel}</p>
                        <span className="px-2 py-0.5 rounded-full text-center"
                          style={{ background: row.retards > 0 ? '#FFFBEB' : '#F3F4F6', color: row.retards > 0 ? '#D97706' : '#9CA3AF', fontSize: 12, fontWeight: 700 }}>
                          {row.retards}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-center"
                          style={{ background: row.absJust > 0 ? '#ECFDF5' : '#F3F4F6', color: row.absJust > 0 ? '#065F46' : '#9CA3AF', fontSize: 12, fontWeight: 700 }}>
                          {row.absJust}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-center"
                          style={{ background: row.absNonJust > 0 ? '#FEF2F2' : '#F3F4F6', color: row.absNonJust > 0 ? '#B91C1C' : '#9CA3AF', fontSize: 12, fontWeight: 700 }}>
                          {row.absNonJust}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-center"
                          style={{ background: row.conges > 0 ? '#EEF2F7' : '#F3F4F6', color: row.conges > 0 ? '#3E5A78' : '#9CA3AF', fontSize: 12, fontWeight: 700 }}>
                          {row.conges}
                        </span>
                      </div>
                    );
                  })}
                  {/* Totals */}
                  {monthlySummary.length > 1 && monthlySummary.reduce((acc, r) => ({
                      retards: acc.retards + r.retards,
                      absJust: acc.absJust + r.absJust,
                      absNonJust: acc.absNonJust + r.absNonJust,
                      conges: acc.conges + r.conges,
                    }), { retards: 0, absJust: 0, absNonJust: 0, conges: 0 }) && (
                    <div className="grid grid-cols-5 gap-2 px-3 py-2.5 rounded-lg items-center mt-1"
                      style={{ background: '#EEF2F7', border: '1px solid #CBD5E1' }}>
                      <p style={{ color: '#3E5A78', fontSize: 12, fontWeight: 700 }}>TOTAL</p>
                      {[
                        monthlySummary.reduce((s, r) => s + r.retards, 0),
                        monthlySummary.reduce((s, r) => s + r.absJust, 0),
                        monthlySummary.reduce((s, r) => s + r.absNonJust, 0),
                        monthlySummary.reduce((s, r) => s + r.conges, 0),
                      ].map((v, i) => (
                        <span key={i} style={{ color: '#3E5A78', fontSize: 13, fontWeight: 700, textAlign: 'center', display: 'block' }}>{v}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeView === 'saisie' && <>
          {/* New record form */}
          <div className="space-y-3">
            <SectionTitle>Nouvelle saisie</SectionTitle>

            {/* Type */}
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.entries(ATTENDANCE_LABELS) as [AttendanceType, typeof ATTENDANCE_LABELS[AttendanceType]][]).map(([v, meta]) => (
                <button key={v} type="button" onClick={() => setType(v)}
                  className="py-2 px-3 rounded-lg text-left"
                  style={{ background: type === v ? meta.bg : '#F9F7F3', color: type === v ? meta.color : '#374151', fontSize: 12, fontWeight: type === v ? 700 : 400, border: `1px solid ${type === v ? meta.color + '50' : '#E5E7EB'}`, cursor: 'pointer' }}>
                  {meta.label}
                </button>
              ))}
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Date début *</label>
                <div className="flex gap-1.5 items-center">
                  <input value={debutText} onChange={e => { setDebutText(e.target.value); parseDate(e.target.value, setDebutIso); }}
                    placeholder="JJ/MM/AAAA" style={{ ...INPUT, flex: 1, minWidth: 0 }} />
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <button type="button" onClick={() => (document.getElementById('att-debut') as HTMLInputElement)?.showPicker?.()}
                      className="flex items-center justify-center rounded-lg"
                      style={{ width: 32, height: 32, background: '#F3F4F6', border: '1px solid #E5E7EB', cursor: 'pointer' }}>📅</button>
                    <input id="att-debut" type="date" value={debutIso}
                      onChange={e => { setDebutIso(e.target.value); setDebutText(e.target.value.split('-').reverse().join('/')); }}
                      style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }} />
                  </div>
                </div>
              </div>
              <div>
                <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Date fin</label>
                <div className="flex gap-1.5 items-center">
                  <input value={finText} onChange={e => { setFinText(e.target.value); parseDate(e.target.value, setFinIso); }}
                    placeholder="JJ/MM/AAAA" style={{ ...INPUT, flex: 1, minWidth: 0 }} />
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <button type="button" onClick={() => (document.getElementById('att-fin') as HTMLInputElement)?.showPicker?.()}
                      className="flex items-center justify-center rounded-lg"
                      style={{ width: 32, height: 32, background: '#F3F4F6', border: '1px solid #E5E7EB', cursor: 'pointer' }}>📅</button>
                    <input id="att-fin" type="date" value={finIso}
                      onChange={e => { setFinIso(e.target.value); setFinText(e.target.value.split('-').reverse().join('/')); }}
                      style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Motif */}
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Motif</label>
              <input value={motif} onChange={e => setMotif(e.target.value)}
                placeholder="Ex : Maladie, Démarche administrative…" style={INPUT} />
            </div>

            {/* Justifiée / Non justifiée + fichier — uniquement pour absence */}
            {type === 'absence' && (
              <div className="space-y-2">
                <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block' }}>Justification</label>
                <div className="flex gap-2">
                  {[{ v: true, label: 'Justifiée', color: '#065F46', bg: '#ECFDF5', border: '#6EE7B7' },
                    { v: false, label: 'Non justifiée', color: '#B91C1C', bg: '#FEF2F2', border: '#FECACA' }].map(opt => (
                    <button key={String(opt.v)} type="button"
                      onClick={() => setJustified(opt.v)}
                      className="flex-1 py-2 px-3 rounded-lg"
                      style={{
                        background: justified === opt.v ? opt.bg : '#F9F7F3',
                        color: justified === opt.v ? opt.color : '#374151',
                        fontSize: 12, fontWeight: justified === opt.v ? 700 : 400,
                        border: `1px solid ${justified === opt.v ? opt.border : '#E5E7EB'}`,
                        cursor: 'pointer',
                      }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
                <FilePicker
                  label="Joindre un justificatif…"
                  file={justif}
                  onChange={f => { setJustif(f); if (f) setJustified(true); }}
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                />
                {justified && !justif && (
                  <p style={{ color: '#6B7280', fontSize: 11 }}>Justifiée sans pièce jointe.</p>
                )}
              </div>
            )}

            <button disabled={!canSave || saving} onClick={handleSave}
              className="w-full py-2.5 rounded-lg flex items-center justify-center gap-2"
              style={{ background: canSave ? '#3E5A78' : '#E5E7EB', color: canSave ? '#FFFFFF' : '#9CA3AF', fontSize: 13, fontWeight: 600, border: 'none', cursor: canSave ? 'pointer' : 'not-allowed' }}>
              {saving ? <><Loader2 size={14} className="animate-spin" /> Enregistrement…</> : <><Check size={14} /> Enregistrer</>}
            </button>
          </div>

          {/* History */}
          <div className="space-y-2">
            <SectionTitle>Historique</SectionTitle>
            {loadingRec ? (
              <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin" style={{ color: '#9CA3AF' }} /></div>
            ) : records.length === 0 ? (
              <p style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>Aucun enregistrement.</p>
            ) : (
              records.map(r => {
                const meta = ATTENDANCE_LABELS[r.type as AttendanceType] ?? { label: r.type, color: '#374151', bg: '#F3F4F6' };
                const isJustified = r.justified || !!r.justifKey;
                const isDeleting = deletingIds.has(r.id);
                const isEditing  = editingId === r.id;

                if (isEditing) {
                  return (
                    <div key={r.id} className="rounded-lg px-4 py-3 space-y-3"
                      style={{ background: '#F9F7F3', border: '1px solid #3E5A78' }}>
                      {/* Type */}
                      <div className="grid grid-cols-3 gap-1.5">
                        {(Object.entries(ATTENDANCE_LABELS) as [AttendanceType, typeof ATTENDANCE_LABELS[AttendanceType]][]).map(([v, m]) => (
                          <button key={v} type="button" onClick={() => setEditForm(f => ({ ...f, type: v }))}
                            className="py-1.5 rounded-lg text-center"
                            style={{ background: editForm.type === v ? m.bg : '#FFFFFF', color: editForm.type === v ? m.color : '#374151', fontSize: 11, fontWeight: editForm.type === v ? 700 : 400, border: `1px solid ${editForm.type === v ? m.color + '60' : '#E5E7EB'}`, cursor: 'pointer' }}>
                            {m.label}
                          </button>
                        ))}
                      </div>
                      {/* Dates */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label style={{ color: '#374151', fontSize: 11, fontWeight: 500, display: 'block', marginBottom: 3 }}>Début *</label>
                          <div className="flex gap-1 items-center">
                            <input value={editForm.debutText} onChange={e => parseEditDate(e.target.value, 'debutText')}
                              placeholder="JJ/MM/AAAA" style={{ ...INPUT, flex: 1, minWidth: 0, fontSize: 12, padding: '6px 8px' }} />
                            <div style={{ position: 'relative', flexShrink: 0 }}>
                              <button type="button" onClick={() => (document.getElementById('edit-att-debut') as HTMLInputElement)?.showPicker?.()}
                                style={{ width: 28, height: 28, background: '#F3F4F6', border: '1px solid #E5E7EB', borderRadius: 6, cursor: 'pointer' }}>📅</button>
                              <input id="edit-att-debut" type="date" value={editForm.debutIso}
                                onChange={e => { const iso = e.target.value; setEditForm(f => ({ ...f, debutIso: iso, debutText: iso.split('-').reverse().join('/') })); }}
                                style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }} />
                            </div>
                          </div>
                        </div>
                        <div>
                          <label style={{ color: '#374151', fontSize: 11, fontWeight: 500, display: 'block', marginBottom: 3 }}>Fin</label>
                          <div className="flex gap-1 items-center">
                            <input value={editForm.finText} onChange={e => parseEditDate(e.target.value, 'finText')}
                              placeholder="JJ/MM/AAAA" style={{ ...INPUT, flex: 1, minWidth: 0, fontSize: 12, padding: '6px 8px' }} />
                            <div style={{ position: 'relative', flexShrink: 0 }}>
                              <button type="button" onClick={() => (document.getElementById('edit-att-fin') as HTMLInputElement)?.showPicker?.()}
                                style={{ width: 28, height: 28, background: '#F3F4F6', border: '1px solid #E5E7EB', borderRadius: 6, cursor: 'pointer' }}>📅</button>
                              <input id="edit-att-fin" type="date" value={editForm.finIso}
                                onChange={e => { const iso = e.target.value; setEditForm(f => ({ ...f, finIso: iso, finText: iso.split('-').reverse().join('/') })); }}
                                style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }} />
                            </div>
                          </div>
                        </div>
                      </div>
                      {/* Motif */}
                      <input value={editForm.motif} onChange={e => setEditForm(f => ({ ...f, motif: e.target.value }))}
                        placeholder="Motif…" style={{ ...INPUT, fontSize: 12, padding: '6px 8px' }} />
                      {/* Justifiée toggle (edit) */}
                      {editForm.type === 'absence' && (
                        <div className="flex gap-2">
                          {[{ v: true, label: 'Justifiée', color: '#065F46', bg: '#ECFDF5', border: '#6EE7B7' },
                            { v: false, label: 'Non justifiée', color: '#B91C1C', bg: '#FEF2F2', border: '#FECACA' }].map(opt => (
                            <button key={String(opt.v)} type="button"
                              onClick={() => setEditForm(f => ({ ...f, justified: opt.v }))}
                              className="flex-1 py-1.5 rounded-lg"
                              style={{
                                background: editForm.justified === opt.v ? opt.bg : '#FFFFFF',
                                color: editForm.justified === opt.v ? opt.color : '#374151',
                                fontSize: 11, fontWeight: editForm.justified === opt.v ? 700 : 400,
                                border: `1px solid ${editForm.justified === opt.v ? opt.border : '#E5E7EB'}`,
                                cursor: 'pointer',
                              }}>
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                      {/* Justificatif */}
                      <div>
                        <label style={{ color: '#374151', fontSize: 11, fontWeight: 500, display: 'block', marginBottom: 3 }}>Justificatif</label>
                        {r.justifKey && !editJustifFile && (
                          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg mb-1.5"
                            style={{ border: '1px solid #D1FAE5', background: 'rgba(6,95,70,0.03)' }}>
                            <Check size={11} style={{ color: '#065F46', flexShrink: 0 }} />
                            <span style={{ flex: 1, color: '#065F46', fontSize: 11 }}>Justificatif — déjà joint</span>
                            <button type="button" title="Voir le justificatif" onClick={async () => {
                              try { const { url } = await teamApi.getAttendanceJustifUrl(r.id); window.open(url, '_blank', 'noopener,noreferrer'); }
                              catch { toast.error('Impossible d\'ouvrir le justificatif.'); }
                            }}
                              className="flex items-center justify-center rounded"
                              style={{ width: 24, height: 24, background: '#EEF2F7', color: '#3E5A78', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                              <Eye size={12} />
                            </button>
                          </div>
                        )}
                        <FilePicker
                          label={r.justifKey ? 'Remplacer le justificatif…' : 'Joindre un justificatif…'}
                          file={editJustifFile}
                          onChange={f => { setEditJustifFile(f); if (f) setEditForm(ef => ({ ...ef, justified: true })); }}
                          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                        />
                      </div>
                      {/* Actions */}
                      <div className="flex gap-2">
                        <button onClick={() => setEditingId(null)} className="flex-1 py-1.5 rounded-lg"
                          style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 12, cursor: 'pointer' }}>
                          Annuler
                        </button>
                        <button disabled={!editForm.debutIso || updating} onClick={handleUpdate}
                          className="flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1"
                          style={{ background: editForm.debutIso ? '#3E5A78' : '#E5E7EB', color: editForm.debutIso ? '#FFFFFF' : '#9CA3AF', fontSize: 12, fontWeight: 600, border: 'none', cursor: editForm.debutIso ? 'pointer' : 'not-allowed' }}>
                          {updating ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Enregistrer
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={r.id} className="flex items-start gap-3 px-4 py-3 rounded-lg"
                    style={{ background: meta.bg + '60', border: `1px solid ${meta.color}25`, opacity: isDeleting ? 0.5 : 1 }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full" style={{ background: meta.bg, color: meta.color, fontSize: 10, fontWeight: 700 }}>{meta.label.toUpperCase()}</span>
                        {r.type === 'absence' && (
                          <span className="px-2 py-0.5 rounded-full" style={{ background: isJustified ? '#ECFDF5' : '#FEF2F2', color: isJustified ? '#065F46' : '#B91C1C', fontSize: 10, fontWeight: 700 }}>
                            {isJustified ? (r.justifKey ? 'JUSTIFIÉE' : 'JUSTIFIÉE SANS PIÈCE') : 'NON JUSTIFIÉE'}
                          </span>
                        )}
                        <span style={{ color: '#6B7280', fontSize: 12 }}>
                          {new Date(r.dateDebut).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                          {r.dateFin ? ` → ${new Date(r.dateFin).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}` : ''}
                        </span>
                      </div>
                      {r.motif && <p style={{ color: '#374151', fontSize: 12, marginTop: 3 }}>{r.motif}</p>}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {r.justifKey && (
                        <button onClick={async () => {
                          try {
                            const { url } = await teamApi.getAttendanceJustifUrl(r.id);
                            window.open(url, '_blank', 'noopener,noreferrer');
                          } catch { toast.error('Impossible d\'ouvrir le justificatif.'); }
                        }}
                          className="flex items-center gap-1 px-2 py-1 rounded"
                          style={{ background: '#EEF2F7', color: '#3E5A78', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                          <Eye size={13} />
                        </button>
                      )}
                      <button onClick={() => startEdit(r)} disabled={isDeleting}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, color: '#6B7280' }}
                        title="Modifier">
                        <Edit3 size={13} />
                      </button>
                      <button onClick={() => handleDelete(r.id)} disabled={isDeleting}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, color: '#B91C1C' }}
                        title="Supprimer">
                        {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          </>}
        </div>

        <div className="flex justify-end px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid #F3F4F6', background: '#F9F7F3' }}>
          <button onClick={onClose} className="px-5 py-2 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, cursor: 'pointer' }}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Member Card ──────────────────────────────────────────────────────────────

function MemberCard({ m, effectiveStatus, onAttendance, onEdit, onExit }: {
  m: TeamMember;
  effectiveStatus?: 'present' | 'absent' | 'conge';
  onAttendance: (m: TeamMember) => void;
  onEdit: (m: TeamMember) => void;
  onExit: (m: TeamMember) => void;
}) {
  const st = STATUS[effectiveStatus ?? m.status];
  const rs = getRoleStyle(m.role);
  const fnColor = getFunctionColor(m.role);
  return (
    <div className="rounded-xl p-5 flex flex-col gap-3"
      style={{
        background: fnColor + '10',
        border: '1px solid ' + fnColor + '25',
        borderLeft: '2px solid ' + fnColor,
      }}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center rounded-full flex-shrink-0"
            style={{ width: 40, height: 40, background: '#F3F4F6', color: '#6B7280', fontSize: 14, fontWeight: 700 }}>
            {m.initials}
          </div>
          <div>
            <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 600 }}>{m.name}</p>
            <span className="px-2 py-0.5 rounded-full inline-block" style={{ background: rs.bg, color: rs.color, fontSize: 10, fontWeight: 600, marginTop: 2 }}>{m.role}</span>
          </div>
        </div>
        <span className="px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: st.bg, color: st.color, fontSize: 10, fontWeight: 600 }}>{st.label}</span>
      </div>
      {m.classes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {m.classes.map(c => <span key={c} className="px-2 py-0.5 rounded-full" style={{ background: '#F3F4F6', color: '#374151', fontSize: 10, fontWeight: 500 }}>{c}</span>)}
        </div>
      )}

      {/* Planning inline */}
      {(() => {
        const plan = parsePlanning(m.scheduleJson);
        const activeDays = JOURS.filter(j => (plan[j] ?? []).length > 0);
        if (activeDays.length === 0) return null;
        return (
          <div className="space-y-1 pt-2" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
            {activeDays.map(day => (
              <div key={day} className="flex items-start gap-2">
                <span style={{ color: '#9CA3AF', fontSize: 10, fontWeight: 700, width: 26, flexShrink: 0, paddingTop: 2, letterSpacing: '0.03em' }}>
                  {day.slice(0, 3).toUpperCase()}
                </span>
                <div className="flex flex-wrap gap-1">
                  {(plan[day] ?? []).map((slot, i) => (
                    <span key={i} className="px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(62,90,120,0.08)', color: '#3E5A78', fontSize: 9.5, fontWeight: 500, whiteSpace: 'nowrap' }}>
                      {slot.debut}–{slot.fin}{slot.label ? ` · ${slot.label}` : ''}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      <div className="flex items-center justify-between mt-auto pt-2" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
        <span style={{ color: '#9CA3AF', fontSize: 11 }}>Depuis {new Date(m.since).getFullYear()}</span>
        <div className="flex items-center gap-1">
          <button onClick={() => onAttendance(m)} className="p-1.5 rounded-lg hover:bg-white/60"
            title="Absences / Congés" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <CalendarClock size={13} style={{ color: '#D97706' }} />
          </button>
          <button onClick={() => onEdit(m)} className="p-1.5 rounded-lg hover:bg-white/60"
            title="Modifier" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <Edit3 size={13} style={{ color: '#6B7280' }} />
          </button>
          <button onClick={() => onExit(m)} className="p-1.5 rounded-lg hover:bg-red-50"
            title="Marquer comme sorti" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <UserMinus size={13} style={{ color: '#B91C1C' }} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Active Members ───────────────────────────────────────────────────────

function ActiveTab({ members, onExit, onEdit, onAdd, onAttendance }: {
  members: TeamMember[];
  onExit: (m: TeamMember) => void;
  onEdit: (m: TeamMember) => void;
  onAdd: () => void;
  onAttendance: (m: TeamMember) => void;
}) {
  const [search,        setSearch]        = useState('');
  const [filter,        setFilter]        = useState<'all' | 'present' | 'absent' | 'conge'>('all');

  const effStatus = (m: TeamMember): 'present' | 'absent' | 'conge' => m.status;

  const filtered = members.filter(m => {
    const q = search.toLowerCase();
    return (!q || m.name.toLowerCase().includes(q) || m.role.toLowerCase().includes(q))
      && (filter === 'all' || effStatus(m) === filter);
  });

  const counts = {
    all:     members.length,
    present: members.filter(m => effStatus(m) === 'present').length,
    absent:  members.filter(m => effStatus(m) === 'absent').length,
    conge:   members.filter(m => effStatus(m) === 'conge').length,
  };

  const grpLabel = (grp: 'present' | 'absent' | 'conge') => STATUS[grp].label;

  return (
    <div className="space-y-4">

      {/* Status chips + add button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-2 flex-wrap">
          {([
            ['all',     'Tous',      counts.all],
            ['present', 'Présents',  counts.present],
            ['absent',  'Absents',   counts.absent],
            ['conge',   'En congé',  counts.conge],
          ] as [typeof filter, string, number][]).map(([f, label, n]) => (
            <button key={f} onClick={() => setFilter(f)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{ background: filter === f ? '#EEF2F7' : '#FFFFFF', border: `1px solid ${filter === f ? '#3E5A78' : '#E5E7EB'}`, color: filter === f ? '#3E5A78' : '#374151', fontSize: 12, fontWeight: filter === f ? 600 : 400, cursor: 'pointer' }}>
              {label} <span style={{ background: '#F3F4F6', color: '#6B7280', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10 }}>{n}</span>
            </button>
          ))}
        </div>
        <button onClick={onAdd}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg self-start sm:self-auto"
          style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
          <Plus size={16} /> Ajouter un membre
        </button>
      </div>

      {/* Search */}
      <div className="relative" style={{ maxWidth: 320 }}>
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
          className="w-full pl-9 pr-8 py-2 rounded-lg outline-none"
          style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#1A1A1A', fontSize: 13 }} />
        {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X size={13} style={{ color: '#9CA3AF' }} /></button>}
      </div>

      {/* Grid — grouped by effective status when no filter active */}
      {filter === 'all' ? (
        <div className="space-y-6">
          {(['present', 'absent', 'conge'] as const).map(grp => {
            const group = filtered.filter(m => effStatus(m) === grp);
            if (group.length === 0) return null;
            const grpMeta = STATUS[grp];
            return (
              <div key={grp}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2.5 py-1 rounded-lg text-xs font-semibold" style={{ background: grpMeta.bg, color: grpMeta.color }}>
                    {grpLabel(grp)} — {group.length}
                  </span>
                  <div className="flex-1 h-px" style={{ background: grpMeta.color + '20' }} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {group.map(m => <MemberCard key={m.id} m={m} effectiveStatus={effStatus(m)} onAttendance={onAttendance} onEdit={onEdit} onExit={onExit} />)}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(m => <MemberCard key={m.id} m={m} effectiveStatus={effStatus(m)} onAttendance={onAttendance} onEdit={onEdit} onExit={onExit} />)}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Candidates ───────────────────────────────────────────────────────────

function CandidatesTab({ candidates, onAdd, onIntegrate, onIntegrateNow, onEdit }: {
  candidates: (Candidat & { apiId: string })[];
  onAdd: () => void;
  onIntegrate: (c: Candidat & { apiId: string }) => void;
  onIntegrateNow: (c: Candidat & { apiId: string }) => void;
  onEdit: (c: Candidat & { apiId: string }) => void;
}) {
  const [docsPopover, setDocsPopover] = useState<{ id: string; docs: { id: string; label: string }[]; loading: boolean; anchor: { top: number; right: number } } | null>(null);

  const handleCvClick = async (c: Candidat & { apiId: string }) => {
    if (!c.cvUploaded) return;
    try {
      const { url } = await teamApi.getCvUrl(c.apiId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error('Impossible d\'ouvrir le CV.');
    }
  };

  const handleDocsClick = async (c: Candidat & { apiId: string }, e: React.MouseEvent<HTMLButtonElement>) => {
    if (docsPopover?.id === c.apiId) { setDocsPopover(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const anchor = { top: rect.bottom + 4, right: window.innerWidth - rect.right };
    setDocsPopover({ id: c.apiId, docs: [], loading: true, anchor });
    try {
      const docs = await teamApi.listCandidateDocs(c.apiId);
      setDocsPopover(prev => (prev && prev.id === c.apiId) ? { ...prev, docs, loading: false } : prev);
    } catch {
      toast.error('Impossible de charger les documents.');
      setDocsPopover(null);
    }
  };

  const openDoc = async (candidateId: string, docId: string) => {
    try {
      const { url } = await teamApi.getCandidateDocUrl(candidateId, docId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch { toast.error('Impossible d\'ouvrir le document.'); }
  };


  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button onClick={onAdd}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg"
          style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
          <Plus size={16} /> Ajouter un candidat
        </button>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
        {candidates.length === 0 ? (
          <div className="py-12 text-center">
            <p style={{ color: '#9CA3AF', fontSize: 13 }}>Aucun candidat pour l'instant.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid #F3F4F6', background: '#F9F7F3' }}>
                {['Candidat', 'Poste visé', 'Disponible', 'Entretien', 'Recommandé / Provenance', 'CV', 'Docs', ''].map(h => (
                  <th key={h} className="text-left px-5 py-3" style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em' }}>
                    {h.toUpperCase()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {candidates.map((c, i) => {
                const fnColor = getFunctionColor(c.posteVise);
                const typeCand = (c as any).typeCandidature as string | null;
                const parsedInfo = (() => {
                  try { return JSON.parse((c as any).contactInfo ?? '{}'); } catch { return null; }
                })();
                const contact = typeCand === 'recommandation' ? parsedInfo : null;
                const mutation = typeCand === 'mutation' ? parsedInfo : null;
                return (
                  <tr key={c.id}
                    style={{
                      borderBottom: i < candidates.length - 1 ? '1px solid #F9F7F3' : 'none',
                      background: fnColor + '08',
                    }}
                    className="hover:brightness-95 transition-all">

                    {/* Candidat */}
                    <td className="px-5 py-4" style={{ borderLeft: '2px solid ' + fnColor }}>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center rounded-full flex-shrink-0"
                          style={{ width: 32, height: 32, background: '#F3F4F6', color: '#6B7280', fontSize: 11, fontWeight: 700 }}>
                          {(c.prenom[0] ?? '?').toUpperCase()}{(c.nom[0] ?? '?').toUpperCase()}
                        </div>
                        <div>
                          <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 600 }}>{c.prenom} {c.nom}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {c.telephone && <p style={{ color: '#9CA3AF', fontSize: 11 }}>{c.telephone}</p>}
                            {(c as any).typeCandidature && (
                              <span className="px-1.5 py-0.5 rounded-full" style={{ background: '#EEF2F7', color: '#3E5A78', fontSize: 9, fontWeight: 700 }}>
                                {TYPE_CAND_LABELS[(c as any).typeCandidature as TypeCandidature] ?? (c as any).typeCandidature}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Poste visé */}
                    <td className="px-5 py-4" style={{ color: '#374151', fontSize: 13 }}>{c.posteVise || '—'}</td>

                    {/* Disponible */}
                    <td className="px-5 py-4" style={{ color: '#9CA3AF', fontSize: 12 }}>
                      {(c as any).disponibleDe ? new Date((c as any).disponibleDe).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </td>

                    {/* Entretien */}
                    <td className="px-5 py-4">
                      <span className="px-2 py-0.5 rounded-full" style={{
                        background: c.statut === 'entretien fait' ? '#ECFDF5' : '#F3F4F6',
                        color: c.statut === 'entretien fait' ? '#065F46' : '#9CA3AF',
                        fontSize: 10, fontWeight: 700,
                      }}>
                        {c.statut === 'entretien fait' ? 'FAIT' : 'NON FAIT'}
                      </span>
                    </td>

                    {/* Recommandé par / Mutation */}
                    <td className="px-5 py-4">
                      {contact ? (
                        <div>
                          <p style={{ color: '#1A1A1A', fontSize: 12, fontWeight: 600 }}>
                            {[contact.prenom, contact.nom].filter(Boolean).join(' ') || '—'}
                          </p>
                          {contact.tel && <p style={{ color: '#9CA3AF', fontSize: 11 }}>{contact.tel}</p>}
                          {contact.fonction && <p style={{ color: '#6B7280', fontSize: 11 }}>{contact.fonction}</p>}
                        </div>
                      ) : mutation ? (
                        <div>
                          <p style={{ color: '#1A1A1A', fontSize: 12, fontWeight: 600 }}>
                            {mutation.etablissement || 'Mutation interne'}
                          </p>
                          {mutation.contactDirecteur && (
                            <p style={{ color: '#6B7280', fontSize: 11 }}>{mutation.contactDirecteur}</p>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: '#D1D5DB', fontSize: 12 }}>—</span>
                      )}
                    </td>

                    {/* CV */}
                    <td className="px-5 py-4">
                      {c.cvUploaded ? (
                        <button onClick={() => handleCvClick(c)}
                          title="Voir le CV"
                          className="flex items-center justify-center rounded"
                          style={{ width: 28, height: 28, background: '#EEF2F7', color: '#3E5A78', border: 'none', cursor: 'pointer' }}>
                          <Eye size={13} />
                        </button>
                      ) : (
                        <span style={{ color: '#D1D5DB', fontSize: 12 }}>—</span>
                      )}
                    </td>

                    {/* Docs complémentaires */}
                    <td className="px-5 py-4">
                      <button onClick={e => { e.stopPropagation(); handleDocsClick(c, e); }}
                        title="Documents complémentaires"
                        className="flex items-center justify-center rounded"
                        style={{ width: 28, height: 28, background: docsPopover?.id === c.apiId ? '#3E5A78' : '#EEF2F7', color: docsPopover?.id === c.apiId ? '#FFFFFF' : '#3E5A78', border: 'none', cursor: 'pointer' }}>
                        <Paperclip size={13} />
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button onClick={() => onEdit(c)} className="p-1.5 rounded-lg hover:bg-gray-100"
                          title="Modifier" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                          <Edit3 size={13} style={{ color: '#6B7280' }} />
                        </button>
                        {(() => {
                          const sid = (c as any).scheduledIntegrationDate as string | null;
                          const today = new Date().toISOString().split('T')[0];
                          if (sid && sid.split('T')[0] > today) {
                            return (
                              <button onClick={() => onIntegrate(c)}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
                                style={{ background: '#FFFBEB', color: '#D97706', fontSize: 11, fontWeight: 600, border: '1px solid #FDE68A', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                <CalendarClock size={12} />
                                {new Date(sid).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                              </button>
                            );
                          }
                          return (
                            <button onClick={() => sid ? onIntegrateNow(c) : onIntegrate(c)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
                              style={{ background: sid ? '#ECFDF5' : '#EEF2F7', color: sid ? '#065F46' : '#3E5A78', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              <UserCheck size={13} />
                              {sid ? 'Intégrer maintenant' : 'Intégrer'}
                            </button>
                          );
                        })()}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {docsPopover && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setDocsPopover(null)} />
          <div className="fixed z-50 rounded-xl shadow-xl overflow-hidden"
            onClick={e => e.stopPropagation()}
            style={{ top: docsPopover.anchor.top, right: docsPopover.anchor.right, width: 260, background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
            <div className="px-3 py-2" style={{ borderBottom: '1px solid #F3F4F6', background: '#F9F7F3' }}>
              <p style={{ color: '#374151', fontSize: 11, fontWeight: 700 }}>DOCUMENTS COMPLÉMENTAIRES</p>
            </div>
            {docsPopover.loading ? (
              <div className="flex justify-center py-4">
                <Loader2 size={14} className="animate-spin" style={{ color: '#9CA3AF' }} />
              </div>
            ) : docsPopover.docs.length === 0 ? (
              <p className="px-3 py-3" style={{ color: '#9CA3AF', fontSize: 12 }}>Aucun document.</p>
            ) : (
              <div className="py-1" style={{ maxHeight: 260, overflowY: 'auto' }}>
                {docsPopover.docs.map(doc => (
                  <button key={doc.id} onClick={() => openDoc(docsPopover.id, doc.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left"
                    style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                    <Paperclip size={11} style={{ color: '#3E5A78', flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, color: '#374151', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.label}</span>
                    <Eye size={11} style={{ color: '#9CA3AF', flexShrink: 0 }} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

// ─── Tab: Former Members ───────────────────────────────────────────────────────

function FormerTab({ former, onReintegrate, onReintegrateNow }: {
  former: FormerMember[];
  onReintegrate: (m: FormerMember) => void;
  onReintegrateNow: (m: FormerMember) => void;
}) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
      {former.length === 0 ? (
        <div className="py-12 text-center">
          <p style={{ color: '#9CA3AF', fontSize: 13 }}>Aucun ancien membre enregistré.</p>
        </div>
      ) : (
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid #F3F4F6', background: '#F9F7F3' }}>
              {['Ancien membre', 'Poste', 'Date de départ', 'Motif', ''].map(h => (
                <th key={h} className="text-left px-5 py-3" style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em' }}>
                  {h.toUpperCase()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {former.map((m, i) => {
              const fnColor = getFunctionColor(m.role);
              return (
                <tr key={m.id}
                  style={{
                    borderBottom: i < former.length - 1 ? '1px solid #F9F7F3' : 'none',
                    background: fnColor + '08',
                  }}
                  className="hover:brightness-95 transition-all">
                  <td className="px-5 py-4" style={{ borderLeft: '2px solid ' + fnColor }}>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center rounded-full"
                        style={{ width: 32, height: 32, background: '#F3F4F6', color: '#6B7280', fontSize: 11, fontWeight: 700 }}>
                        {m.initials}
                      </div>
                      <p style={{ color: '#374151', fontSize: 13, fontWeight: 600 }}>{m.name}</p>
                    </div>
                  </td>
                  <td className="px-5 py-4" style={{ color: '#374151', fontSize: 13 }}>{m.role}</td>
                  <td className="px-5 py-4" style={{ color: '#9CA3AF', fontSize: 12 }}>{m.dateSortie}</td>
                  <td className="px-5 py-4">
                    <span className="px-2 py-0.5 rounded-full" style={{ background: '#F3F4F6', color: '#6B7280', fontSize: 11, fontWeight: 500 }}>
                      {m.motifSortie}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    {(() => {
                      const srd = (m as any).scheduledReintegrationDate as string | null;
                      const today = new Date().toISOString().split('T')[0];
                      if (srd && srd.split('T')[0] > today) {
                        return (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                              style={{ background: '#FFFBEB', color: '#D97706', fontSize: 11, fontWeight: 600, border: '1px solid #FDE68A', whiteSpace: 'nowrap' }}>
                              <CalendarClock size={11} />
                              Intégration le {new Date(srd).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                            </span>
                            <button onClick={() => onReintegrateNow(m)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg"
                              style={{ background: '#ECFDF5', color: '#065F46', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              <UserCheck size={12} /> Intégrer maintenant
                            </button>
                          </div>
                        );
                      }
                      return (
                        <button onClick={() => onReintegrate(m)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
                          style={{ background: '#EEF2F7', color: '#3E5A78', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          <UserCheck size={13} /> Réintégrer
                        </button>
                      );
                    })()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function TeamPage() {
  const [tab, setTab] = useState<Tab>('active');
  const [members,    setMembers]    = useState<(TeamMember & { apiId: string })[]>([]);
  const [candidates, setCandidates] = useState<(Candidat  & { apiId: string })[]>([]);
  const [former,     setFormer]     = useState<(FormerMember & { apiId: string })[]>([]);
  const [loading,    setLoading]    = useState(true);

  // Modals
  const [exitTarget,         setExitTarget]         = useState<(TeamMember & { apiId: string }) | null>(null);
  const [editTarget,         setEditTarget]         = useState<(TeamMember & { apiId: string }) | null>(null);
  const [showAddMember,      setShowAddMember]      = useState(false);
  const [attendanceTarget,   setAttendanceTarget]   = useState<(TeamMember & { apiId: string }) | null>(null);
  const [showAddCandidate,   setShowAddCandidate]   = useState(false);
  const [editCandidate,      setEditCandidate]      = useState<(Candidat & { apiId: string }) | null>(null);
  const [integrateTarget,    setIntegrateTarget]    = useState<(Candidat & { apiId: string }) | null>(null);
  const [reintegrateTarget,  setReintegrateTarget]  = useState<(FormerMember & { apiId: string }) | null>(null);

  useEffect(() => {
    Promise.all([teamApi.listStaff(), teamApi.listCandidates(), teamApi.listFormer()])
      .then(([staff, cands, ex]) => {
        setMembers(staff.map(mapStaff) as any);
        setCandidates(cands.map(mapCandidate) as any);
        setFormer(ex.map(mapFormer) as any);
      })
      .catch(() => toast.error('Erreur de chargement de l\'équipe.'))
      .finally(() => setLoading(false));
  }, []);

  const handleExit = async (motif: string) => {
    if (!exitTarget) return;
    try {
      const ex = await teamApi.exitStaff(exitTarget.apiId, motif, new Date().toISOString().split('T')[0]);
      setMembers(prev => prev.filter(m => m.apiId !== exitTarget.apiId));
      setFormer(prev => [mapFormer(ex) as any, ...prev]);
      setExitTarget(null);
    } catch { toast.error('Erreur lors du départ.'); }
  };

  const uploadStaffFiles = async (id: string, form: { cinFile?: File; cvFile?: File; planning: WeekPlan; extraFiles: File[]; remarques: string }) => {
    const uploads: Promise<any>[] = [];
    if (form.cinFile) uploads.push(teamApi.uploadStaffDoc(id, form.cinFile, "Carte d'identité nationale"));
    if (form.cvFile)  uploads.push(teamApi.uploadStaffCv(id, form.cvFile));
    form.extraFiles.forEach(f => uploads.push(teamApi.uploadStaffDoc(id, f, f.name)));
    uploads.push(teamApi.updateStaff(id, {
      scheduleJson: JSON.stringify(form.planning),
      ...(form.remarques ? { notes: form.remarques } : {}),
    }));
    await Promise.all(uploads);
  };

  const handleEditSave = async (form: EditForm & { cinFile?: File; cvFile?: File; planning: WeekPlan; extraFiles: File[]; remarques: string }) => {
    if (!editTarget) return;
    const statusMap: Record<string, ApiStaffStatus> = { present: 'PRESENT', absent: 'ABSENT', conge: 'CONGE' };
    try {
      await teamApi.updateStaff(editTarget.apiId, {
        firstName: form.prenom, lastName: form.nom,
        role: form.poste || editTarget.role,
        status: statusMap[form.statut],
      });
      await uploadStaffFiles(editTarget.apiId, form);
      const fresh = await teamApi.getStaff(editTarget.apiId);
      setMembers(prev => prev.map(m => m.apiId === editTarget.apiId ? mapStaff(fresh) as any : m));
      setEditTarget(null);
    } catch { toast.error('Erreur lors de la sauvegarde.'); }
  };

  const handleAddMember = async (form: EditForm & { cinFile?: File; cvFile?: File; planning: WeekPlan; extraFiles: File[]; remarques: string }) => {
    const statusMap: Record<string, ApiStaffStatus> = { present: 'PRESENT', absent: 'ABSENT', conge: 'CONGE' };
    try {
      const created = await teamApi.createStaff({
        firstName: form.prenom, lastName: form.nom,
        role: form.poste || 'Éducateur',
        status: statusMap[form.statut],
      });
      await uploadStaffFiles(created.id, form);
      const fresh = await teamApi.getStaff(created.id);
      setMembers(prev => [mapStaff(fresh) as any, ...prev]);
      setShowAddMember(false);
    } catch { toast.error('Erreur lors de l\'ajout du membre.'); }
  };

  const handleIntegrate = async (poste: string, date: string, planning: WeekPlan) => {
    if (!integrateTarget) return;
    const today = new Date().toISOString().split('T')[0];
    const isFuture = date > today;
    try {
      if (isFuture) {
        const updated = await teamApi.updateCandidate(integrateTarget.apiId, {
          scheduledIntegrationDate: date,
          ...(poste ? { targetRole: poste } : {}),
        });
        setCandidates(prev => prev.map(c => c.apiId === integrateTarget.apiId ? { ...c, ...mapCandidate(updated) } as any : c));
        toast.success(`Intégration de ${integrateTarget.prenom} programmée au ${new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}.`);
      } else {
        const newMember = await teamApi.promote(integrateTarget.apiId, poste || undefined, date);
        await teamApi.updateStaff(newMember.id, { scheduleJson: JSON.stringify(planning) });
        const fresh = await teamApi.getStaff(newMember.id);
        setMembers(prev => [mapStaff(fresh) as any, ...prev]);
        setCandidates(prev => prev.filter(c => c.apiId !== integrateTarget.apiId));
        setTab('active');
        toast.success(`${integrateTarget.prenom} ${integrateTarget.nom} a été intégré(e) dans l'équipe active.`);
      }
      setIntegrateTarget(null);
    } catch { toast.error('Erreur lors de l\'intégration.'); }
  };

  const handleReintegrate = async (poste: string, date: string, _note: string, planning: WeekPlan) => {
    if (!reintegrateTarget) return;
    const today = new Date().toISOString().split('T')[0];
    const isFuture = date > today;
    try {
      if (isFuture) {
        const updated = await teamApi.scheduleReintegration(reintegrateTarget.apiId, poste, date);
        setFormer(prev => prev.map(m => m.apiId === reintegrateTarget.apiId ? { ...m, ...mapFormer(updated) } as any : m));
        const dateLabel = new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
        toast.success(`Réintégration de ${reintegrateTarget.name} programmée au ${dateLabel}.`);
      } else {
        const newMember = await teamApi.reintegrate(reintegrateTarget.apiId, poste, date);
        await teamApi.updateStaff(newMember.id, { scheduleJson: JSON.stringify(planning) });
        const fresh = await teamApi.getStaff(newMember.id);
        setMembers(prev => [mapStaff(fresh) as any, ...prev]);
        setFormer(prev => prev.filter(m => m.apiId !== reintegrateTarget.apiId));
        setTab('active');
        toast.success(`${reintegrateTarget.name} a été réintégré(e) dans l'équipe active.`);
      }
      setReintegrateTarget(null);
    } catch { toast.error('Erreur lors de la réintégration.'); }
  };

  const handleIntegrateNow = async (candidat: Candidat & { apiId: string }) => {
    const today = new Date().toISOString().split('T')[0];
    try {
      const newMember = await teamApi.promote(candidat.apiId, (candidat as any).posteVise || undefined, today);
      const fresh = await teamApi.getStaff(newMember.id);
      setMembers(prev => [mapStaff(fresh) as any, ...prev]);
      setCandidates(prev => prev.filter(c => c.apiId !== candidat.apiId));
      setTab('active');
      toast.success(`${candidat.prenom} ${candidat.nom} a été intégré(e) dans l'équipe active.`);
    } catch { toast.error('Erreur lors de l\'intégration.'); }
  };

  const handleReintegrateNow = async (member: FormerMember & { apiId: string }) => {
    const today = new Date().toISOString().split('T')[0];
    try {
      const newMember = await teamApi.reintegrate(member.apiId, member.role, today);
      const fresh = await teamApi.getStaff(newMember.id);
      setMembers(prev => [mapStaff(fresh) as any, ...prev]);
      setFormer(prev => prev.filter(m => m.apiId !== member.apiId));
      setTab('active');
      toast.success(`${member.name} a été réintégré(e) dans l'équipe active.`);
    } catch { toast.error('Erreur lors de la réintégration.'); }
  };

  const handleAddCandidate = async (c: Omit<Candidat, 'id'> & { _files?: Record<string, File>; _typeCandidature?: string; _disponibleDe?: string; _contactInfo?: string; _notes?: string }) => {
    const candidateStatusMap: Record<string, ApiCandidateStatus> = {
      'nouveau': 'NOUVEAU', 'présélectionné': 'PRESELECTIONNE', 'entretien fait': 'ENTRETIEN_FAIT',
    };
    try {
      const created = await teamApi.createCandidate({
        firstName: c.prenom, lastName: c.nom,
        targetRole: c.posteVise || undefined,
        phone: c.telephone || undefined,
        status: candidateStatusMap[c.statut],
        typeCandidature: c._typeCandidature,
        disponibleDe: c._disponibleDe,
        contactInfo: c._contactInfo,
        notes: c._notes,
      });
      const uploads: Promise<any>[] = [];
      const cvFile = c._files?.cv;
      if (cvFile) uploads.push(teamApi.uploadCv(created.id, cvFile));
      if (c._files?.cin) uploads.push(teamApi.uploadCandidateDoc(created.id, c._files.cin, "Carte d'identité nationale"));
      Object.entries(c._files ?? {}).forEach(([k, f]) => {
        if (k !== 'cv' && k !== 'cin') uploads.push(teamApi.uploadCandidateDoc(created.id, f, f.name));
      });
      const results = await Promise.allSettled(uploads);
      const cvResult = cvFile ? results[0] : null;
      const final = cvResult?.status === 'fulfilled' ? cvResult.value : created;
      setCandidates(prev => [mapCandidate(final) as any, ...prev]);
      setShowAddCandidate(false);
    } catch { toast.error('Erreur lors de l\'ajout du candidat.'); }
  };

  const handleEditCandidateSave = async (updated: Candidat & { apiId: string }) => {
    setCandidates(prev => prev.map(c => c.apiId === updated.apiId ? updated as any : c));
    setEditCandidate(null);
  };

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: 'active',     label: 'Équipe active',  count: members.length },
    { key: 'candidates', label: 'Candidats',       count: candidates.length },
    { key: 'former',     label: 'Anciens membres', count: former.length },
  ];

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={20} className="animate-spin" style={{ color: '#9CA3AF' }} />
    </div>
  );

  return (
    <div className="px-4 md:px-6 py-6 space-y-5" style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div>
        <h2 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>Mon équipe</h2>
        <p style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>
          {members.length} membres actifs · {members.filter(m => m.status === 'present').length} présents aujourd'hui
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: '#F3F4F6', width: 'fit-content' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all"
            style={{
              background: tab === t.key ? '#FFFFFF' : 'transparent',
              color: tab === t.key ? '#1A1A1A' : '#6B7280',
              fontSize: 13, fontWeight: tab === t.key ? 600 : 400,
              border: 'none', cursor: 'pointer',
              boxShadow: tab === t.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}>
            {t.label}
            <span className="px-1.5 py-0.5 rounded-full"
              style={{ background: tab === t.key ? '#EEF2F7' : '#E5E7EB', color: tab === t.key ? '#3E5A78' : '#9CA3AF', fontSize: 10, fontWeight: 700 }}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'active' && (
        <ActiveTab
          members={members}
          onExit={setExitTarget}
          onEdit={setEditTarget}
          onAdd={() => setShowAddMember(true)}
          onAttendance={setAttendanceTarget}
        />
      )}
      {tab === 'candidates' && (
        <CandidatesTab
          candidates={candidates}
          onAdd={() => setShowAddCandidate(true)}
          onIntegrate={setIntegrateTarget}
          onIntegrateNow={handleIntegrateNow}
          onEdit={setEditCandidate}
        />
      )}
      {tab === 'former' && (
        <FormerTab former={former} onReintegrate={setReintegrateTarget} onReintegrateNow={handleReintegrateNow} />
      )}

      {/* Modals */}
      {exitTarget && (
        <ExitMemberModal member={exitTarget} onConfirm={handleExit} onClose={() => setExitTarget(null)} />
      )}
      {editTarget && (
        <MemberEditModal member={editTarget} onSave={handleEditSave} onClose={() => setEditTarget(null)} />
      )}
      {showAddMember && (
        <AddMemberModal onSave={handleAddMember} onClose={() => setShowAddMember(false)} />
      )}
      {showAddCandidate && (
        <AddCandidateModal
          onSave={handleAddCandidate as any}
          onClose={() => setShowAddCandidate(false)}
        />
      )}
      {editCandidate && (
        <EditCandidateModal
          candidat={editCandidate}
          onSave={handleEditCandidateSave as any}
          onClose={() => setEditCandidate(null)}
        />
      )}
      {integrateTarget && (
        <IntegrationModal
          candidat={integrateTarget}
          onConfirm={handleIntegrate}
          onClose={() => setIntegrateTarget(null)}
        />
      )}
      {reintegrateTarget && (
        <ReintegrationModal
          member={reintegrateTarget}
          onConfirm={handleReintegrate}
          onClose={() => setReintegrateTarget(null)}
        />
      )}
      {attendanceTarget && (
        <AttendanceModal
          member={attendanceTarget as any}
          onClose={() => setAttendanceTarget(null)}
          onMemberStatusChange={(status) =>
            setMembers(prev => prev.map(m => m.apiId === attendanceTarget.apiId ? { ...m, status } : m))
          }
        />
      )}
    </div>
  );
}
