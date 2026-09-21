/**
 * Mismo Web Client ID que `GOOGLE_CLIENT_ID` en el backend y
 * `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` en la app móvil — Google emite el
 * id_token con esa audiencia sin importar qué cliente lo pidió.
 */
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

export const isGoogleSignInConfigured = (): boolean => Boolean(GOOGLE_CLIENT_ID);
