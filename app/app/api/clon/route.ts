import { listClones } from "@/lib/clon/server";
import { crearClon, type DatosClon } from "@/lib/clon/crear";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return Response.json({ clones: listClones() });
}

/**
 * Pasos 1 y 2: personaje + formato + guion. Con un guion pegado queda listo
 * para aprobar; con un brief, la IA lo escribe en segundo plano.
 * (El modo Clon + B-roll entra por /api/clon/broll, con el video.)
 */
export async function POST(req: Request) {
  try {
    const id = await crearClon((await req.json()) as DatosClon);
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}
