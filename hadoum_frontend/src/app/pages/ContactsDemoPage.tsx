import { useState } from 'react';
import { ContactAutocomplete } from '../components/contacts/ContactAutocomplete';
import { ContactFormModal } from '../components/contacts/ContactFormModal';
import { contactsApi } from '../services/contacts.api';
import { useAuth } from '../context/AuthContext';
import type { ApiContact, ApiContactLike } from '../types/contacts.types';

// Development-only harness for PR 2 (ContactAutocomplete / ContactFormModal).
// Reached only via a direct URL (/app/contacts-demo) — deliberately not added
// to Sidebar.tsx, matching the existing /app/design-system precedent, which
// is likewise reachable but not linked from the main navigation. No consuming
// business page imports these components yet; this route exists solely to
// exercise them in isolation until a later PR wires them into a real form.

function SelectionPreview({ contact }: { contact: ApiContactLike | null }) {
  if (!contact) {
    return <p style={{ color: '#9CA3AF', fontSize: 12 }}>Aucune sélection.</p>;
  }
  return (
    <pre
      data-testid="selection-json"
      style={{
        background: '#F9F7F3', border: '1px solid #E5E7EB', borderRadius: 8,
        padding: 12, fontSize: 11, overflowX: 'auto', color: '#374151',
      }}
    >
      {JSON.stringify(contact, null, 2)}
    </pre>
  );
}

export function ContactsDemoPage() {
  const { user } = useAuth();
  // The Contact API only allows DIRECTOR/SUPERVISOR (see PR 1's @Roles
  // decorators) — gating the harness page the same way means an
  // EDUCATOR/BOARD session can't exercise it at all, not just get 403s from
  // components inside it.
  const allowed = user?.role === 'director' || user?.role === 'supervisor';

  const [basicId, setBasicId] = useState<string | null>(null);
  const [basicContact, setBasicContact] = useState<ApiContactLike | null>(null);
  const [editTarget, setEditTarget] = useState<ApiContact | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  async function openEdit() {
    if (!basicId) return;
    setEditError(null);
    try {
      // ContactFormModal's edit mode needs the full ApiContact shape;
      // search selections may only carry the compact summary, so this
      // re-fetches to guarantee a complete record regardless of how the
      // current selection was made.
      setEditTarget(await contactsApi.get(basicId));
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Erreur lors du chargement du contact.');
    }
  }

  const [scopedId, setScopedId] = useState<string | null>(null);
  const [scopedContact, setScopedContact] = useState<ApiContactLike | null>(null);

  const [preloadInput, setPreloadInput] = useState('');
  const [preloadedId, setPreloadedId] = useState<string | null>(null);
  const [preloadedContact, setPreloadedContact] = useState<ApiContactLike | null>(null);
  const [preloadError, setPreloadError] = useState<string | null>(null);

  async function handlePreload() {
    setPreloadError(null);
    try {
      const contact = await contactsApi.get(preloadInput.trim());
      setPreloadedId(contact.id);
      setPreloadedContact(contact);
    } catch (e) {
      setPreloadError(e instanceof Error ? e.message : 'Contact introuvable.');
    }
  }

  if (!allowed) {
    return (
      <div className="px-4 md:px-6 py-6" data-testid="contacts-demo-forbidden">
        <p style={{ color: '#B91C1C', fontSize: 14, fontWeight: 600 }}>Accès refusé</p>
        <p style={{ color: '#6B7280', fontSize: 13, marginTop: 4 }}>
          Cette page de démonstration est réservée à la direction et à la supervision.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-6 py-6 space-y-8" style={{ maxWidth: 720 }}>
      <div>
        <h2 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>
          Démonstration — Répertoire des contacts (PR 2)
        </h2>
        <p style={{ color: '#6B7280', fontSize: 13, marginTop: 4 }}>
          Route de développement, volontairement absente de la navigation. Sert à vérifier
          ContactAutocomplete et ContactFormModal avant leur intégration dans les modules métier.
        </p>
      </div>

      <section className="space-y-3" data-testid="demo-basic">
        <h3 style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600 }}>
          1. Recherche, filtrage par catégorie, création, doublons
        </h3>
        <ContactAutocomplete
          label="Contact"
          value={basicId}
          selectedContact={basicContact}
          onChange={(c) => { setBasicContact(c); setBasicId(c?.id ?? null); }}
          allowCreate
          required
          helperText="Recherche sur nom, structure, fonction, téléphone, notes."
        />
        {basicId && (
          <button
            onClick={openEdit}
            style={{ padding: '6px 12px', borderRadius: 8, background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
          >
            Modifier ce contact
          </button>
        )}
        {editError && <p style={{ color: '#B91C1C', fontSize: 12 }}>{editError}</p>}
        <SelectionPreview contact={basicContact} />
        {editTarget && (
          <ContactFormModal
            mode="edit"
            initialContact={editTarget}
            onClose={() => setEditTarget(null)}
            onSaved={(contact) => { setBasicContact(contact); setBasicId(contact.id); setEditTarget(null); }}
          />
        )}
      </section>

      <section className="space-y-3" data-testid="demo-scoped">
        <h3 style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600 }}>
          2. Filtrage restreint par catégorie
        </h3>
        <p style={{ color: '#9CA3AF', fontSize: 12 }}>
          Limité aux catégories Fournisseur et Prestataire (categoryKeys).
        </p>
        <ContactAutocomplete
          label="Fournisseur ou prestataire"
          value={scopedId}
          selectedContact={scopedContact}
          onChange={(c) => { setScopedContact(c); setScopedId(c?.id ?? null); }}
          allowCreate
          categoryKeys={['FOURNISSEUR', 'PRESTATAIRE']}
        />
        <SelectionPreview contact={scopedContact} />
      </section>

      <section className="space-y-3" data-testid="demo-inactive">
        <h3 style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600 }}>
          3. Contact inactif référencé
        </h3>
        <p style={{ color: '#9CA3AF', fontSize: 12 }}>
          Charge un contact existant par identifiant (actif ou non) pour vérifier l'affichage du
          badge « Contact inactif » — ce module ne propose pas de désactivation lui-même.
        </p>
        <div className="flex gap-2">
          <input
            data-testid="preload-contact-id"
            value={preloadInput}
            onChange={(e) => setPreloadInput(e.target.value)}
            placeholder="ID de contact"
            style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13 }}
          />
          <button
            data-testid="preload-contact-submit"
            onClick={handlePreload}
            style={{ padding: '8px 14px', borderRadius: 8, background: '#3E5A78', color: '#FFFFFF', border: 'none', fontSize: 13, cursor: 'pointer' }}
          >
            Charger
          </button>
        </div>
        {preloadError && <p style={{ color: '#B91C1C', fontSize: 12 }}>{preloadError}</p>}
        <ContactAutocomplete
          label="Contact préchargé"
          value={preloadedId}
          selectedContact={preloadedContact}
          onChange={(c) => { setPreloadedContact(c); setPreloadedId(c?.id ?? null); }}
          includeInactiveSelected
        />
        <SelectionPreview contact={preloadedContact} />
      </section>
    </div>
  );
}
