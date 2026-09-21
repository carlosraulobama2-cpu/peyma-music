import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, isSubmitting, user, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isLoading && user?.role === 'ADMIN') {
    return <Navigate to="/moderation" replace />;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await login(email, password);
      navigate('/moderation');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
    }
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(600px circle at 50% -10%, rgba(29,185,84,0.15), transparent 60%), radial-gradient(500px circle at 90% 90%, rgba(29,185,84,0.08), transparent 60%)',
        }}
      />

      <div className="mb-10 text-2xl font-bold tracking-tight">
        Peyma Music <span className="font-normal text-muted">/ Admin</span>
      </div>

      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-surface/60 p-8 shadow-2xl backdrop-blur-xl">
        <h1 className="text-center text-2xl font-bold">Panel de control</h1>
        <p className="mt-1 text-center text-sm text-muted">Sólo para cuentas con permisos de administrador.</p>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
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

          {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 rounded-full bg-brand py-3.5 text-base font-bold text-black transition-all duration-300 ease-in-out hover:scale-[1.02] hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          >
            {isSubmitting ? 'Entrando…' : 'Iniciar sesión'}
          </button>
        </form>
      </div>
    </main>
  );
}
