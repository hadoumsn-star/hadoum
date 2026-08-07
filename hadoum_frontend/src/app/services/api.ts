export const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

let currentToken: string | null = null;

export function setAuthToken(token: string | null) {
  currentToken = token;
}

let onUnauthorized: (() => void) | null = null;

// Registered by AuthContext so a 401 (missing/invalid/expired session)
// logs the user out and redirects to /login, instead of surfacing as a
// generic error toast on every subsequent request.
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

// Carries the HTTP status and parsed response body alongside the message, so
// callers that need to branch on a specific status (e.g. the Contacts 409
// duplicate-warning) don't have to re-parse anything or lose information —
// `instanceof Error` still holds, so every existing `catch (e) { e instanceof
// Error ? e.message : … }` call site keeps working unchanged.
export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const isFormData = options?.body instanceof FormData;
  const headers: Record<string, string> = {};
  if (!isFormData) headers['Content-Type'] = 'application/json';
  if (currentToken) headers['Authorization'] = `Bearer ${currentToken}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: Object.keys(headers).length ? headers : undefined,
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    if (res.status === 401) onUnauthorized?.();
    throw new ApiError(error.message ?? `API error ${res.status}`, res.status, error);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : undefined;
}

export const api = {
  get:    <T>(path: string)                    => request<T>(path),
  post:   <T>(path: string, body: unknown)     => request<T>(path, { method: 'POST',   body: JSON.stringify(body) }),
  patch:  <T>(path: string, body: unknown)     => request<T>(path, { method: 'PATCH',  body: JSON.stringify(body) }),
  put:    <T>(path: string, body: unknown)     => request<T>(path, { method: 'PUT',    body: JSON.stringify(body) }),
  delete: <T>(path: string)                    => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, form: FormData)    => request<T>(path, { method: 'POST',   body: form }),
};
