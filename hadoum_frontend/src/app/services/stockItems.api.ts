import { api } from './api';
import type { ApiValidationRequest, ApiValidationStatus } from './maintenanceTickets.api';
import type { ApiStockMovement } from './stockMovements.api';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ApiStockCategory =
  | 'ALIMENTAIRE' | 'HYGIENE' | 'ENTRETIEN' | 'MEDICAL' | 'BUREAU'
  | 'FOURNITURES_SCOLAIRES' | 'VETEMENTS' | 'LITERIE' | 'MOBILIER'
  | 'EQUIPEMENT' | 'INFORMATIQUE' | 'OUTILLAGE' | 'DON' | 'AUTRE';

export type ApiStockUnit =
  | 'UNITE' | 'CARTON' | 'PAQUET' | 'KILOGRAMME' | 'GRAMME' | 'LITRE'
  | 'MILLILITRE' | 'BOITE' | 'SAC' | 'BOUTEILLE' | 'ROULEAU' | 'LOT' | 'AUTRE';

export type ApiStockMovementType =
  | 'ENTREE' | 'SORTIE' | 'AJUSTEMENT_POSITIF' | 'AJUSTEMENT_NEGATIF' | 'TRANSFERT'
  | 'PERTE' | 'CASSE' | 'PEREMPTION' | 'DON_RECU' | 'DON_DISTRIBUE' | 'RETOUR'
  | 'INVENTAIRE_CORRECTION';

export type ApiStockValidationAction =
  | 'LARGE_STOCK_EXIT' | 'NEGATIVE_ADJUSTMENT' | 'STOCK_LOSS' | 'INVENTORY_CORRECTION'
  | 'STOCK_ITEM_ARCHIVE';

export type ApiStockDocumentType =
  | 'FACTURE' | 'BON_LIVRAISON' | 'BON_SORTIE' | 'DON' | 'INVENTAIRE' | 'TRANSFERT'
  | 'REFORME' | 'PERTE' | 'VOL' | 'GARANTIE' | 'PHOTO' | 'AUTRE';

export interface ApiStockItemDocument {
  id: string;
  stockItemId: string;
  fileKey: string;
  fileMime: string;
  label: string | null;
  documentType: ApiStockDocumentType | null;
  uploadedById: string | null;
  createdAt: string;
}

export interface ApiStockItem {
  id: string;
  name: string;
  reference: string | null;
  barcode: string | null;
  category: ApiStockCategory;
  description: string | null;
  unit: ApiStockUnit;
  currentQuantity: number;
  minimumQuantity: number | null;
  maximumQuantity: number | null;
  reorderQuantity: number | null;
  unitCost: number | null;
  storageLocation: string | null;
  spaceId: string | null;
  supplierName: string | null;
  supplierContractId: string | null;
  batchNumber: string | null;
  expirationDate: string | null;
  isPerishable: boolean;
  isActive: boolean;
  notes: string | null;
  validationStatus: ApiValidationStatus | null;
  pendingValidationAction: ApiStockValidationAction | null;
  createdById: string | null;
  archivedAt: string | null;
  isOutOfStock: boolean;
  isLowStock: boolean;
  isOverstocked: boolean;
  isExpiringSoon: boolean;
  isExpired: boolean;
  daysUntilExpiration: number | null;
  inventoryValue: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiStockItemDetail extends ApiStockItem {
  documents: ApiStockItemDocument[];
  space: { id: string; name: string } | null;
  supplierContract: { id: string; contractName: string; supplierName: string } | null;
  createdBy: { id: string; name: string; initials: string; roleLabel: string } | null;
}

export interface CreateStockItemInput {
  name: string;
  reference?: string;
  barcode?: string;
  category: ApiStockCategory;
  description?: string;
  unit?: ApiStockUnit;
  minimumQuantity?: number;
  maximumQuantity?: number;
  reorderQuantity?: number;
  unitCost?: number;
  storageLocation?: string;
  spaceId?: string;
  supplierName?: string;
  supplierContractId?: string;
  batchNumber?: string;
  expirationDate?: string;
  isPerishable?: boolean;
  notes?: string;
  initialQuantity?: number;
}

export interface StockItemFilters {
  search?: string;
  category?: ApiStockCategory;
  unit?: ApiStockUnit;
  active?: boolean;
  lowStock?: boolean;
  outOfStock?: boolean;
  expiringSoon?: boolean;
  expired?: boolean;
  validationStatus?: ApiValidationStatus;
}

export interface CreateStockEntryInput {
  quantity: number;
  reason?: string;
  source?: string;
  unitCost?: number;
  batchNumber?: string;
  expirationDate?: string;
  referenceDocument?: string;
  movementDate?: string;
}

export interface CreateStockExitInput {
  quantity: number;
  reason?: string;
  destination?: string;
  referenceDocument?: string;
  movementDate?: string;
}

export interface CreateStockAdjustmentInput {
  quantityDelta: number;
  reason: string;
  lossType?: 'PERTE' | 'CASSE' | 'PEREMPTION';
  isInventoryCorrection?: boolean;
  movementDate?: string;
}

export interface CreateStockTransferInput {
  destination?: string;
  spaceId?: string;
  reason?: string;
}

// PR 12 — physical inventory count. The server computes the variance itself
// from the item's current quantity; the caller only reports what it counted.
export interface CreateStockInventoryCountInput {
  actualQuantity: number;
  comment?: string;
}

export interface StockInventoryCountResult {
  item: ApiStockItem;
  expectedQuantity: number;
  actualQuantity: number;
  difference: number;
}

// ─── API calls ────────────────────────────────────────────────────────────────

export const stockItemsApi = {
  list: (filters?: StockItemFilters) => {
    const qs = new URLSearchParams();
    if (filters?.search) qs.set('search', filters.search);
    if (filters?.category) qs.set('category', filters.category);
    if (filters?.unit) qs.set('unit', filters.unit);
    if (filters?.active !== undefined) qs.set('active', String(filters.active));
    if (filters?.lowStock) qs.set('lowStock', 'true');
    if (filters?.outOfStock) qs.set('outOfStock', 'true');
    if (filters?.expiringSoon) qs.set('expiringSoon', 'true');
    if (filters?.expired) qs.set('expired', 'true');
    if (filters?.validationStatus) qs.set('validationStatus', filters.validationStatus);
    const query = qs.toString();
    return api.get<ApiStockItem[]>(`/stock-items${query ? `?${query}` : ''}`);
  },
  get: (id: string) => api.get<ApiStockItemDetail>(`/stock-items/${id}`),
  create: (data: CreateStockItemInput) => api.post<ApiStockItem>('/stock-items', data),
  update: (id: string, data: Partial<CreateStockItemInput>) =>
    api.patch<ApiStockItem>(`/stock-items/${id}`, data),
  archive: (id: string) => api.patch<ApiStockItem>(`/stock-items/${id}/archive`, {}),
  createEntry: (id: string, data: CreateStockEntryInput) =>
    api.post<ApiStockItem>(`/stock-items/${id}/entries`, data),
  createExit: (id: string, data: CreateStockExitInput) =>
    api.post<ApiStockItem>(`/stock-items/${id}/exits`, data),
  createAdjustment: (id: string, data: CreateStockAdjustmentInput) =>
    api.post<ApiStockItem>(`/stock-items/${id}/adjustments`, data),
  createTransfer: (id: string, data: CreateStockTransferInput) =>
    api.post<ApiStockItem>(`/stock-items/${id}/transfers`, data),
  createInventoryCount: (id: string, data: CreateStockInventoryCountInput) =>
    api.post<StockInventoryCountResult>(`/stock-items/${id}/inventory-count`, data),
  movements: (id: string) => api.get<ApiStockMovement[]>(`/stock-items/${id}/movements`),
  approve: (id: string, comment?: string) =>
    api.patch<ApiStockItem>(`/stock-items/${id}/approve`, { comment }),
  reject: (id: string, comment: string) =>
    api.patch<ApiStockItem>(`/stock-items/${id}/reject`, { comment }),
  requestChanges: (id: string, comment: string) =>
    api.patch<ApiStockItem>(`/stock-items/${id}/request-changes`, { comment }),
  history: (id: string) => api.get<ApiValidationRequest[]>(`/stock-items/${id}/validation-history`),
  uploadDocument: (id: string, file: File, documentType?: ApiStockDocumentType, label?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (documentType) form.append('documentType', documentType);
    if (label) form.append('label', label);
    return api.upload<ApiStockItemDocument>(`/stock-items/${id}/documents`, form);
  },
  listDocuments: (id: string) => api.get<ApiStockItemDocument[]>(`/stock-items/${id}/documents`),
  getDocumentUrl: (id: string, documentId: string) =>
    api.get<{ url: string; expiresIn: number }>(`/stock-items/${id}/documents/${documentId}/url`),
  deleteDocument: (id: string, documentId: string) =>
    api.delete(`/stock-items/${id}/documents/${documentId}`),
};
