import { deleteVersion, exists } from "@/lib/server/projects";

export const dynamic = "force-dynamic";

/** Eliminar una versión (vN.mp4 + vN.json van a la Papelera del sistema). */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/projects/[id]/versions/[n]">) {
  const { id, n } = await ctx.params;
  if (!exists(id)) return Response.json({ error: "No existe el proyecto" }, { status: 404 });
  if (!/^\d+$/.test(n)) return Response.json({ error: "Versión inválida" }, { status: 400 });
  try {
    await deleteVersion(id, Number(n));
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
