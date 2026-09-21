"use client";

import { useState } from "react";
import { http } from "../lib/httpClient";
import { useAuth } from "../lib/AuthProvider";

/**
 * Pide permiso para compartir la ubicación aproximada.
 *
 * Reglas que sigue este banner, y por qué:
 *
 * - Sólo aparece si el usuario está en `NOT_ASKED`. A quien ya dijo que no
 *   no se le vuelve a preguntar; insistir es lo que convierte una petición
 *   de permiso en acoso.
 * - Dice exactamente QUÉ se guarda (una zona de ~11 km, no la dirección),
 *   PARA QUÉ (el mapa de oyentes del panel) y que es revocable. Un "¿nos
 *   dejas tu ubicación?" a secas no es consentimiento informado.
 * - No se pide el permiso del navegador hasta que la persona dice que sí
 *   aquí. Disparar el diálogo nativo sin contexto es la forma más rápida de
 *   que lo rechacen para siempre.
 */

/** Redondeo a ~11 km. El servidor lo repite; aquí es para no enviar de más. */
function coarse(value: number): number {
  return Math.round(value * 10) / 10;
}

export function LocationConsentBanner() {
  const { user } = useAuth();
  // Si se mostró y ya se decidió, se oculta. Sólo ESO es estado; si el
  // banner debe aparecer se DERIVA del usuario en cada render, sin efecto.
  const [decided, setDecided] = useState(false);
  const [busy, setBusy] = useState(false);

  // `locationConsent` puede no venir en sesiones creadas antes de que
  // existiera el campo: se trata como "no preguntado".
  const consent = (user as { locationConsent?: string } | null)?.locationConsent;
  const visible = !decided && Boolean(user) && (consent === undefined || consent === "NOT_ASKED");

  const decide = async (consent: "GRANTED" | "DENIED") => {
    setBusy(true);
    try {
      await http.patch("/users/me/location-consent", { consent });

      if (consent === "GRANTED") {
        // Ahora sí se pide el permiso del navegador, ya con contexto dado.
        navigator.geolocation?.getCurrentPosition(
          (position) => {
            sessionStorage.setItem(
              "peyma-coords",
              JSON.stringify({
                latitude: coarse(position.coords.latitude),
                longitude: coarse(position.coords.longitude),
              }),
            );
          },
          () => {
            // Denegado a nivel de navegador: no se insiste. El permiso de
            // la plataforma queda concedido pero sin coordenadas que enviar,
            // que es un estado perfectamente válido.
          },
          { maximumAge: 600_000, timeout: 10_000 },
        );
      }
    } finally {
      setBusy(false);
      setDecided(true);
    }
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Permiso de ubicación"
      className="mx-6 mb-4 rounded-xl border border-white/15 bg-surface-raised p-4 sm:mx-10"
    >
      <p className="text-sm font-semibold">¿Nos dejás ver desde dónde escuchás?</p>
      <p className="mt-1 text-sm text-muted">
        Guardaríamos sólo la <strong>zona aproximada</strong> (unos 11 km a la redonda), nunca tu dirección ni tu
        recorrido. Sirve para el mapa de oyentes que ven los artistas y el equipo de Peyma. Podés cambiar de opinión
        cuando quieras desde tu perfil, y al hacerlo borramos lo que hubiéramos guardado.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          onClick={() => decide("GRANTED")}
          disabled={busy}
          className="rounded-full bg-brand px-5 py-2 text-sm font-bold text-black transition-colors hover:bg-brand-hover disabled:opacity-50"
        >
          Sí, compartir mi zona
        </button>
        <button
          onClick={() => decide("DENIED")}
          disabled={busy}
          className="rounded-full border border-white/25 px-5 py-2 text-sm font-semibold transition-colors hover:border-white disabled:opacity-50"
        >
          No, gracias
        </button>
      </div>
    </div>
  );
}

/**
 * Coordenadas guardadas en esta sesión, si las hay.
 *
 * En `sessionStorage` y no en `localStorage`: la ubicación de hoy no tiene
 * por qué seguir siendo válida la semana que viene, y persistirla entre
 * sesiones sería guardar más de lo necesario.
 */
export function getStoredCoords(): { latitude: number; longitude: number } | null {
  try {
    const raw = sessionStorage.getItem("peyma-coords");
    return raw ? (JSON.parse(raw) as { latitude: number; longitude: number }) : null;
  } catch {
    return null;
  }
}
