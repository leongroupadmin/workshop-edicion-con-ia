import path from "node:path";
import { tail } from "@/lib/server/fsutil";
import { exists, paths } from "@/lib/server/projects";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/projects/[id]/logs">) {
  const { id } = await ctx.params;
  if (!exists(id)) return Response.json({ error: "No existe el proyecto" }, { status: 404 });
  const dir = paths(id).logs;
  return Response.json({
    pipeline: tail(path.join(dir, "pipeline.log"), 150),
    jobs: tail(path.join(dir, "jobs.log"), 150),
    agent: tail(path.join(dir, "agent.log"), 150),
  });
}
