"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { setAuthToken } from "../../lib/httpClient";
import { useAuth } from "../../lib/AuthProvider";

/** Se lee desde ImpersonationBanner.tsx — marca que la sesión activa es prestada, no propia. */
export const IMPERSONATION_FLAG_KEY = "peyma-impersonating";

/**
 * Recibe el enlace de soporte que genera el panel admin (Usuarios → "Entrar
 * como"): guarda el token de 1 hora como si fuera un login normal y manda a
 * Inicio. El banner persistente (ImpersonationBanner) es lo único que
 * distingue esta sesión de una real — sin él, nadie se acordaría de que
 * está viendo la cuenta de otra persona.
 */
function ImpersonatePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  const token = searchParams.get("token");
  const [error, setError] = useState<string | null>(
    token ? null : "Enlace incompleto: falta el token.",
  );

  useEffect(() => {
    if (!token) return;
    setAuthToken(token);
    sessionStorage.setItem(IMPERSONATION_FLAG_KEY, "1");
    refresh()
      .then(() => router.replace("/dashboard"))
      .catch(() => {
        sessionStorage.removeItem(IMPERSONATION_FLAG_KEY);
        setError("El enlace ya venció o no es válido. Generá uno nuevo desde el panel.");
      });
    // Sólo al montar: es una redirección de un solo uso, no algo que deba repetirse si cambia algo del hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-20 text-center">
      {error ? (
        <>
          <p className="text-lg font-bold">No se pudo entrar</p>
          <p className="max-w-sm text-sm text-muted">{error}</p>
        </>
      ) : (
        <p className="text-sm text-muted">Entrando…</p>
      )}
    </main>
  );
}

export default function ImpersonatePage() {
  return (
    <Suspense fallback={<main className="flex-1" />}>
      <ImpersonatePageContent />
    </Suspense>
  );
}
