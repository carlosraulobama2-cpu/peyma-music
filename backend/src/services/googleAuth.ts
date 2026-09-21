/**
 * Peyma Music API — Verificación de Google Sign-In
 *
 * El cliente (Expo/React Native, vía @react-native-google-signin/google-signin)
 * obtiene el `idToken` directamente del SDK nativo de Google y lo manda al
 * backend — acá sólo se verifica su firma y audiencia contra
 * `GOOGLE_CLIENT_ID` (el Web Client ID de Google Cloud Console). No hay
 * intercambio de código de autorización ni `client secret`: eso sólo hace
 * falta en el flujo de redirect de un sitio web, que este backend no usa.
 */
import { OAuth2Client } from 'google-auth-library';
import { AppError, UnauthorizedError } from '../utils/errors';

export interface GoogleProfile {
  googleId: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

let client: OAuth2Client | undefined;

// A diferencia de JWT_SECRET (imprescindible para toda la API), Google
// Sign-In es una feature opcional: si GOOGLE_CLIENT_ID no está configurada,
// el resto del servidor debe seguir arrancando — sólo esta ruta puntual
// falla, con un error claro, en vez de tirar abajo todo el proceso al importar.
function getClient(): { client: OAuth2Client; audience: string } {
  const audience = process.env.GOOGLE_CLIENT_ID;
  if (!audience) {
    throw new AppError('Google Sign-In no está configurado en este servidor', 501, 'google_auth_not_configured');
  }
  client ??= new OAuth2Client(audience);
  return { client, audience };
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  const { client, audience } = getClient();

  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken, audience });
    payload = ticket.getPayload();
  } catch {
    throw new UnauthorizedError('Token de Google inválido o expirado');
  }

  if (!payload?.sub || !payload.email) {
    throw new UnauthorizedError('El perfil de Google no incluyó los datos necesarios');
  }
  // Google exige verificar esto explícitamente — un email no verificado no
  // es un identificador confiable para vincular/crear una cuenta.
  if (!payload.email_verified) {
    throw new UnauthorizedError('El correo de Google no está verificado');
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    displayName: payload.name ?? payload.email.split('@')[0]!,
    avatarUrl: payload.picture ?? null,
  };
}
