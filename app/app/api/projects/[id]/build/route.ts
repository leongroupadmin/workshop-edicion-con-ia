import { build } from "@/lib/server/build";
import { emit } from "@/lib/server/bus";
import { exists } from "@/lib/server/projects";

export const dynamic = "force-dynamic";

/** Botón Renderizar / Re-renderizar: hace todo lo necesario y arma una versión nueva. */
export async function POST(_req: Request, ctx: RouteContext<"/api/projects/[id]/build">) {
  const { id } = await ctx.params;
  if (!exists(id)) return Response.json({ error: "No existe el proyecto" }, { status: 404 });
  try {
    build(id);
    emit(id, { type: "refresh" });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 409 });
  }
}
