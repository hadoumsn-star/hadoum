import { useState, useMemo, useEffect } from 'react';
import {
  Plus, Search, X, Edit3, UserCheck, AlertCircle,
  ChevronDown, ArrowUp, ArrowDown, Check, ChevronRight,
  ArrowLeft, Camera, UserMinus, Upload, Eye, Loader, Bell, Trash2,
} from 'lucide-react';
import { Child } from '../data/mockData';
import { childrenApi } from '../services/children.api';
import { mapSummaryToChild, mapFormToPayload, mapStatus } from '../services/children.mapper';
import { useAuth } from '../context/AuthContext';
import { REQUIRED_DOCS, COMPLEMENTARY_DOCS, isDossierComplet, isDossierEnrichi } from '../config/documents.config';
import type { ApiDocument, ApiDocumentType, ApiChildStatus } from '../types/api.types';

// ─── Types ────────────────────────────────────────────────────────────────────

type AttendanceFilter = 'all' | 'present' | 'absent';
type DossierFilter    = 'all' | 'complet' | 'à compléter' | 'incomplet';
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
  { key: 'photo',               label: 'Photo' },
] as const;

type DocKey = typeof DOCS_LIST[number]['key'];
type Docs = Record<DocKey, boolean>;

// CRM extended data per child
interface ChildCRM {
  docs: Docs;
  hasComplementaryDocs: boolean;
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
  sortiesHist: { id?: string; type: string; dateDepart: string; dateRetour: string; motif: string; responsable: string; responsableTel: string }[];
  activitesListe: string;
  gouts: string;
  caractere: string;
}

function makeDefaultCRM(child: Child): ChildCRM {
  const allDocs = child.dossierStatus === 'complet';
  const docs: Docs = {
    acteNaissance: allDocs,
    acteDeces:     allDocs,
    pieceIdTuteur: true,
    accordAEMO:    allDocs,
    carnetSante:   allDocs,
    certificatPEC: allDocs,
    photo:         allDocs,
  };
  return {
    docs, hasComplementaryDocs: false, isActive: true,
    situationFamiliale: child.childStatus ? mapStatus(child.childStatus) : 'Orphelin complet',
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
  onConfirm: (type: 'temporaire' | 'définitive', date: string, motif: string, responsable: string, dateRetour: string) => void;
  onClose: () => void;
}) {
  const [type,           setType]          = useState<'temporaire' | 'définitive'>('temporaire');
  const [date,           setDate]          = useState('');
  const [dateText,       setDateText]      = useState('');
  const [dateRetour,     setDateRetour]    = useState('');
  const [dateRetourText, setDateRetourText] = useState('');
  const [motif,          setMotif]         = useState('');
  const [responsable,    setResponsable]   = useState('');
  const [responsableTel, setResponsableTel] = useState('');
  const canConfirm = date && motif && responsable && responsableTel;

  const parseDate = (val: string, setIso: (v: string) => void) => {
    const m = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) setIso(`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`);
    else if (!val) setIso('');
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: 'rgba(26,26,26,0.55)', backdropFilter: 'blur(2px)' }}>
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
                <button key={t} type="button" onClick={() => { setType(t); if (t === 'définitive') setDateRetour(''); }} className="flex-1 py-2"
                  style={{ background: type === t ? '#3E5A78' : '#FFFFFF', color: type === t ? '#FFFFFF' : '#374151', fontSize: 13, fontWeight: type === t ? 600 : 400, border: 'none', cursor: 'pointer', textTransform: 'capitalize' }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className={type === 'temporaire' ? 'grid grid-cols-2 gap-3' : ''}>
            <div>
              <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Date de départ *</label>
              <div className="flex gap-1.5 items-center">
                <input
                  value={dateText}
                  onChange={e => { setDateText(e.target.value); parseDate(e.target.value, setDate); }}
                  placeholder="JJ/MM/AAAA"
                  style={{ ...INPUT_S, flex: 1, minWidth: 0 }}
                />
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <button type="button"
                    onClick={() => (document.getElementById('exit-date-picker') as HTMLInputElement)?.showPicker?.()}
                    className="flex items-center justify-center rounded-lg"
                    style={{ width: 34, height: 34, background: '#F3F4F6', border: '1px solid #E5E7EB', cursor: 'pointer' }}>
                    📅
                  </button>
                  <input id="exit-date-picker" type="date" value={date}
                    onChange={e => { setDate(e.target.value); setDateText(e.target.value.split('-').reverse().join('/')); }}
                    style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }} />
                </div>
              </div>
            </div>
            {type === 'temporaire' && (
              <div>
                <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Date de retour prévue</label>
                <div className="flex gap-1.5 items-center">
                  <input
                    value={dateRetourText}
                    onChange={e => { setDateRetourText(e.target.value); parseDate(e.target.value, setDateRetour); }}
                    placeholder="JJ/MM/AAAA"
                    style={{ ...INPUT_S, flex: 1, minWidth: 0 }}
                  />
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <button type="button"
                      onClick={() => (document.getElementById('exit-retour-picker') as HTMLInputElement)?.showPicker?.()}
                      className="flex items-center justify-center rounded-lg"
                      style={{ width: 34, height: 34, background: '#F3F4F6', border: '1px solid #E5E7EB', cursor: 'pointer' }}>
                      📅
                    </button>
                    <input id="exit-retour-picker" type="date" value={dateRetour}
                      min={date || undefined}
                      onChange={e => { setDateRetour(e.target.value); setDateRetourText(e.target.value.split('-').reverse().join('/')); }}
                      style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }} />
                  </div>
                </div>
              </div>
            )}
          </div>
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Motif *</label>
            <input value={motif} onChange={e => setMotif(e.target.value)} placeholder="Ex : Retour en famille" style={INPUT_S} />
          </div>
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Responsable pendant la sortie *</label>
            <input value={responsable} onChange={e => setResponsable(e.target.value)} placeholder="Nom du responsable" style={INPUT_S} />
          </div>
          <div>
            <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Téléphone du tuteur *</label>
            <input
              type="tel"
              value={responsableTel}
              onChange={e => {
                const raw = e.target.value.replace(/^\+221\s?/, '').replace(/\D/g, '').slice(0, 9);
                const fmt =
                  raw.length === 0 ? '' :
                  raw.length <= 2 ? `+221 ${raw}` :
                  raw.length <= 5 ? `+221 ${raw.slice(0,2)} ${raw.slice(2)}` :
                  raw.length <= 7 ? `+221 ${raw.slice(0,2)} ${raw.slice(2,5)} ${raw.slice(5)}` :
                  `+221 ${raw.slice(0,2)} ${raw.slice(2,5)} ${raw.slice(5,7)} ${raw.slice(7)}`;
                setResponsableTel(fmt);
              }}
              placeholder="+221 77 123 45 67"
              style={INPUT_S}
            />
          </div>
        </div>
        <div className="flex gap-2 px-6 pb-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, cursor: 'pointer' }}>
            Annuler
          </button>
          <button disabled={!canConfirm} onClick={() => canConfirm && onConfirm(type, date, motif, responsable, dateRetour)}
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

function CrmFiche({ child, crm, onClose, onExitRequest, onUpdate, onChildUpdate, onReactivate, onDossierChange }: {
  child: Child;
  crm: ChildCRM;
  onClose: () => void;
  onExitRequest: () => void;
  onUpdate: (crm: ChildCRM) => void;
  onChildUpdate: (updates: Partial<Child>) => void;
  onReactivate: () => void;
  onDossierChange: (status: 'complet' | 'partiel' | 'incomplet') => void;
}) {
  const [activeTab, setActiveTab] = useState<CrmTab>('identite');
  const [localCrm, setLocalCrm]  = useState<ChildCRM>(crm);
  const [editing, setEditing]     = useState(false);
  const [identity, setIdentity]   = useState({ firstName: child.firstName, lastName: child.lastName });

  // ── Real documents state ────────────────────────────────────────────────────
  const [docs, setDocs]           = useState<ApiDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  // Tracks which slot is currently uploading: a document type (new upload) or a document id (replacement)
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  useEffect(() => {
    if (!child.apiId) return;
    setLoadingDocs(true);
    childrenApi.getDocuments(child.apiId)
      .then(setDocs)
      .catch(() => {})
      .finally(() => setLoadingDocs(false));
  }, [child.apiId]);

  // Load existing medical record when Santé tab opens
  useEffect(() => {
    if (activeTab !== 'sante' || !child.apiId) return;
    childrenApi.get(child.apiId).then(full => {
      if (full.medicalRecord) {
        setLocalCrm(prev => ({
          ...prev,
          groupeSanguin: full.medicalRecord!.bloodType          ?? '—',
          allergies:     full.medicalRecord!.allergies          ?? '—',
          traitements:   full.medicalRecord!.currentTreatments  ?? '—',
          vaccinations:  full.medicalRecord!.vaccinationsText   ?? '—',
          consultations: full.medicalRecord!.consultationsText  ?? '—',
        }));
      }
    }).catch(() => {});
  }, [activeTab, child.apiId]);

  // Load sorties history from event logs when Sorties tab opens
  useEffect(() => {
    if (activeTab !== 'sorties' || !child.apiId) return;
    childrenApi.getEvents(child.apiId).then(events => {
      const sortiesHist = events
        .filter(e => e.eventType === 'SORTIE')
        .map(e => {
          // details may be JSON {motif, dateRetour} or plain string
          let motif = e.details ?? '';
          let dateRetour = '';
          let dateDepart = e.createdAt.split('T')[0];
          let responsable = e.author ?? '';
          let responsableTel = '';
          try {
            const parsed = JSON.parse(e.details ?? '{}');
            motif          = parsed.motif          ?? motif;
            dateRetour     = parsed.dateRetour      ?? '';
            dateDepart     = parsed.dateDepart      ?? dateDepart;
            responsable    = parsed.responsable     ?? responsable;
            responsableTel = parsed.responsableTel  ?? '';
          } catch { /* plain string fallback */ }
          return {
            id:   e.id,
            type: e.summary.toLowerCase().includes('définitive') ? 'définitive' : 'temporaire',
            dateDepart,
            dateRetour,
            motif,
            responsable,
            responsableTel,
          };
        });
      if (sortiesHist.length > 0) {
        setLocalCrm(prev => ({ ...prev, sortiesHist }));
      }
    }).catch(() => {});
  }, [activeTab, child.apiId]);

  const presentTypes = docs.map(d => d.type as ApiDocumentType);
  const complet = isDossierComplet(presentTypes);
  const enrichi = isDossierEnrichi(presentTypes);

  const handleAddDoc = async (type: ApiDocumentType, label: string, file: File) => {
    if (!child.apiId) return;
    setUploadingFor(type);
    try {
      const created = await childrenApi.uploadDocument(child.apiId, file, type, label);
      const updated = [...docs, created];
      setDocs(updated);
      const types = updated.map(d => d.type as ApiDocumentType);
      const complet = isDossierComplet(types);
      const enrichi = isDossierEnrichi(types);
      onDossierChange(!complet ? 'incomplet' : !enrichi ? 'à compléter' : 'complet');
    } catch (err: any) {
      alert(`Erreur lors de l'envoi : ${err.message}`);
    } finally {
      setUploadingFor(null);
    }
  };

  const handleReplaceDoc = async (docId: string, file: File) => {
    if (!child.apiId) return;
    setUploadingFor(docId);
    try {
      const updated = await childrenApi.replaceDocument(child.apiId, docId, file);
      setDocs(prev => prev.map(d => d.id === docId ? updated : d));
    } catch (err: any) {
      alert(`Erreur lors du remplacement : ${err.message}`);
    } finally {
      setUploadingFor(null);
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!child.apiId) return;
    setDeletingDocId(docId);
    try {
      await childrenApi.deleteDocument(child.apiId, docId);
      const updated = docs.filter(d => d.id !== docId);
      setDocs(updated);
      const types = updated.map(d => d.type as ApiDocumentType);
      const complet = isDossierComplet(types);
      const enrichi = isDossierEnrichi(types);
      onDossierChange(!complet ? 'incomplet' : !enrichi ? 'à compléter' : 'complet');
    } catch (err: any) {
      alert(`Erreur lors de la suppression : ${err.message ?? 'veuillez réessayer.'}`);
    } finally {
      setDeletingDocId(null);
    }
  };

  const av  = avatar(child.id);
  const age = getAge(child.dob);

  const set = (key: keyof ChildCRM, val: any) =>
    setLocalCrm(prev => ({ ...prev, [key]: val }));

  const toggleDoc = (key: DocKey) =>
    setLocalCrm(prev => ({ ...prev, docs: { ...prev.docs, [key]: !prev.docs[key] } }));

  const [saveError, setSaveError] = useState('');

  const save = async () => {
    setSaveError('');
    try {
      if (child.apiId) {
        if (activeTab === 'identite') {
          await childrenApi.update(child.apiId, {
            firstName: identity.firstName,
            lastName:  identity.lastName,
          });
          onChildUpdate({ firstName: identity.firstName, lastName: identity.lastName });
        } else if (activeTab === 'sante') {
          await childrenApi.upsertMedical(child.apiId, {
            bloodType:         localCrm.groupeSanguin !== '—' ? localCrm.groupeSanguin : undefined,
            allergies:         localCrm.allergies     !== '—' ? localCrm.allergies     : undefined,
            currentTreatments: localCrm.traitements   !== '—' ? localCrm.traitements   : undefined,
            vaccinationsText:  localCrm.vaccinations  !== '—' ? localCrm.vaccinations  : undefined,
            consultationsText: localCrm.consultations !== '—' ? localCrm.consultations : undefined,
          });
        } else if (activeTab === 'scolarite') {
          await childrenApi.upsertSchool(child.apiId, {
            currentLevel: localCrm.niveauScolaire,
            schoolName:   localCrm.etablissement,
          });
        } else if (activeTab === 'famille') {
          await childrenApi.update(child.apiId, {
            familyComposition: localCrm.compositionFamiliale || undefined,
            guardianName:      localCrm.contactsFamille.split('—')[0]?.trim() || undefined,
          });
        } else if (activeTab === 'sorties') {
          const makeDetails = (s: typeof localCrm.sortiesHist[0]) =>
            JSON.stringify({ dateDepart: s.dateDepart, motif: s.motif, dateRetour: s.dateRetour, responsable: s.responsable, responsableTel: s.responsableTel });

          // Update existing events
          await Promise.all(
            localCrm.sortiesHist
              .filter(s => s.id)
              .map(s => childrenApi.updateEvent(child.apiId!, s.id!, {
                summary: `Sortie ${s.type}`,
                details: makeDetails(s),
              }))
          );

          // Create new events (rows added via "+", no id yet)
          const newSorties = localCrm.sortiesHist.filter(s => !s.id);
          const created = await Promise.all(
            newSorties.map(s => childrenApi.addEvent(child.apiId!, {
              eventType: 'SORTIE',
              summary: `Sortie ${s.type}`,
              details: makeDetails(s),
              author: s.responsable || undefined,
            }))
          );
          if (created.length > 0) {
            let ci = 0;
            const updated = localCrm.sortiesHist.map(s =>
              !s.id && ci < created.length ? { ...s, id: created[ci++].id } : s
            );
            setLocalCrm(prev => ({ ...prev, sortiesHist: updated }));
          }

          // Sync exitDate + exitReturnDate on Child from the latest sortie
          const allSorties = [...localCrm.sortiesHist];
          const latest = allSorties.sort((a, b) => b.dateDepart.localeCompare(a.dateDepart))[0];
          if (child.exitType === 'temporaire' && latest) {
            await childrenApi.update(child.apiId!, {
              exitDate:       latest.dateDepart  || undefined,
              exitReturnDate: latest.dateRetour  || null,
            });
          }
        }
      }
      onUpdate(localCrm);
      setEditing(false);
    } catch (err: any) {
      setSaveError(err.message ?? 'Erreur lors de la sauvegarde.');
    }
  };

  const F: React.CSSProperties = {
    ...INPUT_S,
    background: editing ? '#FFFFFF' : '#F9F7F3',
    color:      editing ? '#1A1A1A' : '#6B7280',
    cursor:     editing ? 'text'    : 'default',
  };
  const FS: React.CSSProperties = { ...F, cursor: editing ? 'pointer' : 'default' };
  const FT: React.CSSProperties = { ...F, resize: 'none' };

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
                {editing ? (
                  <div className="flex gap-2">
                    <input value={identity.firstName} onChange={e => setIdentity(prev => ({ ...prev, firstName: e.target.value }))}
                      placeholder="Prénom" style={{ ...F, fontSize: 15, fontWeight: 700, width: 120 }} />
                    <input value={identity.lastName} onChange={e => setIdentity(prev => ({ ...prev, lastName: e.target.value }))}
                      placeholder="Nom" style={{ ...F, fontSize: 15, fontWeight: 700, width: 120 }} />
                  </div>
                ) : (
                  <p style={{ color: '#1A1A1A', fontSize: 18, fontWeight: 700 }}>{child.firstName} {child.lastName}</p>
                )}
                <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>N° {String(child.id).padStart(4, '0')} · {age} ans</p>
                <div className="flex gap-2 mt-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded-full"
                    style={{ background: crm.isActive ? '#ECFDF5' : '#F3F4F6', color: crm.isActive ? '#065F46' : '#9CA3AF', fontSize: 10, fontWeight: 700 }}>
                    {crm.isActive ? 'ACTIF' : 'SORTI'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full"
                    style={{
                      background: !complet ? '#FEF2F2' : !enrichi ? '#FFFBEB' : '#ECFDF5',
                      color: !complet ? '#B91C1C' : !enrichi ? '#92400E' : '#065F46',
                      fontSize: 10, fontWeight: 700
                    }}>
                    {!complet ? 'DOSSIER INCOMPLET' : !enrichi ? 'DOSSIER PARTIEL' : 'DOSSIER COMPLET'}
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
                <InfoRow label="Numéro de dossier" value={child.fileNumber ?? `N° ${String(child.id).padStart(4, '0')}`} />
                <InfoRow label="Statut" value={crm.isActive ? 'Actif' : `Sorti — ${crm.exitType ?? ''}`} />
              </div>
            </div>

            {/* Documents requis */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p style={{ color: '#374151', fontSize: 13, fontWeight: 600 }}>Documents requis</p>
                <span className="px-2 py-0.5 rounded-full"
                  style={{ background: complet ? '#ECFDF5' : '#FEF2F2', color: complet ? '#065F46' : '#B91C1C', fontSize: 10, fontWeight: 700 }}>
                  {presentTypes.filter(t => REQUIRED_DOCS.some(r => r.type === t)).length}/{REQUIRED_DOCS.length}
                </span>
              </div>

              {loadingDocs ? (
                <div className="flex items-center justify-center py-6">
                  <Loader size={16} style={{ color: '#9CA3AF' }} className="animate-spin" />
                </div>
              ) : (
                <div className="space-y-2">
                  {REQUIRED_DOCS.map(req => {
                    const uploaded = docs.find(d => d.type === req.type);
                    const isReplacing = uploaded ? uploadingFor === uploaded.id : false;
                    const isUploading = uploadingFor === req.type;
                    return (
                      <div key={req.type}>
                        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg"
                          style={{ border: `1px solid ${uploaded ? '#D1FAE5' : '#F3F4F6'}`, background: uploaded ? 'rgba(6,95,70,0.03)' : '#FAFAFA' }}>
                          {/* Status icon */}
                          <div className="flex items-center justify-center rounded flex-shrink-0"
                            style={{ width: 18, height: 18, background: uploaded ? '#065F46' : '#FFFFFF', border: `1.5px solid ${uploaded ? '#065F46' : '#D1D5DB'}` }}>
                            {uploaded && <Check size={10} style={{ color: '#FFFFFF' }} />}
                          </div>

                          {/* Label */}
                          <span className="flex-1" style={{ color: uploaded ? '#1A1A1A' : '#6B7280', fontSize: 13 }}>
                            {req.label}
                          </span>

                          {/* Actions */}
                          {uploaded ? (
                            <div className="flex items-center gap-2">
                              <span style={{ color: '#9CA3AF', fontSize: 11 }}>
                                {new Date(uploaded.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </span>
                              <button
                                onClick={async () => {
                                  if (!child.apiId) return;
                                  try {
                                    const { url } = await childrenApi.getDocumentUrl(child.apiId, uploaded.id);
                                    window.open(url, '_blank', 'noopener,noreferrer');
                                  } catch {
                                    alert('Impossible d\'ouvrir le document.');
                                  }
                                }}
                                className="flex items-center justify-center rounded"
                                style={{ width: 28, height: 28, background: '#EEF2F7', color: '#3E5A78', border: 'none', cursor: 'pointer' }}>
                                <Eye size={13} />
                              </button>
                              <label
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
                                style={{ border: `1px solid ${isReplacing ? '#A7F3D0' : '#E5E7EB'}`, background: isReplacing ? 'rgba(6,95,70,0.04)' : '#FAFAFA', color: isReplacing ? '#065F46' : '#6B7280', fontSize: 11, fontWeight: 600, cursor: isReplacing ? 'not-allowed' : 'pointer' }}>
                                {isReplacing ? <Loader size={11} className="animate-spin" style={{ color: '#065F46' }} /> : <Upload size={11} style={{ color: '#9CA3AF' }} />}
                                {isReplacing ? 'Envoi…' : 'Remplacer'}
                                <input type="file" className="hidden"
                                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                  disabled={isReplacing}
                                  onChange={e => {
                                    const f = e.target.files?.[0];
                                    e.target.value = '';
                                    if (f) handleReplaceDoc(uploaded.id, f);
                                  }} />
                              </label>
                              <button
                                onClick={() => handleDeleteDoc(uploaded.id)}
                                disabled={deletingDocId === uploaded.id}
                                title="Supprimer le document"
                                className="flex items-center justify-center rounded"
                                style={{ width: 28, height: 28, background: 'none', border: 'none', color: '#B91C1C', cursor: deletingDocId === uploaded.id ? 'not-allowed' : 'pointer', opacity: deletingDocId === uploaded.id ? 0.5 : 1 }}>
                                {deletingDocId === uploaded.id ? <Loader size={13} className="animate-spin" /> : <Trash2 size={13} />}
                              </button>
                            </div>
                          ) : (
                            <label
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
                              style={{ border: `1px solid ${isUploading ? '#A7F3D0' : '#E5E7EB'}`, background: isUploading ? 'rgba(6,95,70,0.04)' : '#FAFAFA', color: isUploading ? '#065F46' : '#6B7280', fontSize: 11, fontWeight: 600, cursor: isUploading ? 'not-allowed' : 'pointer' }}>
                              {isUploading ? <Loader size={11} className="animate-spin" style={{ color: '#065F46' }} /> : <Upload size={11} style={{ color: '#9CA3AF' }} />}
                              {isUploading ? 'Envoi…' : 'Ajouter'}
                              <input type="file" className="hidden"
                                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                disabled={isUploading}
                                onChange={e => {
                                  const f = e.target.files?.[0];
                                  e.target.value = '';
                                  if (f) handleAddDoc(req.type, req.label, f);
                                }} />
                            </label>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Complementary documents */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p style={{ color: '#374151', fontSize: 13, fontWeight: 600 }}>Documents complémentaires</p>
                  {/* <p style={{ color: '#9CA3AF', fontSize: 11, marginTop: 2 }}>Facultatifs — enrichissent le dossier</p> */}
                </div>
                <span className="px-2 py-0.5 rounded-full"
                  style={{ background: enrichi ? '#ECFDF5' : '#FFFBEB', color: enrichi ? '#065F46' : '#92400E', fontSize: 10, fontWeight: 700 }}>
                  {presentTypes.filter(t => COMPLEMENTARY_DOCS.some(c => c.type === t)).length}/{COMPLEMENTARY_DOCS.length}
                </span>
              </div>
              {loadingDocs ? null : (
                <div className="space-y-2">
                  {COMPLEMENTARY_DOCS.map(comp => {
                    const uploaded = docs.find(d => d.type === comp.type);
                    const isReplacing = uploaded ? uploadingFor === uploaded.id : false;
                    const isUploading = uploadingFor === comp.type;
                    return (
                      <div key={comp.type}>
                        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg"
                          style={{ border: `1px solid ${uploaded ? '#D1FAE5' : '#FEF3C7'}`, background: uploaded ? 'rgba(6,95,70,0.03)' : 'rgba(251,191,36,0.04)' }}>
                          <div className="flex items-center justify-center rounded flex-shrink-0"
                            style={{ width: 18, height: 18, background: uploaded ? '#065F46' : '#FFFFFF', border: `1.5px solid ${uploaded ? '#065F46' : '#FCD34D'}` }}>
                            {uploaded && <Check size={10} style={{ color: '#FFFFFF' }} />}
                          </div>
                          <span className="flex-1" style={{ color: uploaded ? '#1A1A1A' : '#92400E', fontSize: 13 }}>
                            {comp.label}
                          </span>
                          {uploaded ? (
                            <div className="flex items-center gap-2">
                              <span style={{ color: '#9CA3AF', fontSize: 11 }}>
                                {new Date(uploaded.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </span>
                              <button
                                onClick={async () => {
                                  if (!child.apiId) return;
                                  try {
                                    const { url } = await childrenApi.getDocumentUrl(child.apiId, uploaded.id);
                                    window.open(url, '_blank', 'noopener,noreferrer');
                                  } catch {
                                    alert('Impossible d\'ouvrir le document.');
                                  }
                                }}
                                className="flex items-center justify-center rounded"
                                style={{ width: 28, height: 28, background: '#EEF2F7', color: '#3E5A78', border: 'none', cursor: 'pointer' }}>
                                <Eye size={13} />
                              </button>
                              <label
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
                                style={{ border: `1px solid ${isReplacing ? '#A7F3D0' : '#E5E7EB'}`, background: isReplacing ? 'rgba(6,95,70,0.04)' : '#FAFAFA', color: isReplacing ? '#065F46' : '#6B7280', fontSize: 11, fontWeight: 600, cursor: isReplacing ? 'not-allowed' : 'pointer' }}>
                                {isReplacing ? <Loader size={11} className="animate-spin" style={{ color: '#065F46' }} /> : <Upload size={11} style={{ color: '#9CA3AF' }} />}
                                {isReplacing ? 'Envoi…' : 'Remplacer'}
                                <input type="file" className="hidden"
                                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                  disabled={isReplacing}
                                  onChange={e => {
                                    const f = e.target.files?.[0];
                                    e.target.value = '';
                                    if (f) handleReplaceDoc(uploaded.id, f);
                                  }} />
                              </label>
                              <button
                                onClick={() => handleDeleteDoc(uploaded.id)}
                                disabled={deletingDocId === uploaded.id}
                                title="Supprimer le document"
                                className="flex items-center justify-center rounded"
                                style={{ width: 28, height: 28, background: 'none', border: 'none', color: '#B91C1C', cursor: deletingDocId === uploaded.id ? 'not-allowed' : 'pointer', opacity: deletingDocId === uploaded.id ? 0.5 : 1 }}>
                                {deletingDocId === uploaded.id ? <Loader size={13} className="animate-spin" /> : <Trash2 size={13} />}
                              </button>
                            </div>
                          ) : (
                            <label
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
                              style={{ border: `1px solid ${isUploading ? '#A7F3D0' : '#FCD34D'}`, background: isUploading ? 'rgba(6,95,70,0.04)' : '#FFFBEB', color: isUploading ? '#065F46' : '#92400E', fontSize: 11, fontWeight: 600, cursor: isUploading ? 'not-allowed' : 'pointer' }}>
                              {isUploading ? <Loader size={11} className="animate-spin" style={{ color: '#065F46' }} /> : <Upload size={11} style={{ color: '#92400E' }} />}
                              {isUploading ? 'Envoi…' : 'Ajouter'}
                              <input type="file" className="hidden"
                                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                disabled={isUploading}
                                onChange={e => {
                                  const f = e.target.files?.[0];
                                  e.target.value = '';
                                  if (f) handleAddDoc(comp.type, comp.label, f);
                                }} />
                            </label>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );

      // ── Famille ────────────────────────────────────────────────────────────
      case 'famille':
        return (
          <div className="space-y-4">
            <Field label="Situation familiale">
              <select value={localCrm.situationFamiliale} disabled={!editing}
                onChange={e => set('situationFamiliale', e.target.value)} style={FS}>
                <option>Orphelin complet</option>
                <option>Orphelin de père</option>
                <option>Orphelin de mère</option>
                <option>Demi-orphelin</option>
                <option>Enfant en difficulté</option>
              </select>
            </Field>
            <Field label="Lieu de vie (famille)">
              <input value={localCrm.lieuVie} readOnly={!editing} onChange={e => set('lieuVie', e.target.value)} style={F} />
            </Field>
            <Field label="Date dernière visite familiale">
              <input value={localCrm.derniereVisite} readOnly={!editing} onChange={e => set('derniereVisite', e.target.value)}
                placeholder="Ex : 15 Avr 2026" style={F} />
            </Field>
            <Field label="Contacts famille">
              <textarea value={localCrm.contactsFamille} readOnly={!editing} onChange={e => set('contactsFamille', e.target.value)}
                rows={2} style={FT} placeholder="Nom — téléphone" />
            </Field>
            <Field label="Composition familiale">
              <textarea value={localCrm.compositionFamiliale} readOnly={!editing} onChange={e => set('compositionFamiliale', e.target.value)}
                rows={2} style={FT} placeholder="Ex : Père décédé, mère présente…" />
            </Field>
          </div>
        );

      // ── Scolarité ──────────────────────────────────────────────────────────
      case 'scolarite':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Niveau">
                <select value={localCrm.niveauScolaire} disabled={!editing}
                  onChange={e => set('niveauScolaire', e.target.value)} style={FS}>
                  {CLASSES.map(c => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Établissement">
                <input value={localCrm.etablissement} readOnly={!editing}
                  onChange={e => set('etablissement', e.target.value)} style={F} />
              </Field>
            </div>
            <Field label="Résultats par matière">
              <textarea value={localCrm.resultatsMatieres} readOnly={!editing}
                onChange={e => set('resultatsMatieres', e.target.value)}
                rows={3} placeholder="Français : 14/20, Maths : 16/20…" style={FT} />
            </Field>
            <Field label="Assiduité">
              <input value={localCrm.assiduiteNote} readOnly={!editing}
                onChange={e => set('assiduiteNote', e.target.value)}
                placeholder="Ex : 95% de présence" style={F} />
            </Field>
            <Field label="Observations enseignant">
              <textarea value={localCrm.observationsEnseignant} readOnly={!editing}
                onChange={e => set('observationsEnseignant', e.target.value)}
                rows={3} placeholder="Notes pédagogiques…" style={FT} />
            </Field>
          </div>
        );

      // ── Santé ──────────────────────────────────────────────────────────────
      case 'sante':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Groupe sanguin">
                <select value={localCrm.groupeSanguin} disabled={!editing}
                  onChange={e => set('groupeSanguin', e.target.value)} style={FS}>
                  {['—', 'A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−'].map(g => <option key={g}>{g}</option>)}
                </select>
              </Field>
              <Field label="Allergies connues">
                <input value={localCrm.allergies} readOnly={!editing}
                  onChange={e => set('allergies', e.target.value)} placeholder="Ex : Pénicilline" style={F} />
              </Field>
            </div>
            <Field label="Vaccinations (dates)">
              <textarea value={localCrm.vaccinations} readOnly={!editing}
                onChange={e => set('vaccinations', e.target.value)}
                rows={3} placeholder="Ex : BCG 2020, Hépatite B 2021…" style={FT} />
            </Field>
            <Field label="Traitements en cours">
              <textarea value={localCrm.traitements} readOnly={!editing}
                onChange={e => set('traitements', e.target.value)}
                rows={2} placeholder="Médicaments, posologie…" style={FT} />
            </Field>
            <Field label="Consultations médicales">
              <textarea value={localCrm.consultations} readOnly={!editing}
                onChange={e => set('consultations', e.target.value)}
                rows={2} placeholder="Dernières consultations…" style={FT} />
            </Field>
          </div>
        );

      // ── Sorties ────────────────────────────────────────────────────────────
      case 'sorties':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p style={{ color: '#374151', fontSize: 13, fontWeight: 600 }}>Historique des sorties</p>
              {editing && (
                <button
                  onClick={() => set('sortiesHist', [
                    ...localCrm.sortiesHist,
                    { type: 'temporaire', dateDepart: '', dateRetour: '', motif: '', responsable: '', responsableTel: '' }
                  ])}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
                  style={{ background: '#EEF2F7', color: '#3E5A78', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                  <Plus size={13} /> Ajouter
                </button>
              )}
            </div>
            {localCrm.sortiesHist.length === 0 ? (
              <div className="py-8 text-center rounded-xl" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
                <p style={{ color: '#9CA3AF', fontSize: 13 }}>Aucune sortie enregistrée.</p>
              </div>
            ) : (
              localCrm.sortiesHist.map((s, idx) => (
                <div key={idx} className="rounded-xl p-4 space-y-3" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
                  {/* Row 1 — Type */}
                  <Field label="Type">
                    <select value={s.type} disabled={!editing}
                      onChange={e => { const h = [...localCrm.sortiesHist]; h[idx] = { ...h[idx], type: e.target.value }; set('sortiesHist', h); }}
                      style={FS}>
                      <option value="temporaire">Temporaire</option>
                      <option value="définitive">Définitive</option>
                    </select>
                  </Field>

                  {/* Row 2 — Dates */}
                  <div className={s.type !== 'définitive' ? 'grid grid-cols-2 gap-3' : ''}>
                    <Field label="Date départ">
                      <div className="flex gap-1.5 items-center">
                        <input
                          value={s.dateDepart ? s.dateDepart.split('-').reverse().join('/') : ''}
                          readOnly={!editing}
                          onChange={e => {
                            const val = e.target.value;
                            const m = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
                            const iso = m ? `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` : val;
                            const h = [...localCrm.sortiesHist]; h[idx] = { ...h[idx], dateDepart: iso }; set('sortiesHist', h);
                          }}
                          placeholder="JJ/MM/AAAA"
                          style={{ ...F, flex: 1, minWidth: 0 }}
                        />
                        {editing && (
                          <div style={{ position: 'relative', flexShrink: 0 }}>
                            <button type="button"
                              onClick={() => (document.getElementById(`depart-picker-${idx}`) as HTMLInputElement)?.showPicker?.()}
                              className="flex items-center justify-center rounded-lg"
                              style={{ width: 34, height: 34, background: '#F3F4F6', border: '1px solid #E5E7EB', cursor: 'pointer' }}>
                              📅
                            </button>
                            <input id={`depart-picker-${idx}`} type="date" value={s.dateDepart}
                              onChange={e => { const h = [...localCrm.sortiesHist]; h[idx] = { ...h[idx], dateDepart: e.target.value }; set('sortiesHist', h); }}
                              style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }} />
                          </div>
                        )}
                      </div>
                    </Field>
                    {s.type !== 'définitive' && (
                      <Field label="Date retour prévue">
                        <div className="flex gap-1.5 items-center">
                          <input
                            value={s.dateRetour ? s.dateRetour.split('-').reverse().join('/') : ''}
                            readOnly={!editing}
                            onChange={e => {
                              const val = e.target.value;
                              const m = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
                              const iso = m ? `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` : val;
                              const h = [...localCrm.sortiesHist]; h[idx] = { ...h[idx], dateRetour: iso }; set('sortiesHist', h);
                            }}
                            placeholder="JJ/MM/AAAA"
                            style={{ ...F, flex: 1, minWidth: 0 }}
                          />
                          {editing && (
                            <div style={{ position: 'relative', flexShrink: 0 }}>
                              <button type="button"
                                onClick={() => (document.getElementById(`retour-picker-${idx}`) as HTMLInputElement)?.showPicker?.()}
                                className="flex items-center justify-center rounded-lg"
                                style={{ width: 34, height: 34, background: '#F3F4F6', border: '1px solid #E5E7EB', cursor: 'pointer' }}>
                                📅
                              </button>
                              <input id={`retour-picker-${idx}`} type="date" value={s.dateRetour}
                                onChange={e => { const h = [...localCrm.sortiesHist]; h[idx] = { ...h[idx], dateRetour: e.target.value }; set('sortiesHist', h); }}
                                style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }} />
                            </div>
                          )}
                        </div>
                      </Field>
                    )}
                  </div>

                  {/* Row 3 — Motif */}
                  <Field label="Motif">
                    <input value={s.motif} readOnly={!editing}
                      onChange={e => { const h = [...localCrm.sortiesHist]; h[idx] = { ...h[idx], motif: e.target.value }; set('sortiesHist', h); }}
                      placeholder="Raison de la sortie" style={F} />
                  </Field>

                  {/* Row 4 — Responsable + Téléphone */}
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Responsable">
                      <input value={s.responsable} readOnly={!editing}
                        onChange={e => { const h = [...localCrm.sortiesHist]; h[idx] = { ...h[idx], responsable: e.target.value }; set('sortiesHist', h); }}
                        placeholder="Nom du responsable" style={F} />
                    </Field>
                    <Field label="Téléphone tuteur">
                      <input
                        type="tel"
                        value={s.responsableTel ?? ''}
                        readOnly={!editing}
                        onChange={e => {
                          const raw = e.target.value.replace(/^\+221\s?/, '').replace(/\D/g, '').slice(0, 9);
                          const fmt =
                            raw.length === 0 ? '' :
                            raw.length <= 2 ? `+221 ${raw}` :
                            raw.length <= 5 ? `+221 ${raw.slice(0,2)} ${raw.slice(2)}` :
                            raw.length <= 7 ? `+221 ${raw.slice(0,2)} ${raw.slice(2,5)} ${raw.slice(5)}` :
                            `+221 ${raw.slice(0,2)} ${raw.slice(2,5)} ${raw.slice(5,7)} ${raw.slice(7)}`;
                          const h = [...localCrm.sortiesHist]; h[idx] = { ...h[idx], responsableTel: fmt }; set('sortiesHist', h);
                        }}
                        placeholder="+221 77 123 45 67"
                        style={F}
                      />
                    </Field>
                  </div>
                  {editing && (
                    <button
                      onClick={async () => {
                        const sortie = localCrm.sortiesHist[idx];
                        if (sortie.id && child.apiId) {
                          try {
                            await childrenApi.deleteEvent(child.apiId, sortie.id);
                          } catch {
                            alert('Erreur lors de la suppression.');
                            return;
                          }
                        }
                        const newHist = localCrm.sortiesHist.filter((_, i) => i !== idx);
                        setLocalCrm(prev => ({ ...prev, sortiesHist: newHist, isActive: newHist.length === 0 ? true : prev.isActive }));
                        onUpdate({ ...localCrm, sortiesHist: newHist, isActive: newHist.length === 0 ? true : localCrm.isActive });
                        if (newHist.length === 0 && child.apiId) {
                          childrenApi.reactivateChild(child.apiId)
                            .then(() => onReactivate())
                            .catch(() => {});
                        }
                      }}
                      style={{ color: '#B91C1C', fontSize: 11, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      Supprimer
                    </button>
                  )}
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
              <textarea value={localCrm.activitesListe} readOnly={!editing}
                onChange={e => set('activitesListe', e.target.value)}
                rows={3} placeholder="Football, karaté, dessin…" style={FT} />
            </Field>
            <Field label="Goûts et intérêts">
              <textarea value={localCrm.gouts} readOnly={!editing}
                onChange={e => set('gouts', e.target.value)}
                rows={2} placeholder="Musique, lecture, sciences…" style={FT} />
            </Field>
            <Field label="Traits de caractère">
              <textarea value={localCrm.caractere} readOnly={!editing}
                onChange={e => set('caractere', e.target.value)}
                rows={2} placeholder="Curieux, sociable, timide…" style={FT} />
            </Field>
          </div>
        );

      default: return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
      style={{ background: 'rgba(26,26,26,0.55)', backdropFilter: 'blur(2px)' }}
>
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
                <button onClick={() => { setLocalCrm(crm); setIdentity({ firstName: child.firstName, lastName: child.lastName }); setEditing(false); }}
                  className="px-3 py-1.5 rounded-lg"
                  style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, cursor: 'pointer' }}>
                  Annuler
                </button>
                {saveError && (
                  <span style={{ color: '#B91C1C', fontSize: 11 }}>{saveError}</span>
                )}
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
              {t.key === 'identite' && complet && !enrichi && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full" style={{ background: '#FFFBEB', color: '#92400E', fontSize: 9, fontWeight: 700 }}>~</span>
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
  firstName: '', lastName: '', dob: new Date().toISOString().split('T')[0], gender: 'M',
  classe: 'Primaire 1', attendanceStatus: 'present',
  dossierStatus: 'incomplet', tuteurName: '', tuteurPhone: '',
  admissionDate: new Date().toISOString().split('T')[0],
};
const EMPTY_DOCS: Docs = Object.fromEntries(DOCS_LIST.map(d => [d.key, false])) as Docs;

// Mapping from DOCS_LIST key → ApiDocumentType
const DOC_KEY_TO_TYPE: Record<DocKey, ApiDocumentType> = {
  acteNaissance:    'ACTE_NAISSANCE',
  acteDeces:        'ACTE_DECES',
  pieceIdTuteur:    'PIECE_ID_TUTEUR',
  accordAEMO:       'ACCORD_AEMO',
  carnetSante:      'CARNET_SANTE',
  certificatPEC:    'CERTIFICAT_PEC',
  photo:            'PHOTO',
};

export function AddModal({ onCreated, onClose }: {
  onCreated: (child: Child & { apiId: string }) => void;
  onClose: () => void;
}) {
  const [step, setStep]       = useState<FormStep>(1);
  const [form, setForm]       = useState<Omit<Child, 'id'>>(EMPTY_FORM);
  const [childStatus, setChildStatus] = useState<ApiChildStatus>('ORPHELIN_COMPLET');
  const [dobText, setDobText] = useState('');
  const [admissionText, setAdmissionText] = useState('');
  const [docFiles, setDocFiles] = useState<Partial<Record<DocKey, File>>>({});
  const [compDocFiles, setCompDocFiles] = useState<Partial<Record<ApiDocumentType, File>>>({});
  const [saving, setSaving]   = useState(false);
  const [saveError, setSaveError] = useState('');
  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleDobText = (val: string) => {
    setDobText(val);
    const m = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) set('dob', `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
  };

  const handleAdmissionText = (val: string) => {
    setAdmissionText(val);
    const m = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) set('admissionDate', `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
  };

  const canNext =
    step === 1 ? !!(form.firstName.trim() && form.lastName.trim() && form.dob) :
    step === 2 ? !!form.classe : true;

  const next = () => { if (canNext && step < 4) setStep(s => (s + 1) as FormStep); };
  const back = () => { if (step > 1) setStep(s => (s - 1) as FormStep); };

  const STEPS: { n: FormStep; l: string }[] = [
    { n: 1, l: 'Identité' }, { n: 2, l: 'Scolarité' },
    { n: 3, l: 'Tuteur' },   { n: 4, l: 'Documents' },
  ];
  const docsCount = Object.keys(docFiles).length;

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      // Phase 1 — create child record (critical, must succeed)
      const created = await childrenApi.create(mapFormToPayload({ ...form, childStatus }));
      const newChild = mapSummaryToChild(created);
      await childrenApi.upsertSchool(created.id, { currentLevel: form.classe });
      newChild.classe = form.classe as Child['classe'];

      // Phase 2 — upload documents (non-critical: child is created even if uploads fail)
      try {
        const requiredUploads = Object.entries(docFiles).map(([key, file]) =>
          file ? childrenApi.uploadDocument(
            created.id,
            file,
            DOC_KEY_TO_TYPE[key as DocKey],
            DOCS_LIST.find(d => d.key === key)?.label ?? key,
          ) : Promise.resolve()
        );
        const compUploads = Object.entries(compDocFiles).map(([type, file]) =>
          file ? childrenApi.uploadDocument(
            created.id,
            file,
            type as ApiDocumentType,
            COMPLEMENTARY_DOCS.find(d => d.type === type)?.label ?? type,
          ) : Promise.resolve()
        );
        await Promise.all([...requiredUploads, ...compUploads]);
        const compCount = Object.keys(compDocFiles).length;
        newChild.dossierStatus =
          docsCount === DOCS_LIST.length && compCount === COMPLEMENTARY_DOCS.length ? 'complet' :
          docsCount === DOCS_LIST.length ? 'à compléter' :
          'incomplet';
      } catch (uploadErr: any) {
        // Child was created — warn but don't block; user can add docs from the CRM fiche
        alert(`Dossier créé. Certains documents n'ont pas pu être envoyés : ${uploadErr.message}. Ajoutez-les depuis la fiche.`);
      }

      onCreated(newChild as Child & { apiId: string });
    } catch (err: any) {
      setSaveError(err.message ?? 'Erreur lors de l\'enregistrement.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(26,26,26,0.55)', backdropFilter: 'blur(2px)' }}>
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
                <div className="flex gap-2 items-center">
                  <input
                    value={dobText}
                    onChange={e => handleDobText(e.target.value)}
                    placeholder="JJ/MM/AAAA"
                    style={{ ...INPUT_S, flex: 1 }}
                  />
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <button
                      type="button"
                      title="Choisir via le calendrier"
                      onClick={() => (document.getElementById('dob-picker') as HTMLInputElement)?.showPicker?.()}
                      className="flex items-center justify-center rounded-lg"
                      style={{ width: 36, height: 36, background: '#F3F4F6', border: '1px solid #E5E7EB', cursor: 'pointer', color: '#6B7280' }}>
                      📅
                    </button>
                    <input
                      id="dob-picker"
                      type="date"
                      value={form.dob}
                      onChange={e => { set('dob', e.target.value); setDobText(e.target.value.split('-').reverse().join('/')); }}
                      style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                    />
                  </div>
                </div>
                {dobText && !form.dob.match(/^\d{4}-\d{2}-\d{2}$/) && (
                  <p style={{ color: '#B91C1C', fontSize: 11, marginTop: 3 }}>Format attendu : JJ/MM/AAAA</p>
                )}
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
              <div>
                <label style={{ color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 }}>Situation</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    ['ORPHELIN_COMPLET', 'Orphelin complet'],
                    ['ORPHELIN_PERE',    'Orphelin de père'],
                    ['ORPHELIN_MERE',    'Orphelin de mère'],
                  ] as [ApiChildStatus, string][]).map(([v, l]) => (
                    <button key={v} type="button" onClick={() => setChildStatus(v)}
                      className="py-2 rounded-lg text-center"
                      style={{ background: childStatus === v ? '#3E5A78' : '#F9F7F3', color: childStatus === v ? '#FFFFFF' : '#374151', fontSize: 12, fontWeight: childStatus === v ? 600 : 400, border: `1px solid ${childStatus === v ? '#3E5A78' : '#E5E7EB'}`, cursor: 'pointer', lineHeight: 1.3 }}>
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
                <div className="flex gap-2 items-center">
                  <input
                    value={admissionText}
                    onChange={e => handleAdmissionText(e.target.value)}
                    placeholder="JJ/MM/AAAA"
                    style={{ ...INPUT_S, flex: 1 }}
                  />
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <button
                      type="button"
                      title="Choisir via le calendrier"
                      onClick={() => (document.getElementById('admission-picker') as HTMLInputElement)?.showPicker?.()}
                      className="flex items-center justify-center rounded-lg"
                      style={{ width: 36, height: 36, background: '#F3F4F6', border: '1px solid #E5E7EB', cursor: 'pointer', color: '#6B7280' }}>
                      📅
                    </button>
                    <input
                      id="admission-picker"
                      type="date"
                      value={form.admissionDate}
                      onChange={e => { set('admissionDate', e.target.value); setAdmissionText(e.target.value.split('-').reverse().join('/')); }}
                      style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                    />
                  </div>
                </div>
                {admissionText && !form.admissionDate.match(/^\d{4}-\d{2}-\d{2}$/) && (
                  <p style={{ color: '#B91C1C', fontSize: 11, marginTop: 3 }}>Format attendu : JJ/MM/AAAA</p>
                )}
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
                <input
                  type="tel"
                  value={form.tuteurPhone}
                  onChange={e => {
                    const raw = e.target.value.replace(/^\+221\s?/, '').replace(/\D/g, '').slice(0, 9);
                    const fmt =
                      raw.length === 0 ? '' :
                      raw.length <= 2 ? `+221 ${raw}` :
                      raw.length <= 5 ? `+221 ${raw.slice(0,2)} ${raw.slice(2)}` :
                      raw.length <= 7 ? `+221 ${raw.slice(0,2)} ${raw.slice(2,5)} ${raw.slice(5)}` :
                      `+221 ${raw.slice(0,2)} ${raw.slice(2,5)} ${raw.slice(5,7)} ${raw.slice(7)}`;
                    set('tuteurPhone', fmt);
                  }}
                  placeholder="+221 77 123 45 67"
                  style={INPUT_S}
                />
              </div>
            </>
          )}
          {step === 4 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p style={{ color: '#374151', fontSize: 13, fontWeight: 600 }}>Documents requis</p>
                <span className="px-2 py-0.5 rounded-full"
                  style={{ background: docsCount === DOCS_LIST.length ? '#ECFDF5' : '#FEF2F2', color: docsCount === DOCS_LIST.length ? '#065F46' : '#B91C1C', fontSize: 10, fontWeight: 700 }}>
                  {docsCount}/{DOCS_LIST.length}
                </span>
              </div>
              {/* <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 10 }}>
                Les documents seront envoyés vers le stockage sécurisé après création du dossier.
              </p> */}
              <div className="space-y-1.5" style={{ maxHeight: 200, overflowY: 'auto' }}>
                {DOCS_LIST.map(doc => {
                  const file = docFiles[doc.key];
                  return (
                    <label key={doc.key} className="flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer"
                      style={{ border: `1px solid ${file ? '#D1FAE5' : '#F3F4F6'}`, background: file ? 'rgba(6,95,70,0.03)' : '#FAFAFA' }}>
                      <div className="flex items-center justify-center rounded flex-shrink-0"
                        style={{ width: 16, height: 16, background: file ? '#3E5A78' : '#FFFFFF', border: `1.5px solid ${file ? '#3E5A78' : '#D1D5DB'}` }}>
                        {file && <Check size={9} style={{ color: '#FFFFFF' }} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p style={{ color: file ? '#1A1A1A' : '#6B7280', fontSize: 12, fontWeight: file ? 500 : 400 }}>{doc.label}</p>
                        {file && (
                          <p style={{ color: '#065F46', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {file.name}
                          </p>
                        )}
                      </div>
                      <span className="flex items-center gap-1 px-2 py-1 rounded flex-shrink-0"
                        style={{ background: file ? '#ECFDF5' : '#F3F4F6', border: `1px solid ${file ? '#A7F3D0' : '#E5E7EB'}`, color: file ? '#065F46' : '#374151', fontSize: 10, fontWeight: 600 }}>
                        {file ? <><Check size={9} /> Joint</> : <><Upload size={9} /> Joindre</>}
                      </span>
                      {file && (
                        <button
                          type="button"
                          onClick={e => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDocFiles(prev => {
                              const next = { ...prev };
                              delete next[doc.key];
                              return next;
                            });
                          }}
                          title="Retirer le fichier"
                          className="flex items-center justify-center rounded flex-shrink-0"
                          style={{ width: 22, height: 22, background: 'none', border: 'none', color: '#B91C1C', cursor: 'pointer' }}>
                          <Trash2 size={12} />
                        </button>
                      )}
                      <input type="file" className="hidden"
                        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                        onChange={e => {
                          const f = e.target.files?.[0];
                          setDocFiles(prev => f ? { ...prev, [doc.key]: f } : prev);
                        }} />
                    </label>
                  );
                })}
              </div>

              {/* Complementary documents */}
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p style={{ color: '#374151', fontSize: 13, fontWeight: 600 }}>Documents complémentaires</p>
                    {/* <p style={{ color: '#9CA3AF', fontSize: 11, marginTop: 1 }}>Facultatifs — enrichissent le dossier</p> */}
                  </div>
                  <span className="px-2 py-0.5 rounded-full"
                    style={{ background: '#FFFBEB', color: '#92400E', fontSize: 10, fontWeight: 700 }}>
                    {Object.keys(compDocFiles).length}/{COMPLEMENTARY_DOCS.length}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {COMPLEMENTARY_DOCS.map(doc => {
                    const file = compDocFiles[doc.type];
                    return (
                      <label key={doc.type} className="flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer"
                        style={{ border: `1px solid ${file ? '#D1FAE5' : '#FEF3C7'}`, background: file ? 'rgba(6,95,70,0.03)' : 'rgba(251,191,36,0.04)' }}>
                        <div className="flex items-center justify-center rounded flex-shrink-0"
                          style={{ width: 16, height: 16, background: file ? '#065F46' : '#FFFFFF', border: `1.5px solid ${file ? '#065F46' : '#FCD34D'}` }}>
                          {file && <Check size={9} style={{ color: '#FFFFFF' }} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p style={{ color: file ? '#1A1A1A' : '#92400E', fontSize: 12, fontWeight: file ? 500 : 400 }}>{doc.label}</p>
                          {file && (
                            <p style={{ color: '#065F46', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {file.name}
                            </p>
                          )}
                        </div>
                        <span className="flex items-center gap-1 px-2 py-1 rounded flex-shrink-0"
                          style={{ background: file ? '#ECFDF5' : '#FFFBEB', border: `1px solid ${file ? '#A7F3D0' : '#FCD34D'}`, color: file ? '#065F46' : '#92400E', fontSize: 10, fontWeight: 600 }}>
                          {file ? <><Check size={9} /> Joint</> : <><Upload size={9} /> Joindre</>}
                        </span>
                        {file && (
                          <button
                            type="button"
                            onClick={e => {
                              e.preventDefault();
                              e.stopPropagation();
                              setCompDocFiles(prev => {
                                const next = { ...prev };
                                delete next[doc.type];
                                return next;
                              });
                            }}
                            title="Retirer le fichier"
                            className="flex items-center justify-center rounded flex-shrink-0"
                            style={{ width: 22, height: 22, background: 'none', border: 'none', color: '#B91C1C', cursor: 'pointer' }}>
                            <Trash2 size={12} />
                          </button>
                        )}
                        <input type="file" className="hidden"
                          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                          onChange={e => {
                            const f = e.target.files?.[0];
                            setCompDocFiles(prev => f ? { ...prev, [doc.type]: f } : prev);
                          }} />
                      </label>
                    );
                  })}
                </div>
              </div>

              {saveError && <p style={{ color: '#B91C1C', fontSize: 12, marginTop: 8 }}>{saveError}</p>}
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
          <button type="button" onClick={step < 4 ? next : handleSave}
            disabled={(!canNext && step < 4) || saving}
            className="flex items-center gap-2 px-5 py-2 rounded-lg"
            style={{
              background: (canNext || step === 4) && !saving ? '#3E5A78' : '#E5E7EB',
              color: (canNext || step === 4) && !saving ? '#FFFFFF' : '#9CA3AF',
              fontSize: 13, fontWeight: 600, border: 'none',
              cursor: (canNext || step === 4) && !saving ? 'pointer' : 'not-allowed',
            }}>
            {step < 4
              ? <>Continuer <ChevronRight size={14} /></>
              : saving
                ? <><Loader size={14} className="animate-spin" /> Enregistrement…</>
                : <><Check size={14} /> Enregistrer</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, total, color, bg, icon: Icon }: { label: string; value: number; total?: number; color: string; bg: string; icon: React.ElementType }) {
  return (
    <div className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: bg }}>
      <div className="flex items-center justify-center rounded-lg" style={{ width: 34, height: 34, background: 'rgba(255,255,255,0.75)' }}>
        <Icon size={16} style={{ color }} />
      </div>
      <div>
        {total !== undefined ? (
          <p style={{ color, fontSize: 22, fontWeight: 700, lineHeight: 1 }}>
            {value} <span style={{ fontSize: 14, fontWeight: 500, color: '#9CA3AF' }}>sur {total}</span>
          </p>
        ) : (
          <p style={{ color, fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{value}</p>
        )}
        <p style={{ color: '#6B7280', fontSize: 11, marginTop: 2 }}>{label}</p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

// ─── Sortie date helpers ─────────────────────────────────────────────────────

const TODAY = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();

function daysFromToday(dateStr: string): number {
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - TODAY.getTime()) / 86_400_000);
}

type SortieState = 'none' | 'pending' | 'active' | 'returned';

function getSortieState(c: Child): SortieState {
  if (c.exitType !== 'temporaire' || !c.exitDate) return 'none';
  const daysUntilDep = daysFromToday(c.exitDate);
  if (daysUntilDep > 0) return 'pending';
  if (c.exitReturnDate && daysFromToday(c.exitReturnDate) <= 0) return 'returned';
  return 'active';
}

function getEffectiveAttendance(c: Child): 'present' | 'absent' {
  const state = getSortieState(c);
  if (state === 'active' || state === 'returned') return 'absent';
  return c.attendanceStatus;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ChildrenPage() {
  const { user } = useAuth();
  const [children, setChildren] = useState<Child[]>([]);
  const [crmData, setCrmData]   = useState<Record<number, ChildCRM>>({});
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    childrenApi.list()
      .then(data => {
        const mapped = data.map(mapSummaryToChild);
        setChildren(mapped);
        setCrmData(Object.fromEntries(mapped.map(c => [c.id, makeDefaultCRM(c)])));
      })
      .catch(err => setError(err.message ?? 'Erreur de chargement'))
      .finally(() => setLoading(false));
  }, []);

  const [search, setSearch]                 = useState('');
  const [filterAttendance, setFilterAttendance] = useState<AttendanceFilter>('all');
  const [filterDossier, setFilterDossier]   = useState<DossierFilter>('all');
  const [sortField, setSortField]           = useState<SortField>(null);
  const [sortDir, setSortDir]               = useState<SortDir>('asc');
  const [showFilters, setShowFilters]       = useState(true);

  const [modal, setModal]           = useState<{ mode: 'view' | 'add' | null; child?: Child }>({ mode: null });
  const [exitTarget, setExitTarget] = useState<Child | null>(null);

  // CRM update
  const updateCrm = (id: number, crm: ChildCRM) => setCrmData(prev => ({ ...prev, [id]: crm }));

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const getDossierStatus = (id: number): 'complet' | 'à compléter' | 'partiel' | 'incomplet' =>
    children.find(c => c.id === id)?.dossierStatus ?? 'incomplet';

  // A child is effectively active if: never exited, OR their temporary sortie return date has passed
  const isEffectivelyActive = (c: Child) => {
    const manuallySorti = crmData[c.id]?.isActive === false || c.exitStatus === 'sorti';
    if (!manuallySorti) return true;
    const state = getSortieState(c);
    return state === 'active' || state === 'returned' || state === 'pending';
  };

  // Sortie alerts: departure or return within 7 days
  const sortieAlerts = useMemo(() => {
    const alerts: { child: Child; kind: 'departure' | 'return'; days: number; date: string }[] = [];
    children.forEach(c => {
      if (c.exitType !== 'temporaire' || c.exitStatus !== 'sorti') return;
      if (c.exitDate) {
        const days = daysFromToday(c.exitDate);
        if (days >= 0 && days <= 7) alerts.push({ child: c, kind: 'departure', days, date: c.exitDate });
      }
      if (c.exitReturnDate) {
        const days = daysFromToday(c.exitReturnDate);
        if (days >= 0 && days <= 7) alerts.push({ child: c, kind: 'return', days, date: c.exitReturnDate });
      }
    });
    return alerts.sort((a, b) => a.days - b.days);
  }, [children]);

  const filtered = useMemo(() => {
    let list = children.filter(c => {
      const q = search.toLowerCase();
      return (!q || `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) || c.classe.toLowerCase().includes(q))
        && (filterAttendance === 'all' || getEffectiveAttendance(c) === filterAttendance)
        && (filterDossier === 'all' || getDossierStatus(c.id) === filterDossier);
    });
    if (sortField) {
      list = [...list].sort((a, b) => {
        let va: string | number = '';
        let vb: string | number = '';
        if (sortField === 'name')       { va = `${a.firstName} ${a.lastName}`; vb = `${b.firstName} ${b.lastName}`; }
        else if (sortField === 'age')   { va = getAge(a.dob); vb = getAge(b.dob); }
        else if (sortField === 'classe'){ va = a.classe; vb = b.classe; }
        else if (sortField === 'attendance') { va = getEffectiveAttendance(a); vb = getEffectiveAttendance(b); }
        else if (sortField === 'dossier')    { va = getDossierStatus(a.id); vb = getDossierStatus(b.id); }
        if (typeof va === 'number') return sortDir === 'asc' ? va - (vb as number) : (vb as number) - va;
        return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
      });
    }
    return list;
  }, [children, crmData, search, filterAttendance, filterDossier, sortField, sortDir]);

  const activeCount    = children.filter(isEffectivelyActive).length;
  const presentCount   = children.filter(c => isEffectivelyActive(c) && getEffectiveAttendance(c) === 'present').length;
  const incompletTotal = children.filter(c => isEffectivelyActive(c) && getDossierStatus(c.id) !== 'complet').length;

  const handleExit = async (type: 'temporaire' | 'définitive', date: string, motif: string, responsable: string, dateRetour: string) => {
    if (!exitTarget) return;
    const apiId = (exitTarget as any).apiId as string | undefined;
    try {
      if (apiId) {
        await childrenApi.exitChild(apiId, {
          exitType: type,
          exitDate: date,
          exitReason: motif,
          exitResponsable: responsable || undefined,
          dateRetour: dateRetour || undefined,
        });
      }
      setCrmData(prev => ({
        ...prev,
        [exitTarget.id]: { ...prev[exitTarget.id], isActive: false, exitType: type, exitDate: date, exitMotif: motif, exitResponsable: responsable }
      }));
      setChildren(prev => prev.map(c =>
        c.id === exitTarget.id
          ? { ...c, exitStatus: 'sorti', exitType: type, exitDate: date, exitReturnDate: dateRetour || undefined }
          : c
      ));
      setExitTarget(null);
      if (modal.child?.id === exitTarget.id) setModal({ mode: null });
    } catch {
      alert('Erreur lors de l\'enregistrement de la sortie.');
    }
  };

  const handleAddChild = async (form: Omit<Child, 'id'>, initialDocs: Docs) => {
    try {
      const created = await childrenApi.create(mapFormToPayload(form));
      const newChild = mapSummaryToChild(created);
      const docsComplet = Object.values(initialDocs).every(Boolean);
      newChild.dossierStatus = docsComplet ? 'complet' : 'incomplet';
      setChildren(prev => [newChild, ...prev]);
      const defaultCrm = makeDefaultCRM(newChild);
      setCrmData(prev => ({ ...prev, [newChild.id]: { ...defaultCrm, docs: initialDocs } }));
      setModal({ mode: null });
    } catch (err: any) {
      alert(`Erreur lors de la création : ${err.message}`);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <p style={{ color: '#9CA3AF', fontSize: 14 }}>Chargement des dossiers…</p>
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center h-64">
      <p style={{ color: '#B91C1C', fontSize: 14 }}>{error}</p>
    </div>
  );

  return (
    <div className="px-4 md:px-6 py-6 space-y-5" style={{ maxWidth: 1400 }}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>Dossiers enfants</h2>
          <p style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>{activeCount} actifs · {children.length - activeCount} sortis · {children.length} total</p>
        </div>
        <button onClick={() => setModal({ mode: 'add' })}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg self-start"
          style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
          <Plus size={16} /> Ajouter un enfant
        </button>
      </div>

      {/* Sortie alerts banner — visible to director and supervisor */}
      {sortieAlerts.length > 0 && (user?.role === 'director' || user?.role === 'supervisor') && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #FED7AA', background: '#FFF7ED' }}>
          <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid #FED7AA', background: '#FFEDD5' }}>
            <Bell size={14} style={{ color: '#C2410C' }} />
            <p style={{ color: '#C2410C', fontSize: 12, fontWeight: 700 }}>
              SORTIES — ALERTES ({sortieAlerts.length})
            </p>
          </div>
          <div className="divide-y" style={{ borderColor: '#FED7AA' }}>
            {sortieAlerts.map((a, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full"
                    style={{ background: a.kind === 'departure' ? '#FEF2F2' : '#ECFDF5', color: a.kind === 'departure' ? '#B91C1C' : '#065F46', fontSize: 10, fontWeight: 700 }}>
                    {a.kind === 'departure' ? 'DÉPART' : 'RETOUR'}
                  </span>
                  <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 500 }}>
                    {a.child.firstName} {a.child.lastName}
                  </p>
                  <p style={{ color: '#6B7280', fontSize: 12 }}>
                    — {new Date(a.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded-full"
                  style={{ background: a.days === 0 ? '#FEF2F2' : '#FFFBEB', color: a.days === 0 ? '#B91C1C' : '#92400E', fontSize: 11, fontWeight: 600 }}>
                  {a.days === 0 ? "Aujourd'hui" : `Dans ${a.days} jour${a.days > 1 ? 's' : ''}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Présents aujourd'hui" value={presentCount}   total={activeCount}  color="#065F46" bg="#ECFDF5" icon={UserCheck} />
        <StatCard label="Dossiers incomplets"  value={incompletTotal}                      color="#B91C1C" bg="#FEF2F2" icon={AlertCircle} />
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3">
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
              {([['all', 'Tous'], ['complet', 'Complet'], ['à compléter', 'À compléter'], ['incomplet', 'Incomplet']] as [DossierFilter, string][]).map(([f, l]) => (
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
                const isActive = isEffectivelyActive(child);
                const sortieState = getSortieState(child);
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
                              style={{
                                background: sortieState === 'active' ? '#FFF7ED' : '#F3F4F6',
                                color: sortieState === 'active' ? '#C2410C' : '#9CA3AF',
                                fontSize: 9, fontWeight: 700,
                              }}>
                              {sortieState === 'active' ? 'EN SORTIE' : sortieState === 'pending' ? `DÉPART ${child.exitDate}` : 'SORTI'}
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
                          style={{ background: getEffectiveAttendance(child) === 'present' ? '#ECFDF5' : '#FEF2F2', color: getEffectiveAttendance(child) === 'present' ? '#065F46' : '#B91C1C', fontSize: 11, fontWeight: 600 }}>
                          {getEffectiveAttendance(child) === 'present' ? 'Présent' : 'Absent'}
                        </span>
                      ) : <span style={{ color: '#9CA3AF', fontSize: 12 }}>—</span>}
                    </td>
                    <td className="px-5 py-4">
                      {(() => {
                        const ds = getDossierStatus(child.id);
                        const bg    = ds === 'complet' ? '#ECFDF5' : ds === 'à compléter' ? '#FFFBEB' : '#FEF2F2';
                        const color = ds === 'complet' ? '#065F46' : ds === 'à compléter' ? '#92400E' : '#B91C1C';
                        const label = ds === 'complet' ? 'Complet' : ds === 'à compléter' ? 'À compléter' : 'Incomplet';
                        return (
                          <span className="px-2 py-0.5 rounded-full" style={{ background: bg, color, fontSize: 11, fontWeight: 600 }}>
                            {label}
                          </span>
                        );
                      })()}
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
          onUpdate={crm => {
            updateCrm(modal.child!.id, crm);
            const latest = [...crm.sortiesHist].sort((a, b) => b.dateDepart.localeCompare(a.dateDepart))[0];
            if (latest && latest.type === 'temporaire') {
              setChildren(prev => prev.map(c =>
                c.id === modal.child!.id
                  ? { ...c, exitDate: latest.dateDepart || undefined, exitReturnDate: latest.dateRetour || undefined }
                  : c
              ));
            }
          }}
          onDossierChange={status => {
            const id = modal.child!.id;
            setChildren(prev => prev.map(c =>
              c.id === id ? { ...c, dossierStatus: status } : c
            ));
          }}
          onChildUpdate={updates => {
            const id = modal.child!.id;
            setChildren(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
            setModal(prev => prev.child ? { ...prev, child: { ...prev.child, ...updates } } : prev);
          }}
          onReactivate={() => {
            const id = modal.child!.id;
            updateCrm(id, { ...crmData[id], isActive: true });
            setChildren(prev => prev.map(c =>
              c.id === id ? { ...c, exitStatus: 'actif' as const, exitType: undefined, exitDate: undefined } : c
            ));
          }}
        />
      )}

      {/* Add Modal */}
      {modal.mode === 'add' && (
        <AddModal
          onCreated={newChild => {
            setChildren(prev => [newChild, ...prev]);
            setCrmData(prev => ({ ...prev, [newChild.id]: makeDefaultCRM(newChild) }));
            setModal({ mode: null });
          }}
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
