/**
 * Peyma Music (app) — Notificaciones del servidor
 *
 * Sustituye al store local que las inventaba a partir del estado del
 * teléfono. Ahora vienen de la API: son hechos que decidió el servidor
 * (tu canción se aprobó, te dieron el check) y el dispositivo no tiene
 * forma de saberlos por su cuenta.
 */
import { http } from './httpClient';
import type { Ionicons } from '@expo/vector-icons';

export type NotificationKind =
  | 'TRACK_APPROVED'
  | 'TRACK_REJECTED'
  | 'TRACK_TAKEDOWN'
  | 'ARTIST_VERIFIED'
  | 'PROMOTION_APPROVED'
  | 'PROMOTION_REJECTED'
  | 'NEW_FOLLOWER'
  | 'SYSTEM';

export interface ServerNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  targetType: string | null;
  targetId: string | null;
  readAt: string | null;
  createdAt: string;
}

/** Icono por tipo. Vive en el cliente: es presentación, no dato. */
export const NOTIFICATION_ICONS: Record<NotificationKind, keyof typeof Ionicons.glyphMap> = {
  TRACK_APPROVED: 'checkmark-circle',
  TRACK_REJECTED: 'close-circle',
  TRACK_TAKEDOWN: 'warning',
  ARTIST_VERIFIED: 'shield-checkmark',
  PROMOTION_APPROVED: 'megaphone',
  PROMOTION_REJECTED: 'megaphone-outline',
  NEW_FOLLOWER: 'person-add',
  SYSTEM: 'information-circle',
};

export function fetchNotifications(): Promise<{ notifications: ServerNotification[]; unread: number }> {
  return http.get('/notifications?limit=50');
}

export function markAllNotificationsRead(): Promise<{ marked: number }> {
  return http.patch('/notifications/read');
}

export function markNotificationRead(id: string): Promise<{ ok: boolean }> {
  return http.patch(`/notifications/${id}/read`);
}
