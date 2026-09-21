"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/AuthProvider";
import { GoogleSignInButton } from "../../components/GoogleSignInButton";

export default function LoginPage() {
  const router = useRouter();
  const { login, loginWithGoogle, isSubmitting, user, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && user) router.replace("/dashboard");
  }, [isLoading, user, router]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión.");
    }
  };

  const handleGoogleToken = async (idToken: string) => {
    setError(null);
    try {
      await loginWithGoogle(idToken);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión con Google.");
    }
  };

  return (
    <main className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(600px circle at 50% -10%, rgba(29,185,84,0.15), transparent 60%), radial-gradient(500px circle at 90% 90%, rgba(29,185,84,0.08), transparent 60%)",
        }}
      />

      <Link href="/" className="mb-10 text-2xl font-bold tracking-tight">
        Peyma Music
      </Link>

      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-surface/60 p-8 shadow-2xl backdrop-blur-xl transition-all duration-300 ease-in-out">
        <h1 className="text-center text-2xl font-bold">Inicia sesión en Peyma Music</h1>

        <div className="mt-6">
          <GoogleSignInButton onIdToken={handleGoogleToken} onError={setError} />
        </div>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-xs font-semibold text-muted">o con tu correo</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm font-semibold">
            Correo electrónico
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              className="rounded-lg border border-white/15 bg-black/20 px-4 py-3 text-sm font-normal outline-none transition-colors focus:border-brand"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm font-semibold">
            Contraseña
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="rounded-lg border border-white/15 bg-black/20 px-4 py-3 text-sm font-normal outline-none transition-colors focus:border-brand"
            />
          </label>

          {error && (
            <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 rounded-full bg-brand py-3.5 text-base font-bold text-black transition-all duration-300 ease-in-out hover:scale-[1.02] hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          >
            {isSubmitting ? "Entrando…" : "Iniciar sesión"}
          </button>
        </form>

        <p className="mt-8 text-center text-sm text-muted">
          ¿No tienes cuenta?{" "}
          <Link href="/register" className="font-semibold text-foreground hover:underline">
            Regístrate en Peyma Music
          </Link>
        </p>
      </div>
    </main>
  );
}
