/**
 * Peyma Music — Google Sign-In (nativo)
 *
 * `@react-native-google-signin/google-signin` — la librería activamente
 * mantenida y recomendada por el ecosistema Expo/RN para esto (Expo AuthSession
 * también sirve, pero para Google específicamente esta da el flujo nativo
 * completo con menos piezas propias). Requiere un development build — NO
 * funciona en Expo Go — porque agrega código nativo real (ver el plugin en
 * app.json). El `webClientId` es el mismo `GOOGLE_CLIENT_ID` que ya configura
 * el backend en `services/googleAuth.ts`: Google emite el id_token con esa
 * audiencia sin importar si quien inició sesión fue el build de iOS o Android.
 */
import { GoogleSignin, statusCodes, isErrorWithCode, isSuccessResponse } from '@react-native-google-signin/google-signin';

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

let configured = false;

function ensureConfigured(): void {
  if (configured) return;
  if (!WEB_CLIENT_ID) {
    throw new Error('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID no está definida. Copia .env.example a .env.');
  }
  GoogleSignin.configure({ webClientId: WEB_CLIENT_ID, offlineAccess: false });
  configured = true;
}

export const isGoogleSignInConfigured = (): boolean => Boolean(WEB_CLIENT_ID);

export class GoogleSignInCancelledError extends Error {}

/** Dispara el flujo nativo y devuelve el `idToken` listo para `POST /auth/google/token`. */
export async function signInWithGoogle(): Promise<string> {
  ensureConfigured();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) throw new GoogleSignInCancelledError('El usuario canceló el inicio de sesión con Google.');

  const { idToken } = response.data;
  if (!idToken) throw new Error('Google no devolvió un id_token — revisa la configuración de webClientId.');
  return idToken;
}

export function isGoogleSignInCancelled(error: unknown): boolean {
  if (error instanceof GoogleSignInCancelledError) return true;
  return isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED;
}
