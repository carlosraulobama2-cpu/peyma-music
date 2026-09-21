/**
 * Peyma Music (app) — Consentimiento de ubicación
 *
 * Reglas, y por qué:
 *
 * - El permiso del sistema (iOS/Android) NO se pide hasta que la persona
 *   acepta en nuestro propio diálogo. Disparar el diálogo nativo sin
 *   contexto es la forma más rápida de que lo rechacen para siempre, y en
 *   iOS un rechazo no se puede volver a pedir desde la app.
 * - Se usa precisión BAJA a propósito. No necesitamos saber en qué calle
 *   está nadie; pedir precisión alta gastaría batería y recogería un dato
 *   más sensible del que hace falta.
 * - Las coordenadas se redondean a ~11 km antes de salir del dispositivo.
 *   El servidor lo repite, pero enviarlas ya redondeadas significa que la
 *   coordenada exacta nunca viaja por la red.
 */
import * as Location from 'expo-location';
import { http } from './httpClient';

export type ConsentValue = 'GRANTED' | 'DENIED';

/** Redondeo a 1 decimal: ~11 km. */
function coarse(value: number): number {
  return Math.round(value * 10) / 10;
}

let cachedCoords: { latitude: number; longitude: number } | null = null;

/**
 * Registra la decisión y, si acepta, pide el permiso del sistema.
 *
 * Devuelve si además se consiguieron coordenadas: aceptar en nuestro
 * diálogo pero denegar el permiso del sistema es un estado válido — la
 * plataforma tiene el consentimiento y simplemente no hay dato que enviar.
 */
export async function setLocationConsent(consent: ConsentValue): Promise<{ gotCoords: boolean }> {
  await http.patch('/users/me/location-consent', { consent });

  if (consent === 'DENIED') {
    cachedCoords = null;
    return { gotCoords: false };
  }

  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return { gotCoords: false };

  try {
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
    cachedCoords = {
      latitude: coarse(position.coords.latitude),
      longitude: coarse(position.coords.longitude),
    };
    return { gotCoords: true };
  } catch {
    // Sin señal GPS o el servicio apagado: no es un error que deba
    // interrumpir nada.
    return { gotCoords: false };
  }
}

/** Coordenadas aproximadas de esta sesión, si las hay. */
export function getCoarseCoords(): { latitude: number; longitude: number } | null {
  return cachedCoords;
}
