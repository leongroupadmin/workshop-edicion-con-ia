import { fullState } from "@/lib/server/build";
import { deleteProject, exists, writeMeta } from "@/lib/server/projects";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/projects/[id]">) {
  const { id } = await ctx.params;
  if (!exists(id)) return Response.json({ error: "No existe el proyecto" }, { status: 404 });
  return Response.json(fullState(id));
}

/** Renombrar el proyecto. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/projects/[id]">) {
  const { id } = await ctx.params;
  if (!exists(id)) return Response.json({ error: "No existe el proyecto" }, { status: 404 });
  const body = (await req.json()) as { title?: string };
  if (body.title?.trim()) writeMeta(id, { title: body.title.trim().slice(0, 120) });
  return Response.json(fullState(id));
}

/** Eliminar el proyecto (va a la Papelera de la Mac). */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/projects/[id]">) {
  const { id } = await ctx.params;
  if (!exists(id)) return Response.json({ error: "No existe el proyecto" }, { status: 404 });
  try {
    await deleteProject(id);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 409 });
  }
}
