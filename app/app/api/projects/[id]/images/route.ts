import path from "node:path";
import { emit } from "@/lib/server/bus";
import { safeFilename, saveBody } from "@/lib/server/fsutil";
import { IMAGE_EXTS, listImages, removeImage, setImageNote } from "@/lib/server/images";
import { exists, paths } from "@/lib/server/projects";

export const dynamic = "force-dynamic";

const faltaProyecto = () => Response.json({ error: "No existe el proyecto" }, { status: 404 });

/** GET: imágenes que subió el usuario para este video. */
export async function GET(_req: Request, ctx: RouteContext<"/api/projects/[id]/images">) {
  const { id } = await ctx.params;
  if (!exists(id)) return faltaProyecto();
  return Response.json({ images: listImages(id) });
}

/** POST: sube una imagen (cuerpo binario, nombre en el header x-filename). */
export async function POST(req: Request, ctx: RouteContext<"/api/projects/[id]/images">) {
  const { id } = await ctx.params;
  if (!exists(id)) return faltaProyecto();
  const original = decodeURIComponent(req.headers.get("x-filename") ?? "imagen.jpg");
  const ext = path.extname(original).toLowerCase();
  if (!IMAGE_EXTS.includes(ext)) {
    return Response.json({ error: "Formato no soportado (JPG, PNG, WEBP o SVG)." }, { status: 400 });
  }
  const file = safeFilename(original);
  await saveBody(req, path.join(paths(id).images, file));
  emit(id, { type: "refresh" });
  return Response.json({ ok: true, file, images: listImages(id) });
}

/** PATCH: cambia la descripción de una imagen. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/projects/[id]/images">) {
  const { id } = await ctx.params;
  if (!exists(id)) return faltaProyecto();
  const { file, note } = (await req.json().catch(() => ({}))) as { file?: string; note?: string };
  if (!file) return Response.json({ error: "Falta el archivo." }, { status: 400 });
  setImageNote(id, path.basename(file), note ?? "");
  return Response.json({ ok: true, images: listImages(id) });
}

/** DELETE ?file=…: manda la imagen a la Papelera del sistema. */
export async function DELETE(req: Request, ctx: RouteContext<"/api/projects/[id]/images">) {
  const { id } = await ctx.params;
  if (!exists(id)) return faltaProyecto();
  const file = new URL(req.url).searchParams.get("file");
  if (!file) return Response.json({ error: "Falta el archivo." }, { status: 400 });
  try {
    await removeImage(id, file);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  emit(id, { type: "refresh" });
  return Response.json({ ok: true, images: listImages(id) });
}
