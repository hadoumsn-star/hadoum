// Shared "Répertoire des contacts" types — mirror the PR 1 backend contract
// exactly (see hadoum_api/src/contacts). Do not add fields the API doesn't
// return; do not rename fields to look nicer client-side.

export interface ApiContactCategory {
  id: string;
  key: string;
  label: string;
  color: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// Full shape returned by GET /contacts/:id, POST /contacts, PATCH /contacts/:id,
// PATCH /contacts/:id/(de|re)activate, and the photo endpoints.
export interface ApiContact {
  id: string;
  fullName: string;
  organization: string | null;
  functionTitle: string | null;
  categoryId: string;
  category: ApiContactCategory;
  phone: string | null;
  whatsappEnabled: boolean;
  email: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  photoKey: string | null;
  photoMime: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// Reduced shape returned by GET /contacts when `compact=true` (see
// ContactsService.toCompact), and by the `possibleDuplicate` field of a 409
// response. Search results use this shape — it does not carry every field of
// ApiContact (no photoKey/address/city/notes/createdAt/…), which is why
// ContactAutocomplete's onChange can hand back either shape depending on
// whether the contact came from a search result or a create/edit response.
export interface ApiContactSummary {
  id: string;
  fullName: string;
  organization: string | null;
  functionTitle: string | null;
  category: {
    id: string;
    key: string;
    label: string;
    color: string | null;
  };
  phone: string | null;
  email: string | null;
  active: boolean;
}

export type ApiContactLike = ApiContact | ApiContactSummary;

// GET /contacts response envelope — matches ContactsService.findAll exactly.
// No `items`, no `totalPages` — the backend returns neither.
export interface PaginatedContactResponse<
  T extends ApiContactLike = ApiContactLike,
> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// Fields accepted by POST /contacts / PATCH /contacts/:id (CreateContactDto /
// UpdateContactDto). `active` is deliberately absent — the backend never
// accepts it through these endpoints.
export interface ContactFormInput {
  fullName: string;
  organization?: string;
  functionTitle?: string;
  categoryId: string;
  phone?: string;
  whatsappEnabled?: boolean;
  email?: string;
  address?: string;
  city?: string;
  notes?: string;
}

// Body of the 409 thrown by ContactsService.create when a probable duplicate
// is found and `force` wasn't set.
export interface ProbableDuplicateResponse {
  statusCode: 409;
  error: string;
  message: string;
  possibleDuplicate: ApiContactSummary;
}
