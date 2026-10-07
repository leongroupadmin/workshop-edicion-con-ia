import fs from "node:fs";
import { isBusy, runAgent } from "@/lib/server/agent";
import { planPrompt, startPrepare } from "@/lib/server/pipeline";
import { exists, paths, readSettings } from "@/lib/server/projects";

export const dynamic = "force-dynamic";

/**
 * Reintentar después de un error: si falta el corte, rehace los pasos 1-2;
 * si ya está cortado y no hay plan, se lo pide a Claude.
 */
export async function POST(_req: Request, ctx: RouteContext<"/api/projects/[id]/retry">) {
  const { id } = await ctx.params;
  if (!exists(id)) return Response.json({ error: "No existe el proyecto" }, { status: 404 });
  if (isBusy(id)) return Response.json({ error: "Hay otro proceso corriendo." }, { status: 409 });
  const p = paths(id);
  try {
    if (!fs.existsSync(p.cut) || !fs.existsSync(p.cutTranscript)) startPrepare(id);
    else if (!fs.existsSync(p.plan))
      runAgent(id, planPrompt(id), {
        kind: "plan",
        role: "system",
        visibleText: `Reintentando: pidiéndole a ${readSettings(id).aiProvider === "openai" ? "OpenAI" : "Claude"} el plan de edición…`,
      });
    else return Response.json({ error: "No hay nada para reintentar: usá el chat o los botones del plan." }, { status: 400 });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 409 });
  }
}
