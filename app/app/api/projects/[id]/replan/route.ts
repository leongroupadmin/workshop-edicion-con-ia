import { isBusy } from "@/lib/server/agent";
import { emit } from "@/lib/server/bus";
import { replanWithStyle } from "@/lib/server/pipeline";
import { exists } from "@/lib/server/projects";

export const dynamic = "force-dynamic";

/** Claude rehace el plan con el ritmo y el estilo de gráficos actuales. */
export async function POST(_req: Request, ctx: RouteContext<"/api/projects/[id]/replan">) {
  const { id } = await ctx.params;
  if (!exists(id)) return Response.json({ error: "No existe el proyecto" }, { status: 404 });
  try {
    if (isBusy(id)) throw new Error("Claude o un render ya están trabajando. Esperá a que termine.");
    replanWithStyle(id);
    emit(id, { type: "refresh" });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 409 });
  }
}
