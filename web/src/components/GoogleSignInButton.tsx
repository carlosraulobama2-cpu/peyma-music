"use client";

import { GoogleLogin } from "@react-oauth/google";
import { isGoogleSignInConfigured } from "../lib/googleAuthConfig";

interface GoogleSignInButtonProps {
  onIdToken: (idToken: string) => void;
  onError: (message: string) => void;
}

export function GoogleSignInButton({ onIdToken, onError }: GoogleSignInButtonProps) {
  if (!isGoogleSignInConfigured()) {
    return (
      <button
        type="button"
        disabled
        title="Falta configurar NEXT_PUBLIC_GOOGLE_CLIENT_ID"
        className="flex h-11 w-full cursor-not-allowed items-center justify-center rounded-full border border-white/10 text-sm font-semibold text-muted opacity-50"
      >
        Continuar con Google (no configurado)
      </button>
    );
  }

  return (
    <div className="flex justify-center [&>div]:w-full">
      <GoogleLogin
        theme="filled_black"
        shape="pill"
        width="320"
        onSuccess={(response) => {
          if (!response.credential) {
            onError("Google no devolvió credenciales válidas.");
            return;
          }
          onIdToken(response.credential);
        }}
        onError={() => onError("No se pudo iniciar sesión con Google.")}
      />
    </div>
  );
}
