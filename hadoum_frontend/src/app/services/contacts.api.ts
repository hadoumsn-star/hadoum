import { api, ApiError } from './api';
import type {
  ApiContact,
  ApiContactCategory,
  ContactFormInput,
  PaginatedContactResponse,
  ProbableDuplicateResponse,
} from '../types/contacts.types';

// ─── Duplicate-warning error ────────────────────────────────────────────────

// Thrown instead of a generic ApiError when POST /contacts responds 409 with
// a possibleDuplicate payload, so callers can branch on
// `err instanceof ContactDuplicateError` without inspecting status codes
// themselves. Never thrown for any other 409 shape — those surface as a plain
// ApiError, same as any other API failure.
export class ContactDuplicateError extends Error {
  possibleDuplicate: ProbableDuplicateResponse['possibleDuplicate'];
  constructor(body: ProbableDuplicateResponse) {
    super(body.message);
    this.name = 'ContactDuplicateError';
    this.possibleDuplicate = body.possibleDuplicate;
  }
}

function isProbableDuplicateBody(
  body: unknown,
): body is ProbableDuplicateResponse {
  return (
    typeof body === 'object' &&
    body !== null &&
    'possibleDuplicate' in body &&
    (body as { possibleDuplicate?: unknown }).possibleDuplicate != null
  );
}

// ─── List params ─────────────────────────────────────────────────────────────

export interface ListContactsParams {
  search?: string;
  categoryId?: string;
  active?: boolean;
  compact?: boolean;
  page?: number;
  pageSize?: number;
}

function buildQuery(params: object): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

// ─── API calls ────────────────────────────────────────────────────────────────

export const contactsApi = {
  list: (params: ListContactsParams = {}) =>
    api.get<PaginatedContactResponse>(`/contacts${buildQuery(params)}`),

  get: (id: string) => api.get<ApiContact>(`/contacts/${id}`),

  create: async (
    payload: ContactFormInput,
    options?: { force?: boolean },
  ): Promise<ApiContact> => {
    const query = options?.force ? '?force=true' : '';
    try {
      return await api.post<ApiContact>(`/contacts${query}`, payload);
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 409 &&
        isProbableDuplicateBody(err.body)
      ) {
        throw new ContactDuplicateError(err.body);
      }
      throw err;
    }
  },

  update: (id: string, payload: Partial<ContactFormInput>) =>
    api.patch<ApiContact>(`/contacts/${id}`, payload),

  listCategories: () => api.get<ApiContactCategory[]>('/contacts/categories'),

  uploadPhoto: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.upload<ApiContact>(`/contacts/${id}/photo`, form);
  },

  getPhotoUrl: (id: string) =>
    api.get<{ url: string; expiresIn: number }>(`/contacts/${id}/photo-url`),

  deletePhoto: (id: string) => api.delete<ApiContact>(`/contacts/${id}/photo`),
};
