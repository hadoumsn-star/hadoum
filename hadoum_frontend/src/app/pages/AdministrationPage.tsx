import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Building2, FileSignature, Landmark, Package,
  ArrowRight,
} from 'lucide-react';
import { spacesApi } from '../services/spaces.api';
import { supplierContractsApi } from '../services/supplierContracts.api';
import { administrativeProceduresApi } from '../services/administrativeProcedures.api';
import { stockItemsApi } from '../services/stockItems.api';
import { inventoryAssetsApi } from '../services/inventoryAssets.api';

// ─── Module cards ──────────────────────────────────────────────────────────────

interface ModuleCard {
  key: string;
  title: string;
  description: string;
  path: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
}

// "Tickets de maintenance" and "Registre d'entrées/sorties" cards removed
// from this hub (Director/Supervisor menu simplification) — the underlying
// pages, routes (now redirecting here, see routes.tsx), services, and
// backend modules are untouched and can be re-added here later.
const CARDS: ModuleCard[] = [
  {
    key: 'locaux',
    title: 'Locaux et espaces',
    description: "Gérer les salles, dortoirs et espaces de l'orphelinat.",
    path: '/app/locaux-espaces',
    icon: Building2, iconColor: '#3E5A78', iconBg: '#EEF2F7',
  },
  {
    key: 'contrats',
    title: 'Contrats fournisseurs',
    description: 'Gérer les contrats (eau, gaz, électricité, entretien…).',
    path: '/app/contrats-fournisseurs',
    icon: FileSignature, iconColor: '#065F46', iconBg: '#ECFDF5',
  },
  {
    key: 'demarches',
    title: 'Démarches administratives',
    description: 'Suivre les dossiers, autorisations et renouvellements.',
    path: '/app/demarches-administratives',
    icon: Landmark, iconColor: '#7C3AED', iconBg: '#F5F3FF',
  },
  {
    key: 'stocks',
    title: 'Stocks et inventaire',
    description: "Suivre l'alimentation, l'hygiène et le matériel.",
    path: '/app/stocks-inventaire',
    icon: Package, iconColor: '#B91C1C', iconBg: '#FEF2F2',
  },
];

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function AdministrationPage() {
  const navigate = useNavigate();
  const [activeSpaces, setActiveSpaces] = useState<number | null>(null);
  const [activeContracts, setActiveContracts] = useState<number | null>(null);
  const [proceduresNeedingAttention, setProceduresNeedingAttention] = useState<number | null>(null);
  const [stocksNeedingAttention, setStocksNeedingAttention] = useState<number | null>(null);

  useEffect(() => {
    spacesApi.list({ isActive: true }).then(data => setActiveSpaces(data.length)).catch(() => {});
    supplierContractsApi.list().then(data => {
      setActiveContracts(data.filter(c => c.effectiveStatus === 'ACTIF').length);
    }).catch(() => {});
    administrativeProceduresApi.list().then(data => {
      setProceduresNeedingAttention(
        data.filter(p => p.isExpired || p.isResponseOverdue || p.isRenewalDueSoon || p.validationStatus === 'PENDING_VALIDATION').length,
      );
    }).catch(() => {});
    Promise.all([stockItemsApi.list(), inventoryAssetsApi.list()]).then(([items, assets]) => {
      const stockAlerts = items.filter(i => i.isLowStock || i.isOutOfStock || i.isExpired || i.validationStatus === 'PENDING_VALIDATION').length;
      const assetAlerts = assets.filter(a => a.isInventoryCheckDue || a.isInventoryCheckOverdue || a.validationStatus === 'PENDING_VALIDATION').length;
      setStocksNeedingAttention(stockAlerts + assetAlerts);
    }).catch(() => {});
  }, []);

  const counters: Record<string, number | null> = {
    locaux: activeSpaces,
    contrats: activeContracts,
    demarches: proceduresNeedingAttention,
    stocks: stocksNeedingAttention,
  };

  return (
    <div className="px-4 md:px-6 py-6 space-y-5" style={{ maxWidth: 1100 }}>
      <div>
        <h2 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>
          Administration et Gestion des Locaux
        </h2>
        <p style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>
          Locaux, contrats, démarches et stocks de l'orphelinat.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CARDS.map(card => {
          const Icon = card.icon;
          const count = counters[card.key];
          return (
            <button
              key={card.key}
              onClick={() => navigate(card.path)}
              className="text-left rounded-xl p-5 flex flex-col gap-4 hover:shadow-md transition-shadow"
              style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', cursor: 'pointer' }}
            >
              <div className="flex items-start justify-between">
                <div
                  className="flex items-center justify-center rounded-xl"
                  style={{ width: 40, height: 40, background: card.iconBg }}
                >
                  <Icon size={19} style={{ color: card.iconColor }} />
                </div>
                {count !== null && (
                  <span
                    className="px-2 py-0.5 rounded-full"
                    style={{ background: '#F3F4F6', color: '#374151', fontSize: 11, fontWeight: 600 }}
                  >
                    {count}
                  </span>
                )}
              </div>
              <div>
                <p style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 600 }}>{card.title}</p>
                <p style={{ color: '#6B7280', fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>
                  {card.description}
                </p>
              </div>
              <div className="flex items-center gap-1.5" style={{ color: '#3E5A78', fontSize: 12, fontWeight: 500 }}>
                Accéder <ArrowRight size={13} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
