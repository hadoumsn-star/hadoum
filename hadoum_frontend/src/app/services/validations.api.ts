import { api } from './api';
import type { ApiValidationRequest } from './maintenanceTickets.api';

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
  // Administrative procedure-shaped fields
  authority?: string;
  procedureType?: string;
  priority?: string;
  pendingValidationAction?: string;
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
}

export interface ApiPendingValidation extends ApiValidationRequest {
  resource: ApiPendingValidationResource | null;
}

export const validationsApi = {
  pending: () => api.get<ApiPendingValidation[]>('/validations/pending'),
};
