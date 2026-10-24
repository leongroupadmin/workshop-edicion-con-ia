import { busy, pasarAEdicion, readJob } from "@/lib/clon/server";
import type { Settings } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Paso 5: crea el proyecto de edición con el video del clon, la marca y los ajustes elegidos en "Nuevo video". */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    readJob(id);
    if (busy(id)) return Response.json({ error: "Este clon todavía está trabajando." }, { status: 409 });
    const body = (await req.json().catch(() => ({}))) as { brand?: string; settings?: unknown };
    const elegidos = body.settings && typeof body.settings === "object" ? (body.settings as Partial<Settings>) : {};
    const proyectoId = pasarAEdicion(id, typeof body.brand === "string" ? body.brand : "", elegidos);
    return Response.json({ proyectoId });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}
