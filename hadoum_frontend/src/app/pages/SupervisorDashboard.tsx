import { useAuth } from '../context/AuthContext';
import { PendingValidationsList } from '../components/validations/PendingValidationsList';

// ─── Main Dashboard ───────────────────────────────────────────────────────────
//
// Deliberately minimal: this used to also carry a decision-focus summary
// block (count/delay text + an incident badge — already removed in an
// earlier pass), a "Suivi des incidents" section, and a "Vue économique"
// section (budget KPI cards + a *mock*, locally-stateful fund-requests list
// from AppDataContext — never backend-connected, unlike the real
// /api/fund-requests API). All three are gone now. Incidents still have
// their own full page (`/app/incidents`, in the sidebar); nothing here
// duplicates it.
//
// Supervisor validation experience consistency: this page used to carry two
// separate sections here — the expense-only <PendingExpenseApprovals />
// widget (also on FinancesPage) plus its own inline "every other resource
// type" list, each with their own "Dépenses à valider"/"Demandes à valider"
// heading. Once the expense widget's own title also became "Demandes à
// valider" (the app-wide rename — see PendingExpenseApprovals), the two
// would have shown as two adjacent, identically-titled sections on the same
// page. Merged into one: the exact same <PendingValidationsList /> component
// /app/validations renders, now covering every resource type including
// expenses — "one unified 'Demandes à valider' experience," not two. The
// expense-only widget remains exactly as it was on FinancesPage, where a
// finance-specific view is the whole point of that page.

export function SupervisorDashboard() {
  const { user } = useAuth();
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div data-testid="supervisor-dashboard" className="px-4 md:px-6 py-6 space-y-5" style={{ maxWidth: 1100 }}>

      {/* ── Header ── */}
      <div>
        <h2 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>
          Bonjour, {user?.name.split(' ')[0]} 👋
        </h2>
        <p style={{ color: '#6B7280', fontSize: 13, marginTop: 3, textTransform: 'capitalize' }}>
          {today} · Vue supervision
        </p>
      </div>

      {/* ── Demandes à valider — every pending ValidationRequest, any
          resource type, one list (see docstring above). ── */}
      <PendingValidationsList variant="card" />

      <div style={{ height: 24 }} />
    </div>
  );
}
