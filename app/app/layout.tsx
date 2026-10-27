import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import "./globals.css";

// Inter para la interfaz; Manrope para títulos, números y etiquetas destacadas.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
  title: "Editor LG",
  description: "Edición automática de video con Remotion, HyperFrames y Claude",
  icons: { icon: "/editor-lg-icono.svg" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`h-full antialiased ${inter.variable} ${manrope.variable}`}>
      <body className="h-screen flex flex-col font-sans text-[14px] overflow-hidden">
        <header className="h-12 shrink-0 border-b border-line bg-panel/80 backdrop-blur-md flex items-center px-4 gap-6">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- ícono local, sin optimizar */}
            <img src="/editor-lg-icono.svg" alt="" className="h-7 w-7 select-none" draggable={false} />
            <span className="font-heading text-[15px] font-bold tracking-tight text-white">Editor LG</span>
          </Link>
          <Nav />
        </header>
        <main className="flex-1 min-h-0 overflow-y-auto flex flex-col">{children}</main>
      </body>
    </html>
  );
}
