import { estadoClaves, guardarClave, leerClave, type Servicio } from "@/lib/clon/storage";
import { probarClave as probarKie } from "@/lib/clon/kie";
import { probarClave as probarCartesia } from "@/lib/clon/cartesia";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * "Probar conexión": con una clave nueva la prueba y, si funciona, la guarda en
 * assets/personajes/claves.json. Sin clave, prueba la que ya está cargada.
 * Nunca devuelve el valor de una clave.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { servicio?: string; clave?: string };
    const servicio = body.servicio as Servicio;
    if (servicio !== "kie" && servicio !== "cartesia") throw new Error("Servicio desconocido.");
    const nueva = typeof body.clave === "string" ? body.clave.trim() : "";
    if (nueva.length > 500) throw new Error("Esa clave es demasiado larga.");
    const clave = nueva || leerClave(servicio);
    if (!clave) throw new Error("Pegá la clave primero.");
    const probar = servicio === "kie" ? probarKie : probarCartesia;
    const resultado = await probar(clave);
    if (resultado.ok && nueva) guardarClave(servicio, nueva);
    return Response.json({ ...resultado, guardada: resultado.ok && Boolean(nueva), claves: estadoClaves() });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}

/** Quita la clave guardada en el panel (la del entorno, si hay, sigue). */
export async function DELETE(req: Request) {
  const servicio = new URL(req.url).searchParams.get("servicio");
  if (servicio !== "kie" && servicio !== "cartesia") return Response.json({ error: "Servicio desconocido." }, { status: 400 });
  guardarClave(servicio, null);
  return Response.json({ claves: estadoClaves() });
}
