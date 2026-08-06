import { api } from './api';
import type { ApiValidationRequest, ApiValidationStatus } from './maintenanceTickets.api';
import type { ApiContact } from '../types/contacts.types';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ApiContractCategory =
  | 'BOULANGERIE' | 'GAZ' | 'EAU' | 'ELECTRICITE' | 'WOYOFAL'
  | 'ENTRETIEN' | 'NETTOYAGE' | 'SECURITE' | 'AUTRE';

export type ApiContractStatus = 'BROUILLON' | 'ACTIF' | 'EXPIRE_BIENTOT' | 'EXPIRE' | 'RESILIE' | 'ARCHIVE';
export type ApiRenewalType = 'AUTOMATIQUE' | 'MANUEL' | 'NON_RENOUVELABLE';
export type ApiBillingFrequency = 'MENSUELLE' | 'TRIMESTRIELLE' | 'SEMESTRIELLE' | 'ANNUELLE' | 'PONCTUELLE';
export type ApiContractValidationAction = 'CREATION' | 'RENEWAL' | 'TERMINATION';

export interface ApiContractDocument {
  id: string;
  contractId: string;
  fileKey: string;
  fileMime: string;
  label: string | null;
  createdAt: string;
}

export interface ApiSupplierContract {
  id: string;
  supplierName: string;
  // PR 8 (Contact directory integration): nullable — null on legacy
  // contracts that predate this PR and were never linked. supplierName/
  // contactPerson/phone/email/address stay as the legacy free-text
  // snapshot fields for back-compat (see supplierContracts.api.ts).
  supplierContactId: string | null;
  supplierContact: ApiContact | null;
  contractName: string;
  category: ApiContractCategory;
  description: string | null;
  contractNumber: string | null;
  startDate: string;
  endDate: string | null;
  renewalDate: string | null;
  renewalType: ApiRenewalType | null;
  noticePeriod: number | null;
  amount: number | null;
  billingFrequency: ApiBillingFrequency | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  status: ApiContractStatus;
  effectiveStatus: ApiContractStatus;
  notes: string | null;
  validationStatus: ApiValidationStatus | null;
  pendingValidationAction: ApiContractValidationAction | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiSupplierContractDetail extends ApiSupplierContract {
  documents: ApiContractDocument[];
}

export interface CreateSupplierContractInput {
  // Optional now — required only when supplierContactId isn't provided
  // (enforced server-side). string: assign/replace. null: explicitly clear
  // an existing assignment (legacy snapshot fields are preserved, not
  // cleared — supplierName stays NOT NULL). undefined/omitted: leave the
  // current relation untouched.
  supplierName?: string;
  supplierContactId?: string | null;
  contractName: string;
  category: ApiContractCategory;
  description?: string;
  contractNumber?: string;
  startDate: string;
  endDate?: string;
  renewalDate?: string;
  renewalType?: ApiRenewalType;
  noticePeriod?: number;
  amount?: number;
  billingFrequency?: ApiBillingFrequency;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export interface ContractFilters {
  category?: ApiContractCategory;
  status?: ApiContractStatus;
  validationStatus?: ApiValidationStatus;
  expiringSoon?: boolean;
  expired?: boolean;
  search?: string;
}

// ─── API calls ────────────────────────────────────────────────────────────────

export const supplierContractsApi = {
  list: (filters?: ContractFilters) => {
    const qs = new URLSearchParams();
    if (filters?.category) qs.set('category', filters.category);
    if (filters?.status) qs.set('status', filters.status);
    if (filters?.validationStatus) qs.set('validationStatus', filters.validationStatus);
    if (filters?.expiringSoon) qs.set('expiringSoon', 'true');
    if (filters?.expired) qs.set('expired', 'true');
    if (filters?.search) qs.set('search', filters.search);
    const query = qs.toString();
    return api.get<ApiSupplierContract[]>(`/supplier-contracts${query ? `?${query}` : ''}`);
  },
  get: (id: string) => api.get<ApiSupplierContractDetail>(`/supplier-contracts/${id}`),
  create: (data: CreateSupplierContractInput) => api.post<ApiSupplierContract>('/supplier-contracts', data),
  update: (id: string, data: Partial<CreateSupplierContractInput>) =>
    api.patch<ApiSupplierContract>(`/supplier-contracts/${id}`, data),
  archive: (id: string) => api.patch<ApiSupplierContract>(`/supplier-contracts/${id}/archive`, {}),
  submitValidation: (id: string, comment?: string) =>
    api.post<ApiSupplierContract>(`/supplier-contracts/${id}/submit-validation`, { comment }),
  requestRenewal: (id: string, comment?: string) =>
    api.post<ApiSupplierContract>(`/supplier-contracts/${id}/request-renewal`, { comment }),
  requestTermination: (id: string, comment?: string) =>
    api.post<ApiSupplierContract>(`/supplier-contracts/${id}/request-termination`, { comment }),
  approve: (id: string, comment?: string) =>
    api.patch<ApiSupplierContract>(`/supplier-contracts/${id}/approve`, { comment }),
  reject: (id: string, comment: string) =>
    api.patch<ApiSupplierContract>(`/supplier-contracts/${id}/reject`, { comment }),
  requestChanges: (id: string, comment: string) =>
    api.patch<ApiSupplierContract>(`/supplier-contracts/${id}/request-changes`, { comment }),
  history: (id: string) => api.get<ApiValidationRequest[]>(`/supplier-contracts/${id}/validation-history`),
  uploadDocument: (id: string, file: File, label?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (label) form.append('label', label);
    return api.upload<ApiContractDocument>(`/supplier-contracts/${id}/documents`, form);
  },
  listDocuments: (id: string) => api.get<ApiContractDocument[]>(`/supplier-contracts/${id}/documents`),
  getDocumentUrl: (contractId: string, documentId: string) =>
    api.get<{ url: string; expiresIn: number }>(`/supplier-contracts/${contractId}/documents/${documentId}/url`),
  deleteDocument: (contractId: string, documentId: string) =>
    api.delete(`/supplier-contracts/${contractId}/documents/${documentId}`),
};
