import { abrirLogin, abrirLoginOpenAI, leerCuenta, leerCuentaOpenAI } from "@/lib/server/cuenta";
import { readDefaultSettings, writeDefaultSettings } from "@/lib/server/projects";
import type { Settings } from "@/lib/types";

export const dynamic = "force-dynamic";

const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));
const error = (e: unknown) => Response.json({ error: mensaje(e) }, { status: 500 });

/**
 * GET: con qué cuentas de Claude y de ChatGPT funciona el panel, y cuál IA
 * arranca elegida en los videos nuevos. Si una no se puede leer (por ejemplo,
 * Codex no está instalado), la otra se muestra igual.
 */
export async function GET() {
  const [claude, openai] = await Promise.allSettled([leerCuenta(), leerCuentaOpenAI()]);
  return Response.json({
    cuenta: claude.status === "fulfilled" ? claude.value : null,
    cuentaError: claude.status === "rejected" ? mensaje(claude.reason) : null,
    openai: openai.status === "fulfilled" ? openai.value : null,
    openaiError: openai.status === "rejected" ? mensaje(openai.reason) : null,
    aiProvider: readDefaultSettings().aiProvider,
  });
}

/**
 * POST: "cambiar" abre el login de Claude en una Terminal; "conectar-openai"
 * abre el login de ChatGPT; "proveedor" elige la IA con la que arrancan los
 * videos nuevos.
 */
export async function POST(req: Request) {
  const { action, email, aiProvider } = (await req.json().catch(() => ({}))) as {
    action?: string;
    email?: string;
    aiProvider?: Settings["aiProvider"];
  };
  try {
    if (action === "cambiar") {
      await abrirLogin(email);
      return Response.json({ ok: true });
    }
    if (action === "conectar-openai") {
      await abrirLoginOpenAI();
      return Response.json({ ok: true });
    }
    if (action === "proveedor") {
      if (aiProvider !== "anthropic" && aiProvider !== "openai") {
        return Response.json({ error: "IA desconocida." }, { status: 400 });
      }
      writeDefaultSettings({ ...readDefaultSettings(), aiProvider });
      return Response.json({ ok: true, aiProvider });
    }
    return Response.json({ error: "Acción desconocida." }, { status: 400 });
  } catch (e) {
    return error(e);
  }
}
