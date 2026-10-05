import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Editor de video",
  description: "Edición automática de video con Remotion, HyperFrames y Claude",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="h-screen flex flex-col font-sans text-[14px] overflow-hidden">
        <header className="h-12 shrink-0 border-b border-line bg-panel flex items-center px-4 gap-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="inline-block w-5 h-5 rounded-[5px] bg-accent" />
            Editor
          </Link>
          <nav className="flex items-center gap-1 text-neutral-400">
            <Link href="/" className="px-3 py-1.5 rounded-md hover:bg-white/5 hover:text-white">
              Proyectos
            </Link>
            <Link href="/marca" className="px-3 py-1.5 rounded-md hover:bg-white/5 hover:text-white">
              Marca y música
            </Link>
            <Link href="/cuenta" className="px-3 py-1.5 rounded-md hover:bg-white/5 hover:text-white">
              Cuenta
            </Link>
          </nav>
          <div className="ml-auto">
            <Link
              href="/nuevo"
              className="px-3 py-1.5 rounded-md bg-accent text-black font-medium hover:brightness-110"
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
