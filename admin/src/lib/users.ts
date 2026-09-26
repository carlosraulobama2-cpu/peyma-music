import { http } from './httpClient';
import type { Role } from './authContext';

/** Mismo tipo que `Role` en `authContext.ts` — se re-exporta con este nombre porque acá describe el rol de un usuario cualquiera, no el de la sesión del panel. */
export type UserRole = Role;

/** Un usuario gestionado desde el panel — no confundir con `AuthenticatedAdmin` de `lib/authContext.ts`, que es la sesión del propio panel. */
export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  avatarUrl: string | null;
  createdAt: string;
  usesGoogle: boolean;
  _count: { playlists: number; favorites: number; streamLogs: number };
}

export function fetchUsers(search = '', page = 1): Promise<{
  users: AdminUser[];
  pagination: { page: number; total: number; totalPages: number };
}> {
  const query = new URLSearchParams({ page: String(page), limit: '25' });
  if (search.trim()) query.set('search', search.trim());
  return http.get(`/admin/users?${query}`);
}

export function setUserRole(id: string, role: UserRole): Promise<{ user: AdminUser }> {
  return http.patch(`/admin/users/${id}/role`, { role });
}

export interface AuditEntry {
  id: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetLabel: string | null;
  metadata: unknown;
  ipAddress: string | null;
  createdAt: string;
}

export function fetchAudit(limit = 20): Promise<{ entries: AuditEntry[] }> {
  return http.get(`/admin/audit?limit=${limit}`);
}

export interface AuditFilters {
  page?: number;
  limit?: number;
  action?: string;
  targetType?: string;
  actorEmail?: string;
  /** ISO 8601. */
  from?: string;
  to?: string;
}

export interface AuditPage {
  entries: AuditEntry[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  /** Qué acciones existen DE VERDAD en la bitácora — para el desplegable de filtro. */
  availableActions: string[];
}

export function fetchAuditPage(filters: AuditFilters = {}): Promise<AuditPage> {
  const query = new URLSearchParams();
  if (filters.page) query.set('page', String(filters.page));
  query.set('limit', String(filters.limit ?? 30));
  if (filters.action) query.set('action', filters.action);
  if (filters.targetType) query.set('targetType', filters.targetType);
  if (filters.actorEmail) query.set('actorEmail', filters.actorEmail);
  if (filters.from) query.set('from', filters.from);
  if (filters.to) query.set('to', filters.to);
  return http.get(`/admin/audit?${query}`);
}

export interface ImpersonationTicket {
  token: string;
  user: { id: string; email: string };
  expiresInSeconds: number;
}

/**
 * Mina un token de soporte para "entrar como" este usuario en la web — vive
 * 1 hora, no una sesión normal de 7 días, y queda registrado en la
 * bitácora. Rechazado por el backend si el usuario objetivo es ADMIN.
 */
export function impersonateUser(userId: string): Promise<ImpersonationTicket> {
  return http.post(`/admin/users/${userId}/impersonate`, {});
}
