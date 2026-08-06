import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { X, Loader2, AlertTriangle, ImagePlus, Trash2 } from 'lucide-react';
import { contactsApi, ContactDuplicateError } from '../../services/contacts.api';
import { formatSenegalPhone, categoryBadgeStyle } from './contacts.utils';
import type {
  ApiContact,
  ApiContactCategory,
  ApiContactSummary,
  ContactFormInput,
} from '../../types/contacts.types';

// ─── Styling ─────────────────────────────────────────────────────────────────

const INPUT: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid #E5E7EB', background: '#FFFFFF',
  color: '#1A1A1A', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

const LABEL: React.CSSProperties = {
  color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5,
};

const ERROR_TEXT: React.CSSProperties = { color: '#B91C1C', fontSize: 11, marginTop: 4 };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // mirrors the backend Multer limit

type FieldKey =
  | 'fullName' | 'organization' | 'functionTitle' | 'categoryId'
  | 'phone' | 'email' | 'address' | 'city' | 'notes';

interface FormState {
  fullName: string;
  organization: string;
  functionTitle: string;
  categoryId: string;
  phone: string;
  whatsappEnabled: boolean;
  email: string;
  address: string;
  city: string;
  notes: string;
}

function emptyForm(initialFullName = '', fixedCategoryId = ''): FormState {
  return {
    fullName: initialFullName,
    organization: '',
    functionTitle: '',
    categoryId: fixedCategoryId,
    phone: '',
    whatsappEnabled: false,
    email: '',
    address: '',
    city: '',
    notes: '',
  };
}

function formFromContact(contact: ApiContact): FormState {
  return {
    fullName: contact.fullName,
    organization: contact.organization ?? '',
    functionTitle: contact.functionTitle ?? '',
    categoryId: contact.categoryId,
    phone: contact.phone ?? '',
    whatsappEnabled: contact.whatsappEnabled,
    email: contact.email ?? '',
    address: contact.address ?? '',
    city: contact.city ?? '',
    notes: contact.notes ?? '',
  };
}

function toPayload(form: FormState): ContactFormInput {
  const clean = (v: string) => (v.trim() ? v.trim() : undefined);
  return {
    fullName: form.fullName.trim(),
    organization: clean(form.organization),
    functionTitle: clean(form.functionTitle),
    categoryId: form.categoryId,
    phone: clean(form.phone),
    whatsappEnabled: form.whatsappEnabled,
    email: clean(form.email),
    address: clean(form.address),
    city: clean(form.city),
    notes: clean(form.notes),
  };
}

function validate(form: FormState): Partial<Record<FieldKey, string>> {
  const errors: Partial<Record<FieldKey, string>> = {};
  if (!form.fullName.trim()) errors.fullName = 'Le nom du contact est requis.';
  if (!form.categoryId) errors.categoryId = 'La catégorie est requise.';
  if (form.email.trim() && !EMAIL_RE.test(form.email.trim())) {
    errors.email = 'Adresse e-mail invalide.';
  }
  return errors;
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface ContactFormModalProps {
  mode: 'create' | 'edit';
  /** Required for mode="edit". */
  initialContact?: ApiContact;
  /** Create-mode prefill, e.g. from the autocomplete's current search text. */
  initialFullName?: string;
  /** Pre-selects (and locks) the category when the caller is scoped to one category. */
  fixedCategoryId?: string;
  onClose: () => void;
  /**
   * Called once the contact is durably saved — on a normal create/edit, on
   * "Utiliser ce contact", and on "Créer quand même". Always followed by the
   * modal unmounting (the caller owns closing via `onClose`, but this
   * component also calls `onClose` itself right after `onSaved` in every one
   * of those paths so callers don't have to remember to).
   */
  onSaved: (contact: ApiContact) => void;
}

export function ContactFormModal({
  mode,
  initialContact,
  initialFullName = '',
  fixedCategoryId,
  onClose,
  onSaved,
}: ContactFormModalProps) {
  const isEdit = mode === 'edit';
  const [form, setForm] = useState<FormState>(() =>
    isEdit && initialContact
      ? formFromContact(initialContact)
      : emptyForm(initialFullName, fixedCategoryId ?? ''),
  );
  const initialSnapshot = useRef(JSON.stringify(form));

  const [categories, setCategories] = useState<ApiContactCategory[]>([]);
  useEffect(() => {
    contactsApi
      .listCategories()
      .then(setCategories)
      .catch(() => toast.error('Erreur lors du chargement des catégories.'));
  }, []);

  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [duplicateWarning, setDuplicateWarning] = useState<ApiContactSummary | null>(null);
  const [resolvingDuplicate, setResolvingDuplicate] = useState<'use' | 'force' | null>(null);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [pendingSavedContact, setPendingSavedContact] = useState<ApiContact | null>(null);
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);
  const [retryingPhoto, setRetryingPhoto] = useState(false);

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    };
  }, [photoPreviewUrl]);

  function set<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function handlePhotoPick(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Le fichier doit être une image.');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error('La photo dépasse la taille maximale de 10 Mo.');
      return;
    }
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoFile(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
  }

  function clearPhoto() {
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoFile(null);
    setPhotoPreviewUrl(null);
  }

  const isDirty =
    !pendingSavedContact &&
    (JSON.stringify(form) !== initialSnapshot.current || photoFile !== null);

  function requestClose() {
    if (pendingSavedContact) {
      // The contact itself is already saved server-side; closing now is
      // equivalent to "continue without the photo", never a discarded save.
      onSaved(pendingSavedContact);
      onClose();
      return;
    }
    if (isDirty && !window.confirm('Fermer sans enregistrer les modifications ?')) return;
    onClose();
  }

  // Uploads the pending photo (if any) against an already-saved contact, then
  // hands off to the caller. On failure the contact stays saved and the
  // modal switches into a small non-blocking retry panel instead of closing.
  async function finalizeWithPhoto(contact: ApiContact) {
    if (!photoFile) {
      onSaved(contact);
      onClose();
      return;
    }
    try {
      const withPhoto = await contactsApi.uploadPhoto(contact.id, photoFile);
      onSaved(withPhoto);
      onClose();
    } catch (e) {
      setPendingSavedContact(contact);
      setPhotoUploadError(
        e instanceof Error ? e.message : "Erreur lors de l'envoi de la photo.",
      );
    }
  }

  async function handleRetryPhoto() {
    if (!pendingSavedContact || !photoFile) return;
    setRetryingPhoto(true);
    try {
      const withPhoto = await contactsApi.uploadPhoto(pendingSavedContact.id, photoFile);
      onSaved(withPhoto);
      onClose();
    } catch (e) {
      setPhotoUploadError(
        e instanceof Error ? e.message : "Erreur lors de l'envoi de la photo.",
      );
    } finally {
      setRetryingPhoto(false);
    }
  }

  async function handleSubmit() {
    const validation = validate(form);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSaving(true);
    setApiError(null);
    try {
      const contact =
        isEdit && initialContact
          ? await contactsApi.update(initialContact.id, toPayload(form))
          : await contactsApi.create(toPayload(form));
      await finalizeWithPhoto(contact);
    } catch (e) {
      if (e instanceof ContactDuplicateError) {
        setDuplicateWarning(e.possibleDuplicate);
      } else {
        setApiError(e instanceof Error ? e.message : 'Erreur lors de la sauvegarde du contact.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleUseDuplicate() {
    if (!duplicateWarning) return;
    setResolvingDuplicate('use');
    try {
      const full = await contactsApi.get(duplicateWarning.id);
      onSaved(full);
      onClose();
    } catch (e) {
      setApiError(
        e instanceof Error ? e.message : 'Erreur lors de la récupération du contact existant.',
      );
    } finally {
      setResolvingDuplicate(null);
    }
  }

  async function handleForceCreate() {
    setResolvingDuplicate('force');
    setApiError(null);
    try {
      const contact = await contactsApi.create(toPayload(form), { force: true });
      setDuplicateWarning(null);
      await finalizeWithPhoto(contact);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : 'Erreur lors de la création du contact.');
    } finally {
      setResolvingDuplicate(null);
    }
  }

  const title = isEdit ? 'Modifier le contact' : 'Nouveau contact';

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      data-testid="contact-form-modal"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => { if (e.target === e.currentTarget) requestClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden shadow-xl flex flex-col"
        style={{ background: '#FFFFFF', maxHeight: '92vh' }}
      >
        <div
          className="flex items-center justify-between px-6 py-5 flex-shrink-0"
          style={{ borderBottom: '1px solid #F3F4F6' }}
        >
          <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>
            {duplicateWarning ? 'Contact similaire trouvé' : pendingSavedContact ? 'Photo du contact' : title}
          </h3>
          <button onClick={requestClose} aria-label="Fermer">
            <X size={18} style={{ color: '#9CA3AF' }} />
          </button>
        </div>

        {duplicateWarning ? (
          <DuplicatePanel
            duplicate={duplicateWarning}
            resolving={resolvingDuplicate}
            onUse={handleUseDuplicate}
            onForceCreate={handleForceCreate}
            onCancel={() => setDuplicateWarning(null)}
          />
        ) : pendingSavedContact ? (
          <PhotoRetryPanel
            error={photoUploadError}
            retrying={retryingPhoto}
            onRetry={handleRetryPhoto}
            onSkip={() => { onSaved(pendingSavedContact); onClose(); }}
          />
        ) : (
          <>
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
              <div>
                <label style={LABEL} htmlFor="contact-form-fullName">Nom du contact *</label>
                <input
                  id="contact-form-fullName"
                  autoFocus
                  value={form.fullName}
                  onChange={(e) => set('fullName', e.target.value)}
                  placeholder="Ex : Ousmane Diop"
                  style={{ ...INPUT, border: `1px solid ${errors.fullName ? '#B91C1C' : '#E5E7EB'}` }}
                />
                {errors.fullName && <p style={ERROR_TEXT}>{errors.fullName}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={LABEL} htmlFor="contact-form-organization">Entreprise / Structure</label>
                  <input id="contact-form-organization" value={form.organization} onChange={(e) => set('organization', e.target.value)} style={INPUT} />
                </div>
                <div>
                  <label style={LABEL} htmlFor="contact-form-functionTitle">Fonction</label>
                  <input id="contact-form-functionTitle" value={form.functionTitle} onChange={(e) => set('functionTitle', e.target.value)} style={INPUT} />
                </div>
              </div>

              <div>
                <label style={LABEL} htmlFor="contact-form-categoryId">Catégorie *</label>
                <select
                  id="contact-form-categoryId"
                  value={form.categoryId}
                  disabled={!!fixedCategoryId}
                  onChange={(e) => set('categoryId', e.target.value)}
                  style={{ ...INPUT, cursor: fixedCategoryId ? 'not-allowed' : 'pointer', border: `1px solid ${errors.categoryId ? '#B91C1C' : '#E5E7EB'}` }}
                >
                  <option value="">Sélectionner…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
                {errors.categoryId && <p style={ERROR_TEXT}>{errors.categoryId}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={LABEL} htmlFor="contact-form-phone">Téléphone</label>
                  <input
                    id="contact-form-phone"
                    value={form.phone}
                    onChange={(e) => set('phone', e.target.value)}
                    onBlur={(e) => set('phone', formatSenegalPhone(e.target.value))}
                    placeholder="77 123 45 67"
                    style={INPUT}
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label htmlFor="contact-form-whatsapp" className="flex items-center gap-2" style={{ fontSize: 12, color: '#374151', cursor: 'pointer' }}>
                    <input
                      id="contact-form-whatsapp"
                      type="checkbox"
                      checked={form.whatsappEnabled}
                      onChange={(e) => set('whatsappEnabled', e.target.checked)}
                    />
                    Ce numéro utilise WhatsApp
                  </label>
                </div>
              </div>

              <div>
                <label style={LABEL} htmlFor="contact-form-email">E-mail</label>
                <input
                  id="contact-form-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  style={{ ...INPUT, border: `1px solid ${errors.email ? '#B91C1C' : '#E5E7EB'}` }}
                />
                {errors.email && <p style={ERROR_TEXT}>{errors.email}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={LABEL} htmlFor="contact-form-address">Adresse</label>
                  <input id="contact-form-address" value={form.address} onChange={(e) => set('address', e.target.value)} style={INPUT} />
                </div>
                <div>
                  <label style={LABEL} htmlFor="contact-form-city">Ville</label>
                  <input id="contact-form-city" value={form.city} onChange={(e) => set('city', e.target.value)} style={INPUT} />
                </div>
              </div>

              <div>
                <label style={LABEL} htmlFor="contact-form-notes">Notes</label>
                <textarea
                  id="contact-form-notes"
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  rows={3}
                  style={{ ...INPUT, resize: 'none' }}
                />
              </div>

              <div>
                <label style={LABEL}>Photo (optionnel)</label>
                {photoPreviewUrl ? (
                  <div className="flex items-center gap-3">
                    <img
                      src={photoPreviewUrl}
                      alt="Aperçu"
                      className="rounded-lg object-cover"
                      style={{ width: 56, height: 56, border: '1px solid #E5E7EB' }}
                    />
                    <button
                      type="button"
                      onClick={clearPhoto}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
                      style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#B91C1C', fontSize: 12, cursor: 'pointer' }}
                    >
                      <Trash2 size={12} /> Retirer
                    </button>
                  </div>
                ) : (
                  <label
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer"
                    style={{ border: '1px solid #E5E7EB', background: '#FAFAFA' }}
                  >
                    <ImagePlus size={14} style={{ color: '#9CA3AF', flexShrink: 0 }} />
                    <span style={{ flex: 1, color: '#6B7280', fontSize: 13 }}>Ajouter une photo…</span>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={(e) => { handlePhotoPick(e.target.files?.[0] ?? null); e.target.value = ''; }}
                    />
                  </label>
                )}
              </div>

              {apiError && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg" style={{ background: '#FEF2F2', color: '#B91C1C', fontSize: 12 }}>
                  <AlertTriangle size={14} /> {apiError}
                </div>
              )}
            </div>

            <div className="flex gap-2 px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid #F3F4F6' }}>
              <button
                onClick={requestClose}
                className="flex-1 py-2.5 rounded-lg"
                style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
              >
                Annuler
              </button>
              <button
                disabled={saving}
                onClick={handleSubmit}
                className="flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2"
                style={{
                  background: saving ? '#E5E7EB' : '#3E5A78',
                  color: saving ? '#9CA3AF' : '#FFFFFF',
                  fontSize: 13, fontWeight: 600, border: 'none',
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {isEdit ? 'Enregistrer' : 'Créer'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Duplicate-warning panel ────────────────────────────────────────────────

function DuplicatePanel({
  duplicate, resolving, onUse, onForceCreate, onCancel,
}: {
  duplicate: ApiContactSummary;
  resolving: 'use' | 'force' | null;
  onUse: () => void;
  onForceCreate: () => void;
  onCancel: () => void;
}) {
  const badge = categoryBadgeStyle(duplicate.category.color);
  return (
    <>
      <div className="px-6 py-5 space-y-4">
        <p style={{ color: '#6B7280', fontSize: 13 }}>
          Un contact similaire existe déjà dans le répertoire :
        </p>
        <div className="rounded-xl px-4 py-3" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span style={{ color: '#1A1A1A', fontSize: 14, fontWeight: 700 }}>{duplicate.fullName}</span>
            <span className="px-1.5 py-0.5 rounded-full" style={{ background: badge.bg, color: badge.color, fontSize: 10, fontWeight: 700 }}>
              {duplicate.category.label.toUpperCase()}
            </span>
          </div>
          {duplicate.organization && (
            <p style={{ color: '#374151', fontSize: 12 }}>{duplicate.organization}</p>
          )}
          {duplicate.phone && <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>Tél : {duplicate.phone}</p>}
          {duplicate.email && <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>{duplicate.email}</p>}
        </div>
      </div>
      <div className="flex flex-col gap-2 px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid #F3F4F6' }}>
        <button
          disabled={resolving !== null}
          onClick={onUse}
          className="w-full py-2.5 rounded-lg flex items-center justify-center gap-2"
          style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}
        >
          {resolving === 'use' && <Loader2 size={14} className="animate-spin" />}
          Utiliser ce contact
        </button>
        <button
          disabled={resolving !== null}
          onClick={onForceCreate}
          className="w-full py-2.5 rounded-lg flex items-center justify-center gap-2"
          style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
        >
          {resolving === 'force' && <Loader2 size={14} className="animate-spin" />}
          Créer quand même
        </button>
        <button
          disabled={resolving !== null}
          onClick={onCancel}
          className="w-full py-2 rounded-lg"
          style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: 12, cursor: 'pointer' }}
        >
          Retour au formulaire
        </button>
      </div>
    </>
  );
}

// ─── Post-save photo-retry panel ────────────────────────────────────────────

function PhotoRetryPanel({
  error, retrying, onRetry, onSkip,
}: {
  error: string | null;
  retrying: boolean;
  onRetry: () => void;
  onSkip: () => void;
}) {
  return (
    <>
      <div className="px-6 py-5 space-y-3">
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg" style={{ background: '#FFFBEB', color: '#D97706', fontSize: 12 }}>
          <AlertTriangle size={14} />
          Le contact a été enregistré, mais l'envoi de la photo a échoué{error ? ` (${error})` : ''}.
        </div>
      </div>
      <div className="flex gap-2 px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid #F3F4F6' }}>
        <button
          onClick={onSkip}
          className="flex-1 py-2.5 rounded-lg"
          style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
        >
          Continuer sans la photo
        </button>
        <button
          disabled={retrying}
          onClick={onRetry}
          className="flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2"
          style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}
        >
          {retrying && <Loader2 size={14} className="animate-spin" />}
          Réessayer
        </button>
      </div>
    </>
  );
}
