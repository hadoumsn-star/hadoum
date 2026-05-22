import { useState, useEffect } from 'react';
import { TeamMember, Candidat, FormerMember } from '../data/mockData';
import {
  Plus, Search, X, Edit3, Check,
  UserMinus, UserCheck, Upload, ArrowUpRight,
  Paperclip, Loader2,
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
  const [motif, setMotif] = useState('');
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(26,26,26,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl" style={{ background: '#FFFFFF' }}>
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>Marquer comme sorti</h3>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
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
              <option>Autre</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 px-6 pb-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, cursor: 'pointer' }}>
            Annuler
          </button>
          <button disabled={!motif} onClick={() => motif && onConfirm(motif)} className="flex-1 py-2.5 rounded-lg"
            style={{ background: motif ? '#B91C1C' : '#E5E7EB', color: motif ? '#FFFFFF' : '#9CA3AF', fontSize: 13, fontWeight: 600, border: 'none', cursor: motif ? 'pointer' : 'not-allowed' }}>
            Confirmer la sortie
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit / Add Member Modal ───────────────────────────────────────────────────

interface EditForm { nom: string; prenom: string; poste: string; statut: TeamMember['status']; }

function MemberEditModal({ title, initial, onSave, onClose }: {
  title: string; initial: EditForm; onSave: (form: EditForm) => void; onClose: () => void;
}) {
  const [form, setForm] = useState<EditForm>(initial);
  const set = (k: keyof EditForm, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(26,26,26,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl" style={{ background: '#FFFFFF' }}>
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 17, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {(['nom', 'prenom', 'poste'] as (keyof EditForm)[]).map(k => (
            <div key={k}>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>
                {k === 'nom' ? 'Nom' : k === 'prenom' ? 'Prénom' : 'Poste'}
              </label>
              <input value={form[k] as string} onChange={e => set(k, e.target.value)}
                placeholder={k === 'nom' ? 'Belarbi' : k === 'prenom' ? 'Amine' : 'Éducateur…'}
                style={INPUT} />
            </div>
          ))}
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Statut</label>
            <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid #E5E7EB' }}>
              {(['present', 'absent', 'conge'] as TeamMember['status'][]).map(s => (
                <button key={s} type="button" onClick={() => set('statut', s)} className="flex-1 py-2 px-2"
                  style={{ background: form.statut === s ? '#3E5A78' : '#FFFFFF', color: form.statut === s ? '#FFFFFF' : '#374151', fontSize: 12, fontWeight: form.statut === s ? 600 : 400, border: 'none', cursor: 'pointer' }}>
                  {STATUS[s].label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-2 px-6 py-4" style={{ borderTop: '1px solid #F3F4F6', background: '#F9F7F3' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, cursor: 'pointer' }}>
            Annuler
          </button>
          <button onClick={() => onSave(form)} className="flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2"
            style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
            <Check size={14} /> Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Candidate Modal ───────────────────────────────────────────────────────

function AddCandidateModal({ onSave, onClose }: {
  onSave: (c: Omit<Candidat, 'id'>) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ prenom: '', nom: '', posteVise: '', telephone: '', statut: 'nouveau' as Candidat['statut'], cvUploaded: false });
  const [cvFile, setCvFile] = useState<File | null>(null);
  const set = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));
  const canSave = form.prenom.trim() && form.nom.trim();

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(26,26,26,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl" style={{ background: '#FFFFFF' }}>
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 17, fontWeight: 700 }}>Ajouter un candidat</h3>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Prénom *</label>
              <input value={form.prenom} onChange={e => set('prenom', e.target.value)} placeholder="Sonia" style={INPUT} autoFocus />
            </div>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Nom *</label>
              <input value={form.nom} onChange={e => set('nom', e.target.value)} placeholder="Benyahia" style={INPUT} />
            </div>
          </div>
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Poste visé</label>
            <input value={form.posteVise} onChange={e => set('posteVise', e.target.value)} placeholder="Éducateur, Auxiliaire…" style={INPUT} />
          </div>
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Téléphone</label>
            <input value={form.telephone} onChange={e => set('telephone', e.target.value)} placeholder="0551 00 11 22" style={INPUT} />
          </div>
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Statut</label>
            <select value={form.statut} onChange={e => set('statut', e.target.value)} style={{ ...INPUT, cursor: 'pointer' }}>
              <option value="nouveau">Nouveau</option>
              <option value="présélectionné">Présélectionné</option>
              <option value="entretien fait">Entretien fait</option>
            </select>
          </div>
          {/* CV upload réel */}
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>CV (PDF)</label>
            <label className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer"
              style={{ border: `1px solid ${cvFile ? '#A7F3D0' : '#E5E7EB'}`, background: cvFile ? 'rgba(6,95,70,0.04)' : '#FAFAFA' }}>
              <Upload size={14} style={{ color: cvFile ? '#065F46' : '#9CA3AF', flexShrink: 0 }} />
              <span style={{ flex: 1, color: cvFile ? '#065F46' : '#6B7280', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {cvFile ? cvFile.name : 'Joindre un CV…'}
              </span>
              {cvFile && <Check size={13} style={{ color: '#065F46', flexShrink: 0 }} />}
              <input type="file" className="hidden" accept=".pdf,.doc,.docx"
                onChange={e => setCvFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>
        </div>
        <div className="flex gap-2 px-6 py-4" style={{ borderTop: '1px solid #F3F4F6', background: '#F9F7F3' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, cursor: 'pointer' }}>
            Annuler
          </button>
          <button disabled={!canSave}
            onClick={() => canSave && onSave({ ...form, cvUploaded: !!cvFile, dateCandidate: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }), _cvFile: cvFile } as any)}
            className="flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2"
            style={{ background: canSave ? '#3E5A78' : '#E5E7EB', color: canSave ? '#FFFFFF' : '#9CA3AF', fontSize: 13, fontWeight: 600, border: 'none', cursor: canSave ? 'pointer' : 'not-allowed' }}>
            <Check size={14} /> Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Candidate Modal (point 4) ────────────────────────────────────────────

function EditCandidateModal({ candidat, onSave, onClose }: {
  candidat: Candidat;
  onSave: (updated: Candidat) => void;
  onClose: () => void;
}) {
  const [statut, setStatut] = useState<Candidat['statut']>(candidat.statut);
  const [cvUploaded, setCvUploaded] = useState(candidat.cvUploaded);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(26,26,26,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl" style={{ background: '#FFFFFF' }}>
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 17, fontWeight: 700 }}>Modifier le candidat</h3>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: '#F9F7F3' }}>
            <div className="flex items-center justify-center rounded-full"
              style={{ width: 38, height: 38, background: '#EEF2F7', color: '#3E5A78', fontSize: 13, fontWeight: 700 }}>
              {(candidat.prenom[0] ?? '?').toUpperCase()}{(candidat.nom[0] ?? '?').toUpperCase()}
            </div>
            <div>
              <p style={{ color: '#1A1A1A', fontSize: 14, fontWeight: 600 }}>{candidat.prenom} {candidat.nom}</p>
              <p style={{ color: '#9CA3AF', fontSize: 12 }}>{candidat.posteVise || '—'} · {candidat.telephone}</p>
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
          {/* CV upload réel */}
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>CV (PDF)</label>
            <label className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer"
              style={{ border: `1px solid ${cvUploaded ? '#A7F3D0' : '#E5E7EB'}`, background: cvUploaded ? 'rgba(6,95,70,0.04)' : '#FAFAFA' }}>
              <Upload size={14} style={{ color: cvUploaded ? '#065F46' : '#9CA3AF', flexShrink: 0 }} />
              <span style={{ flex: 1, color: cvUploaded ? '#065F46' : '#6B7280', fontSize: 13 }}>
                {cvUploaded ? 'CV joint ✓ — remplacer' : 'Joindre un CV…'}
              </span>
              <input type="file" className="hidden" accept=".pdf,.doc,.docx"
                onChange={e => { if (e.target.files?.[0]) setCvUploaded(true); }} />
            </label>
          </div>
        </div>
        <div className="flex gap-2 px-6 py-4" style={{ borderTop: '1px solid #F3F4F6', background: '#F9F7F3' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, cursor: 'pointer' }}>
            Annuler
          </button>
          <button onClick={() => onSave({ ...candidat, statut, cvUploaded })}
            className="flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2"
            style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
            <Check size={14} /> Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Reintegration Modal (point 3) ────────────────────────────────────────────

function ReintegrationModal({ member, onConfirm, onClose }: {
  member: FormerMember;
  onConfirm: (poste: string, date: string, note: string) => void;
  onClose: () => void;
}) {
  const [poste, setPoste] = useState(member.role);
  const [date, setDate]   = useState('');
  const [note, setNote]   = useState('');
  const canSave = !!date;

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
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={INPUT} />
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
          <button disabled={!canSave} onClick={() => canSave && onConfirm(poste, date, note)}
            className="flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2"
            style={{ background: canSave ? '#065F46' : '#E5E7EB', color: canSave ? '#FFFFFF' : '#9CA3AF', fontSize: 13, fontWeight: 600, border: 'none', cursor: canSave ? 'pointer' : 'not-allowed' }}>
            <UserCheck size={14} /> Réintégrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Active Members ───────────────────────────────────────────────────────

function ActiveTab({ members, onExit, onEdit, onAdd }: {
  members: TeamMember[];
  onExit: (m: TeamMember) => void;
  onEdit: (m: TeamMember) => void;
  onAdd: () => void;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'present' | 'absent' | 'conge'>('all');

  const filtered = members.filter(m => {
    const q = search.toLowerCase();
    return (!q || m.name.toLowerCase().includes(q) || m.role.toLowerCase().includes(q))
      && (filter === 'all' || m.status === filter);
  });

  const counts = {
    all: members.length,
    present: members.filter(m => m.status === 'present').length,
    absent:  members.filter(m => m.status === 'absent').length,
    conge:   members.filter(m => m.status === 'conge').length,
  };

  return (
    <div className="space-y-5">
      {/* Stats + actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-2 flex-wrap">
          {([['all', 'Tous', counts.all], ['present', 'Présents', counts.present], ['absent', 'Absents', counts.absent], ['conge', 'En congé', counts.conge]] as [typeof filter, string, number][]).map(([f, label, n]) => (
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

      {/* Grid — cartes avec couleur de fonction (point 2) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map(m => {
          const st = STATUS[m.status];
          const rs = getRoleStyle(m.role);
          const fnColor = getFunctionColor(m.role);
          return (
            <div key={m.id} className="rounded-xl p-5 flex flex-col gap-3"
              style={{
                background: fnColor + '10',     // ~6% opacity bg
                border: '1px solid ' + fnColor + '25',
                borderLeft: '2px solid ' + fnColor,  // bordure gauche couleur pleine
              }}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  {/* Avatar neutre (point 2 — pas de couleur avatar) */}
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
              <div className="flex items-center justify-between mt-auto pt-2" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <span style={{ color: '#9CA3AF', fontSize: 11 }}>Depuis {new Date(m.since).getFullYear()}</span>
                <div className="flex items-center gap-1">
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
        })}
      </div>
    </div>
  );
}

// ─── Tab: Candidates ───────────────────────────────────────────────────────────

function CandidatesTab({ candidates, onAdd, onPromote, onEdit }: {
  candidates: (Candidat & { apiId: string })[];
  onAdd: () => void;
  onPromote: (id: string) => void;
  onEdit: (c: Candidat & { apiId: string }) => void;
}) {
  const handleCvClick = async (c: Candidat & { apiId: string }) => {
    if (!c.cvUploaded) return;
    try {
      const { url } = await teamApi.getCvUrl(c.apiId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error('Impossible d\'ouvrir le CV.');
    }
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
                {['Candidat', 'Poste visé', 'Date', 'Statut', 'CV', ''].map(h => (
                  <th key={h} className="text-left px-5 py-3" style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em' }}>
                    {h.toUpperCase()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {candidates.map((c, i) => {
                const st = STATUT_CANDIDAT[c.statut];
                const fnColor = getFunctionColor(c.posteVise);
                return (
                  <tr key={c.id}
                    style={{
                      borderBottom: i < candidates.length - 1 ? '1px solid #F9F7F3' : 'none',
                      background: fnColor + '08',
                    }}
                    className="hover:brightness-95 transition-all">
                    <td className="px-5 py-4" style={{ borderLeft: '2px solid ' + fnColor }}>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center rounded-full"
                          style={{ width: 32, height: 32, background: '#F3F4F6', color: '#6B7280', fontSize: 11, fontWeight: 700 }}>
                          {(c.prenom[0] ?? '?').toUpperCase()}{(c.nom[0] ?? '?').toUpperCase()}
                        </div>
                        <div>
                          <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 600 }}>{c.prenom} {c.nom}</p>
                          <p style={{ color: '#9CA3AF', fontSize: 11 }}>{c.telephone}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4" style={{ color: '#374151', fontSize: 13 }}>{c.posteVise || '—'}</td>
                    <td className="px-5 py-4" style={{ color: '#9CA3AF', fontSize: 12 }}>{c.dateCandidate}</td>
                    <td className="px-5 py-4">
                      <span className="px-2 py-0.5 rounded-full" style={{ background: st.bg, color: st.color, fontSize: 10, fontWeight: 700 }}>
                        {st.label.toUpperCase()}
                      </span>
                    </td>
                    {/* Icône CV (point 4) */}
                    <td className="px-5 py-4">
                      <button
                        onClick={() => handleCvClick(c)}
                        title={c.cvUploaded ? 'Ouvrir le CV' : 'Aucun CV'}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: c.cvUploaded ? 'pointer' : 'default' }}>
                        <Paperclip size={16} style={{ color: c.cvUploaded ? '#065F46' : '#D1D5DB' }} />
                      </button>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5">
                        {/* Bouton éditer */}
                        <button onClick={() => onEdit(c)} className="p-1.5 rounded-lg hover:bg-gray-100"
                          title="Modifier" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                          <Edit3 size={13} style={{ color: '#6B7280' }} />
                        </button>
                        {c.statut === 'présélectionné' && (
                          <button onClick={() => onPromote(c.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
                            style={{ background: '#ECFDF5', color: '#065F46', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                            <ArrowUpRight size={13} /> Promouvoir
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Former Members ───────────────────────────────────────────────────────

function FormerTab({ former, onReintegrate }: {
  former: FormerMember[];
  onReintegrate: (m: FormerMember) => void;
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
                  {/* Bouton Réintégrer (point 3) */}
                  <td className="px-5 py-4">
                    <button onClick={() => onReintegrate(m)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
                      style={{ background: '#EEF2F7', color: '#3E5A78', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      <UserCheck size={13} /> Réintégrer
                    </button>
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
  const [editTarget,         setEditTarget]         = useState<{ mode: 'edit'; member: TeamMember & { apiId: string } } | { mode: 'add' } | null>(null);
  const [showAddCandidate,   setShowAddCandidate]   = useState(false);
  const [editCandidate,      setEditCandidate]      = useState<(Candidat & { apiId: string }) | null>(null);
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

  const handleEditSave = async (form: { nom: string; prenom: string; poste: string; statut: TeamMember['status'] }) => {
    const statusMap: Record<string, ApiStaffStatus> = { present: 'PRESENT', absent: 'ABSENT', conge: 'CONGE' };
    try {
      if (editTarget?.mode === 'edit') {
        const updated = await teamApi.updateStaff(editTarget.member.apiId, {
          firstName: form.prenom, lastName: form.nom,
          role: form.poste || editTarget.member.role,
          status: statusMap[form.statut],
        });
        setMembers(prev => prev.map(m => m.apiId === editTarget.member.apiId ? mapStaff(updated) as any : m));
      } else {
        const created = await teamApi.createStaff({
          firstName: form.prenom, lastName: form.nom,
          role: form.poste || 'Éducateur',
          status: statusMap[form.statut],
        });
        setMembers(prev => [mapStaff(created) as any, ...prev]);
      }
      setEditTarget(null);
    } catch { toast.error('Erreur lors de la sauvegarde.'); }
  };

  const handlePromote = async (id: string) => {
    try {
      const newMember = await teamApi.promote(id);
      setMembers(prev => [mapStaff(newMember) as any, ...prev]);
      setCandidates(prev => prev.filter(c => c.apiId !== id));
      setTab('active');
      toast.success('Candidat promu dans l\'équipe active.');
    } catch { toast.error('Erreur lors de la promotion.'); }
  };

  const handleReintegrate = async (poste: string, date: string, _note: string) => {
    if (!reintegrateTarget) return;
    try {
      const newMember = await teamApi.reintegrate(reintegrateTarget.apiId, poste, date);
      setMembers(prev => [mapStaff(newMember) as any, ...prev]);
      setFormer(prev => prev.filter(m => m.apiId !== reintegrateTarget.apiId));
      setReintegrateTarget(null);
      setTab('active');
      toast.success(`${reintegrateTarget.name} a été réintégré(e) dans l'équipe active.`);
    } catch { toast.error('Erreur lors de la réintégration.'); }
  };

  const handleAddCandidate = async (c: Omit<Candidat, 'id'> & { _cvFile?: File }) => {
    const candidateStatusMap: Record<string, ApiCandidateStatus> = {
      'nouveau': 'NOUVEAU', 'présélectionné': 'PRESELECTIONNE', 'entretien fait': 'ENTRETIEN_FAIT',
    };
    try {
      const created = await teamApi.createCandidate({
        firstName: c.prenom, lastName: c.nom,
        targetRole: c.posteVise || undefined,
        phone: c.telephone || undefined,
        status: candidateStatusMap[c.statut],
      });
      if (c._cvFile) {
        const updated = await teamApi.uploadCv(created.id, c._cvFile);
        setCandidates(prev => [mapCandidate(updated) as any, ...prev]);
      } else {
        setCandidates(prev => [mapCandidate(created) as any, ...prev]);
      }
      setShowAddCandidate(false);
    } catch { toast.error('Erreur lors de l\'ajout du candidat.'); }
  };

  const handleEditCandidateSave = async (updated: Candidat & { apiId: string }) => {
    const statusMap: Record<string, ApiCandidateStatus> = {
      'nouveau': 'NOUVEAU', 'présélectionné': 'PRESELECTIONNE', 'entretien fait': 'ENTRETIEN_FAIT',
    };
    try {
      const res = await teamApi.updateCandidate(updated.apiId, { status: statusMap[updated.statut] });
      setCandidates(prev => prev.map(c => c.apiId === updated.apiId ? mapCandidate(res) as any : c));
      setEditCandidate(null);
    } catch { toast.error('Erreur lors de la mise à jour.'); }
  };

  const getInitialEditForm = (): { nom: string; prenom: string; poste: string; statut: TeamMember['status'] } => {
    if (editTarget?.mode === 'edit') {
      const parts = editTarget.member.name.split(' ');
      return { prenom: parts[0] ?? '', nom: parts.slice(1).join(' ') ?? '', poste: editTarget.member.role, statut: editTarget.member.status };
    }
    return { prenom: '', nom: '', poste: '', statut: 'present' };
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
          onEdit={m => setEditTarget({ mode: 'edit', member: m })}
          onAdd={() => setEditTarget({ mode: 'add' })}
        />
      )}
      {tab === 'candidates' && (
        <CandidatesTab
          candidates={candidates}
          onAdd={() => setShowAddCandidate(true)}
          onPromote={handlePromote}
          onEdit={setEditCandidate}
        />
      )}
      {tab === 'former' && (
        <FormerTab former={former} onReintegrate={setReintegrateTarget} />
      )}

      {/* Modals */}
      {exitTarget && (
        <ExitMemberModal member={exitTarget} onConfirm={handleExit} onClose={() => setExitTarget(null)} />
      )}
      {editTarget && (
        <MemberEditModal
          title={editTarget.mode === 'add' ? 'Nouveau membre' : 'Modifier la fiche'}
          initial={getInitialEditForm()}
          onSave={handleEditSave}
          onClose={() => setEditTarget(null)}
        />
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
      {reintegrateTarget && (
        <ReintegrationModal
          member={reintegrateTarget}
          onConfirm={handleReintegrate}
          onClose={() => setReintegrateTarget(null)}
        />
      )}
    </div>
  );
}
