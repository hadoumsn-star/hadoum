import { api } from './api';
import type { ApiValidationRequest, ApiValidationStatus } from './maintenanceTickets.api';
import type { ApiStockUnit } from './stockItems.api';
import type { ApiRegisterDocumentType } from './entryLogs.api';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ApiGoodsMovementType =
  | 'ENTREE_MARCHANDISE' | 'SORTIE_MARCHANDISE' | 'LIVRAISON' | 'RETOUR_FOURNISSEUR'
  | 'PRET_EQUIPEMENT' | 'RETOUR_EQUIPEMENT' | 'TRANSFERT' | 'SORTIE_TEMPORAIRE'
  | 'DON_RECU' | 'DON_DISTRIBUE' | 'REFORME' | 'AUTRE';

export type ApiGoodsMovementStatus =
  | 'ENREGISTRE' | 'SORTI' | 'RETOURNE' | 'EN_ATTENTE_VALIDATION' | 'ANNULE' | 'ARCHIVE';

export type ApiGoodsValidationAction =
  | 'HIGH_VALUE_ASSET_EXIT' | 'TEMPORARY_ASSET_EXIT' | 'CONTROLLED_GOODS_EXIT' | 'RECORD_ARCHIVE';

export interface ApiGoodsMovementDocument {
  id: string;
  movementId: string;
  fileKey: string;
  fileMime: string;
  label: string | null;
  documentType: ApiRegisterDocumentType | null;
  uploadedById: string | null;
  createdAt: string;
}

export interface ApiGoodsMovementLog {
  id: string;
  movementType: ApiGoodsMovementType;
  description: string;
  itemReference: string | null;
  stockItemId: string | null;
  inventoryAssetId: string | null;
  quantity: number | null;
  unit: ApiStockUnit | null;
  source: string | null;
  destination: string | null;
  personInCharge: string | null;
  vehicleRegistration: string | null;
  deliveryNoteNumber: string | null;
  authorizationReference: string | null;
  reason: string | null;
  movementDateTime: string;
  expectedReturnDate: string | null;
  actualReturnDate: string | null;
  status: ApiGoodsMovementStatus;
  recordedById: string | null;
  authorizedByUserId: string | null;
  validationStatus: ApiValidationStatus | null;
  pendingValidationAction: ApiGoodsValidationAction | null;
  incidentReported: boolean;
  incidentId: string | null;
  incidentDescription: string | null;
  notes: string | null;
  archivedAt: string | null;
  isOverdueReturn: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiGoodsMovementLogDetail extends ApiGoodsMovementLog {
  documents: ApiGoodsMovementDocument[];
  stockItem: { id: string; name: string; unit: ApiStockUnit } | null;
  inventoryAsset: { id: string; name: string; assetCode: string | null } | null;
  recordedBy: { id: string; name: string; initials: string; roleLabel: string } | null;
  authorizedByUser: { id: string; name: string; initials: string; roleLabel: string } | null;
  incident: { id: string; title: string; status: string } | null;
}

export interface CreateGoodsMovementInput {
  movementType: ApiGoodsMovementType;
  description: string;
  itemReference?: string;
  stockItemId?: string;
  inventoryAssetId?: string;
  quantity?: number;
  unit?: ApiStockUnit;
  source?: string;
  destination?: string;
  personInCharge?: string;
  vehicleRegistration?: string;
  deliveryNoteNumber?: string;
  authorizationReference?: string;
  reason?: string;
  movementDateTime?: string;
  expectedReturnDate?: string;
  authorizedByUserId?: string;
  notes?: string;
}

export interface GoodsMovementFilters {
  search?: string;
  movementType?: ApiGoodsMovementType;
  status?: ApiGoodsMovementStatus;
  stockItemId?: string;
  inventoryAssetId?: string;
  overdueReturn?: boolean;
  validationStatus?: ApiValidationStatus;
}

// ─── API calls ────────────────────────────────────────────────────────────────

export const goodsMovementLogsApi = {
  list: (filters?: GoodsMovementFilters) => {
    const qs = new URLSearchParams();
    if (filters?.search) qs.set('search', filters.search);
    if (filters?.movementType) qs.set('movementType', filters.movementType);
    if (filters?.status) qs.set('status', filters.status);
    if (filters?.stockItemId) qs.set('stockItemId', filters.stockItemId);
    if (filters?.inventoryAssetId) qs.set('inventoryAssetId', filters.inventoryAssetId);
    if (filters?.overdueReturn) qs.set('overdueReturn', 'true');
    if (filters?.validationStatus) qs.set('validationStatus', filters.validationStatus);
    const query = qs.toString();
    return api.get<ApiGoodsMovementLog[]>(`/goods-movement-logs${query ? `?${query}` : ''}`);
  },
  get: (id: string) => api.get<ApiGoodsMovementLogDetail>(`/goods-movement-logs/${id}`),
  create: (data: CreateGoodsMovementInput) => api.post<ApiGoodsMovementLog>('/goods-movement-logs', data),
  update: (id: string, data: Partial<CreateGoodsMovementInput>) =>
    api.patch<ApiGoodsMovementLog>(`/goods-movement-logs/${id}`, data),
  recordReturn: (id: string, actualReturnDate?: string, notes?: string) =>
    api.patch<ApiGoodsMovementLog>(`/goods-movement-logs/${id}/record-return`, { actualReturnDate, notes }),
  archive: (id: string) => api.patch<ApiGoodsMovementLog>(`/goods-movement-logs/${id}/archive`, {}),
  approve: (id: string, comment?: string) =>
    api.patch<ApiGoodsMovementLog>(`/goods-movement-logs/${id}/approve`, { comment }),
  reject: (id: string, comment: string) =>
    api.patch<ApiGoodsMovementLog>(`/goods-movement-logs/${id}/reject`, { comment }),
  requestChanges: (id: string, comment: string) =>
    api.patch<ApiGoodsMovementLog>(`/goods-movement-logs/${id}/request-changes`, { comment }),
  history: (id: string) => api.get<ApiValidationRequest[]>(`/goods-movement-logs/${id}/validation-history`),
  uploadDocument: (id: string, file: File, documentType?: ApiRegisterDocumentType, label?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (documentType) form.append('documentType', documentType);
    if (label) form.append('label', label);
    return api.upload<ApiGoodsMovementDocument>(`/goods-movement-logs/${id}/documents`, form);
  },
  listDocuments: (id: string) => api.get<ApiGoodsMovementDocument[]>(`/goods-movement-logs/${id}/documents`),
  getDocumentUrl: (id: string, documentId: string) =>
    api.get<{ url: string; expiresIn: number }>(`/goods-movement-logs/${id}/documents/${documentId}/url`),
  deleteDocument: (id: string, documentId: string) =>
    api.delete(`/goods-movement-logs/${id}/documents/${documentId}`),
};
