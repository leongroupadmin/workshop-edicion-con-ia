import { accionPendiente, busy, clonDir, interrumpido, launch, readJob, saveJob } from "@/lib/clon/server";
import { estadoClaves } from "@/lib/clon/storage";
import { armarBloques, contarPalabras, maxPalabras, segundosPara } from "@/lib/clon/guion";
import { encuadreDe, reglasDe, type ClonJob } from "@/lib/clon/types";
import { moveToTrash } from "@/lib/server/fsutil";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

const leer = async (ctx: Context) => {
  const { id } = await ctx.params;
  return readJob(id);
};

export async function GET(_req: Request, ctx: Context) {
  try {
    const job = await leer(ctx);
    return Response.json({ job, running: busy(job.id), interrumpido: interrumpido(job), claves: estadoClaves() });
  } catch {
    return Response.json({ error: "No encontré este clon." }, { status: 404 });
  }
}

type Cambio = { id?: string; texto?: string };

/**
 * Aplica los textos editados. Antes de aprobar se puede cambiar todo (y un
 * bloque largo se parte en varios). Si falló un bloque, solo se puede cambiar
 * ese (sin pasarse de largo), para reintentarlo sin tocar los que ya están.
 */
const aplicarCambios = (job: ClonJob, cambios: unknown) => {
  if (!Array.isArray(cambios)) throw new Error("Lista de bloques inválida.");
  const lista = cambios as Cambio[];
  if (lista.some((c) => typeof c?.texto !== "string")) throw new Error("Lista de bloques inválida.");
  const reglas = reglasDe(job.settings.modelo);
  if (job.paso === "esperando_aprobacion") {
    const bloques = armarBloques(lista.map((c) => c.texto!), encuadreDe(job), reglas);
    if (!bloques.length) throw new Error("El guion quedó vacío.");
    job.guion.bloques = bloques;
    return;
  }
  if (job.paso === "error" && job.fallo === "generar") {
    for (const c of lista) {
      const b = job.guion.bloques.find((x) => x.id === c.id);
      if (!b) throw new Error("Bloque inválido.");
      const texto = c.texto!.replace(/\s+/g, " ").trim();
      if (texto === b.texto) continue;
      if (b.estado !== "error") throw new Error("Solo se puede cambiar el bloque que falló.");
      if (!texto) throw new Error("El bloque no puede quedar vacío.");
      if (contarPalabras(texto) > maxPalabras(reglas))
        throw new Error(`El bloque quedó largo: dejalo en ${maxPalabras(reglas)} palabras o menos.`);
      Object.assign(b, { texto, segundos: segundosPara(texto, reglas), estado: "pendiente" });
      delete b.taskId;
      delete b.url;
      delete b.intentosBajada;
    }
    return;
  }
  throw new Error("El guion ya está aprobado: no se puede cambiar.");
};

/** Guarda los textos editados (se llama sola al salir de un bloque). */
export async function PUT(req: Request, ctx: Context) {
  try {
    const job = await leer(ctx);
    if (busy(job.id)) return Response.json({ error: "Este clon está trabajando. Esperá a que termine." }, { status: 409 });
    const body = await req.json();
    aplicarCambios(job, body.bloques);
    saveJob(job);
    return Response.json({ job });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}

/**
 * El único botón: aprueba el guion y crea el video, o reintenta lo que falló
 * (solo los bloques que faltan: los que ya están no se vuelven a pagar).
 */
export async function POST(req: Request, ctx: Context) {
  try {
    const job = await leer(ctx);
    if (busy(job.id)) return Response.json({ error: "Este clon ya está trabajando." }, { status: 409 });
    const body = (await req.json().catch(() => ({}))) as { bloques?: unknown; accion?: string; nivel?: unknown };
    const claves = estadoClaves();
    // "Mejorar la sincronización": rehace solo el ajuste del video con otro nivel
    // (reusa la voz de Cartesia y las palabras de Whisper: no se paga nada).
    if (body.accion === "sincro") {
      if (job.paso !== "listo" || job.voz?.metodo !== "lectura")
        throw new Error("La sincronización se puede mejorar cuando el video está listo.");
      if (body.nivel !== 1 && body.nivel !== 2 && body.nivel !== 3) throw new Error("Nivel de sincronización inválido.");
      if (!claves.cartesia.cargada) throw new Error("Falta la clave de Cartesia. Cargala en la pestaña Personajes.");
      job.nivelSincro = body.nivel;
      saveJob(job);
      launch(job.id, "voz");
      return Response.json({ ok: true, job: readJob(job.id) });
    }
    if (body.bloques !== undefined) aplicarCambios(job, body.bloques);
    const accion = job.paso === "esperando_aprobacion" ? "generar" : accionPendiente(job);
    if (!accion) throw new Error("No hay nada para hacer ahora.");
    if (accion === "generar" && !claves.kie.cargada) throw new Error("Falta la clave de Kie. Cargala en la pestaña Personajes.");
    if (accion !== "guion" && !claves.cartesia.cargada) throw new Error("Falta la clave de Cartesia. Cargala en la pestaña Personajes.");
    if (job.paso === "esperando_aprobacion") {
      const reglas = reglasDe(job.settings.modelo);
      if (job.guion.bloques.some((b) => contarPalabras(b.texto) > maxPalabras(reglas) || b.segundos > reglas.max))
        throw new Error("Hay un bloque demasiado largo.");
      job.guion.aprobadoAt = new Date().toISOString();
    }
    saveJob(job);
    launch(job.id, accion);
    return Response.json({ ok: true, job: readJob(job.id) });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
}

/** Manda el clon a la Papelera (recuperable). El proyecto de edición, si hay, queda. */
export async function DELETE(_req: Request, ctx: Context) {
  let job: ClonJob;
  try {
    job = await leer(ctx);
  } catch {
    return Response.json({ error: "No encontré este clon." }, { status: 404 });
  }
  if (busy(job.id)) return Response.json({ error: "Esperá a que termine antes de eliminarlo." }, { status: 409 });
  try {
    await moveToTrash([clonDir(job.id)]);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
