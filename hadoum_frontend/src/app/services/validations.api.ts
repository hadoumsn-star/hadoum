import { api } from './api';
import type { ApiValidationRequest } from './maintenanceTickets.api';
import type { ApiExpenseWorkflowStatus } from './finances.api';

export interface ApiPendingValidationResource {
  id: string;
  status: string;
  // Ticket-shaped fields
  title?: string;
  urgency?: string;
  space?: { name: string };
  // Contract-shaped fields
  contractName?: string;
  supplierName?: string;
  category?: string;
  startDate?: string;
  endDate?: string | null;
  amount?: number | null;
  // Administrative procedure-shaped fields
  authority?: string;
  procedureType?: string;
  priority?: string;
  pendingValidationAction?: string;
  // Assigned responsible — shared by MAINTENANCE_TICKET and
  // ADMINISTRATIVE_PROCEDURE (ValidationsService.findPending()'s additive
  // enrichment): prefer `assignedContact` (the Contact relation) over the
  // legacy free-text `assignedTo`; never show both.
  assignedTo?: string | null;
  assignedContact?: { id: string; fullName: string } | null;
  // Stock item-shaped fields
  name?: string;
  unit?: string;
  currentQuantity?: number;
  pendingValidationPayload?: { quantity?: number; reason?: string } | null;
  // Inventory asset-shaped fields
  assetCode?: string;
  // Entry log-shaped fields
  fullName?: string;
  organization?: string;
  visitorCategory?: string;
  // Goods movement-shaped fields
  description?: string;
  movementType?: string;
  destination?: string;
  // PR 5F — expense (EXPENSE_TRANSACTION) fields, from
  // ValidationsService.findPending()'s own resource-enrichment (PR 5B/5C).
  // `category` above is reused (same field name, TransactionCategory values).
  label?: string;
  amountXof?: number;
  date?: string;
  expenseWorkflowStatus?: ApiExpenseWorkflowStatus | null;
  supplierContact?: { id: string; fullName: string } | null;
}

export interface ApiPendingValidation extends ApiValidationRequest {
  resource: ApiPendingValidationResource | null;
}

export const validationsApi = {
  pending: () => api.get<ApiPendingValidation[]>('/validations/pending'),
  // Generic across every resource type — PR 5B's EXPENSE_TRANSACTION history
  // goes through the exact same endpoint as every other resource type.
  history: (resourceType: string, resourceId: string) =>
    api.get<ApiValidationRequest[]>(`/validations/${resourceType}/${resourceId}/history`),
};
