"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../lib/AuthProvider";
import { NotificationBell } from "./NotificationBell";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Inicio" },
  { href: "/search", label: "Buscar" },
  { href: "/subir", label: "Subir" },
  { href: "/library", label: "Biblioteca" },
  { href: "/artista", label: "Artista" },
  { href: "/perfil", label: "Perfil" },
] as const;

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    router.replace("/");
  };

  return (
    <header className="sticky top-0 z-[100] flex items-center justify-between gap-6 border-b border-white/5 bg-background/60 px-6 py-4 backdrop-blur-xl sm:px-10">
      <div className="flex min-w-0 items-center gap-8">
        <Link href="/dashboard" className="text-xl font-bold tracking-tight">
          Peyma Music
        </Link>
        <nav className="flex items-center gap-5 text-sm font-semibold">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
              className={pathname === item.href ? "text-foreground" : "text-muted transition-colors hover:text-foreground"}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="flex flex-shrink-0 items-center gap-3">
        <NotificationBell />
        {user?.role === "ADMIN" && (
          <a
            href={process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://localhost:5173"}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-brand px-5 py-2 text-sm font-bold text-black transition-all duration-300 ease-in-out hover:scale-105 hover:bg-brand-hover"
          >
            Panel de moderación ↗
          </a>
        )}
        <button
          onClick={handleLogout}
          className="rounded-full border border-white/30 px-5 py-2 text-sm font-semibold transition-colors hover:border-white"
        >
          Cerrar sesión
        </button>
      </div>
    </header>
  );
}
