/**
 * Worker del pipeline de clon (corre afuera del panel).
 *
 *   npx tsx scripts/clon/worker.ts <id> guion     → la IA redacta el guion en bloques
 *   npx tsx scripts/clon/worker.ts <id> generar   → un clip de Kie por bloque, pegado y voz
 *   npx tsx scripts/clon/worker.ts <id> voz       → solo la voz (Cartesia lee el guion) y el ajuste del video
 *
 * Voz: Cartesia lee el guion con la voz del personaje y el video se ajusta a
 * esa voz palabra por palabra (scripts/clon/sincro.ts).
 * Guarda job.json después de cada cambio para que el panel muestre el avance.
 * Si un bloque falla, los demás quedan guardados: al reintentar solo se vuelve
 * a pedir (y pagar) el que falló.
 */
import fs from "node:fs";
import path from "node:path";
import { clonDir, readJob, saveJob, claim, leerClave } from "./storage";
import { subirFoto, crearTarea, esperarTarea, bajar, FalloKie } from "./kie";
import { leerTexto } from "./cartesia";
import { armarPartido } from "./partido";
import { COLA_S, NIVELES, ajustarConSilencios, armarVideo, calcularAnclas, calcularPiezas, desfases } from "./sincro";
import { transcribeFile } from "../transcribe";
import { redactarGuion } from "./guion-ia";
import { armarBloques, avisoDuracion, duracionGuion, faltanGanchoOCta, promptBloque } from "../../app/lib/clon/guion";
import { MODELOS, encuadreDe, energiaDe, modeloDe, registroDe, reglasDe, textoAcento, type Bloque, type ClonAccion, type ClonJob } from "../../app/lib/clon/types";
import { run, probeVideo, probeDurationMs, detectSilences } from "../lib/media";
import type { Transcript } from "../../src/pipeline/types";

/** Pedidos a Kie en paralelo como máximo. */
const PARALELO = 3;

const log = (msg: string) => console.log(`[${new Date().toISOString()}] ${msg}`);

const enParalelo = async <T>(items: T[], max: number, fn: (item: T) => Promise<void>) => {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(max, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
};

/** El clip existe, tiene imagen y sonido, y dura lo que se pidió. */
const verificarClip = async (archivo: string, segundos: number) => {
  if (!fs.existsSync(archivo) || fs.statSync(archivo).size < 1000) throw new Error("El clip bajó vacío.");
  const info = await probeVideo(archivo);
  if (!info.width) throw new Error("El clip no tiene imagen.");
  if (!info.hasAudio) throw new Error("El clip vino sin sonido.");
  const s = info.durationMs / 1000;
  if (s < segundos - 1 || s > segundos + 2) throw new Error(`El clip dura ${s.toFixed(1)} s y se pidieron ${segundos} s.`);
};

const ffmpeg = (args: string[]) => run("ffmpeg", ["-y", "-v", "error", ...args]);

/** Volumen percibido de un audio (LUFS integrado, EBU R128). */
const volumen = async (archivo: string) => {
  const { stderr } = await run("ffmpeg", ["-nostats", "-i", archivo, "-af", "ebur128", "-f", "null", "-"]);
  const m = /Integrated loudness:\s*I:\s*(-?[\d.]+)\s*LUFS/.exec(stderr);
  if (!m) throw new Error("No se pudo medir el volumen de la voz.");
  return Number(m[1]);
};

/** Más de esto de diferencia de volumen se corrige (Cartesia devuelve la voz más baja). */
const VOLUMEN_MAX_DB = 1;
/** Volumen al que se lleva la voz del clon (voz en redes) y cuánto puede bajar el limitador un pico. */
const VOLUMEN_OBJETIVO_LUFS = -16;
const LIMITADOR_MAX_DB = 3;

/** Pico más alto de un audio, en dB (0 = el máximo). */
const picoDb = async (archivo: string) => {
  const { stderr } = await run("ffmpeg", ["-nostats", "-i", archivo, "-af", "astats=measure_perchannel=none", "-f", "null", "-"]);
  const m = /Peak level dB:\s*(-?[\d.]+|-inf)/.exec(stderr);
  return m && m[1] !== "-inf" ? Number(m[1]) : -20;
};

/**
 * Recorta la foto al centro con la proporción del video (9:16 o 16:9) y la
 * achica a 2048 px como máximo (Grok acepta hasta 10 MB). Devuelve el JPG nuevo.
 */
export const recortarFoto = async (foto: string, aspectRatio: "9:16" | "16:9" | "1:1") => {
  const [w, h] = aspectRatio.split(":").map(Number);
  const destino = path.join(path.dirname(foto), `foto-${w}x${h}.jpg`);
  // Cuadrada (modo B-roll): se recorta más de abajo que de arriba para no cortar la cabeza.
  const y = aspectRatio === "1:1" ? ":(ih-oh)*0.3" : "";
  await ffmpeg([
    "-i", foto,
    "-vf", `crop='min(iw,ih*${w}/${h})':'min(ih,iw*${h}/${w})'${y ? `:(iw-ow)/2${y}` : ""},scale='min(2048,iw)':'min(2048,ih)':force_original_aspect_ratio=decrease`,
    "-frames:v", "1", "-q:v", "2", destino,
  ]);
  return destino;
};

export async function procesar(id: string, accion: string, ownsLock = false) {
  const release = ownsLock ? () => fs.rmSync(path.join(clonDir(id), ".lock"), { force: true }) : claim(id);
  const dir = clonDir(id);
  const job = readJob(id);
  const guardar = () => saveJob(job);
  const paso = (p: ClonJob["paso"], mensaje: string) => {
    Object.assign(job, { paso: p, mensaje, error: undefined, fallo: undefined });
    guardar();
    log(mensaje);
  };
  let actual: ClonAccion = accion as ClonAccion;

  // ---------- 2. guion con IA ----------
  const guion = async () => {
    const { hook, cta } = job.guion;
    if (!job.guion.brief?.trim() && !hook && !cta) throw new Error("Falta el brief para escribir el guion.");
    paso("guion", `${job.settings.aiProvider === "openai" ? "OpenAI" : "Claude"} está escribiendo el guion…`);
    const pedir = (corregir?: string[]) =>
      redactarGuion({
        brief: job.guion.brief ?? "",
        hook,
        cta,
        corregir,
        nombre: job.personaje.nombre,
        descripcion: job.personaje.descripcion,
        acento: textoAcento(job.personaje).guion,
        energia: energiaDe(job.personaje.energia).label,
        registro: registroDe(job.personaje.registro).guion,
        duracionObjetivoS: job.settings.duracionObjetivoS,
        broll: job.modo === "broll",
        aiProvider: job.settings.aiProvider,
        reglas: reglasDe(job.settings.modelo),
      });
    let textos = await pedir();
    // El gancho y el CTA van tal cual: si la IA los cambió, se le pide una vez más.
    let faltan = faltanGanchoOCta(textos, hook, cta);
    if (faltan.length) {
      log(`la IA no respetó ${faltan.join(" ni ")}; reintento`);
      textos = await pedir(faltan);
      faltan = faltanGanchoOCta(textos, hook, cta);
    }
    job.guion.bloques = armarBloques(textos, encuadreDe(job), reglasDe(job.settings.modelo));
    const n = job.guion.bloques.length;
    const s = duracionGuion(job.guion.bloques);
    paso(
      "esperando_aprobacion",
      `Guion listo: ${n} bloque${n === 1 ? "" : "s"}, unos ${s} s. Revisalo y aprobalo.` +
        (job.broll ? avisoDuracion(s, job.broll.duracionS) : "") +
        (faltan.length ? ` Ojo: la IA cambió ${faltan.join(" y ")}; corregilo antes de aprobar.` : ""),
    );
  };

  // ---------- 3. un clip por bloque + pegado ----------
  const generar = async () => {
    if (!job.guion.aprobadoAt) throw new Error("Primero aprobá el guion.");
    if (!job.guion.bloques.length) throw new Error("El guion está vacío.");
    const clave = leerClave("kie");
    if (!clave) throw new Error("Falta la clave de Kie. Cargala en la pestaña Personajes.");
    const clipsDir = path.join(dir, "clips");
    fs.mkdirSync(clipsDir, { recursive: true });
    const archivo = (b: Bloque) => `c${job.guion.bloques.indexOf(b) + 1}.mp4`;
    const listo = (b: Bloque) => b.estado === "listo" && b.file && fs.existsSync(path.join(clipsDir, b.file));
    const total = job.guion.bloques.length;
    const avance = () => {
      job.mensaje = `Creando los clips: ${job.guion.bloques.filter(listo).length} de ${total} listos…`;
      guardar();
    };
    paso("generando", "Preparando los clips…");

    const pendientes = job.guion.bloques.filter((b) => !listo(b));
    let foto: Promise<string> | null = null;
    // Con B-roll el personaje va en media pantalla (casi cuadrada): se pide cuadrado
    // (Gemini no tiene cuadrado: horizontal, y la cara queda al centro).
    const aspectRatio =
      job.modo === "broll"
        ? modeloDe(job.settings.modelo) === "gemini-omni-video"
          ? "16:9"
          : "1:1"
        : job.settings.formato === "vertical"
          ? "9:16"
          : "16:9";
    // La foto se recorta al formato del video: Grok, con una sola foto, saca el formato de la foto.
    const fotoUrl = () => (foto ??= recortarFoto(path.join(dir, job.personaje.foto), aspectRatio).then((f) => subirFoto(clave, f)));

    await enParalelo(pendientes, PARALELO, async (b) => {
      const n = job.guion.bloques.indexOf(b) + 1;
      try {
        delete b.error;
        if (!b.url) {
          // Con taskId ya pagado (p.ej. se cortó mientras esperaba) se vuelve a consultar, no se pide de nuevo.
          if (!b.taskId) {
            b.estado = "generando";
            guardar();
            b.taskId = await crearTarea(clave, {
              prompt: promptBloque(b, job.personaje, { en: MODELOS[modeloDe(job.settings.modelo)].promptEn }),
              fotoUrl: await fotoUrl(),
              segundos: b.segundos,
              aspectRatio,
              resolucion: job.settings.resolucion,
              modelo: job.settings.modelo,
            });
            log(`bloque ${n}: pedido ${b.taskId}`);
          }
          b.estado = "generando";
          guardar();
          const r = await esperarTarea(clave, b.taskId, { onEstado: (e) => log(`bloque ${n}: ${e}`) });
          b.url = r.url;
          b.creditos = r.creditos;
          guardar();
        }
        b.estado = "bajando";
        guardar();
        const file = archivo(b);
        await bajar(b.url, path.join(clipsDir, file));
        await verificarClip(path.join(clipsDir, file), b.segundos);
        Object.assign(b, { file, estado: "listo", intentosBajada: undefined });
        log(`bloque ${n}: listo`);
      } catch (e) {
        b.estado = "error";
        b.error = (e as Error).message;
        if (e instanceof FalloKie) {
          // Kie lo rechazó: al reintentar hay que pedirlo de nuevo.
          delete b.taskId;
        } else if (b.url) {
          // Falló la bajada o la verificación: se vuelve a bajar gratis una vez; si sigue mal, se pide de nuevo.
          b.intentosBajada = (b.intentosBajada ?? 0) + 1;
          if (b.intentosBajada >= 2) {
            delete b.url;
            delete b.taskId;
            delete b.intentosBajada;
          }
        }
        log(`bloque ${n}: error — ${b.error}`);
      }
      avance();
    });

    const fallados = job.guion.bloques.filter((b) => b.estado === "error");
    if (fallados.length) {
      const nombres = fallados.map((b) => `bloque ${job.guion.bloques.indexOf(b) + 1}`).join(", ");
      throw new Error(
        `Falló ${nombres}: ${fallados[0].error!.replace(/\.?$/, ".")} Tocá "Reintentar": solo se vuelve a pedir ${fallados.length === 1 ? "ese bloque" : "esos bloques"}, los demás ya están guardados.`,
      );
    }

    job.mensaje = "Pegando los clips…";
    guardar();
    const clips = job.guion.bloques.map((b) => path.join(clipsDir, b.file!));
    const lista = path.join(dir, "lista.txt");
    fs.writeFileSync(lista, clips.map((c) => `file '${c.replace(/'/g, "'\\''")}'`).join("\n"));
    const pegado = path.join(dir, "pegado.mp4");
    const tmp = path.join(dir, ".pegado.tmp.mp4");
    let esperado = 0;
    for (const c of clips) esperado += await probeDurationMs(c);
    const bien = async () => {
      const info = await probeVideo(tmp);
      return info.hasAudio && Math.abs(info.durationMs - esperado) < 500;
    };
    try {
      await ffmpeg(["-f", "concat", "-safe", "0", "-i", lista, "-c", "copy", "-movflags", "+faststart", tmp]);
      if (!(await bien())) throw new Error("el pegado sin re-encodear salió mal");
    } catch (e) {
      log(`pegado con -c copy no anduvo (${(e as Error).message.split("\n")[0]}), re-encodeando…`);
      await ffmpeg([
        "-f", "concat", "-safe", "0", "-i", lista,
        "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", tmp,
      ]);
      if (!(await bien())) throw new Error("No se pudieron pegar los clips: el video pegado no dura lo que suman los clips.");
    }
    fs.renameSync(tmp, pegado);
    log(`pegado: ${(esperado / 1000).toFixed(2)} s`);
  };

  // ---------- 4. voz: Cartesia lee el guion y el video se ajusta a esa voz ----------
  const voz = async () => {
    const vozId = job.personaje.vozId;
    if (!vozId) throw new Error("El personaje no tiene voz elegida. Elegila en la pestaña Personajes y creá el clon de nuevo.");
    const clave = leerClave("cartesia");
    if (!clave) throw new Error("Falta la clave de Cartesia. Cargala en la pestaña Personajes.");
    const pegado = path.join(dir, "pegado.mp4");
    if (!fs.existsSync(pegado)) throw new Error("Falta el video pegado. Volvé a crear el video.");
    const trabajo = path.join(dir, "sincro");
    fs.mkdirSync(trabajo, { recursive: true });

    // 1. Cartesia lee el guion entero (se reusa si ya lo leyó igual: no se vuelve a pagar).
    paso("voz", "Cartesia está leyendo el guion…");
    const texto = job.guion.bloques.map((b) => b.texto).join(" ").replace(/[“”"]/g, "").trim();
    const emocion = energiaDe(job.personaje.energia).cartesia;
    const lectura = path.join(dir, "voz-cartesia.wav");
    const firma = path.join(trabajo, "lectura.json");
    const pedido = JSON.stringify({ texto, vozId, emocion });
    if (!fs.existsSync(lectura) || !fs.existsSync(firma) || fs.readFileSync(firma, "utf8") !== pedido) {
      await leerTexto(clave, { texto, vozId, emocion, destino: lectura });
      fs.writeFileSync(firma, pedido);
    } else log("voz: se reusa la lectura de Cartesia");

    // 2. Whisper marca cada palabra en la voz de Kie (la que mueve los labios) y en la de Cartesia.
    // Si ya se marcaron (p.ej. al cambiar el nivel de sincronización), se reusan.
    job.mensaje = "Marcando las palabras en las dos voces…";
    guardar();
    const marcar = async (input: string, nombre: string): Promise<Transcript> => {
      const json = path.join(trabajo, nombre);
      if (fs.existsSync(json) && fs.statSync(json).mtimeMs > fs.statSync(input).mtimeMs)
        return JSON.parse(fs.readFileSync(json, "utf8")) as Transcript;
      return transcribeFile({ input, outDir: trabajo, projectId: null, outName: nombre });
    };
    const kie = await marcar(pegado, "kie.json");
    const cart = await marcar(lectura, "cartesia.json");
    if (!kie.words.length) throw new Error("No se entienden palabras en la voz del video: no se puede sincronizar.");
    if (!cart.words.length) throw new Error("No se entienden palabras en la lectura de Cartesia.");

    // 3. El video se ajusta a la voz de Cartesia, tramo por tramo.
    const nivelN = job.nivelSincro ?? 1;
    const nivel = NIVELES[nivelN];
    job.mensaje = `Ajustando el video a la voz (sincronización ${nivel.label.toLowerCase()})…`;
    guardar();
    // En los niveles altos, los bordes de palabra se corrigen con el silencio real del audio.
    let palabrasKie = kie.words;
    let palabrasCart = cart.words;
    if (nivel.silencios) {
      palabrasKie = ajustarConSilencios(kie.words, (await detectSilences(pegado, 0.12)).silences);
      palabrasCart = ajustarConSilencios(cart.words, (await detectSilences(lectura, 0.12)).silences);
    }
    const { anclas, emparejadas, esPausa } = calcularAnclas(palabrasKie, palabrasCart, nivel);
    const piezas = calcularPiezas(anclas, esPausa, nivel.vmin);
    const errores = desfases(palabrasKie, palabrasCart, anclas);
    const video = path.join(trabajo, "video.mp4");
    await armarVideo(pegado, piezas, path.join(trabajo, "piezas"), video);

    // 4. Volumen: Cartesia devuelve la voz baja (unos -22 LUFS). Se lleva a
    // -16 LUFS (lo normal para voz en redes), pero sin aplastarla: la subida
    // nunca obliga al limitador a bajar más de 3 dB un pico (más que eso suena
    // a bajones de calidad). No se iguala al audio de Kie, que viene muy fuerte.
    const lufsKie = await volumen(pegado);
    const lufsCart = await volumen(lectura);
    const pico = await picoDb(lectura);
    const ganancia = Math.max(-6, Math.min(VOLUMEN_OBJETIVO_LUFS - lufsCart, -1 - pico + LIMITADOR_MAX_DB));
    const filtros = [`apad=pad_dur=${(COLA_S + 0.3).toFixed(2)}`];
    if (Math.abs(ganancia) > VOLUMEN_MAX_DB)
      filtros.unshift(`volume=${ganancia.toFixed(2)}dB`, "alimiter=limit=0.891:attack=5:release=80:level=false");
    const audio = path.join(trabajo, "voz.wav");
    await ffmpeg(["-i", lectura, "-af", filtros.join(","), "-ar", "44100", audio]);

    job.mensaje = "Armando el video final…";
    guardar();
    const tmp = path.join(dir, ".final.tmp.mp4");
    if (job.modo === "broll" && job.broll) {
      // Clon + B-roll: B-roll arriba (sin audio), el personaje abajo, la voz de Cartesia.
      job.mensaje = "Armando la pantalla partida (B-roll arriba, personaje abajo)…";
      guardar();
      const r = await armarPartido({
        avatar: video,
        broll: path.join(dir, job.broll.archivo),
        brollS: job.broll.duracionS,
        audio,
        duracionS: (await probeDurationMs(audio)) / 1000,
        destino: tmp,
      });
      log(`partido: B-roll estirado x${r.estirar.toFixed(3)}, ${r.congelarS.toFixed(2)} s quieto al final`);
    } else {
      await ffmpeg([
        "-i", video, "-i", audio,
        "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-shortest", "-movflags", "+faststart", tmp,
      ]);
    }
    const info = await probeVideo(tmp);
    if (!info.hasAudio || !info.width) throw new Error("El video final salió sin imagen o sin sonido.");
    fs.renameSync(tmp, path.join(dir, "final.mp4"));
    const pct = (q: number) => Math.round(errores[Math.min(errores.length - 1, Math.floor(errores.length * q))] ?? 0);
    job.voz = {
      metodo: "lectura",
      generadoAt: new Date().toISOString(),
      nivel: nivelN,
      emocion,
      palabras: { emparejadas, kie: kie.words.length, cartesia: cart.words.length },
      sincro: { medianaMs: pct(0.5), p90Ms: pct(0.9), corridas: errores.filter((e) => e > 150).length },
      duracionOriginalS: kie.durationMs / 1000,
      duracionNuevaS: cart.durationMs / 1000,
      desfaseS: 0,
      volumenOriginalLufs: Number(lufsKie.toFixed(1)),
      volumenNuevaLufs: Number(lufsCart.toFixed(1)),
      ...(Math.abs(ganancia) > VOLUMEN_MAX_DB ? { gananciaDb: Number(ganancia.toFixed(1)) } : {}),
    };
    log(
      `voz: ${emparejadas} de ${kie.words.length} palabras emparejadas, ${piezas.length} tramos, ` +
        `desfase mediano ${job.voz.sincro!.medianaMs} ms, 90 % ${job.voz.sincro!.p90Ms} ms, ${job.voz.sincro!.corridas} corridas; ` +
        `ganancia ${ganancia.toFixed(1)} dB`,
    );
    paso("listo", "Video listo. Miralo y pasalo a edición.");
  };

  try {
    if (accion === "guion") await guion();
    else if (accion === "generar") {
      await generar();
      actual = "voz";
      await voz();
    } else if (accion === "voz") await voz();
    else throw new Error("Acción inválida.");
  } catch (error) {
    job.paso = "error";
    job.fallo = actual;
    job.error = (error as Error).message;
    job.mensaje =
      actual === "guion" ? "No se pudo escribir el guion." : actual === "voz" ? "No se pudo poner la voz." : "No se pudo crear el video.";
    guardar();
    log(`error: ${job.error}`);
    throw error;
  } finally {
    release();
  }
}

if (require.main === module)
  procesar(process.argv[2], process.argv[3], process.argv.includes("--locked")).catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
