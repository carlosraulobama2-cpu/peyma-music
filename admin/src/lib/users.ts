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
