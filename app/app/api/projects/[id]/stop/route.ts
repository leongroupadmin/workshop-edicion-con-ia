import { setRunning, store } from "@/lib/server/bus";
import { writeStatus } from "@/lib/server/projects";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: RouteContext<"/api/projects/[id]/stop">) {
  const { id } = await ctx.params;
  const r = store.running.get(id);
  if (!r) return Response.json({ ok: true });
  r.abort?.();
  if (r.kind === "job") {
    setRunning(id, null);
    writeStatus(id, "error", "Proceso detenido por el usuario.");
  }
  return Response.json({ ok: true });
}
