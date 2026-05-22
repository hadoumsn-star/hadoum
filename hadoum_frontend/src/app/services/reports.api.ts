import { api } from './api';

export interface ApiReport {
  id: string;
  title: string;
  type: string;
  mimeType: string;
  reportDate: string;
  uploadedBy: string | null;
  createdAt: string;
}

export const reportsApi = {
  list: () =>
    api.get<ApiReport[]>('/reports'),

  upload: (file: File, title: string, type: string, reportDate: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('title', title);
    form.append('type', type);
    form.append('reportDate', reportDate);
    form.append('uploadedBy', 'staff');
    return api.upload<ApiReport>('/reports/upload', form);
  },

  getUrl: (id: string) =>
    api.get<{ url: string; expiresIn: number }>(`/reports/${id}/url`),

  delete: (id: string) =>
    api.delete(`/reports/${id}`),
};
