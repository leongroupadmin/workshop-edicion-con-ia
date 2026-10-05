import { emit } from "@/lib/server/bus";
import { writeJson } from "@/lib/server/fsutil";
import { applyLayoutUse } from "@/lib/server/pipeline";
import { exists, paths, readSettings } from "@/lib/server/projects";
import { normalizeSettings } from "@/lib/server/settings";
import type { Settings } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Guarda los ajustes del proyecto (se llama en cada cambio del panel). No
 * renderiza: el video se actualiza con el botón Renderizar (ver build.ts).
 */
export async function POST(req: Request, ctx: RouteContext<"/api/projects/[id]/settings">) {
  const { id } = await ctx.params;
  if (!exists(id)) return Response.json({ error: "No existe el proyecto" }, { status: 404 });
  const { settings: patch } = (await req.json()) as { settings: Partial<Settings> };
  const before = readSettings(id);
  const next = normalizeSettings(patch, before);
  writeJson(paths(id).settings, next);
  // "Cómo se ven los gráficos" (que no sea "auto") cambia el plan actual
  const layouts =
    before.style.layoutUse !== next.style.layoutUse ? applyLayoutUse(id, next.style.layoutUse) : { changed: 0 };
  emit(id, { type: "refresh" });
  return Response.json({ settings: next, layouts });
}
