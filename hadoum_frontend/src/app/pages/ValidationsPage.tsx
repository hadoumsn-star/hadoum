import { PendingValidationsList } from '../components/validations/PendingValidationsList';

// The full-page "Demandes à valider" experience — every pending
// ValidationRequest, any resource type, one list. All of the actual
// fetching/rendering/decision logic lives in the shared
// <PendingValidationsList /> component (also used by the Supervisor
// Dashboard's own "Demandes à valider" section) so the two never drift
// apart or duplicate the same list twice.
export function ValidationsPage() {
  return (
    <div className="px-4 md:px-6 py-6">
      <PendingValidationsList variant="page" />
    </div>
  );
}
