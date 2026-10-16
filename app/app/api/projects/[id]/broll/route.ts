import fs from "node:fs";
import path from "node:path";
import { emit } from "@/lib/server/bus";
import { safeFilename, saveBody } from "@/lib/server/fsutil";
import { BROLL_EXTS } from "@/lib/server/images";
import { exists, paths } from "@/lib/server/projects";

export const dynamic = "force-dynamic";

const listBroll = (id: string) => {
  const dir = paths(id).broll;
  if (!fs.existsSync(dir)) return [] as string[];
  return fs.readdirSync(dir).filter((file: string) => BROLL_EXTS.includes(path.extname(file).toLowerCase())).sort();
};

export async function GET(_req: Request, ctx: RouteContext<"/api/projects/[id]/broll">) {
  const { id } = await ctx.params;
  if (!exists(id)) return Response.json({ error: "No existe el proyecto" }, { status: 404 });
  return Response.json({ broll: listBroll(id) });
}

export async function POST(req: Request, ctx: RouteContext<"/api/projects/[id]/broll">) {
  const { id } = await ctx.params;
  if (!exists(id)) return Response.json({ error: "No existe el proyecto" }, { status: 404 });
  const original = decodeURIComponent(req.headers.get("x-filename") ?? "broll.mp4");
  const ext = path.extname(original).toLowerCase();
  if (!BROLL_EXTS.includes(ext)) return Response.json({ error: "Formato no soportado (MP4, MOV, WEBM o M4V)." }, { status: 400 });
  const file = safeFilename(original);
  await saveBody(req, path.join(paths(id).broll, file));
  emit(id, { type: "refresh" });
  return Response.json({ ok: true, file, broll: listBroll(id) });
}
