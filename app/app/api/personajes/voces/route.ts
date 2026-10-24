import { leerClave } from "@/lib/clon/storage";
import { listarVoces, type Voz } from "@/lib/clon/cartesia";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Las voces cambian poco: se guardan 10 minutos para no pedirlas en cada pantalla.
let cache: { clave: string; hasta: number; voces: Voz[] } | null = null;

/** Voces de Cartesia (primero las de español). */
export async function GET() {
  const clave = leerClave("cartesia");
  if (!clave) return Response.json({ voces: [], faltaClave: true });
  try {
    if (!cache || cache.clave !== clave || cache.hasta < Date.now()) {
      cache = { clave, hasta: Date.now() + 10 * 60_000, voces: await listarVoces(clave) };
    }
    return Response.json({ voces: cache.voces, faltaClave: false });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 502 });
  }
}
