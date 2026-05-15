import { useState, useMemo } from 'react';
import {
  Plus, Search, X, Edit3, Users, UserCheck, AlertCircle, FolderOpen,
  ChevronDown, ArrowUp, ArrowDown, Check, ChevronRight,
  ArrowLeft, Phone, Camera, UserMinus, FileText, Upload,
} from 'lucide-react';
import { allChildrenData, Child } from '../data/mockData';

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusFilter = 'actif' | 'sorti' | 'all';
type AttendanceFilter = 'all' | 'present' | 'absent';
type DossierFilter    = 'all' | 'complet' | 'incomplet';
type ClasseFilter     = 'all' | Child['classe'];
type SortField        = 'name' | 'age' | 'classe' | 'attendance' | 'dossier' | null;
type SortDir          = 'asc' | 'desc';
type CrmTab = 'identite' | 'famille' | 'scolarite' | 'sante' | 'sorties' | 'activites';

const CLASSES: Child['classe'][] = ['Maternelle', 'Primaire 1', 'Primaire 2', 'Primaire 3', 'Collège'];

const AVATAR_PALETTE = [
  { bg: '#EEF2F7', color: '#3E5A78' },
  { bg: '#ECFDF5', color: '#065F46' },
  { bg: '#F5F3FF', color: '#7C3AED' },
  { bg: '#FFFBEB', color: '#92400E' },
  { bg: '#FFF7ED', color: '#C2410C' },
];

// Documents requis
const DOCS_LIST = [
  { key: 'acteNaissance',       label: 'Acte de naissance' },
  { key: 'acteDeces',           label: 'Acte de décès parent(s)' },
  { key: 'pieceIdTuteur',       label: 'Pièce d\'identité tuteur légal' },
  { key: 'accordAEMO',          label: 'Accord AEMO' },
  { key: 'carnetSante',         label: 'Carnet de santé' },
  { key: 'certificatPEC',       label: 'Certificat de prise en charge' },
  { key: 'autorisationGouv',    label: 'Autorisation gouvernementale' },
  { key: 'photo',               label: 'Photo' },
] as const;

type DocKey = typeof DOCS_LIST[number]['key'];
type Docs = Record<DocKey, boolean>;

// CRM extended data per child
interface ChildCRM {
  docs: Docs;
  isActive: boolean;
  exitType?: 'temporaire' | 'définitive';
  exitDate?: string;
  exitMotif?: string;
  exitResponsable?: string;
  situationFamiliale: string;
  lieuVie: string;
  derniereVisite: string;
  contactsFamille: string;
  compositionFamiliale: string;
  niveauScolaire: string;
  etablissement: string;
  resultatsMatieres: string;
  assiduiteNote: string;
  observationsEnseignant: string;
  groupeSanguin: string;
  allergies: string;
  vaccinations: string;
  traitements: string;
  consultations: string;
  sortiesHist: { type: string; dateDepart: string; dateRetour: string; motif: string; responsable: string }[];
  activitesListe: string;
  gouts: string;
  caractere: string;
}

function makeDefaultCRM(child: Child): ChildCRM {
  const allDocs = child.dossierStatus === 'complet';
  const docs: Docs = {
    acteNaissance:    allDocs,
    acteDeces:        allDocs,
    pieceIdTuteur:    true,
    accordAEMO:       allDocs,
    carnetSante:      allDocs,
    certificatPEC:    allDocs,
    autorisationGouv: allDocs,
    photo:            allDocs,
  };
  return {
    docs, isActive: true,
    situationFamiliale: 'Orphelin complet',
    lieuVie: 'Orphelinat Hadoum',
    derniereVisite: '—',
    contactsFamille: child.tuteurName ? `${child.tuteurName} — ${child.tuteurPhone}` : '—',
    compositionFamiliale: '—',
    niveauScolaire: child.classe,
    etablissement: 'École interne Hadoum',
    resultatsMatieres: '—',
    assiduiteNote: '—',
    observationsEnseignant: '—',
    groupeSanguin: '—',
    allergies: '—',
    vaccinations: '—',
    traitements: '—',
    consultations: '—',
    sortiesHist: [],
    activitesListe: '—',
    gouts: '—',
    caractere: '—',
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAge(dob: string): number {
  const ref = new Date('2026-05-11');
  const b   = new Date(dob);
  let age = ref.getFullYear() - b.getFullYear();
  const m = ref.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < b.getDate())) age--;
  return age;
}

function initials(first: string, last: string) {
  return `${first[0] ?? '?'}${last[0] ?? '?'}`.toUpperCase();
}

function avatar(id: number) { return AVATAR_PALETTE[id % AVATAR_PALETTE.length]; }

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function isDossierComplet(docs: Docs) {
  return DOCS_LIST.every(d => docs[d.key]);
}

const INPUT_S: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid #E5E7EB', background: '#FFFFFF',
  color: '#1A1A1A', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

// ─── Sort TH ─────────────────────────────────────────────────────────────────

function SortTH({ label, field, current, dir, onSort }: {
  label: string; field: SortField; current: SortField; dir: SortDir;
  onSort: (f: SortField) => void;
}) {
  const active = current === field;
  return (
    <th className="text-left px-5 py-3 cursor-pointer select-none"
      style={{ color: active ? '#3E5A78' : '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', whiteSpace: 'nowrap' }}
      onClick={() => onSort(field)}>
      <span className="flex items-center gap-1">
        {label.toUpperCase()}
        {active ? (dir === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />) : <ArrowDown size={10} style={{ opacity: 0.2 }} />}
      </span>
    </th>
  );
}

// ─── Exit Modal ───────────────────────────────────────────────────────────────

function ExitChildModal({ child, onConfirm, onClose }: {
  child: Child;
  onConfirm: (type: 'temporaire' | 'définitive', date: string, motif: string, responsable: string) => void;
  onClose: () => void;
}) {
  const [type, setType]           = useState<'temporaire' | 'définitive'>('temporaire');
  const [date, setDate]           = useState('');
  const [motif, setMotif]         = useState('');
  const [responsable, setResponsable] = useState('');
  const canConfirm = date && motif;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: 'rgba(26,26,26,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl" style={{ background: '#FFFFFF' }}>
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>Marquer comme sorti</h3>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p style={{ color: '#374151', fontSize: 13 }}>
            <strong>{child.firstName} {child.lastName}</strong> sera marqué comme sorti. Le dossier est conservé.
          </p>
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Type de sortie *</label>
            <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid #E5E7EB' }}>
              {(['temporaire', 'définitive'] as const).map(t => (
                <button key={t} type="button" onClick={() => setType(t)} className="flex-1 py-2"
                  style={{ background: type === t ? '#3E5A78' : '#FFFFFF', color: type === t ? '#FFFFFF' : '#374151', fontSize: 13, fontWeight: type === t ? 600 : 400, border: 'none', cursor: 'pointer', textTransform: 'capitalize' }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Date de départ *</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={INPUT_S} />
          </div>
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Motif *</label>
            <input value={motif} onChange={e => setMotif(e.target.value)} placeholder="Ex : Retour en famille" style={INPUT_S} />
          </div>
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Responsable pendant la sortie</label>
            <input value={responsable} onChange={e => setResponsable(e.target.value)} placeholder="Nom du responsable" style={INPUT_S} />
          </div>
        </div>
        <div className="flex gap-2 px-6 pb-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, cursor: 'pointer' }}>
            Annuler
          </button>
          <button disabled={!canConfirm} onClick={() => canConfirm && onConfirm(type, date, motif, responsable)}
            className="flex-1 py-2.5 rounded-lg"
            style={{ background: canConfirm ? '#B91C1C' : '#E5E7EB', color: canConfirm ? '#FFFFFF' : '#9CA3AF', fontSize: 13, fontWeight: 600, border: 'none', cursor: canConfirm ? 'pointer' : 'not-allowed' }}>
            Confirmer la sortie
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CRM Fiche Tabs ───────────────────────────────────────────────────────────

const CRM_TABS: { key: CrmTab; label: string }[] = [
  { key: 'identite',  label: 'Identité' },
  { key: 'famille',   label: 'Famille' },
  { key: 'scolarite', label: 'Scolarité' },
  { key: 'sante',     label: 'Santé' },
  { key: 'sorties',   label: 'Sorties' },
  { key: 'activites', label: 'Activités' },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>
        {label.toUpperCase()}
      </label>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5" style={{ borderBottom: '1px solid #F9F7F3' }}>
      <span style={{ color: '#6B7280', fontSize: 13 }}>{label}</span>
      <span style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 500 }}>{value || '—'}</span>
    </div>
  );
}

// ─── CRM Fiche Modal ──────────────────────────────────────────────────────────

function CrmFiche({ child, crm, onClose, onExitRequest, onUpdate }: {
  child: Child;
  crm: ChildCRM;
  onClose: () => void;
  onExitRequest: () => void;
  onUpdate: (crm: ChildCRM) => void;
}) {
  const [activeTab, setActiveTab] = useState<CrmTab>('identite');
  const [localCrm, setLocalCrm]  = useState<ChildCRM>(crm);
  const [editing, setEditing]     = useState(false);

  const av  = avatar(child.id);
  const age = getAge(child.dob);
  const complet = isDossierComplet(localCrm.docs);

  const set = (key: keyof ChildCRM, val: any) =>
    setLocalCrm(prev => ({ ...prev, [key]: val }));

  const toggleDoc = (key: DocKey) =>
    setLocalCrm(prev => ({ ...prev, docs: { ...prev.docs, [key]: !prev.docs[key] } }));

  const save = () => { onUpdate(localCrm); setEditing(false); };

  const renderTab = () => {
    switch (activeTab) {
      // ── Identité ───────────────────────────────────────────────────────────
      case 'identite':
        return (
          <div className="space-y-5">
            {/* Avatar */}
            <div className="flex items-center gap-5">
              <div className="relative flex-shrink-0">
                <div className="flex items-center justify-center rounded-full"
                  style={{ width: 80, height: 80, background: av.bg, color: av.color, fontSize: 26, fontWeight: 700 }}>
                  {initials(child.firstName, child.lastName)}
                </div>
                <button
                  className="absolute -bottom-1 -right-1 flex items-center justify-center rounded-full"
                  style={{ width: 26, height: 26, background: '#3E5A78', border: '2px solid #FFFFFF', cursor: 'pointer' }}
                  title="Ajouter une photo">
                  <Camera size={12} style={{ color: '#FFFFFF' }} />
                </button>
              </div>
              <div>
                <p style={{ color: '#1A1A1A', fontSize: 18, fontWeight: 700 }}>{child.firstName} {child.lastName}</p>
                <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>N° {String(child.id).padStart(4, '0')} · {age} ans</p>
                <div className="flex gap-2 mt-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded-full"
                    style={{ background: crm.isActive ? '#ECFDF5' : '#F3F4F6', color: crm.isActive ? '#065F46' : '#9CA3AF', fontSize: 10, fontWeight: 700 }}>
                    {crm.isActive ? 'ACTIF' : 'SORTI'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full"
                    style={{ background: complet ? '#ECFDF5' : '#FEF2F2', color: complet ? '#065F46' : '#B91C1C', fontSize: 10, fontWeight: 700 }}>
                    {complet ? 'DOSSIER COMPLET' : 'DOSSIER INCOMPLET'}
                  </span>
                </div>
              </div>
            </div>

            {/* Info fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
              <div>
                <InfoRow label="Date de naissance" value={fmtDate(child.dob)} />
                <InfoRow label="Genre" value={child.gender === 'M' ? 'Garçon' : 'Fille'} />
                <InfoRow label="Classe" value={child.classe} />
              </div>
              <div>
                <InfoRow label="Date d'admission" value={fmtDate(child.admissionDate)} />
                <InfoRow label="Numéro de dossier" value={`N° ${String(child.id).padStart(4, '0')}`} />
                <InfoRow label="Statut" value={crm.isActive ? 'Actif' : `Sorti — ${crm.exitType ?? ''}`} />
              </div>
            </div>

            {/* Documents requis */}
            <div>
              <p style={{ color: '#374151', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Documents requis</p>
              <div className="space-y-2">
                {DOCS_LIST.map(doc => (
                  <label key={doc.key}
                    className="flex items-center gap-3 cursor-pointer px-4 py-2.5 rounded-lg hover:bg-gray-50"
                    style={{ border: '1px solid #F3F4F6' }}>
                    <div
                      className="flex items-center justify-center rounded flex-shrink-0"
                      style={{
                        width: 18, height: 18,
                        background: localCrm.docs[doc.key] ? '#3E5A78' : '#FFFFFF',
                        border: `1.5px solid ${localCrm.docs[doc.key] ? '#3E5A78' : '#D1D5DB'}`,
                      }}
                      onClick={() => toggleDoc(doc.key)}>
                      {localCrm.docs[doc.key] && <Check size={11} style={{ color: '#FFFFFF' }} />}
                    </div>
                    <span style={{ color: localCrm.docs[doc.key] ? '#1A1A1A' : '#6B7280', fontSize: 13 }}>
                      {doc.label}
                    </span>
                    {localCrm.docs[doc.key]
                      ? <Check size={13} style={{ color: '#065F46', marginLeft: 'auto' }} />
                      : <AlertCircle size={13} style={{ color: '#B91C1C', marginLeft: 'auto' }} />
                    }
                  </label>
                ))}
              </div>
            </div>
          </div>
        );

      // ── Famille ────────────────────────────────────────────────────────────
      case 'famille':
        return (
          <div className="space-y-4">
            <Field label="Situation familiale">
              <select value={localCrm.situationFamiliale}
                onChange={e => set('situationFamiliale', e.target.value)}
                style={{ ...INPUT_S, cursor: 'pointer' }}>
                <option>Orphelin complet</option>
                <option>Demi-orphelin</option>
                <option>Enfant en difficulté</option>
              </select>
            </Field>
            <Field label="Lieu de vie (famille)">
              <input value={localCrm.lieuVie} onChange={e => set('lieuVie', e.target.value)} style={INPUT_S} />
            </Field>
            <Field label="Date dernière visite familiale">
              <input value={localCrm.derniereVisite} onChange={e => set('derniereVisite', e.target.value)}
                placeholder="Ex : 15 Avr 2026" style={INPUT_S} />
            </Field>
            <Field label="Contacts famille">
              <textarea value={localCrm.contactsFamille} onChange={e => set('contactsFamille', e.target.value)}
                rows={2} style={{ ...INPUT_S, resize: 'none' }} placeholder="Nom — téléphone" />
            </Field>
            <Field label="Composition familiale">
              <textarea value={localCrm.compositionFamiliale} onChange={e => set('compositionFamiliale', e.target.value)}
                rows={2} style={{ ...INPUT_S, resize: 'none' }} placeholder="Ex : Père décédé, mère présente…" />
            </Field>
          </div>
        );

      // ── Scolarité ──────────────────────────────────────────────────────────
      case 'scolarite':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Niveau">
                <select value={localCrm.niveauScolaire} onChange={e => set('niveauScolaire', e.target.value)}
                  style={{ ...INPUT_S, cursor: 'pointer' }}>
                  {CLASSES.map(c => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Établissement">
                <input value={localCrm.etablissement} onChange={e => set('etablissement', e.target.value)} style={INPUT_S} />
              </Field>
            </div>
            <Field label="Résultats par matière">
              <textarea value={localCrm.resultatsMatieres} onChange={e => set('resultatsMatieres', e.target.value)}
                rows={3} placeholder="Français : 14/20, Maths : 16/20…" style={{ ...INPUT_S, resize: 'none' }} />
            </Field>
            <Field label="Assiduité">
              <input value={localCrm.assiduiteNote} onChange={e => set('assiduiteNote', e.target.value)}
                placeholder="Ex : 95% de présence" style={INPUT_S} />
            </Field>
            <Field label="Observations enseignant">
              <textarea value={localCrm.observationsEnseignant} onChange={e => set('observationsEnseignant', e.target.value)}
                rows={3} placeholder="Notes pédagogiques…" style={{ ...INPUT_S, resize: 'none' }} />
            </Field>
          </div>
        );

      // ── Santé ──────────────────────────────────────────────────────────────
      case 'sante':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Groupe sanguin">
                <select value={localCrm.groupeSanguin} onChange={e => set('groupeSanguin', e.target.value)}
                  style={{ ...INPUT_S, cursor: 'pointer' }}>
                  {['—', 'A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−'].map(g => <option key={g}>{g}</option>)}
                </select>
              </Field>
              <Field label="Allergies connues">
                <input value={localCrm.allergies} onChange={e => set('allergies', e.target.value)} placeholder="Ex : Pénicilline" style={INPUT_S} />
              </Field>
            </div>
            <Field label="Vaccinations (dates)">
              <textarea value={localCrm.vaccinations} onChange={e => set('vaccinations', e.target.value)}
                rows={3} placeholder="Ex : BCG 2020, Hépatite B 2021…" style={{ ...INPUT_S, resize: 'none' }} />
            </Field>
            <Field label="Traitements en cours">
              <textarea value={localCrm.traitements} onChange={e => set('traitements', e.target.value)}
                rows={2} placeholder="Médicaments, posologie…" style={{ ...INPUT_S, resize: 'none' }} />
            </Field>
            <Field label="Consultations médicales">
              <textarea value={localCrm.consultations} onChange={e => set('consultations', e.target.value)}
                rows={2} placeholder="Dernières consultations…" style={{ ...INPUT_S, resize: 'none' }} />
            </Field>
          </div>
        );

      // ── Sorties ────────────────────────────────────────────────────────────
      case 'sorties':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p style={{ color: '#374151', fontSize: 13, fontWeight: 600 }}>Historique des sorties</p>
              <button
                onClick={() => set('sortiesHist', [
                  ...localCrm.sortiesHist,
                  { type: 'temporaire', dateDepart: '', dateRetour: '', motif: '', responsable: '' }
                ])}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
                style={{ background: '#EEF2F7', color: '#3E5A78', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                <Plus size={13} /> Ajouter
              </button>
            </div>
            {localCrm.sortiesHist.length === 0 ? (
              <div className="py-8 text-center rounded-xl" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
                <p style={{ color: '#9CA3AF', fontSize: 13 }}>Aucune sortie enregistrée.</p>
              </div>
            ) : (
              localCrm.sortiesHist.map((s, idx) => (
                <div key={idx} className="rounded-xl p-4 space-y-3" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Type">
                      <select value={s.type}
                        onChange={e => {
                          const h = [...localCrm.sortiesHist];
                          h[idx] = { ...h[idx], type: e.target.value };
                          set('sortiesHist', h);
                        }}
                        style={{ ...INPUT_S, cursor: 'pointer' }}>
                        <option value="temporaire">Temporaire</option>
                        <option value="permanente">Permanente</option>
                      </select>
                    </Field>
                    <Field label="Date départ">
                      <input type="date" value={s.dateDepart}
                        onChange={e => { const h = [...localCrm.sortiesHist]; h[idx] = { ...h[idx], dateDepart: e.target.value }; set('sortiesHist', h); }}
                        style={INPUT_S} />
                    </Field>
                    <Field label="Date retour prévue">
                      <input type="date" value={s.dateRetour}
                        onChange={e => { const h = [...localCrm.sortiesHist]; h[idx] = { ...h[idx], dateRetour: e.target.value }; set('sortiesHist', h); }}
                        style={INPUT_S} />
                    </Field>
                    <Field label="Responsable">
                      <input value={s.responsable}
                        onChange={e => { const h = [...localCrm.sortiesHist]; h[idx] = { ...h[idx], responsable: e.target.value }; set('sortiesHist', h); }}
                        placeholder="Nom du responsable" style={INPUT_S} />
                    </Field>
                  </div>
                  <Field label="Motif">
                    <input value={s.motif}
                      onChange={e => { const h = [...localCrm.sortiesHist]; h[idx] = { ...h[idx], motif: e.target.value }; set('sortiesHist', h); }}
                      placeholder="Raison de la sortie" style={INPUT_S} />
                  </Field>
                  <button
                    onClick={() => set('sortiesHist', localCrm.sortiesHist.filter((_, i) => i !== idx))}
                    style={{ color: '#B91C1C', fontSize: 11, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    Supprimer cette entrée
                  </button>
                </div>
              ))
            )}
          </div>
        );

      // ── Activités ──────────────────────────────────────────────────────────
      case 'activites':
        return (
          <div className="space-y-4">
            <Field label="Activités pratiquées">
              <textarea value={localCrm.activitesListe} onChange={e => set('activitesListe', e.target.value)}
                rows={3} placeholder="Football, karaté, dessin…" style={{ ...INPUT_S, resize: 'none' }} />
            </Field>
            <Field label="Goûts et intérêts">
              <textarea value={localCrm.gouts} onChange={e => set('gouts', e.target.value)}
                rows={2} placeholder="Musique, lecture, sciences…" style={{ ...INPUT_S, resize: 'none' }} />
            </Field>
            <Field label="Traits de caractère">
              <textarea value={localCrm.caractere} onChange={e => set('caractere', e.target.value)}
                rows={2} placeholder="Curieux, sociable, timide…" style={{ ...INPUT_S, resize: 'none' }} />
            </Field>
          </div>
        );

      default: return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
      style={{ background: 'rgba(26,26,26,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        style={{ background: '#FFFFFF', maxWidth: 800, maxHeight: '95vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 17, fontWeight: 700 }}>
            Dossier — {child.firstName} {child.lastName}
          </h3>
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button onClick={() => { setLocalCrm(crm); setEditing(false); }}
                  className="px-3 py-1.5 rounded-lg"
                  style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, cursor: 'pointer' }}>
                  Annuler
                </button>
                <button onClick={save}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
                  style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                  <Check size={13} /> Sauvegarder
                </button>
              </>
            ) : (
              <button onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
                style={{ background: '#EEF2F7', color: '#3E5A78', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
                <Edit3 size={13} /> Modifier
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100">
              <X size={18} style={{ color: '#9CA3AF' }} />
            </button>
          </div>
        </div>

        {/* Tab navigation — horizontal scrollable on mobile */}
        <div className="flex flex-shrink-0 overflow-x-auto" style={{ borderBottom: '1px solid #F3F4F6', background: '#F9F7F3' }}>
          {CRM_TABS.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className="flex-shrink-0 px-5 py-3 transition-all"
              style={{
                background: activeTab === t.key ? '#FFFFFF' : 'transparent',
                color: activeTab === t.key ? '#3E5A78' : '#6B7280',
                fontSize: 13, fontWeight: activeTab === t.key ? 600 : 400,
                border: 'none', cursor: 'pointer',
                borderBottom: activeTab === t.key ? '2px solid #3E5A78' : '2px solid transparent',
              }}>
              {t.label}
              {t.key === 'identite' && !complet && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full" style={{ background: '#FEF2F2', color: '#B91C1C', fontSize: 9, fontWeight: 700 }}>!</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {renderTab()}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderTop: '1px solid #F3F4F6', background: '#F9F7F3' }}>
          {crm.isActive ? (
            <button onClick={onExitRequest}
              className="flex items-center gap-2 px-4 py-2 rounded-lg"
              style={{ background: '#FEF2F2', color: '#B91C1C', fontSize: 13, fontWeight: 500, border: '1px solid #FECACA', cursor: 'pointer' }}>
              <UserMinus size={13} /> Marquer comme sorti
            </button>
          ) : (
            <span className="flex items-center gap-2 px-4 py-2 rounded-lg"
              style={{ background: '#F3F4F6', color: '#9CA3AF', fontSize: 13 }}>
              Sorti — {crm.exitType}
            </span>
          )}
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Multi-step Add Form ───────────────────────────────────────────────────────

type FormStep = 1 | 2 | 3 | 4;
const EMPTY_FORM: Omit<Child, 'id'> = {
  firstName: '', lastName: '', dob: '', gender: 'M',
  classe: 'Primaire 1', attendanceStatus: 'present',
  dossierStatus: 'incomplet', tuteurName: '', tuteurPhone: '',
  admissionDate: new Date().toISOString().split('T')[0],
};
const EMPTY_DOCS: Docs = Object.fromEntries(DOCS_LIST.map(d => [d.key, false])) as Docs;

function AddModal({ onSave, onClose }: {
  onSave: (child: Omit<Child, 'id'>, initialDocs: Docs) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<FormStep>(1);
  const [form, setForm] = useState<Omit<Child, 'id'>>(EMPTY_FORM);
  const [docs, setDocs] = useState<Docs>({ ...EMPTY_DOCS });
  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  const toggleDoc = (key: DocKey) => setDocs(prev => ({ ...prev, [key]: !prev[key] }));
  const joinDoc   = (key: DocKey) => setDocs(prev => ({ ...prev, [key]: true }));

  const canNext =
    step === 1 ? !!(form.firstName.trim() && form.lastName.trim() && form.dob) :
    step === 2 ? !!form.classe : true;

  const next = () => { if (canNext && step < 4) setStep(s => (s + 1) as FormStep); };
  const back = () => { if (step > 1) setStep(s => (s - 1) as FormStep); };

  const STEPS: { n: FormStep; l: string }[] = [
    { n: 1, l: 'Identité' }, { n: 2, l: 'Scolarité' },
    { n: 3, l: 'Tuteur' },   { n: 4, l: 'Documents' },
  ];
  const docsCount = Object.values(docs).filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(26,26,26,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-xl" style={{ background: '#FFFFFF' }}>
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 17, fontWeight: 700 }}>Ajouter un enfant</h3>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>

        {/* Step indicator — 4 steps */}
        <div className="flex px-4 py-3 gap-0.5 overflow-x-auto" style={{ borderBottom: '1px solid #F3F4F6', background: '#F9F7F3' }}>
          {STEPS.map((s, i) => (
            <div key={s.n} className="flex items-center flex-1 last:flex-none min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="flex items-center justify-center rounded-full flex-shrink-0"
                  style={{ width: 20, height: 20, background: step > s.n ? '#3E5A78' : step === s.n ? '#EEF2F7' : '#F3F4F6', border: step === s.n ? '2px solid #3E5A78' : 'none', color: step > s.n ? '#FFFFFF' : step === s.n ? '#3E5A78' : '#9CA3AF', fontSize: 9, fontWeight: 700 }}>
                  {step > s.n ? <Check size={9} /> : s.n}
                </div>
                <span className="truncate" style={{ fontSize: 11, fontWeight: step === s.n ? 600 : 400, color: step === s.n ? '#3E5A78' : '#9CA3AF' }}>{s.l}</span>
              </div>
              {i < 3 && <div className="flex-1 h-px mx-1" style={{ background: step > s.n ? '#3E5A78' : '#E5E7EB', minWidth: 6 }} />}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4" style={{ minHeight: 220 }}>
          {step === 1 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Prénom *</label>
                  <input value={form.firstName} onChange={e => set('firstName', e.target.value)} placeholder="Amine" style={INPUT_S} autoFocus />
                </div>
                <div>
                  <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Nom *</label>
                  <input value={form.lastName} onChange={e => set('lastName', e.target.value)} placeholder="Belarbi" style={INPUT_S} />
                </div>
              </div>
              <div>
                <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Date de naissance *</label>
                <input type="date" value={form.dob} onChange={e => set('dob', e.target.value)} style={INPUT_S} />
              </div>
              <div>
                <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Genre</label>
                <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid #E5E7EB' }}>
                  {([['M', 'Garçon'], ['F', 'Fille']] as [string, string][]).map(([v, l]) => (
                    <button key={v} type="button" onClick={() => set('gender', v)} className="flex-1 py-2"
                      style={{ background: form.gender === v ? '#3E5A78' : '#FFFFFF', color: form.gender === v ? '#FFFFFF' : '#374151', fontSize: 13, fontWeight: form.gender === v ? 600 : 400, border: 'none', cursor: 'pointer' }}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <div>
                <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Classe *</label>
                <select value={form.classe} onChange={e => set('classe', e.target.value)} style={{ ...INPUT_S, cursor: 'pointer' }}>
                  {CLASSES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Date d'admission</label>
                <input type="date" value={form.admissionDate} onChange={e => set('admissionDate', e.target.value)} style={INPUT_S} />
              </div>
            </>
          )}
          {step === 3 && (
            <>
              <div>
                <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Tuteur référent</label>
                <input value={form.tuteurName} onChange={e => set('tuteurName', e.target.value)} placeholder="Nom complet" style={INPUT_S} />
              </div>
              <div>
                <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Téléphone tuteur</label>
                <input value={form.tuteurPhone} onChange={e => set('tuteurPhone', e.target.value)} placeholder="0551 23 45 67" style={INPUT_S} />
              </div>
            </>
          )}
          {step === 4 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p style={{ color: '#374151', fontSize: 13, fontWeight: 600 }}>Documents requis</p>
                <span className="px-2 py-0.5 rounded-full" style={{ background: docsCount === DOCS_LIST.length ? '#ECFDF5' : '#FEF2F2', color: docsCount === DOCS_LIST.length ? '#065F46' : '#B91C1C', fontSize: 10, fontWeight: 700 }}>
                  {docsCount}/{DOCS_LIST.length}
                </span>
              </div>
              <div className="space-y-1.5" style={{ maxHeight: 260, overflowY: 'auto' }}>
                {DOCS_LIST.map(doc => (
                  <div key={doc.key}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg"
                    style={{ border: `1px solid ${docs[doc.key] ? '#D1FAE5' : '#F3F4F6'}`, background: docs[doc.key] ? 'rgba(6,95,70,0.03)' : '#FAFAFA' }}>
                    {/* Checkbox Reçu */}
                    <div
                      className="flex items-center justify-center rounded flex-shrink-0 cursor-pointer"
                      style={{ width: 16, height: 16, background: docs[doc.key] ? '#3E5A78' : '#FFFFFF', border: `1.5px solid ${docs[doc.key] ? '#3E5A78' : '#D1D5DB'}` }}
                      onClick={() => toggleDoc(doc.key)}>
                      {docs[doc.key] && <Check size={9} style={{ color: '#FFFFFF' }} />}
                    </div>
                    <span className="flex-1" style={{ color: docs[doc.key] ? '#1A1A1A' : '#6B7280', fontSize: 12 }}>{doc.label}</span>
                    {/* Bouton Joindre */}
                    <button type="button" onClick={() => joinDoc(doc.key)}
                      className="flex items-center gap-1 px-2 py-1 rounded flex-shrink-0"
                      style={{ background: docs[doc.key] ? '#ECFDF5' : '#F3F4F6', border: `1px solid ${docs[doc.key] ? '#A7F3D0' : '#E5E7EB'}`, color: docs[doc.key] ? '#065F46' : '#374151', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                      {docs[doc.key] ? <><Check size={9} /> Joint</> : <><Upload size={9} /> Joindre</>}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderTop: '1px solid #F3F4F6', background: '#F9F7F3' }}>
          <button type="button" onClick={step === 1 ? onClose : back}
            className="flex items-center gap-2 px-4 py-2 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            {step === 1 ? 'Annuler' : <><ArrowLeft size={13} /> Retour</>}
          </button>
          <button type="button" onClick={step < 4 ? next : () => onSave(form, docs)}
            disabled={!canNext && step < 4}
            className="flex items-center gap-2 px-5 py-2 rounded-lg"
            style={{
              background: (canNext || step === 4) ? '#3E5A78' : '#E5E7EB',
              color: (canNext || step === 4) ? '#FFFFFF' : '#9CA3AF',
              fontSize: 13, fontWeight: 600, border: 'none',
              cursor: (canNext || step === 4) ? 'pointer' : 'not-allowed',
            }}>
            {step < 4 ? <>Continuer <ChevronRight size={14} /></> : <><Check size={14} /> Enregistrer</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, color, bg, icon: Icon }: { label: string; value: number; color: string; bg: string; icon: React.ElementType }) {
  return (
    <div className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: bg }}>
      <div className="flex items-center justify-center rounded-lg" style={{ width: 34, height: 34, background: 'rgba(255,255,255,0.75)' }}>
        <Icon size={16} style={{ color }} />
      </div>
      <div>
        <p style={{ color, fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{value}</p>
        <p style={{ color: '#6B7280', fontSize: 11, marginTop: 2 }}>{label}</p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ChildrenPage() {
  const [children, setChildren] = useState<Child[]>(allChildrenData);
  const [crmData, setCrmData]   = useState<Record<number, ChildCRM>>(() =>
    Object.fromEntries(allChildrenData.map(c => [c.id, makeDefaultCRM(c)]))
  );

  const [search, setSearch]                 = useState('');
  const [statusFilter, setStatusFilter]     = useState<StatusFilter>('actif');
  const [filterAttendance, setFilterAttendance] = useState<AttendanceFilter>('all');
  const [filterDossier, setFilterDossier]   = useState<DossierFilter>('all');
  const [sortField, setSortField]           = useState<SortField>(null);
  const [sortDir, setSortDir]               = useState<SortDir>('asc');
  const [showFilters, setShowFilters]       = useState(false);

  const [modal, setModal]           = useState<{ mode: 'view' | 'add' | null; child?: Child }>({ mode: null });
  const [exitTarget, setExitTarget] = useState<Child | null>(null);

  // CRM update
  const updateCrm = (id: number, crm: ChildCRM) => setCrmData(prev => ({ ...prev, [id]: crm }));

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  // Derived dossierStatus from documents
  const getDossierStatus = (id: number): 'complet' | 'incomplet' => {
    const crm = crmData[id];
    if (!crm) return 'incomplet';
    return isDossierComplet(crm.docs) ? 'complet' : 'incomplet';
  };

  const filtered = useMemo(() => {
    let list = children.filter(c => {
      const crm = crmData[c.id];
      const isActive = crm?.isActive !== false;
      if (statusFilter === 'actif' && !isActive) return false;
      if (statusFilter === 'sorti' && isActive) return false;
      const q = search.toLowerCase();
      return (!q || `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) || c.classe.toLowerCase().includes(q))
        && (filterAttendance === 'all' || c.attendanceStatus === filterAttendance)
        && (filterDossier === 'all' || getDossierStatus(c.id) === filterDossier);
    });
    if (sortField) {
      list = [...list].sort((a, b) => {
        let va: string | number = '';
        let vb: string | number = '';
        if (sortField === 'name')       { va = `${a.firstName} ${a.lastName}`; vb = `${b.firstName} ${b.lastName}`; }
        else if (sortField === 'age')   { va = getAge(a.dob); vb = getAge(b.dob); }
        else if (sortField === 'classe'){ va = a.classe; vb = b.classe; }
        else if (sortField === 'attendance') { va = a.attendanceStatus; vb = b.attendanceStatus; }
        else if (sortField === 'dossier')    { va = getDossierStatus(a.id); vb = getDossierStatus(b.id); }
        if (typeof va === 'number') return sortDir === 'asc' ? va - (vb as number) : (vb as number) - va;
        return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
      });
    }
    return list;
  }, [children, crmData, search, statusFilter, filterAttendance, filterDossier, sortField, sortDir]);

  const activeCount   = children.filter(c => crmData[c.id]?.isActive !== false).length;
  const sortisCount   = children.filter(c => crmData[c.id]?.isActive === false).length;
  const presentCount  = children.filter(c => (crmData[c.id]?.isActive !== false) && c.attendanceStatus === 'present').length;
  const incompletCount = children.filter(c => (crmData[c.id]?.isActive !== false) && getDossierStatus(c.id) === 'incomplet').length;

  const handleExit = (type: 'temporaire' | 'définitive', date: string, motif: string, responsable: string) => {
    if (!exitTarget) return;
    setCrmData(prev => ({
      ...prev,
      [exitTarget.id]: { ...prev[exitTarget.id], isActive: false, exitType: type, exitDate: date, exitMotif: motif, exitResponsable: responsable }
    }));
    setExitTarget(null);
    if (modal.child?.id === exitTarget.id) setModal({ mode: null });
  };

  const handleAddChild = (form: Omit<Child, 'id'>, initialDocs: Docs) => {
    const newId = Math.max(...children.map(c => c.id)) + 1;
    const docsComplet = Object.values(initialDocs).every(Boolean);
    const newChild: Child = { ...form, id: newId, dossierStatus: docsComplet ? 'complet' : 'incomplet' };
    setChildren(prev => [newChild, ...prev]);
    const defaultCrm = makeDefaultCRM(newChild);
    setCrmData(prev => ({ ...prev, [newId]: { ...defaultCrm, docs: initialDocs } }));
    setModal({ mode: null });
  };

  return (
    <div className="px-4 md:px-6 py-6 space-y-5" style={{ maxWidth: 1400 }}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>Dossiers enfants</h2>
          <p style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>{activeCount} actifs · {sortisCount} sortis · {children.length} total</p>
        </div>
        <button onClick={() => setModal({ mode: 'add' })}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg self-start"
          style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
          <Plus size={16} /> Ajouter un enfant
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Actifs"           value={activeCount}   color="#3E5A78" bg="#EEF2F7" icon={Users} />
        <StatCard label="Présents auj."    value={presentCount}  color="#065F46" bg="#ECFDF5" icon={UserCheck} />
        <StatCard label="Dossiers incomplets" value={incompletCount} color="#B91C1C" bg="#FEF2F2" icon={AlertCircle} />
        <StatCard label="Sortis"           value={sortisCount}   color="#9CA3AF" bg="#F3F4F6" icon={FolderOpen} />
      </div>

      {/* Status filter + search */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Status tabs */}
        <div className="flex gap-1 p-1 rounded-xl flex-shrink-0" style={{ background: '#F3F4F6' }}>
          {([['actif', 'Actifs', activeCount], ['sorti', 'Sortis', sortisCount], ['all', 'Tous', children.length]] as [StatusFilter, string, number][]).map(([f, label, n]) => (
            <button key={f} onClick={() => setStatusFilter(f)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all"
              style={{
                background: statusFilter === f ? '#FFFFFF' : 'transparent',
                color: statusFilter === f ? '#1A1A1A' : '#6B7280',
                fontSize: 12, fontWeight: statusFilter === f ? 600 : 400,
                border: 'none', cursor: 'pointer',
                boxShadow: statusFilter === f ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}>
              {label} <span style={{ background: statusFilter === f ? '#EEF2F7' : '#E5E7EB', color: statusFilter === f ? '#3E5A78' : '#9CA3AF', fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 8 }}>{n}</span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1" style={{ maxWidth: 320 }}>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un enfant…"
            className="w-full pl-9 pr-8 py-2 rounded-lg outline-none"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#1A1A1A', fontSize: 13 }} />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X size={13} style={{ color: '#9CA3AF' }} /></button>}
        </div>

        {/* Filters toggle */}
        <button onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{ background: showFilters ? '#EEF2F7' : '#FFFFFF', border: '1px solid #E5E7EB', color: showFilters ? '#3E5A78' : '#374151', fontSize: 13, cursor: 'pointer' }}>
          Filtres <ChevronDown size={14} style={{ transform: showFilters ? 'rotate(180deg)' : 'none', transition: '150ms' }} />
        </button>
      </div>

      {/* Expandable filters */}
      {showFilters && (
        <div className="flex flex-wrap gap-3 p-4 rounded-xl" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
          <div>
            <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, marginBottom: 6 }}>PRÉSENCE</p>
            <div className="flex gap-1">
              {([['all', 'Tous'], ['present', 'Présents'], ['absent', 'Absents']] as [AttendanceFilter, string][]).map(([f, l]) => (
                <button key={f} onClick={() => setFilterAttendance(f)}
                  className="px-3 py-1.5 rounded-lg text-sm"
                  style={{ background: filterAttendance === f ? '#3E5A78' : '#FFFFFF', color: filterAttendance === f ? '#FFFFFF' : '#374151', fontSize: 12, border: `1px solid ${filterAttendance === f ? '#3E5A78' : '#E5E7EB'}`, cursor: 'pointer' }}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, marginBottom: 6 }}>DOSSIER</p>
            <div className="flex gap-1">
              {([['all', 'Tous'], ['complet', 'Complet'], ['incomplet', 'Incomplet']] as [DossierFilter, string][]).map(([f, l]) => (
                <button key={f} onClick={() => setFilterDossier(f)}
                  className="px-3 py-1.5 rounded-lg"
                  style={{ background: filterDossier === f ? '#3E5A78' : '#FFFFFF', color: filterDossier === f ? '#FFFFFF' : '#374151', fontSize: 12, border: `1px solid ${filterDossier === f ? '#3E5A78' : '#E5E7EB'}`, cursor: 'pointer' }}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: 700 }}>
            <thead>
              <tr style={{ background: '#F9F7F3', borderBottom: '1px solid #F3F4F6' }}>
                <SortTH label="Nom"       field="name"       current={sortField} dir={sortDir} onSort={handleSort} />
                <SortTH label="Âge"       field="age"        current={sortField} dir={sortDir} onSort={handleSort} />
                <SortTH label="Classe"    field="classe"     current={sortField} dir={sortDir} onSort={handleSort} />
                <SortTH label="Présence"  field="attendance" current={sortField} dir={sortDir} onSort={handleSort} />
                <SortTH label="Dossier"   field="dossier"    current={sortField} dir={sortDir} onSort={handleSort} />
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="py-12 text-center" style={{ color: '#9CA3AF', fontSize: 13 }}>Aucun enfant trouvé.</td></tr>
              ) : filtered.map((child, i) => {
                const av = avatar(child.id);
                const crm = crmData[child.id];
                const isActive = crm?.isActive !== false;
                const dossierOk = getDossierStatus(child.id) === 'complet';
                return (
                  <tr key={child.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    style={{ borderBottom: i < filtered.length - 1 ? '1px solid #F9F7F3' : 'none', opacity: isActive ? 1 : 0.6 }}
                    onClick={() => setModal({ mode: 'view', child })}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center rounded-full flex-shrink-0"
                          style={{ width: 34, height: 34, background: av.bg, color: av.color, fontSize: 12, fontWeight: 700 }}>
                          {initials(child.firstName, child.lastName)}
                        </div>
                        <div>
                          <p style={{ color: isActive ? '#1A1A1A' : '#9CA3AF', fontSize: 13, fontWeight: 600 }}>
                            {child.firstName} {child.lastName}
                          </p>
                          {!isActive && (
                            <span className="px-1.5 py-0.5 rounded-full"
                              style={{ background: '#F3F4F6', color: '#9CA3AF', fontSize: 9, fontWeight: 700 }}>
                              SORTI{crm?.exitType ? ` — ${crm.exitType}` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4" style={{ color: '#374151', fontSize: 13 }}>{getAge(child.dob)} ans</td>
                    <td className="px-5 py-4" style={{ color: '#374151', fontSize: 13 }}>{child.classe}</td>
                    <td className="px-5 py-4">
                      {isActive ? (
                        <span className="px-2 py-0.5 rounded-full"
                          style={{ background: child.attendanceStatus === 'present' ? '#ECFDF5' : '#FEF2F2', color: child.attendanceStatus === 'present' ? '#065F46' : '#B91C1C', fontSize: 11, fontWeight: 600 }}>
                          {child.attendanceStatus === 'present' ? 'Présent' : 'Absent'}
                        </span>
                      ) : <span style={{ color: '#9CA3AF', fontSize: 12 }}>—</span>}
                    </td>
                    <td className="px-5 py-4">
                      <span className="px-2 py-0.5 rounded-full"
                        style={{ background: dossierOk ? '#ECFDF5' : '#FEF2F2', color: dossierOk ? '#065F46' : '#B91C1C', fontSize: 11, fontWeight: 600 }}>
                        {dossierOk ? 'Complet' : 'Incomplet'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={e => { e.stopPropagation(); setModal({ mode: 'view', child }); }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg"
                        style={{ background: '#F3F4F6', color: '#374151', fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
                        Ouvrir <ChevronRight size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* CRM Fiche Modal */}
      {modal.mode === 'view' && modal.child && (
        <CrmFiche
          child={modal.child}
          crm={crmData[modal.child.id]}
          onClose={() => setModal({ mode: null })}
          onExitRequest={() => setExitTarget(modal.child!)}
          onUpdate={crm => updateCrm(modal.child!.id, crm)}
        />
      )}

      {/* Add Modal */}
      {modal.mode === 'add' && (
        <AddModal
          onSave={(form, docs) => handleAddChild(form, docs)}
          onClose={() => setModal({ mode: null })}
        />
      )}

      {/* Exit Modal */}
      {exitTarget && (
        <ExitChildModal
          child={exitTarget}
          onConfirm={handleExit}
          onClose={() => setExitTarget(null)}
        />
      )}
    </div>
  );
}
