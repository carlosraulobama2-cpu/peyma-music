"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/dashboard", label: "Inicio", icon: "⌂" },
  { href: "/search", label: "Buscar", icon: "⌕" },
  { href: "/library", label: "Biblioteca", icon: "☰" },
] as const;

/**
 * Barra de navegación inferior para móvil. En pantallas grandes se oculta
 * (ahí manda el sidebar). Va por encima del player deck, que en móvil se
 * apila justo arriba.
 */
export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed bottom-0 left-0 right-0 z-[1000] flex h-16 items-stretch border-t border-white/10 bg-background/95 backdrop-blur-xl lg:hidden"
    >
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            // 48px mínimo de alto de toque: debajo de eso se falla el tap seguido.
            className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors ${
              active ? "text-foreground" : "text-muted"
            }`}
          >
            <span aria-hidden className="text-lg leading-none">
              {item.icon}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
