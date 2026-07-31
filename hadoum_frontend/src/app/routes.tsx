import { createBrowserRouter, Navigate } from 'react-router';
import { AppLayout }            from './layout/AppLayout';
import { LoginPage }            from './pages/LoginPage';
import { ForgotPasswordPage }   from './pages/ForgotPasswordPage';
import { ResetPasswordPage }    from './pages/ResetPasswordPage';
import { RoleDashboard }   from './pages/RoleDashboard';
import { ChildrenPage }    from './pages/ChildrenPage';
import { TeamPage }        from './pages/TeamPage';
import { AttendancePage }  from './pages/AttendancePage';
import { ReportsPage }     from './pages/ReportsPage';
import { ValidationsPage } from './pages/ValidationsPage';
import { FinancesPage }    from './pages/FinancesPage';
import { IndicatorsPage }  from './pages/IndicatorsPage';
import { IncidentsPage }   from './pages/IncidentsPage';
import { MonitoringPage }  from './pages/MonitoringPage';
import { ActivitiesPage }  from './pages/ActivitiesPage';
import { ClassesPage }     from './pages/ClassesPage';
import { ExportsPage }     from './pages/ExportsPage';
import { DesignSystemPage }from './pages/DesignSystemPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { ProfilePage }     from './pages/ProfilePage';
import { MessagesPage }    from './pages/MessagesPage';
import { AdministrationPage } from './pages/AdministrationPage';
import { LocauxPage } from './pages/LocauxPage';
import { TicketsMaintenancePage } from './pages/TicketsMaintenancePage';
import { SupplierContractsPage } from './pages/SupplierContractsPage';
import { DemarchesAdministrativesPage } from './pages/DemarchesAdministrativesPage';
import { StocksInventairePage } from './pages/StocksInventairePage';
import { RegistreEntreesSortiesPage } from './pages/RegistreEntreesSortiesPage';

export const router = createBrowserRouter([
  { path: '/',                 element: <Navigate to="/login" replace /> },
  { path: '/login',            Component: LoginPage },
  { path: '/forgot-password',  Component: ForgotPasswordPage },
  { path: '/reset-password',   Component: ResetPasswordPage },
  { path: '/design-system',    Component: DesignSystemPage },
  {
    path: '/app',
    Component: AppLayout,
    children: [
      { index: true,              element: <Navigate to="/app/dashboard" replace /> },
      { path: 'children',        Component: ChildrenPage },
      { path: 'dashboard',         Component: RoleDashboard },
      { path: 'team',             Component: TeamPage },
      { path: 'attendance',       Component: AttendancePage },
      { path: 'reports',          Component: ReportsPage },
      { path: 'validations',      Component: ValidationsPage },
      { path: 'finances',         Component: FinancesPage },
      { path: 'indicators',       Component: IndicatorsPage },
      { path: 'incidents',        Component: IncidentsPage },
      { path: 'monitoring',       Component: MonitoringPage },
      { path: 'activities',       Component: ActivitiesPage },
      { path: 'classes',          Component: ClassesPage },
      { path: 'exports',          Component: ExportsPage },
      { path: 'design-system',    Component: DesignSystemPage },
      { path: 'messages',          Component: MessagesPage },
      { path: 'administration',              Component: AdministrationPage },
      { path: 'locaux-espaces',              Component: LocauxPage },
      { path: 'tickets-maintenance',         Component: TicketsMaintenancePage },
      { path: 'contrats-fournisseurs',       Component: SupplierContractsPage },
      { path: 'demarches-administratives',   Component: DemarchesAdministrativesPage },
      { path: 'stocks-inventaire',           Component: StocksInventairePage },
      { path: 'registre-entrees-sorties',    Component: RegistreEntreesSortiesPage },
      { path: 'educators',        element: <PlaceholderPage title="Éducateurs" /> },
      { path: 'settings',         element: <PlaceholderPage title="Paramètres" /> },
      { path: 'profile',          Component: ProfilePage },
    ],
  },
  { path: '*', element: <Navigate to="/login" replace /> },
]);