import { fileResponse, safeJoin } from "@/lib/server/fsutil";
import { exists, readMeta, paths } from "@/lib/server/projects";

export const dynamic = "force-dynamic";

const ALLOWED = /^(versions\/v\d+\.mp4|thumb\.jpg|cut\.mp4|scenes\/[\w-]+\.(mp4|webm)|raw\/original\.\w+)$/;

/** Sirve archivos del proyecto (videos con Range). ?download=1 para descargar. */
export async function GET(req: Request, ctx: RouteContext<"/api/projects/[id]/file/[...path]">) {
  const { id, path: parts } = await ctx.params;
  if (!exists(id)) return new Response("No existe", { status: 404 });
  const rel = parts.join("/");
  if (!ALLOWED.test(rel)) return new Response("No permitido", { status: 403 });
  const file = safeJoin(paths(id).dir, rel);
  const url = new URL(req.url);
  let download: string | undefined;
  if (url.searchParams.get("download")) {
    const title = readMeta(id).title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || id;
    download = `${title}-${parts[parts.length - 1]}`;
  }
  return fileResponse(file, req, download);
}
