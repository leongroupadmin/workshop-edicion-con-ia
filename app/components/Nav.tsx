"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Proyectos" },
  { href: "/marca", label: "Marca" },
  { href: "/musica", label: "Música" },
  { href: "/cuenta", label: "Cuenta" },
] as const;

/** Menú de la barra superior, con la sección actual marcada en rojo. */
export const Nav = () => {
  const pathname = usePathname() ?? "/";
  const activa = (href: string) => (href === "/" ? pathname === "/" || pathname.startsWith("/p/") : pathname.startsWith(href));

  return (
    <nav className="flex items-center gap-1 text-neutral-400">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={activa(l.href) ? "page" : undefined}
          className={`px-3 py-1.5 rounded-lg border transition ${
            activa(l.href)
              ? "border-accent/40 bg-accent-soft text-white"
              : "border-transparent hover:bg-white/[0.06] hover:text-white"
          }`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
};
