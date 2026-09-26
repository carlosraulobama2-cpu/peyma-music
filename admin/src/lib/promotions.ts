import { http } from './httpClient';

/** Espejo de `PromotionStatus` en `backend/prisma/schema.prisma`. */
export type PromotionStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';

export const PROMOTION_STATUS_LABEL: Record<PromotionStatus, string> = {
  PENDING_APPROVAL: 'Pendiente',
  ACTIVE: 'Activa',
  REJECTED: 'Rechazada',
  EXPIRED: 'Vencida',
  CANCELLED: 'Cancelada',
};

export interface Promotion {
  id: string;
  days: number;
  status: PromotionStatus;
  position: number;
  startsAt: string | null;
  endsAt: string | null;
  priceCents: number;
  paidAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  msRemaining: number | null;
  requestedBy: { id: string; displayName: string; email: string };
  track: {
    id: string;
    title: string;
    coverUrl: string;
    duration: number;
    genre: string | null;
    artist: { id: string; name: string; isVerified: boolean };
  };
}

export interface PromotionsResponse {
  promotions: Promotion[];
  summary: Partial<Record<PromotionStatus, number>>;
  pricePerDayCents: number;
}

/** Todas las solicitudes de primera fila — ver GET /admin/promotions. */
export function fetchPromotions(): Promise<PromotionsResponse> {
  return http.get<PromotionsResponse>('/admin/promotions');
}

export function approvePromotion(id: string): Promise<{ message: string }> {
  return http.post<{ message: string }>(`/admin/promotions/${id}/approve`);
}

export function rejectPromotion(id: string, reason?: string): Promise<{ message: string; refund: string }> {
  return http.post<{ message: string; refund: string }>(`/admin/promotions/${id}/reject`, { reason });
}

export function cancelPromotion(id: string): Promise<{ message: string }> {
  return http.post<{ message: string }>(`/admin/promotions/${id}/cancel`);
}

/** Recibe los ids ya en el orden deseado — ver PUT /admin/promotions/order. */
export function reorderPromotions(orderedIds: string[]): Promise<{ message: string }> {
  return http.put<{ message: string }>('/admin/promotions/order', { orderedIds });
}
