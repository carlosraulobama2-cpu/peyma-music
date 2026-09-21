import { createContext } from 'react';

export type Role = 'USER' | 'ARTIST' | 'ADMIN';

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
}

export class AuthError extends Error {}

export interface AuthContextValue {
  user: AdminUser | null;
  isLoading: boolean;
  isSubmitting: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
