import { BRAND_DIR, fileResponse, safeJoin } from "@/lib/server/fsutil";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: RouteContext<"/api/brand/file/[...path]">) {
  const { path: parts } = await ctx.params;
  try {
    return fileResponse(safeJoin(BRAND_DIR, parts.join("/")), req);
  } catch {
    return new Response("No permitido", { status: 403 });
  }
}
