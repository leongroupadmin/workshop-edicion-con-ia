import { runAgent } from "@/lib/server/agent";
import { exists } from "@/lib/server/projects";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: RouteContext<"/api/projects/[id]/chat">) {
  const { id } = await ctx.params;
  if (!exists(id)) return Response.json({ error: "No existe el proyecto" }, { status: 404 });
  const { message } = (await req.json()) as { message?: string };
  if (!message?.trim()) return Response.json({ error: "Mensaje vacío" }, { status: 400 });
  try {
    const entryId = runAgent(id, message.trim(), { kind: "chat" });
    return Response.json({ ok: true, entryId });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 409 });
  }
}
