import fs from "node:fs";
import path from "node:path";
import { personajeDir, readPersonaje } from "@/lib/clon/storage";
import { FOTO_EXTS, ponerFoto } from "@/lib/clon/personajes";
import { fileResponse, saveBody } from "@/lib/server/fsutil";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ slug: string }> };

/** Solo la foto del personaje: nada más de la carpeta (ni claves). */
export async function GET(req: Request, ctx: Context) {
  try {
    const { slug } = await ctx.params;
    const p = readPersonaje(slug);
    if (!p?.foto || !/^foto\.(jpe?g|png|webp)$/.test(p.foto)) return new Response("No encontrado", { status: 404 });
    return fileResponse(path.join(personajeDir(slug), p.foto), req);
  } catch {
    return new Response("No encontrado", { status: 404 });
  }
}

/** Subida de la foto: el cuerpo es el archivo; el nombre va en x-filename. */
export async function POST(req: Request, ctx: Context) {
  let tmp = "";
  try {
    const { slug } = await ctx.params;
    if (!readPersonaje(slug)) throw new Error("Ese personaje ya no existe.");
    const nombre = decodeURIComponent(req.headers.get("x-filename") ?? "");
    let ext = path.extname(nombre).toLowerCase();
    if (ext === ".jpeg") ext = ".jpg";
    if (!FOTO_EXTS.includes(ext)) throw new Error("La foto tiene que ser JPG, PNG o WEBP.");
    tmp = path.join(personajeDir(slug), ".foto-subida.tmp");
    const bytes = await saveBody(req, tmp);
    if (bytes < 1000) throw new Error("La foto llegó vacía.");
    if (bytes > 20 * 1024 * 1024) throw new Error("La foto pesa demasiado (máximo 20 MB).");
    return Response.json({ personaje: ponerFoto(slug, tmp, ext) });
  } catch (error) {
    if (tmp) fs.rmSync(tmp, { force: true });
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}
