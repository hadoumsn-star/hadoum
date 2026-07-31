import { api } from './api';
import type { ApiValidationRequest, ApiValidationStatus } from './maintenanceTickets.api';
import type { ApiStockCategory, ApiStockDocumentType } from './stockItems.api';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ApiAssetCondition = 'NEUF' | 'BON' | 'MOYEN' | 'MAUVAIS' | 'HORS_SERVICE';

export type ApiAssetStatus =
  | 'DISPONIBLE' | 'AFFECTE' | 'EN_MAINTENANCE' | 'PERDU' | 'VOLE' | 'CASSE'
  | 'REFORME' | 'ARCHIVE';

export type ApiAssetValidationAction = 'ASSET_TRANSFER' | 'ASSET_DISPOSAL' | 'ASSET_ARCHIVE';

export type ApiAssetDisposalType = 'PERTE' | 'VOL' | 'CASSE' | 'REFORME';

export interface ApiInventoryAssetDocument {
  id: string;
  assetId: string;
  fileKey: string;
  fileMime: string;
  label: string | null;
  documentType: ApiStockDocumentType | null;
  uploadedById: string | null;
  createdAt: string;
}

export interface ApiInventoryAsset {
  id: string;
  name: string;
  assetCode: string | null;
  serialNumber: string | null;
  category: ApiStockCategory;
  description: string | null;
  brand: string | null;
  model: string | null;
  acquisitionDate: string | null;
  acquisitionCost: number | null;
  fundingSource: string | null;
  donorName: string | null;
  warrantyEndDate: string | null;
  condition: ApiAssetCondition;
  status: ApiAssetStatus;
  spaceId: string | null;
  assignedTo: string | null;
  assignedToUserId: string | null;
  lastInventoryDate: string | null;
  nextInventoryDate: string | null;
  notes: string | null;
  validationStatus: ApiValidationStatus | null;
  pendingValidationAction: ApiAssetValidationAction | null;
  createdById: string | null;
  archivedAt: string | null;
  isWarrantyExpiringSoon: boolean;
  isInventoryCheckDue: boolean;
  isInventoryCheckOverdue: boolean;
  daysUntilWarrantyEnd: number | null;
  daysUntilInventoryCheck: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiInventoryAssetDetail extends ApiInventoryAsset {
  documents: ApiInventoryAssetDocument[];
  space: { id: string; name: string } | null;
  assignedToUser: { id: string; name: string; initials: string; roleLabel: string } | null;
  createdBy: { id: string; name: string; initials: string; roleLabel: string } | null;
}

export interface CreateInventoryAssetInput {
  name: string;
  assetCode?: string;
  serialNumber?: string;
  category: ApiStockCategory;
  description?: string;
  brand?: string;
  model?: string;
  acquisitionDate?: string;
  acquisitionCost?: number;
  fundingSource?: string;
  donorName?: string;
  warrantyEndDate?: string;
  condition?: ApiAssetCondition;
  spaceId?: string;
  assignedTo?: string;
  assignedToUserId?: string;
  lastInventoryDate?: string;
  nextInventoryDate?: string;
  notes?: string;
}

export interface InventoryAssetFilters {
  search?: string;
  category?: ApiStockCategory;
  condition?: ApiAssetCondition;
  status?: ApiAssetStatus;
  warrantyExpiringSoon?: boolean;
  inventoryCheckDue?: boolean;
  archived?: boolean;
  validationStatus?: ApiValidationStatus;
}

// ─── API calls ────────────────────────────────────────────────────────────────

export const inventoryAssetsApi = {
  list: (filters?: InventoryAssetFilters) => {
    const qs = new URLSearchParams();
    if (filters?.search) qs.set('search', filters.search);
    if (filters?.category) qs.set('category', filters.category);
    if (filters?.condition) qs.set('condition', filters.condition);
    if (filters?.status) qs.set('status', filters.status);
    if (filters?.warrantyExpiringSoon) qs.set('warrantyExpiringSoon', 'true');
    if (filters?.inventoryCheckDue) qs.set('inventoryCheckDue', 'true');
    if (filters?.archived) qs.set('archived', 'true');
    if (filters?.validationStatus) qs.set('validationStatus', filters.validationStatus);
    const query = qs.toString();
    return api.get<ApiInventoryAsset[]>(`/inventory-assets${query ? `?${query}` : ''}`);
  },
  get: (id: string) => api.get<ApiInventoryAssetDetail>(`/inventory-assets/${id}`),
  create: (data: CreateInventoryAssetInput) => api.post<ApiInventoryAsset>('/inventory-assets', data),
  update: (id: string, data: Partial<CreateInventoryAssetInput>) =>
    api.patch<ApiInventoryAsset>(`/inventory-assets/${id}`, data),
  assign: (id: string, assignedTo: string, assignedToUserId?: string, spaceId?: string) =>
    api.patch<ApiInventoryAsset>(`/inventory-assets/${id}/assign`, { assignedTo, assignedToUserId, spaceId }),
  transfer: (id: string, data: { spaceId?: string; assignedTo?: string; reason?: string; comment?: string }) =>
    api.patch<ApiInventoryAsset>(`/inventory-assets/${id}/transfer`, data),
  requestDisposal: (id: string, disposalType: ApiAssetDisposalType, reason: string, comment?: string) =>
    api.post<ApiInventoryAsset>(`/inventory-assets/${id}/request-disposal`, { disposalType, reason, comment }),
  requestArchive: (id: string, comment?: string) =>
    api.post<ApiInventoryAsset>(`/inventory-assets/${id}/request-archive`, { comment }),
  approve: (id: string, comment?: string) =>
    api.patch<ApiInventoryAsset>(`/inventory-assets/${id}/approve`, { comment }),
  reject: (id: string, comment: string) =>
    api.patch<ApiInventoryAsset>(`/inventory-assets/${id}/reject`, { comment }),
  requestChanges: (id: string, comment: string) =>
    api.patch<ApiInventoryAsset>(`/inventory-assets/${id}/request-changes`, { comment }),
  history: (id: string) => api.get<ApiValidationRequest[]>(`/inventory-assets/${id}/validation-history`),
  uploadDocument: (id: string, file: File, documentType?: ApiStockDocumentType, label?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (documentType) form.append('documentType', documentType);
    if (label) form.append('label', label);
    return api.upload<ApiInventoryAssetDocument>(`/inventory-assets/${id}/documents`, form);
  },
  listDocuments: (id: string) => api.get<ApiInventoryAssetDocument[]>(`/inventory-assets/${id}/documents`),
  getDocumentUrl: (id: string, documentId: string) =>
    api.get<{ url: string; expiresIn: number }>(`/inventory-assets/${id}/documents/${documentId}/url`),
  deleteDocument: (id: string, documentId: string) =>
    api.delete(`/inventory-assets/${id}/documents/${documentId}`),
};
