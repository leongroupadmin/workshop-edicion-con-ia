import { abrirLogin, cerrarSesion, leerCuenta } from "@/lib/server/cuenta";

export const dynamic = "force-dynamic";

const error = (e: unknown) => Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });

/** GET: con qué cuenta de Claude está funcionando el panel. */
export async function GET() {
  try {
    return Response.json({ cuenta: await leerCuenta() });
  } catch (e) {
    return error(e);
  }
}

/** POST: "cambiar" abre el login en una Terminal; "salir" cierra la sesión. */
export async function POST(req: Request) {
  const { action, email } = (await req.json().catch(() => ({}))) as { action?: string; email?: string };
  try {
    if (action === "cambiar") {
      await abrirLogin(email);
      return Response.json({ ok: true });
    }
    if (action === "salir") {
      await cerrarSesion();
      return Response.json({ ok: true, cuenta: await leerCuenta() });
    }
    return Response.json({ error: "Acción desconocida." }, { status: 400 });
  } catch (e) {
    return error(e);
  }
}
