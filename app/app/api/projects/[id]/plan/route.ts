import { isBusy } from "@/lib/server/agent";
import { emit } from "@/lib/server/bus";
import { requestPlanChanges, setItemLayout, setItemRemoved } from "@/lib/server/pipeline";
import { exists } from "@/lib/server/projects";

import type { SceneLayout } from "@/lib/types";

export const dynamic = "force-dynamic";

type Body =
  | { action: "remove" | "restore"; itemId: string }
  | { action: "layout"; itemId: string; layout: SceneLayout }
  | { action: "changes"; message: string };

export async function POST(req: Request, ctx: RouteContext<"/api/projects/[id]/plan">) {
  const { id } = await ctx.params;
  if (!exists(id)) return Response.json({ error: "No existe el proyecto" }, { status: 404 });
  const body = (await req.json()) as Body;
  try {
    if (body.action === "remove" || body.action === "restore") {
      const plan = setItemRemoved(id, body.itemId, body.action === "remove");
      emit(id, { type: "refresh" });
      return Response.json({ plan });
    }
    if (body.action === "layout") {
      const plan = setItemLayout(id, body.itemId, body.layout);
      emit(id, { type: "refresh" });
      return Response.json({ plan });
    }
    if (isBusy(id)) throw new Error("Claude o un render ya están trabajando. Esperá a que termine.");
    if (body.action === "changes") {
      if (!body.message?.trim()) throw new Error("Escribí qué cambios querés.");
      requestPlanChanges(id, body.message.trim());
    }
    emit(id, { type: "refresh" });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 409 });
  }
}
