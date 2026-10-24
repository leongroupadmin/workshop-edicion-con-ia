import { listPersonajes, estadoClaves } from "@/lib/clon/storage";
import { crearPersonaje } from "@/lib/clon/personajes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Personajes guardados + si cada clave de API está cargada (nunca el valor). */
export async function GET() {
  return Response.json({ personajes: listPersonajes(), claves: estadoClaves() });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    return Response.json({ personaje: crearPersonaje(body) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}
