import { useState } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

const PAGE_TITLES: Record<string, { title: string; breadcrumb?: string[] }> = {
  '/app/dashboard':   { title: 'Tableau de bord' },
  '/app/children':    { title: 'Enfants',                  breadcrumb: ['Gestion'] },
  '/app/team':        { title: 'Mon équipe',               breadcrumb: ['Gestion'] },
  '/app/classes':     { title: 'Classes',                  breadcrumb: ['Pédagogie'] },
  '/app/attendance':  { title: 'Présences',                breadcrumb: ['Pédagogie'] },
  '/app/activities':  { title: 'Mes activités',            breadcrumb: ['Pédagogie'] },
  '/app/messages':    { title: 'Messagerie' },
  '/app/finances':    { title: 'Finances & Budget',        breadcrumb: ['Administration'] },
  '/app/reports':     { title: 'Rapports',                 breadcrumb: ['Pilotage'] },
  '/app/validations': { title: 'Demandes à valider',       breadcrumb: ['Supervision'] },
  '/app/incidents':   { title: 'Incidents',                breadcrumb: ['Supervision'] },
  '/app/monitoring':  { title: 'Suivis individuels',       breadcrumb: ['Supervision'] },
  '/app/indicators':  { title: 'Indicateurs',              breadcrumb: ['Pilotage'] },
  '/app/exports':     { title: 'Exports',                  breadcrumb: ['Pilotage'] },
  '/app/administration':            { title: 'Administration et Gestion des Locaux', breadcrumb: ['Administration'] },
  '/app/locaux-espaces':            { title: 'Locaux et espaces',                    breadcrumb: ['Administration'] },
  '/app/tickets-maintenance':       { title: 'Tickets de maintenance',               breadcrumb: ['Administration'] },
  '/app/contrats-fournisseurs':     { title: 'Contrats fournisseurs',                breadcrumb: ['Administration'] },
  '/app/demarches-administratives': { title: 'Démarches administratives',            breadcrumb: ['Administration'] },
  '/app/stocks-inventaire':         { title: 'Stocks et inventaire',                 breadcrumb: ['Administration'] },
  '/app/registre-entrees-sorties':  { title: "Registre d'entrées/sorties",           breadcrumb: ['Administration'] },
  '/app/settings':    { title: 'Paramètres' },
  '/app/profile':     { title: 'Mon profil' },
  '/app/design-system': { title: 'Design System' },
  '/app/contacts-demo': { title: 'Démonstration — Contacts (PR 2)' },
};

const SIDEBAR_WIDTH = 256;

export function AppLayout() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  const pageInfo = PAGE_TITLES[location.pathname] ?? { title: 'Hadoum' };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#F9F7F3' }}>
      {/* Sidebar width for desktop */}
      <style>{`
        @media (min-width: 1024px) {
          .hadoum-sidebar { transform: translateX(0) !important; }
          .hadoum-main    { margin-left: ${SIDEBAR_WIDTH}px; }
        }
      `}</style>

      {/* Mobile backdrop */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-20 lg:hidden"
          style={{ background: 'rgba(0,0,0,0.35)' }}
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className="hadoum-sidebar fixed top-0 left-0 h-full z-30 transition-all duration-300 ease-in-out overflow-hidden"
        style={{
          background: '#FFFFFF',
          borderRight: '1px solid #E5E7EB',
          width: SIDEBAR_WIDTH,
          transform: mobileSidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
        }}
      >
        <Sidebar
          onNavClick={() => setMobileSidebarOpen(false)}
        />
      </aside>

      {/* Main content */}
      <div className="hadoum-main flex flex-col flex-1 min-w-0 h-screen">
        <Topbar
          onMenuClick={() => setMobileSidebarOpen(true)}
          pageTitle={pageInfo.title}
          breadcrumb={pageInfo.breadcrumb}
        />
        <main className="flex-1 overflow-y-auto" style={{ background: '#F9F7F3' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
