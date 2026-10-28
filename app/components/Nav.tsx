"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Edición" },
  { href: "/marca", label: "Marca" },
  { href: "/musica", label: "Música" },
  { href: "/ia", label: "IA" },
] as const;

/** Menú de la barra superior, con la sección actual marcada en ámbar. */
export const Nav = () => {
  const pathname = usePathname() ?? "/";
  const activa = (href: string) => (href === "/" ? pathname === "/" || pathname.startsWith("/p/") : pathname.startsWith(href));

  return (
    <nav className="flex items-center gap-1 text-muted">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={activa(l.href) ? "page" : undefined}
          className={`px-3 py-1.5 rounded-lg border transition ${
            activa(l.href)
              ? "border-accent/40 bg-accent-soft text-fg"
              : "border-transparent hover:bg-fg/[0.06] hover:text-fg"
          }`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
};
