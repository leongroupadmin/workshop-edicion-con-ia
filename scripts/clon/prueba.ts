/**
 * Prueba del pipeline de clon (antes de construir nada).
 *
 *   npx tsx scripts/clon/prueba.ts voces            → voces de Cartesia
 *   npx tsx scripts/clon/prueba.ts clip --voz <id>  → prueba completa
 *
 * La prueba genera DOS clips seguidos de 8 s con la misma foto, los pega y le
 * cambia la voz con Cartesia. Sirve para ver tres cosas: si el labial dice el
 * texto, cuánto se nota la unión entre clips y si Cartesia mantiene los tiempos.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { cambiarVoz, listarVoces } from "./cartesia";
import { bajar, crearTarea, esperarTarea, subirFoto } from "./kie";
import { leerClave } from "./storage";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const SALIDA = path.join(ROOT, "clones", "prueba");
const FOTOS = path.join(ROOT, "assets", "personajes", "prueba");

/** Los dos bloques del guion de prueba (uno por clip, ~8 s cada uno). */
const BLOQUES = [
  "Hola, soy el personaje de prueba y estoy midiendo si el labial sincroniza bien con el texto.",
  "Este es el segundo bloque, pegado justo después, para ver cuánto se nota la unión entre los dos clips.",
];

/** Descripción de encuadre: igual en los dos bloques para que no salte la cámara. */
const ENCUADRE =
  "Plano medio de la persona de la foto, mirando a cámara, cámara fija, " +
  "misma luz y mismo fondo, habla en español rioplatense con tono natural.";

// ---------- utilidades ----------

const leerEnv = () => {
  const archivo = path.join(ROOT, ".env.local");
  if (!fs.existsSync(archivo)) return;
  for (const linea of fs.readFileSync(archivo, "utf8").split("\n")) {
    const m = linea.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
};

/** La clave del entorno (o .env.local) o, si no, la que se cargó en la pestaña Personajes. */
const clave = (nombre: "KIE_API_KEY" | "CARTESIA_API_KEY") => {
  const v = leerClave(nombre === "KIE_API_KEY" ? "kie" : "cartesia");
  if (!v) {
    console.error(
      `\nFalta ${nombre}. Cargala en la pestaña Personajes del panel ` +
        `(o pegala en .env.local, en la raíz del proyecto).\n`,
    );
    process.exit(1);
  }
  return v;
};

const ff = (bin: string, args: string[]) => {
  const r = spawnSync(bin, args, { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${bin} falló: ${r.stderr?.slice(-500)}`);
  return r.stdout.trim();
};

/** Duración en segundos de un archivo de audio o video. */
const duracion = (archivo: string) =>
  Number(ff("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", archivo]));

// ---------- comandos ----------

const comandoVoces = async () => {
  const voces = await listarVoces(clave("CARTESIA_API_KEY"));
  const es = voces.filter((v) => (v.language ?? "").startsWith("es"));
  const lista = es.length ? es : voces;
  console.log(`\n${lista.length} voces${es.length ? " en español" : ""} (de ${voces.length} en total):\n`);
  for (const v of lista.slice(0, 40)) {
    console.log(`  ${v.id}  ${v.name}${v.description ? ` — ${v.description.slice(0, 70)}` : ""}`);
  }
  console.log(`\nElegí una y corré:\n  npx tsx scripts/clon/prueba.ts clip --voz <id>\n`);
};

const comandoClip = async (vozId: string) => {
  const fotos = fs.existsSync(FOTOS)
    ? fs.readdirSync(FOTOS).filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    : [];
  if (!fotos.length) {
    console.error(`\nFalta la foto del personaje. Poné una imagen (jpg o png) en:\n  ${FOTOS}\n`);
    process.exit(1);
  }
  const foto = path.join(FOTOS, fotos[0]);
  fs.mkdirSync(SALIDA, { recursive: true });
  console.log(`\nFoto: ${fotos[0]}`);

  const kie = clave("KIE_API_KEY");
  const cartesia = clave("CARTESIA_API_KEY");
  console.log("1/6 Subiendo la foto a Kie…");
  const fotoUrl = await subirFoto(kie, foto, "images/clon-prueba");

  console.log("2/6 Pidiendo los dos clips de 8 s…");
  const tareas = await Promise.all(
    BLOQUES.map((texto) =>
      crearTarea(kie, {
        prompt: `${ENCUADRE} Dice exactamente: "${texto}"`,
        fotoUrl,
        segundos: 8,
        aspectRatio: "9:16",
        resolucion: "1080p",
      }),
    ),
  );
  const resultados = await Promise.all(
    tareas.map((t, i) => esperarTarea(kie, t, { onEstado: (e) => console.log(`  clip ${i + 1}: ${e}`) })),
  );

  console.log("3/6 Bajando los clips…");
  const clips: string[] = [];
  for (const [i, r] of resultados.entries()) {
    clips.push(await bajar(r.url, path.join(SALIDA, `c${i + 1}.mp4`)));
  }

  console.log("4/6 Pegando los dos clips…");
  const lista = path.join(SALIDA, "lista.txt");
  fs.writeFileSync(lista, clips.map((c) => `file '${c}'`).join("\n"));
  const pegado = path.join(SALIDA, "pegado.mp4");
  try {
    ff("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", lista, "-c", "copy", pegado]);
  } catch {
    ff("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", lista, "-c:v", "libx264", "-c:a", "aac", pegado]);
  }

  console.log("5/6 Cambiando la voz con Cartesia…");
  const audioOriginal = path.join(SALIDA, "voz-original.wav");
  ff("ffmpeg", ["-y", "-i", pegado, "-vn", "-ac", "1", "-ar", "44100", audioOriginal]);
  const audioNuevo = await cambiarVoz(cartesia, audioOriginal, vozId, path.join(SALIDA, "voz-nueva.mp3"));

  console.log("6/6 Armando el video final…");
  const final = path.join(SALIDA, "final.mp4");
  ff("ffmpeg", ["-y", "-i", pegado, "-i", audioNuevo, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-shortest", final]);

  const dOriginal = duracion(audioOriginal);
  const dNuevo = duracion(audioNuevo);
  const deriva = dNuevo - dOriginal;

  console.log(`\n--- Resultado ---`);
  for (const [i, c] of clips.entries()) {
    console.log(`clip ${i + 1}: ${duracion(c).toFixed(2)} s · ${resultados[i].creditos} créditos · generado en ${resultados[i].segundosGeneracion} s`);
  }
  console.log(`pegado:  ${duracion(pegado).toFixed(2)} s`);
  console.log(`audio original: ${dOriginal.toFixed(3)} s`);
  console.log(`audio con voz nueva: ${dNuevo.toFixed(3)} s`);
  console.log(
    `desfase de la voz: ${deriva >= 0 ? "+" : ""}${deriva.toFixed(3)} s  → ${
      Math.abs(deriva) < 0.08 ? "OK, el labial se mantiene" : "SE CORRE: hay que re-ajustar el audio"
    }`,
  );
  console.log(`créditos totales: ${resultados.reduce((a, r) => a + r.creditos, 0)}`);
  console.log(`\nMiralo: ${final}\n`);
};

const main = async () => {
  leerEnv();
  const [comando, ...resto] = process.argv.slice(2);
  if (comando === "voces") return comandoVoces();
  if (comando === "clip") {
    const i = resto.indexOf("--voz");
    const voz = i >= 0 ? resto[i + 1] : process.env.CARTESIA_VOICE_ID;
    if (!voz) {
      console.error("\nFalta la voz. Primero: npx tsx scripts/clon/prueba.ts voces\n");
      process.exit(1);
    }
    return comandoClip(voz);
  }
  console.log(`\nUso:\n  npx tsx scripts/clon/prueba.ts voces\n  npx tsx scripts/clon/prueba.ts clip --voz <id>\n`);
};

main().catch((e) => {
  console.error(`\n${(e as Error).message}\n`);
  process.exit(1);
});
