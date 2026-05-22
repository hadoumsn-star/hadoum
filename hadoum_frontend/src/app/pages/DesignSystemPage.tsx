import { useState } from 'react';
import {
  Check, X, AlertCircle, AlertTriangle, Info, CheckCircle2,
  Loader2, Eye, EyeOff, Plus, Download,
  LayoutDashboard, Users, CalendarCheck, UserCheck,
  Send, Paperclip, Upload, ArrowUp, ArrowDown,
  DollarSign, TrendingUp, ShieldCheck, MessageSquare,
} from 'lucide-react';

// ─── Layout helpers ───────────────────────────────────────────────────────────

function Section({ id, title, description, children }: {
  id: string; title: string; description?: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="space-y-5">
      <div style={{ borderBottom: '2px solid #E5E7EB', paddingBottom: 12 }}>
        <h2 style={{ color: '#1A1A1A', fontSize: 20, fontWeight: 700 }}>{title}</h2>
        {description && <p style={{ color: '#6B7280', fontSize: 13, marginTop: 4 }}>{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', overflow: 'hidden' }}>
      {title && (
        <div className="px-5 py-3.5" style={{ borderBottom: '1px solid #F3F4F6', background: '#F9F7F3' }}>
          <p style={{ color: '#374151', fontSize: 12, fontWeight: 600, letterSpacing: '0.04em' }}>{title.toUpperCase()}</p>
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span style={{ color: '#9CA3AF', fontSize: 11 }}>{label}</span>
      <code style={{ color: '#3E5A78', fontSize: 11, background: '#EEF2F7', padding: '1px 5px', borderRadius: 4 }}>{value}</code>
    </div>
  );
}

// ─── 1. Colors ────────────────────────────────────────────────────────────────

const PALETTE = [
  { name: 'Brand primary / CTA',    hex: '#3E5A78', dark: true  },
  { name: 'Background',             hex: '#F9F7F3', dark: false },
  { name: 'Surface',                hex: '#FFFFFF', dark: false, border: true },
  { name: 'Text primary',           hex: '#1A1A1A', dark: true  },
  { name: 'Text secondary',         hex: '#374151', dark: true  },
  { name: 'Text muted',             hex: '#6B7280', dark: true  },
  { name: 'Text placeholder',       hex: '#9CA3AF', dark: false },
  { name: 'Border default',         hex: '#E5E7EB', dark: false },
  { name: 'Border light',           hex: '#F3F4F6', dark: false },
  { name: 'Alert / Error',          hex: '#B91C1C', dark: true  },
  { name: 'Warning',                hex: '#D97706', dark: true  },
  { name: 'Success',                hex: '#065F46', dark: true  },
  { name: 'Accent purple',          hex: '#7C3AED', dark: true  },
  { name: 'Brand hover (sidebar)',   hex: '#EEF2F7', dark: false },
];

// ─── 2. Typography ────────────────────────────────────────────────────────────

const TYPE_SCALE = [
  { label: 'Page title',      size: '22px', weight: '700', use: 'h2 / page heading',    sample: 'Gestion des enfants' },
  { label: 'Section title',   size: '17px', weight: '700', use: 'modal h3, card title', sample: 'Ajouter un enfant' },
  { label: 'Card heading',    size: '15px', weight: '600', use: 'h3 / section label',   sample: 'Tâches à faire' },
  { label: 'Body standard',   size: '14px', weight: '400', use: 'Descriptions, labels', sample: 'Vue d\'ensemble du tableau de bord' },
  { label: 'Body small',      size: '13px', weight: '400', use: 'Table rows, form text',sample: 'Amine Belarbi — Primaire 3 · 11 ans' },
  { label: 'Caption',         size: '12px', weight: '400', use: 'Dates, meta, subtext', sample: 'Admis le 1 sept. 2020 · Il y a 30 min' },
  { label: 'Label / Badge',   size: '11px', weight: '600', use: 'Badges, pill labels',  sample: 'EN COURS · URGENT · PRÉSENT' },
  { label: 'Overline',        size: '11px', weight: '600', use: 'Section separators',   sample: 'NAVIGATION · RÉCAPITULATIF', mono: true },
];

// ─── 3. Buttons ───────────────────────────────────────────────────────────────

function DemoButton({
  label, bg, color, border, disabled, loading, icon: Icon,
}: {
  label: string; bg: string; color: string;
  border?: string; disabled?: boolean; loading?: boolean; icon?: React.ElementType;
}) {
  return (
    <button
      disabled={disabled || loading}
      className="flex items-center gap-2 px-4 py-2 rounded-lg transition-opacity"
      style={{
        background: bg, color, fontSize: 13, fontWeight: 500,
        border: border ?? 'none', cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      {!loading && Icon && <Icon size={14} />}
      {label}
    </button>
  );
}

// ─── 4. Badges ────────────────────────────────────────────────────────────────

const BADGES = [
  { label: '● Présent',       bg: '#ECFDF5', color: '#065F46' },
  { label: '● Absent',        bg: '#FEF2F2', color: '#B91C1C' },
  { label: '● En congé',      bg: '#FFFBEB', color: '#D97706' },
  { label: 'Dossier complet', bg: '#ECFDF5', color: '#065F46' },
  { label: 'Incomplet',       bg: '#FFFBEB', color: '#D97706' },
  { label: 'URGENT',          bg: '#FEF2F2', color: '#B91C1C' },
  { label: 'NORMAL',          bg: '#EEF2F7', color: '#3E5A78' },
  { label: 'EN COURS',        bg: '#EEF2F7', color: '#3E5A78' },
  { label: 'TERMINÉ',         bg: '#F3F4F6', color: '#9CA3AF' },
  { label: 'À VENIR',         bg: '#FFFBEB', color: '#D97706' },
  { label: 'DISPONIBLE',      bg: '#ECFDF5', color: '#065F46' },
  { label: 'EN RETARD',       bg: '#FEF2F2', color: '#B91C1C' },
  { label: 'PLANIFIÉ',        bg: '#FFFBEB', color: '#D97706' },
  { label: 'MENSUEL',         bg: '#F3F4F6', color: '#374151' },
  { label: 'TRIMESTRIEL',     bg: '#F5F3FF', color: '#7C3AED' },
  { label: 'NOUVEAU',         bg: '#EEF2F7', color: '#3E5A78' },
  { label: 'PRÉSÉLECTIONNÉ',  bg: '#F5F3FF', color: '#7C3AED' },
  { label: 'ENTRETIEN FAIT',  bg: '#FFFBEB', color: '#D97706' },
  { label: 'LECTURE SEULE',   bg: '#F3F4F6', color: '#9CA3AF' },
  { label: 'ACTIF',           bg: '#ECFDF5', color: '#065F46' },
  { label: 'SORTI',           bg: '#FEF2F2', color: '#B91C1C' },
];

// ─── 5. Alerts ────────────────────────────────────────────────────────────────

const ALERTS = [
  {
    level: 'error',
    icon: AlertCircle,
    bg: '#FEF2F2',   border: '#FECACA',   color: '#B91C1C',
    title: 'Dossiers médicaux incomplets',
    desc:  '3 enfants ont des dossiers médicaux nécessitant une mise à jour urgente.',
    action: 'Voir les dossiers',
  },
  {
    level: 'warning',
    icon: AlertTriangle,
    bg: '#FFFBEB',   border: '#FDE68A',   color: '#D97706',
    title: 'Rapport mensuel à soumettre',
    desc:  'Le rapport de Mai 2026 est attendu. Échéance dans 2 jours.',
    action: 'Générer le rapport',
  },
  {
    level: 'success',
    icon: CheckCircle2,
    bg: '#ECFDF5',   border: '#A7F3D0',   color: '#065F46',
    title: 'Présences du mois validées',
    desc:  'Toutes les présences d\'avril ont été confirmées par l\'équipe éducative.',
    action: 'Voir le récapitulatif',
  },
  {
    level: 'info',
    icon: Info,
    bg: '#EEF2F7',   border: '#BFCFDF',   color: '#3E5A78',
    title: 'Mise à jour disponible',
    desc:  'Une nouvelle version de la plateforme est disponible.',
    action: 'En savoir plus',
  },
];

// ─── 6. Form elements ─────────────────────────────────────────────────────────

const INPUT_BASE: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

function InputDemo({ label, state }: { label: string; state: 'default' | 'focus' | 'error' | 'disabled' }) {
  const border = state === 'focus' ? '2px solid #3E5A78'
    : state === 'error' ? '1px solid #B91C1C' : '1px solid #E5E7EB';
  return (
    <div className="space-y-1.5">
      <label style={{ color: '#374151', fontSize: 12, fontWeight: 500 }}>{label}</label>
      <input
        disabled={state === 'disabled'}
        defaultValue={state !== 'default' ? 'Amine Belarbi' : ''}
        placeholder={state === 'default' ? 'Prénom de l\'enfant…' : ''}
        style={{
          ...INPUT_BASE,
          border,
          background: state === 'disabled' ? '#F3F4F6' : '#FFFFFF',
          color: state === 'disabled' ? '#9CA3AF' : '#1A1A1A',
          boxShadow: state === 'focus' ? '0 0 0 3px rgba(62,90,120,0.1)' : 'none',
        }}
      />
      {state === 'error' && (
        <p style={{ color: '#B91C1C', fontSize: 11 }}>Ce champ est obligatoire.</p>
      )}
      <Spec label="état" value={state} />
    </div>
  );
}

// ─── 7. KPI / Stat Cards ──────────────────────────────────────────────────────

// ─── 8. Avatars ───────────────────────────────────────────────────────────────

const AV_COLORS = [
  { bg: '#EEF2F7', color: '#3E5A78', label: 'Brand' },
  { bg: '#ECFDF5', color: '#065F46', label: 'Success' },
  { bg: '#F5F3FF', color: '#7C3AED', label: 'Purple' },
  { bg: '#FFFBEB', color: '#92400E', label: 'Amber' },
  { bg: '#FFF7ED', color: '#C2410C', label: 'Orange' },
];

const AV_SIZES = [
  { size: 24, label: 'XS', font: 9  },
  { size: 32, label: 'SM', font: 11 },
  { size: 40, label: 'MD', font: 13 },
  { size: 52, label: 'LG', font: 16 },
  { size: 64, label: 'XL', font: 20 },
];

// ─── 9. Navigation items ──────────────────────────────────────────────────────

function NavItemDemo({ label, state, icon: Icon }: {
  label: string; state: 'default' | 'hover' | 'active'; icon: React.ElementType;
}) {
  return (
    <div>
      <div
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
        style={{
          background: state === 'active' ? '#EEF2F7' : state === 'hover' ? '#F9F7F3' : 'transparent',
          color: state === 'active' ? '#3E5A78' : '#374151',
        }}
      >
        <Icon size={17} style={{ color: state === 'active' ? '#3E5A78' : '#6B7280' }} />
        <span style={{ fontSize: 14, fontWeight: state === 'active' ? 600 : 400 }}>{label}</span>
        {state === 'active' && (
          <div className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#3E5A78' }} />
        )}
      </div>
      <p style={{ color: '#9CA3AF', fontSize: 10, fontWeight: 500, marginTop: 4, paddingLeft: 12 }}>
        état : <strong>{state}</strong>
      </p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function DesignSystemPage() {
  const [pwVisible, setPwVisible] = useState(false);
  const [checked, setChecked]     = useState(true);
  const [radio, setRadio]         = useState('complet');

  // Anchor links
  const sections = [
    { id: 'colors',     label: 'Couleurs' },
    { id: 'typo',       label: 'Typographie' },
    { id: 'buttons',    label: 'Boutons' },
    { id: 'badges',     label: 'Badges' },
    { id: 'alerts',     label: 'Alertes' },
    { id: 'forms',      label: 'Formulaires' },
    { id: 'cards',      label: 'Cartes' },
    { id: 'avatars',    label: 'Avatars' },
    { id: 'nav',        label: 'Navigation' },
    { id: 'tables',     label: 'Tableaux' },
    { id: 'modals',     label: 'Modales' },
    { id: 'messaging',  label: 'Messagerie' },
    { id: 'documents',  label: 'Documents' },
    { id: 'progress',   label: 'Progression' },
  ];

  return (
    <div className="min-h-screen" style={{ background: '#F9F7F3' }}>
      {/* ── Page header ── */}
      <div style={{ background: '#3E5A78', padding: '32px 40px 28px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', marginBottom: 6 }}>
            HADOUM · DESIGN SYSTEM v1.0
          </p>
          <h1 style={{ color: '#FFFFFF', fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
            Référentiel de composants
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, maxWidth: 480 }}>
            Tokens, composants et états utilisés dans l'interface Hadoum.
            Ce fichier est la source de vérité pour les développeurs.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px 80px' }}>
        {/* Quick nav */}
        <div className="flex items-center gap-2 flex-wrap mb-10 pb-6" style={{ borderBottom: '1px solid #E5E7EB' }}>
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="px-3 py-1.5 rounded-lg"
              style={{
                background: '#FFFFFF', border: '1px solid #E5E7EB',
                color: '#374151', fontSize: 12, fontWeight: 500, textDecoration: 'none',
              }}
            >
              {s.label}
            </a>
          ))}
        </div>

        <div className="space-y-16">

          {/* ── 1. Couleurs ── */}
          <Section id="colors" title="Couleurs" description="Palette de marque complète. Ne pas utiliser de couleurs hors palette.">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {PALETTE.map((c) => (
                <div key={c.hex} className="rounded-xl overflow-hidden" style={{ border: '1px solid #E5E7EB' }}>
                  <div
                    style={{ height: 56, background: c.hex, border: c.border ? '1px solid #E5E7EB' : 'none' }}
                    className="relative"
                  />
                  <div className="px-3 py-2.5" style={{ background: '#FFFFFF' }}>
                    <p style={{ color: '#1A1A1A', fontSize: 12, fontWeight: 600 }}>{c.name}</p>
                    <code style={{ color: '#6B7280', fontSize: 11 }}>{c.hex}</code>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* ── 2. Typographie ── */}
          <Section id="typo" title="Typographie" description="Échelle typographique — system-ui + Inter.">
            <Card>
              <div className="space-y-4">
                {TYPE_SCALE.map((t) => (
                  <div key={t.label} className="flex items-baseline gap-4 flex-wrap py-3" style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <div style={{ minWidth: 120 }}>
                      <p style={{ color: '#9CA3AF', fontSize: 10, fontWeight: 600, letterSpacing: '0.05em' }}>{t.label.toUpperCase()}</p>
                      <div className="flex gap-2 mt-1">
                        <Spec label="" value={t.size} />
                        <Spec label="w" value={t.weight} />
                      </div>
                    </div>
                    <p
                      style={{
                        color: '#1A1A1A', fontSize: t.size, fontWeight: parseInt(t.weight),
                        flex: 1, fontFamily: t.mono ? 'monospace' : undefined,
                      }}
                    >
                      {t.sample}
                    </p>
                    <p style={{ color: '#9CA3AF', fontSize: 11 }}>{t.use}</p>
                  </div>
                ))}
              </div>
            </Card>
          </Section>

          {/* ── 3. Boutons ── */}
          <Section id="buttons" title="Boutons" description="4 variantes × 3 états. Taille unique standard (h = 36px).">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card title="Primaire">
                <div className="space-y-3">
                  <DemoButton label="Ajouter un enfant" bg="#3E5A78" color="#FFFFFF" icon={Plus} />
                  <DemoButton label="Chargement…"       bg="#3E5A78" color="#FFFFFF" loading />
                  <DemoButton label="Désactivé"         bg="#3E5A78" color="#FFFFFF" disabled />
                  <div className="pt-2 space-y-1">
                    <Spec label="bg"    value="#3E5A78" />
                    <Spec label="color" value="#FFFFFF" />
                    <Spec label="r"     value="8px" />
                  </div>
                </div>
              </Card>
              <Card title="Secondaire">
                <div className="space-y-3">
                  <DemoButton label="Exporter" bg="#FFFFFF" color="#374151" border="1px solid #E5E7EB" icon={Download} />
                  <DemoButton label="Chargement…" bg="#FFFFFF" color="#374151" border="1px solid #E5E7EB" loading />
                  <DemoButton label="Désactivé" bg="#FFFFFF" color="#374151" border="1px solid #E5E7EB" disabled />
                  <div className="pt-2 space-y-1">
                    <Spec label="bg"     value="#FFFFFF" />
                    <Spec label="border" value="#E5E7EB" />
                  </div>
                </div>
              </Card>
              <Card title="Danger">
                <div className="space-y-3">
                  <DemoButton label="Supprimer" bg="#B91C1C" color="#FFFFFF" />
                  <DemoButton label="Confirmer" bg="#FEF2F2" color="#B91C1C" />
                  <DemoButton label="Désactivé" bg="#B91C1C" color="#FFFFFF" disabled />
                  <div className="pt-2 space-y-1">
                    <Spec label="bg"    value="#B91C1C" />
                    <Spec label="ghost" value="#FEF2F2 / #B91C1C" />
                  </div>
                </div>
              </Card>
              <Card title="Ghost / Action pill">
                <div className="space-y-3">
                  <button className="flex items-center gap-2 px-3.5 py-2 rounded-lg"
                    style={{ background: '#EEF2F7', color: '#3E5A78', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
                    <CalendarCheck size={14} /> Saisir présences
                  </button>
                  <button className="flex items-center gap-2 px-3.5 py-2 rounded-lg"
                    style={{ background: '#ECFDF5', color: '#065F46', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
                    <Check size={14} /> Valider
                  </button>
                  <button className="flex items-center gap-2 px-3.5 py-2 rounded-lg"
                    style={{ background: '#FEF2F2', color: '#B91C1C', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
                    Signaler absence
                  </button>
                  <div className="pt-2">
                    <Spec label="pattern" value="bg = couleur·50 / color = couleur·700" />
                  </div>
                </div>
              </Card>
            </div>
          </Section>

          {/* ── 4. Badges ── */}
          <Section id="badges" title="Badges & Statuts" description="Pills de statut. Toujours en font-weight 600, fontSize 11px, borderRadius 9999px.">
            <Card>
              <div className="flex flex-wrap gap-2">
                {BADGES.map((b) => (
                  <span
                    key={b.label}
                    className="px-2.5 py-1 rounded-full"
                    style={{ background: b.bg, color: b.color, fontSize: 11, fontWeight: 600 }}
                  >
                    {b.label}
                  </span>
                ))}
              </div>
              <div className="mt-4 pt-4 grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ borderTop: '1px solid #F3F4F6' }}>
                <Spec label="font-size"   value="11px" />
                <Spec label="font-weight" value="600" />
                <Spec label="padding"     value="2px 10px" />
                <Spec label="radius"      value="9999px" />
              </div>
            </Card>
          </Section>

          {/* ── 5. Alertes ── */}
          <Section id="alerts" title="Alertes & Bandeaux" description="4 niveaux. Version compacte (1 ligne) et version complète.">
            <div className="space-y-4">
              {/* Full alerts */}
              {ALERTS.map((a) => {
                const Icon = a.icon;
                return (
                  <div key={a.level}>
                    <p style={{ color: '#9CA3AF', fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 8 }}>
                      {a.level.toUpperCase()} — VERSION COMPLÈTE
                    </p>
                    <div
                      className="flex items-start gap-4 px-5 py-4 rounded-xl"
                      style={{ background: a.bg, border: `1px solid ${a.border}` }}
                    >
                      <Icon size={17} style={{ color: a.color, flexShrink: 0, marginTop: 1 }} />
                      <div className="flex-1">
                        <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 600 }}>{a.title}</p>
                        <p style={{ color: '#374151', fontSize: 12, marginTop: 3 }}>{a.desc}</p>
                      </div>
                      <button className="flex items-center gap-1 flex-shrink-0" style={{ color: a.color, fontSize: 12, fontWeight: 600 }}>
                        {a.action} →
                      </button>
                      <button className="flex-shrink-0 p-1 rounded hover:bg-black/5">
                        <X size={13} style={{ color: '#9CA3AF' }} />
                      </button>
                    </div>
                    <p style={{ color: '#9CA3AF', fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', marginTop: 8, marginBottom: 6 }}>
                      {a.level.toUpperCase()} — VERSION COMPACTE (1 ligne)
                    </p>
                    <div
                      className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
                      style={{ background: a.bg, border: `1px solid ${a.border}` }}
                    >
                      <Icon size={14} style={{ color: a.color, flexShrink: 0 }} />
                      <p className="flex-1" style={{ color: '#1A1A1A', fontSize: 13 }}>
                        <strong>{a.title}</strong>
                        <span style={{ color: '#6B7280' }}> — {a.desc.slice(0, 45)}…</span>
                      </p>
                      <button style={{ color: a.color, fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                        {a.action}
                      </button>
                      <button className="flex-shrink-0">
                        <X size={12} style={{ color: '#9CA3AF' }} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          {/* ── 6. Formulaires ── */}
          <Section id="forms" title="Formulaires" description="Champs de saisie, sélecteurs, cases à cocher. Tous les états.">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card title="Input — 4 états">
                <div className="grid grid-cols-2 gap-4">
                  <InputDemo label="Par défaut"  state="default" />
                  <InputDemo label="Focus"       state="focus" />
                  <InputDemo label="Erreur"      state="error" />
                  <InputDemo label="Désactivé"   state="disabled" />
                </div>
              </Card>

              <Card title="Champs spéciaux">
                <div className="space-y-4">
                  {/* Password with show/hide */}
                  <div className="space-y-1.5">
                    <label style={{ color: '#374151', fontSize: 12, fontWeight: 500 }}>Mot de passe</label>
                    <div className="relative">
                      <input
                        type={pwVisible ? 'text' : 'password'}
                        defaultValue="hadoum2026"
                        style={{ ...INPUT_BASE, border: '1px solid #E5E7EB', background: '#FFFFFF', color: '#1A1A1A', paddingRight: 44 }}
                      />
                      <button
                        onClick={() => setPwVisible(!pwVisible)}
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                      >
                        {pwVisible ? <EyeOff size={14} style={{ color: '#9CA3AF' }} /> : <Eye size={14} style={{ color: '#9CA3AF' }} />}
                      </button>
                    </div>
                    <Spec label="pattern" value="input + toggle icon absolu" />
                  </div>

                  {/* Select */}
                  <div className="space-y-1.5">
                    <label style={{ color: '#374151', fontSize: 12, fontWeight: 500 }}>Classe</label>
                    <select defaultValue="Primaire 2" style={{ ...INPUT_BASE, border: '1px solid #E5E7EB', background: '#FFFFFF', color: '#1A1A1A', cursor: 'pointer' }}>
                      <option>Maternelle</option>
                      <option>Primaire 1</option>
                      <option>Primaire 2</option>
                      <option>Primaire 3</option>
                      <option>Collège</option>
                    </select>
                    <Spec label="identique à input" value="+ cursor: pointer" />
                  </div>

                  {/* Checkbox */}
                  <div className="space-y-2">
                    <label style={{ color: '#374151', fontSize: 12, fontWeight: 500 }}>Cases à cocher</label>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setChecked(!checked)}
                        className="flex items-center justify-center rounded"
                        style={{
                          width: 18, height: 18, flexShrink: 0,
                          background: checked ? '#3E5A78' : '#FFFFFF',
                          border: `2px solid ${checked ? '#3E5A78' : '#D1D5DB'}`,
                          cursor: 'pointer',
                        }}
                      >
                        {checked && <Check size={11} style={{ color: '#FFFFFF' }} />}
                      </button>
                      <span style={{ color: '#374151', fontSize: 13 }}>Dossier complet</span>
                    </div>
                    <Spec label="checked" value="bg #3E5A78 · icon Check" />
                  </div>

                  {/* Radio */}
                  <div className="space-y-2">
                    <label style={{ color: '#374151', fontSize: 12, fontWeight: 500 }}>Boutons radio</label>
                    <div className="flex gap-3">
                      {['complet', 'incomplet'].map((v) => (
                        <button
                          key={v}
                          onClick={() => setRadio(v)}
                          className="flex items-center gap-2"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        >
                          <div className="flex items-center justify-center rounded-full"
                            style={{ width: 18, height: 18, border: `2px solid ${radio === v ? '#3E5A78' : '#D1D5DB'}`, background: '#FFFFFF' }}>
                            {radio === v && <div className="rounded-full" style={{ width: 8, height: 8, background: '#3E5A78' }} />}
                          </div>
                          <span style={{ color: '#374151', fontSize: 13 }}>
                            {v.charAt(0).toUpperCase() + v.slice(1)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>

              {/* Toggle button group */}
              <Card title="Toggle group (Présence / Dossier)">
                <div className="space-y-4">
                  <div>
                    <p style={{ color: '#374151', fontSize: 12, fontWeight: 500, marginBottom: 6 }}>Présence</p>
                    <div className="flex rounded-lg overflow-hidden w-fit" style={{ border: '1px solid #E5E7EB' }}>
                      {['Présent', 'Absent'].map((opt, i) => (
                        <div
                          key={opt}
                          className="px-5 py-2"
                          style={{ background: i === 0 ? '#3E5A78' : '#FFFFFF', color: i === 0 ? '#FFFFFF' : '#374151', fontSize: 13, fontWeight: i === 0 ? 600 : 400 }}
                        >
                          {opt}
                        </div>
                      ))}
                    </div>
                    <div className="mt-2"><Spec label="selected" value="bg #3E5A78, color #FFF" /></div>
                  </div>
                  <div>
                    <p style={{ color: '#374151', fontSize: 12, fontWeight: 500, marginBottom: 6 }}>Filtre présences (tri colonnes)</p>
                    <div className="flex rounded-lg overflow-hidden w-fit" style={{ border: '1px solid #E5E7EB' }}>
                      {['Tous', 'Présents', 'Absents'].map((opt, i) => (
                        <div
                          key={opt}
                          className="px-3 py-1.5"
                          style={{ background: i === 1 ? '#3E5A78' : '#FFFFFF', color: i === 1 ? '#FFFFFF' : '#374151', fontSize: 12, fontWeight: 500 }}
                        >
                          {opt}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>

              {/* Search input */}
              <Card title="Champ de recherche">
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2">
                      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                    </svg>
                  </div>
                  <input
                    defaultValue="Amine"
                    style={{ ...INPUT_BASE, border: '1px solid #E5E7EB', background: '#FFFFFF', color: '#1A1A1A', paddingLeft: 36, paddingRight: 32 }}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-sm cursor-pointer hover:bg-gray-100">
                    <X size={12} style={{ color: '#9CA3AF' }} />
                  </div>
                </div>
                <div className="mt-3 space-y-1">
                  <Spec label="icon" value="Search — left-3, top-½, color #9CA3AF" />
                  <Spec label="clear" value="X — right-3, visuel si value !== ''" />
                </div>
              </Card>
            </div>
          </Section>

          {/* ── 7. Cartes ── */}
          <Section id="cards" title="Cartes" description="KPI card, Stat card, Info card.">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* KPI card */}
              <Card title="KPI Card">
                <div className="rounded-xl p-5" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center justify-center rounded-xl" style={{ width: 40, height: 40, background: '#EEF2F7' }}>
                      <Users size={19} style={{ color: '#3E5A78' }} />
                    </div>
                    <span className="flex items-center gap-1 px-2 py-1 rounded-full" style={{ background: '#ECFDF5', color: '#065F46', fontSize: 10, fontWeight: 600 }}>
                      +2 ce mois
                    </span>
                  </div>
                  <p style={{ color: '#1A1A1A', fontSize: 28, fontWeight: 700 }}>87</p>
                  <p style={{ color: '#1A1A1A', fontSize: 14, fontWeight: 500, marginTop: 4 }}>Enfants enregistrés</p>
                  <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>En charge à ce jour</p>
                </div>
                <div className="mt-3 space-y-1">
                  <Spec label="padding" value="20px" />
                  <Spec label="radius"  value="12px" />
                  <Spec label="border"  value="1px solid #E5E7EB" />
                </div>
              </Card>

              {/* Stat card */}
              <Card title="Stat Card (strip)">
                <div className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: '#ECFDF5' }}>
                  <div className="flex items-center justify-center rounded-lg" style={{ width: 34, height: 34, background: 'rgba(255,255,255,0.75)' }}>
                    <UserCheck size={16} style={{ color: '#065F46' }} />
                  </div>
                  <div>
                    <p style={{ color: '#065F46', fontSize: 22, fontWeight: 700, lineHeight: 1 }}>74</p>
                    <p style={{ color: '#6B7280', fontSize: 11, marginTop: 2 }}>Présents aujourd'hui</p>
                  </div>
                </div>
                <div className="mt-3 space-y-1">
                  <Spec label="bg"      value="couleur-50 (ex: #ECFDF5)" />
                  <Spec label="icon-bg" value="rgba(255,255,255,0.75)" />
                  <Spec label="value"   value="22px 700" />
                </div>
              </Card>

              {/* Info banner */}
              <Card title="Info Card / Context Banner">
                <div className="rounded-xl px-5 py-4" style={{ background: '#EEF2F7', border: '1px solid #BFCFDF' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#3E5A78' }} />
                    <span style={{ color: '#3E5A78', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' }}>EN COURS</span>
                  </div>
                  <p style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 700 }}>Lecture — Primaire 2A</p>
                  <p style={{ color: '#6B7280', fontSize: 12, marginTop: 1 }}>14h00 · Prochaine : Sciences 15h30</p>
                </div>
                <div className="mt-3 space-y-1">
                  <Spec label="bg"     value="#EEF2F7" />
                  <Spec label="border" value="#BFCFDF" />
                  <Spec label="dot"    value="animate-pulse · #3E5A78" />
                </div>
              </Card>
            </div>
          </Section>

          {/* ── 8. Avatars ── */}
          <Section id="avatars" title="Avatars" description="Initiales uniquement. 5 tailles × 5 variantes de couleur.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card title="Tailles">
                <div className="flex items-end gap-4 flex-wrap">
                  {AV_SIZES.map((s) => (
                    <div key={s.label} className="flex flex-col items-center gap-2">
                      <div
                        className="flex items-center justify-center rounded-full"
                        style={{ width: s.size, height: s.size, background: '#EEF2F7', color: '#3E5A78', fontSize: s.font, fontWeight: 700 }}
                      >
                        AB
                      </div>
                      <Spec label={s.label} value={`${s.size}px`} />
                    </div>
                  ))}
                </div>
              </Card>

              <Card title="Variantes couleur (taille MD — 40px)">
                <div className="flex gap-4 flex-wrap">
                  {AV_COLORS.map((av) => (
                    <div key={av.label} className="flex flex-col items-center gap-2">
                      <div
                        className="flex items-center justify-center rounded-full"
                        style={{ width: 40, height: 40, background: av.bg, color: av.color, fontSize: 13, fontWeight: 700 }}
                      >
                        AB
                      </div>
                      <p style={{ color: '#9CA3AF', fontSize: 10, fontWeight: 500 }}>{av.label}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-4 space-y-1" style={{ borderTop: '1px solid #F3F4F6' }}>
                  <Spec label="attribution" value="id % 5 → couleur déterministe" />
                  <Spec label="font"        value="12–20px · 700 · uppercase" />
                </div>
              </Card>
            </div>
          </Section>

          {/* ── 9. Navigation ── */}
          <Section id="nav" title="Navigation" description="États d'un item sidebar. 3 états : default, hover, actif. + mode réduit (icône seule).">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card title="Default">
                <NavItemDemo label="Voir les enfants"  state="default" icon={Users} />
              </Card>
              <Card title="Hover">
                <NavItemDemo label="Voir les enfants"  state="hover"   icon={Users} />
              </Card>
              <Card title="Actif (expanded)">
                <NavItemDemo label="Voir les enfants"  state="active"  icon={Users} />
                <div className="mt-3 pt-3 space-y-1" style={{ borderTop: '1px solid #F3F4F6' }}>
                  <Spec label="indicator" value="dot w-1.5 h-1.5 rounded-full ml-auto" />
                  <Spec label="bg"        value="#EEF2F7 · color #3E5A78" />
                </div>
              </Card>
              <Card title="Actif (collapsed)">
                <div className="flex justify-center">
                  <div className="relative flex items-center justify-center rounded-lg"
                    style={{ width: 40, height: 40, background: '#EEF2F7' }}>
                    <div className="absolute left-0 rounded-r-full"
                      style={{ width: 3, height: 22, background: '#3E5A78', top: '50%', transform: 'translateY(-50%)' }} />
                    <Users size={18} style={{ color: '#3E5A78' }} />
                  </div>
                </div>
                <p style={{ color: '#9CA3AF', fontSize: 10, fontWeight: 500, marginTop: 8, textAlign: 'center' }}>
                  état : <strong>active</strong>
                </p>
                <div className="mt-3 pt-3 space-y-1" style={{ borderTop: '1px solid #F3F4F6' }}>
                  <Spec label="bar" value="w 3px · h 22px · rounded-r-full · left-0" />
                  <Spec label="bg"  value="#EEF2F7" />
                </div>
              </Card>
            </div>

            <Card title="Multi-step form indicator">
              <div className="flex items-center px-2 py-3">
                {[
                  { num: 1, label: 'Identité',   state: 'done'    },
                  { num: 2, label: 'Scolarité',  state: 'active'  },
                  { num: 3, label: 'Tuteur',     state: 'pending' },
                ].map((s, i) => (
                  <div key={s.num} className="flex items-center flex-1 last:flex-none">
                    <div className="flex items-center gap-2">
                      <div
                        className="flex items-center justify-center rounded-full flex-shrink-0"
                        style={{
                          width: 28, height: 28,
                          background: s.state === 'done' ? '#3E5A78' : s.state === 'active' ? '#EEF2F7' : '#F3F4F6',
                          border: s.state === 'active' ? '2px solid #3E5A78' : 'none',
                          color: s.state === 'done' ? '#FFFFFF' : s.state === 'active' ? '#3E5A78' : '#9CA3AF',
                          fontSize: 12, fontWeight: 700,
                        }}
                      >
                        {s.state === 'done' ? <Check size={13} /> : s.num}
                      </div>
                      <span style={{ fontSize: 12, fontWeight: s.state === 'active' ? 600 : 400, color: s.state === 'pending' ? '#9CA3AF' : '#1A1A1A' }}>
                        {s.label}
                      </span>
                    </div>
                    {i < 2 && <div className="flex-1 h-px mx-3" style={{ background: s.state === 'done' ? '#3E5A78' : '#E5E7EB' }} />}
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 space-y-1" style={{ borderTop: '1px solid #F3F4F6' }}>
                <Spec label="done"    value="bg #3E5A78 · icon Check blanc" />
                <Spec label="active"  value="bg #EEF2F7 · border 2px #3E5A78" />
                <Spec label="pending" value="bg #F3F4F6 · color #9CA3AF" />
                <Spec label="line"    value="bg #3E5A78 si done, sinon #E5E7EB" />
              </div>
            </Card>
          </Section>

          {/* ── 10. Tableaux ── */}
          <Section id="tables" title="Tableaux" description="Pattern de table standard. Header gris clair, lignes séparées, actions alignées à droite.">
            <Card>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F9F7F3' }}>
                    {['Enfant', 'Classe', 'Statut', 'Date', ''].map((h, i) => (
                      <th key={i} className={`text-left px-5 py-3 ${i === 4 ? 'text-right' : ''}`}
                        style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em' }}>
                        <span className="flex items-center gap-1">
                          {h.toUpperCase()}
                          {i === 0 && <span className="flex flex-col"><ArrowUp size={8} style={{ color: '#3E5A78' }} /><ArrowDown size={8} style={{ color: '#D1D5DB' }} /></span>}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { name: 'Amine Belarbi',   classe: 'Primaire 2', status: 'PRÉSENT',  statusBg: '#ECFDF5', statusColor: '#065F46',  date: '19 Mai 2026' },
                    { name: 'Sara Hadj',        classe: 'Maternelle', status: 'ABSENT',   statusBg: '#FEF2F2', statusColor: '#B91C1C',  date: '19 Mai 2026' },
                    { name: 'Bilal Meziane',    classe: 'Primaire 3', status: 'EN CONGÉ', statusBg: '#FFFBEB', statusColor: '#D97706',  date: '15 Mai 2026' },
                  ].map((row) => (
                    <tr key={row.name} className="hover:bg-gray-50" style={{ borderTop: '1px solid #F3F4F6' }}>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center rounded-full flex-shrink-0"
                            style={{ width: 32, height: 32, background: '#EEF2F7', color: '#3E5A78', fontSize: 11, fontWeight: 700 }}>
                            {row.name.split(' ').map(n => n[0]).join('')}
                          </div>
                          <span style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 500 }}>{row.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5"><span style={{ color: '#6B7280', fontSize: 13 }}>{row.classe}</span></td>
                      <td className="px-5 py-3.5">
                        <span className="px-2.5 py-0.5 rounded-full" style={{ background: row.statusBg, color: row.statusColor, fontSize: 11, fontWeight: 600 }}>
                          {row.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5"><span style={{ color: '#9CA3AF', fontSize: 12 }}>{row.date}</span></td>
                      <td className="px-5 py-3.5">
                        <div className="flex justify-end gap-1">
                          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
                            style={{ background: '#EEF2F7', color: '#3E5A78', fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
                            <Eye size={12} /> Voir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 pt-4 grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ borderTop: '1px solid #F3F4F6' }}>
                <Spec label="header-bg"  value="#F9F7F3" />
                <Spec label="row-border" value="1px solid #F3F4F6" />
                <Spec label="hover"      value="bg #F9FAFB" />
                <Spec label="sort icons" value="ArrowUp + ArrowDown (lucide)" />
              </div>
            </Card>
          </Section>

          {/* ── 11. Modales ── */}
          <Section id="modals" title="Modales" description="Structure backdrop + modale. z-index 50, blur, arrondi 2xl.">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card title="Structure modale">
                {/* Simulated modal inline */}
                <div className="rounded-2xl overflow-hidden shadow-xl" style={{ border: '1px solid #E5E7EB', background: '#FFFFFF' }}>
                  {/* Header */}
                  <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <div>
                      <h3 style={{ color: '#1A1A1A', fontSize: 17, fontWeight: 700 }}>Titre de la modale</h3>
                      <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>Sous-titre optionnel</p>
                    </div>
                    <button className="p-1 rounded-md hover:bg-gray-100">
                      <X size={18} style={{ color: '#9CA3AF' }} />
                    </button>
                  </div>
                  {/* Body */}
                  <div className="px-6 py-5 space-y-3">
                    <div style={{ height: 32, background: '#F3F4F6', borderRadius: 6 }} />
                    <div style={{ height: 32, background: '#F3F4F6', borderRadius: 6 }} />
                    <div style={{ height: 32, background: '#F9F7F3', borderRadius: 6, width: '60%' }} />
                  </div>
                  {/* Footer */}
                  <div className="flex gap-2 px-6 py-4" style={{ borderTop: '1px solid #F3F4F6', background: '#F9F7F3' }}>
                    <button className="flex-1 py-2.5 rounded-lg"
                      style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                      Annuler
                    </button>
                    <button className="flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2"
                      style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                      <Check size={14} /> Enregistrer
                    </button>
                  </div>
                </div>
              </Card>
              <Card title="Tokens">
                <div className="space-y-2">
                  <Spec label="backdrop"    value="rgba(26,26,26,0.55) + blur(2px)" />
                  <Spec label="z-index"     value="50" />
                  <Spec label="radius"      value="rounded-2xl (16px)" />
                  <Spec label="shadow"      value="shadow-xl" />
                  <Spec label="header-h"    value="~66px · border-bottom #F3F4F6" />
                  <Spec label="footer-bg"   value="#F9F7F3 · border-top #F3F4F6" />
                  <Spec label="max-width"   value="max-w-sm / max-w-md / max-w-xl" />
                  <Spec label="close-btn"   value="X icon · p-1 · hover bg-gray-100" />
                  <Spec label="cta-primary" value="bg #3E5A78 · Check icon + label" />
                  <Spec label="cta-cancel"  value="bg #FFF · border #E5E7EB · #374151" />
                </div>
                <div className="mt-5 pt-4" style={{ borderTop: '1px solid #F3F4F6' }}>
                  <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', marginBottom: 8 }}>FERMETURE</p>
                  <div className="space-y-1.5">
                    <Spec label="click-backdrop" value="onClick sur backdrop uniquement" />
                    <Spec label="touch-guard"    value="e.target === e.currentTarget" />
                    <Spec label="escape"         value="non implémenté (prévu)" />
                  </div>
                </div>
              </Card>
            </div>
          </Section>

          {/* ── 12. Messagerie ── */}
          <Section id="messaging" title="Messagerie" description="Bulles de conversation et liste de conversations. Utilisé dans MessagesPage.">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card title="Bulles de message">
                <div className="space-y-3 p-2" style={{ background: '#F9F7F3', borderRadius: 12 }}>
                  {/* Other's message */}
                  <div className="flex justify-start">
                    <div className="rounded-2xl px-4 py-2.5" style={{ maxWidth: '72%', background: '#FFFFFF', color: '#1A1A1A', border: '1px solid #E5E7EB', borderBottomLeftRadius: 4 }}>
                      <p style={{ fontSize: 13 }}>Bonjour, j'ai une question concernant le planning.</p>
                      <p style={{ fontSize: 10, marginTop: 4, color: '#9CA3AF', textAlign: 'right' }}>09:15</p>
                    </div>
                  </div>
                  {/* My message */}
                  <div className="flex justify-end">
                    <div className="rounded-2xl px-4 py-2.5" style={{ maxWidth: '72%', background: '#3E5A78', color: '#FFFFFF', borderBottomRightRadius: 4 }}>
                      <p style={{ fontSize: 13 }}>Bien sûr, dis-moi !</p>
                      <p style={{ fontSize: 10, marginTop: 4, color: 'rgba(255,255,255,0.6)', textAlign: 'right' }}>09:17</p>
                    </div>
                  </div>
                  {/* Other's reply */}
                  <div className="flex justify-start">
                    <div className="rounded-2xl px-4 py-2.5" style={{ maxWidth: '72%', background: '#FFFFFF', color: '#1A1A1A', border: '1px solid #E5E7EB', borderBottomLeftRadius: 4 }}>
                      <p style={{ fontSize: 13 }}>Est-ce que je peux décaler ma classe du mercredi ?</p>
                      <p style={{ fontSize: 10, marginTop: 4, color: '#9CA3AF', textAlign: 'right' }}>09:18</p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-4 space-y-1.5" style={{ borderTop: '1px solid #F3F4F6' }}>
                  <Spec label="mine-bg"        value="#3E5A78 · color #FFF · bottom-right-r: 4px" />
                  <Spec label="other-bg"       value="#FFFFFF · border #E5E7EB · bottom-left-r: 4px" />
                  <Spec label="timestamp"      value="10px · right-aligned · opacity 60% (mine)" />
                  <Spec label="max-width"      value="72%" />
                </div>
              </Card>

              <Card title="Liste de conversations + champ d'envoi">
                {/* Conv item */}
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #E5E7EB' }}>
                  {/* Active item */}
                  <div className="flex items-center gap-3 px-4 py-3.5" style={{ background: '#EEF2F7', borderLeft: '3px solid #3E5A78', borderBottom: '1px solid #F3F4F6' }}>
                    <div className="flex items-center justify-center rounded-full flex-shrink-0"
                      style={{ width: 40, height: 40, background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 700 }}>
                      KM
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 600 }}>Karim Mansouri</p>
                        <span style={{ color: '#9CA3AF', fontSize: 11 }}>09:18</span>
                      </div>
                      <p className="truncate" style={{ color: '#9CA3AF', fontSize: 12, marginTop: 1 }}>Vous : Oui, c'est possible…</p>
                    </div>
                  </div>
                  {/* Inactive item */}
                  <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderLeft: '3px solid transparent', borderBottom: '1px solid #F3F4F6' }}>
                    <div className="flex items-center justify-center rounded-full flex-shrink-0"
                      style={{ width: 40, height: 40, background: '#F3F4F6', color: '#6B7280', fontSize: 13, fontWeight: 700 }}>
                      FB
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 500 }}>Fatima Bouzid</p>
                        <span style={{ color: '#9CA3AF', fontSize: 11 }}>08:00</span>
                      </div>
                      <p className="truncate" style={{ color: '#9CA3AF', fontSize: 12, marginTop: 1 }}>Parfait, merci beaucoup !</p>
                    </div>
                  </div>
                  {/* Send bar */}
                  <div className="flex items-center gap-3 px-4 py-3" style={{ background: '#FFFFFF', borderTop: '1px solid #E5E7EB' }}>
                    <div className="flex-1 rounded-xl px-4 py-2"
                      style={{ background: '#F3F4F6', border: '1px solid #E5E7EB', color: '#9CA3AF', fontSize: 13 }}>
                      Écrire un message…
                    </div>
                    <div className="flex items-center justify-center rounded-xl flex-shrink-0"
                      style={{ width: 40, height: 40, background: '#E5E7EB' }}>
                      <Send size={16} style={{ color: '#9CA3AF' }} />
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-4 space-y-1.5" style={{ borderTop: '1px solid #F3F4F6' }}>
                  <Spec label="active-border" value="3px solid #3E5A78 (left)" />
                  <Spec label="active-bg"     value="#EEF2F7 · avatar bg #3E5A78" />
                  <Spec label="inactive-border" value="3px solid transparent" />
                  <Spec label="send-active"   value="bg #3E5A78 · icon #FFF" />
                  <Spec label="send-disabled" value="bg #E5E7EB · icon #9CA3AF" />
                </div>
              </Card>
            </div>
          </Section>

          {/* ── 13. Documents ── */}
          <Section id="documents" title="Documents & Pièces jointes" description="Lignes de checklist avec bouton d'attachement. Utilisé dans les fiches enfant.">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card title="Liste de documents">
                <div className="space-y-2">
                  {[
                    { label: 'Acte de naissance',      attached: true  },
                    { label: 'Carnet de santé',         attached: true  },
                    { label: 'Photo d\'identité',       attached: false },
                    { label: 'Attestation de vaccination', attached: false },
                  ].map((doc) => (
                    <div key={doc.label} className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
                      style={{ background: doc.attached ? '#ECFDF5' : '#F9F7F3', border: `1px solid ${doc.attached ? '#A7F3D0' : '#E5E7EB'}` }}>
                      <div className="flex items-center justify-center rounded flex-shrink-0"
                        style={{ width: 18, height: 18, background: doc.attached ? '#3E5A78' : '#FFFFFF', border: `2px solid ${doc.attached ? '#3E5A78' : '#D1D5DB'}` }}>
                        {doc.attached && <Check size={11} style={{ color: '#FFFFFF' }} />}
                      </div>
                      <span className="flex-1" style={{ color: '#374151', fontSize: 13, fontWeight: doc.attached ? 500 : 400 }}>{doc.label}</span>
                      {doc.attached && <Paperclip size={13} style={{ color: '#065F46', flexShrink: 0 }} />}
                      <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg flex-shrink-0"
                        style={{ background: doc.attached ? '#FFFFFF' : '#EEF2F7', color: doc.attached ? '#065F46' : '#3E5A78', fontSize: 11, fontWeight: 600, border: `1px solid ${doc.attached ? '#A7F3D0' : '#BFCFDF'}`, cursor: 'pointer' }}>
                        <Upload size={11} />
                        {doc.attached ? 'Remplacer' : 'Joindre'}
                      </button>
                    </div>
                  ))}
                </div>
              </Card>

              <Card title="Tokens">
                <div className="space-y-2">
                  <Spec label="row-attached"    value="bg #ECFDF5 · border #A7F3D0" />
                  <Spec label="row-missing"     value="bg #F9F7F3 · border #E5E7EB" />
                  <Spec label="checkbox-filled" value="bg #3E5A78 · Check blanc" />
                  <Spec label="paperclip"       value="lucide Paperclip · #065F46 · taille 13" />
                  <Spec label="btn-joindre"     value="bg #EEF2F7 · color #3E5A78" />
                  <Spec label="btn-remplacer"   value="bg #FFF · color #065F46 · border #A7F3D0" />
                  <Spec label="file-input"      value="hidden input ref + onClick trigger" />
                </div>
                <div className="mt-5 pt-4" style={{ borderTop: '1px solid #F3F4F6' }}>
                  <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', marginBottom: 8 }}>ZONE DE DÉPÔT (UPLOAD MODAL)</p>
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
                    style={{ background: '#ECFDF5', border: '1.5px dashed #A7F3D0', cursor: 'pointer' }}>
                    <Upload size={16} style={{ color: '#065F46', flexShrink: 0 }} />
                    <span style={{ color: '#065F46', fontSize: 13 }}>rapport-mensuel-2026.pdf</span>
                    <Check size={15} style={{ color: '#065F46', marginLeft: 'auto' }} />
                  </div>
                  <div className="mt-2">
                    <Spec label="empty-bg" value="#F9F7F3 · dashed #D1D5DB" />
                    <Spec label="filled-bg" value="#ECFDF5 · dashed #A7F3D0 + Check" />
                  </div>
                </div>
              </Card>
            </div>
          </Section>

          {/* ── 14. Barres de progression ── */}
          <Section id="progress" title="Barres de progression" description="Barres d'assiduité et de budget. Couleur conditionnelle selon le taux.">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card title="Barre d'assiduité (Attendance)">
                <div className="space-y-5">
                  {[
                    { label: 'Amine Belarbi',   pct: 96, color: '#065F46', bg: '#ECFDF5' },
                    { label: 'Sara Hadj',        pct: 78, color: '#3E5A78', bg: '#EEF2F7' },
                    { label: 'Bilal Meziane',    pct: 61, color: '#D97706', bg: '#FFFBEB' },
                    { label: 'Nour Amrani',      pct: 42, color: '#B91C1C', bg: '#FEF2F2' },
                  ].map((row) => (
                    <div key={row.label}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span style={{ color: '#374151', fontSize: 13, fontWeight: 500 }}>{row.label}</span>
                        <span style={{ color: row.color, fontSize: 12, fontWeight: 700 }}>{row.pct}%</span>
                      </div>
                      <div className="rounded-full overflow-hidden" style={{ height: 7, background: '#F3F4F6' }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${row.pct}%`, background: row.color }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-5 pt-4 space-y-1.5" style={{ borderTop: '1px solid #F3F4F6' }}>
                  <Spec label="≥ 90%"  value="#065F46 (vert)" />
                  <Spec label="≥ 70%"  value="#3E5A78 (bleu)" />
                  <Spec label="≥ 50%"  value="#D97706 (orange)" />
                  <Spec label="< 50%"  value="#B91C1C (rouge)" />
                  <Spec label="track"  value="bg #F3F4F6 · h 7px · rounded-full" />
                </div>
              </Card>

              <Card title="Barre de budget (Finances)">
                <div className="space-y-5">
                  {[
                    { label: 'Budget consommé',  pct: 78,  color: '#D97706', bg: '#FFFBEB', value: '653 400 DA' },
                    { label: 'Budget restant',   pct: 22,  color: '#065F46', bg: '#ECFDF5', value: '186 600 DA' },
                    { label: 'Dépassement',      pct: 108, color: '#B91C1C', bg: '#FEF2F2', value: '840 000 DA' },
                  ].map((row) => (
                    <div key={row.label}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span style={{ color: '#374151', fontSize: 13, fontWeight: 500 }}>{row.label}</span>
                        <span style={{ color: row.color, fontSize: 12, fontWeight: 700 }}>{row.value}</span>
                      </div>
                      <div className="rounded-full overflow-hidden" style={{ height: 8, background: '#F3F4F6' }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(row.pct, 100)}%`, background: row.color }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-5 pt-4 space-y-1.5" style={{ borderTop: '1px solid #F3F4F6' }}>
                  <Spec label="consommé"   value="#D97706 (orange)" />
                  <Spec label="restant"    value="#065F46 (vert)" />
                  <Spec label="dépassement" value="#B91C1C (rouge)" />
                  <Spec label="track"      value="bg #F3F4F6 · h 8px · rounded-full" />
                  <Spec label="cap"        value="min(pct, 100) pour éviter overflow" />
                </div>

                <div className="mt-5 pt-4" style={{ borderTop: '1px solid #F3F4F6' }}>
                  <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', marginBottom: 8 }}>KPI BUDGET (BOARD)</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Alloué',    value: '840 000', color: '#3E5A78', bg: '#EEF2F7', icon: DollarSign },
                      { label: 'Consommé',  value: '653 400', color: '#D97706', bg: '#FFFBEB', icon: TrendingUp },
                      { label: 'Restant',   value: '186 600', color: '#065F46', bg: '#ECFDF5', icon: ShieldCheck },
                    ].map((kpi) => {
                      const Icon = kpi.icon;
                      return (
                        <div key={kpi.label} className="rounded-xl p-3" style={{ background: kpi.bg }}>
                          <Icon size={14} style={{ color: kpi.color, marginBottom: 6 }} />
                          <p style={{ color: kpi.color, fontSize: 15, fontWeight: 700 }}>{kpi.value}</p>
                          <p style={{ color: '#6B7280', fontSize: 10, marginTop: 1 }}>{kpi.label}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>
            </div>
          </Section>

        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 text-center" style={{ borderTop: '1px solid #E5E7EB' }}>
          <p style={{ color: '#9CA3AF', fontSize: 12 }}>
            Hadoum Design System · v1.0 · Mai 2026 · Usage interne
          </p>
        </div>
      </div>
    </div>
  );
}