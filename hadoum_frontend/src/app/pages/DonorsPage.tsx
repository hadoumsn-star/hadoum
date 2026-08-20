import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  HeartHandshake, Gift, Target, Receipt, MessageSquare, FileText, ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { donorProfilesApi } from '../services/donorProfiles.api';
import { campaignsApi } from '../services/campaigns.api';
import { donationsApi } from '../services/donations.api';
import { donorReportsApi } from '../services/donorReports.api';
import { DonorProfileListSection } from '../components/donors/DonorProfileListSection';
import { CampaignsSection } from '../components/donors/CampaignsSection';
import { DonationsSection } from '../components/donors/DonationsSection';
import { CommunicationsSection } from '../components/donors/CommunicationsSection';
import { ReportsSection } from '../components/donors/ReportsSection';
import { resolveDonorTabParam, type DonorTab } from '../utils/donorTabLink';

type MainTab = DonorTab;

const TABS: { key: MainTab; label: string; icon: React.ElementType }[] = [
  { key: 'parrains',       label: 'Parrains',              icon: HeartHandshake },
  { key: 'donateurs',      label: 'Donateurs ponctuels',   icon: Gift },
  { key: 'cagnottes',      label: 'Cagnottes',             icon: Target },
  { key: 'dons',           label: 'Dons',                  icon: Receipt },
  { key: 'communications', label: 'Communications',        icon: MessageSquare },
  { key: 'rapports',       label: 'Rapports',              icon: FileText },
];

interface Summary {
  activeSponsors: number;
  donationsCount: number;
  activeCampaigns: number;
  reportsToHandle: number;
}

export function DonorsPage() {
  const { user } = useAuth();
  const isBoard = user?.role === 'board';

  // Module 6 (PR 23): deep-link support for e.g. /app/donateurs?tab=cagnottes
  // (used by the Director Dashboard's "À traiter" attention drill-down — see
  // ../utils/donorTabLink.ts's resolveAttentionTargetPath). Read once on
  // mount, same convention as ChildrenPage's own `?attendance=` filter — a
  // missing or unrecognized value safely falls back to the page's normal
  // default ('parrains'), and plain `/app/donateurs` navigation is
  // completely unaffected.
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<MainTab>(() => resolveDonorTabParam(searchParams.get('tab')));
  const [summary, setSummary] = useState<Summary | null>(null);

  // Each of these four calls asks for a single row (pageSize: 1) purely to
  // read the paginated `total` count — never a full list. This keeps the
  // top summary cheap regardless of how many donors/donations/campaigns/
  // reports exist. A card that would require summing amounts across every
  // donation (e.g. "total collected") is intentionally NOT shown here for
  // that reason — Module 6's dashboard is the right place for aggregate
  // financial figures computed server-side.
  useEffect(() => {
    if (isBoard) return;
    Promise.all([
      donorProfilesApi.list({ type: 'PARRAIN', active: true, pageSize: 1 }),
      donationsApi.list({ pageSize: 1 }),
      campaignsApi.list({ status: 'ACTIVE', pageSize: 1 }),
      donorReportsApi.list({ status: 'DRAFT', pageSize: 1 }),
      donorReportsApi.list({ status: 'GENERATED', pageSize: 1 }),
    ]).then(([sponsors, donations, campaigns, draftReports, generatedReports]) => {
      setSummary({
        activeSponsors: sponsors.total,
        donationsCount: donations.total,
        activeCampaigns: campaigns.total,
        reportsToHandle: draftReports.total + generatedReports.total,
      });
    }).catch(() => {});
  }, [isBoard]);

  // Defense in depth only — the backend's RolesGuard already refuses BOARD
  // on every Module 5 endpoint. This just keeps the UX clean instead of
  // showing a page full of failed requests if a BOARD user lands here
  // directly (e.g. a stale bookmark).
  if (isBoard) {
    return (
      <div className="px-4 md:px-6 py-6" style={{ maxWidth: 1100 }}>
        <div className="rounded-xl p-8 text-center" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
          <ShieldAlert size={28} style={{ color: '#9CA3AF', margin: '0 auto 10px' }} />
          <p style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600 }}>Accès non disponible</p>
          <p style={{ color: '#6B7280', fontSize: 13, marginTop: 4 }}>
            La gestion des donateurs et parrains n'est pas accessible depuis ce rôle.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-6 py-6 space-y-5" style={{ maxWidth: 1100 }}>
      <div>
        <h2 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>Donateurs &amp; Parrains</h2>
        <p style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>
          Parrainages, dons, cagnottes, communications et rapports envoyés aux donateurs.
        </p>
      </div>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Parrains actifs',                  value: summary.activeSponsors,   color: '#3E5A78', bg: '#EEF2F7', icon: HeartHandshake },
            { label: 'Dons reçus',                        value: summary.donationsCount,   color: '#065F46', bg: '#ECFDF5', icon: Receipt },
            { label: 'Cagnottes actives',                 value: summary.activeCampaigns,  color: '#065F46', bg: '#ECFDF5', icon: Target },
            { label: 'Rapports à préparer / envoyer',     value: summary.reportsToHandle,  color: '#D97706', bg: '#FFFBEB', icon: FileText },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-xl p-4" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
              <div className="flex items-center justify-center rounded-lg mb-2" style={{ width: 32, height: 32, background: kpi.bg }}>
                <kpi.icon size={16} style={{ color: kpi.color }} />
              </div>
              <p style={{ color: '#1A1A1A', fontSize: 20, fontWeight: 700 }}>{kpi.value}</p>
              <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>{kpi.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{
              background: tab === key ? '#3E5A78' : '#FFFFFF',
              color: tab === key ? '#FFFFFF' : '#374151',
              fontSize: 13, fontWeight: 500,
              border: `1px solid ${tab === key ? 'transparent' : '#E5E7EB'}`,
              cursor: 'pointer',
            }}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === 'parrains' && (
        <DonorProfileListSection
          type="PARRAIN"
          title="Parrains"
          createLabel="Nouveau parrain"
          emptyLabel="Aucun parrain dans cette catégorie"
          searchPlaceholder="Rechercher un parrain…"
        />
      )}
      {tab === 'donateurs' && (
        <DonorProfileListSection
          type="DONATEUR_PONCTUEL"
          title="Donateurs ponctuels"
          createLabel="Nouveau donateur"
          emptyLabel="Aucun donateur ponctuel dans cette catégorie"
          searchPlaceholder="Rechercher un donateur…"
        />
      )}
      {tab === 'cagnottes' && <CampaignsSection />}
      {tab === 'dons' && <DonationsSection />}
      {tab === 'communications' && <CommunicationsSection />}
      {tab === 'rapports' && <ReportsSection />}
    </div>
  );
}
