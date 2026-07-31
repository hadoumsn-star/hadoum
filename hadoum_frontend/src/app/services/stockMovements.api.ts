import { api } from './api';
import type { ApiValidationStatus } from './maintenanceTickets.api';
import type { ApiStockMovementType } from './stockItems.api';

export interface ApiStockMovementUser {
  id: string;
  name: string;
  initials: string;
  roleLabel: string;
}

export interface ApiStockMovement {
  id: string;
  stockItemId: string;
  type: ApiStockMovementType;
  quantity: number;
  quantityBefore: number;
  quantityAfter: number;
  unitCost: number | null;
  totalValue: number | null;
  source: string | null;
  destination: string | null;
  reason: string | null;
  referenceDocument: string | null;
  batchNumber: string | null;
  expirationDate: string | null;
  performedById: string | null;
  performedBy?: ApiStockMovementUser | null;
  approvedById: string | null;
  approvedBy?: ApiStockMovementUser | null;
  movementDate: string;
  validationStatus: ApiValidationStatus | null;
  createdAt: string;
}

export const stockMovementsApi = {
  get: (id: string) => api.get<ApiStockMovement>(`/stock-movements/${id}`),
};
