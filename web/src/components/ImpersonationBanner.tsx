"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/AuthProvider";
import { IMPERSONATION_FLAG_KEY } from "../app/impersonate/page";

/**
 * Franja fija mientras la sesión activa vino de un enlace de soporte
 * ("Entrar como" en el panel admin), para que nadie —ni quien hace
 * soporte, ni quien comparte pantalla con esa persona— olvide que está
 * viendo la cuenta de otro usuario. `sessionStorage` y no `localStorage`:
 * la marca no debe sobrevivir a cerrar la pestaña, igual que el token de 1
 * hora que la originó.
 */
export function ImpersonationBanner() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [active, setActive] = useState(false);

  useEffect(() => {
    try {
      // sessionStorage no existe en el render de servidor: hace falta un efecto
      // para leerlo sólo del lado cliente, no se puede derivar durante el render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActive(sessionStorage.getItem(IMPERSONATION_FLAG_KEY) === "1");
    } catch {
      // Almacenamiento bloqueado (navegación privada): sin bandera, no hay banner — mejor eso que romper la carga.
    }
  }, []);

  if (!active) return null;

  const exit = async () => {
    sessionStorage.removeItem(IMPERSONATION_FLAG_KEY);
    await logout();
    router.replace("/login");
  };

  return (
    <div className="sticky top-0 z-[1100] flex flex-wrap items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-black">
      <span>
        Viendo como {user?.displayName ?? user?.email ?? "otro usuario"} (modo soporte) — expira en menos de 1 hora.
      </span>
      <button
        type="button"
        onClick={() => void exit()}
        className="rounded-full bg-black/15 px-3 py-1 text-xs font-bold transition-colors hover:bg-black/25"
      >
        Salir
      </button>
    </div>
  );
}
