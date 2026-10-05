import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import "./globals.css";

// Inter para la interfaz; Manrope para títulos, números y etiquetas destacadas.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
  title: "Clipo",
  description: "Edición automática de video con Remotion, HyperFrames y Claude",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`h-full antialiased ${inter.variable} ${manrope.variable}`}>
      <body className="h-screen flex flex-col font-sans text-[14px] overflow-hidden">
        <header className="h-12 shrink-0 border-b border-line bg-panel/80 backdrop-blur-md flex items-center px-4 gap-6">
          <Link href="/" aria-label="Clipo" className="flex items-center shrink-0">
            {/* El logo trae margen negro alrededor: se recorta con esta caja y se funde con el fondo. */}
            <span className="relative block h-8 w-[108px] overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element -- logo local, sin optimizar */}
              <img
                src="/clipo-horizontal.webp"
                alt="Clipo"
                className="absolute left-1/2 top-1/2 h-[155%] max-w-none -translate-x-1/2 -translate-y-1/2 mix-blend-screen select-none"
                draggable={false}
              />
            </span>
          </Link>
          <Nav />
          <div className="ml-auto">
            <Link
              href="/nuevo"
              className="px-3 py-1.5 rounded-lg bg-accent text-white font-medium hover:bg-accent-hover shadow-[0_6px_18px_-10px_var(--color-accent)]"
            >
              + Nuevo video
            </Link>
          </div>
        </header>
        <main className="flex-1 min-h-0 overflow-y-auto flex flex-col">{children}</main>
      </body>
    </html>
  );
}
