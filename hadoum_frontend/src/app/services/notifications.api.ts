import { api } from './api';

export type ApiNotificationType =
  | 'VALIDATION_SUBMITTED' | 'VALIDATION_APPROVED' | 'VALIDATION_REJECTED' | 'VALIDATION_CHANGES_REQUESTED';

export interface ApiNotification {
  id: string;
  recipientId: string;
  type: ApiNotificationType;
  resourceType: string | null;
  resourceId: string | null;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export const notificationsApi = {
  list: () => api.get<ApiNotification[]>('/notifications'),
  unreadCount: () => api.get<{ count: number }>('/notifications/unread-count'),
  markRead: (id: string) => api.patch<ApiNotification>(`/notifications/${id}/read`, {}),
  markAllRead: () => api.patch('/notifications/read-all', {}),
};
