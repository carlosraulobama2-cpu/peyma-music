import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

/** Con login-específico ya rechazando cuentas no-admin (ver useAuth.login), esto cubre el caso "ya había un token guardado" al recargar. */
export function RequireAdminRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted">Cargando…</p>
      </div>
    );
  }

  if (!user || user.role !== 'ADMIN') {
    // Se recuerda a dónde iba. Sin esto, abrir el enlace directo a una
    // denuncia con la sesión vencida te deja en la portada del panel
    // después de entrar, y hay que volver a buscar la denuncia a mano.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <>{children}</>;
}
