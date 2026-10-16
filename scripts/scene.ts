/**
 * Escenas de motion graphics con HyperFrames (paso 4 del pipeline).
 *
 * Uso:
 *   npx tsx scripts/scene.ts list   <projectId>            ítems del plan que llevan escena
 *   npx tsx scripts/scene.ts init   <projectId> <itemId>   crea scenes-src/<itemId>/ (HyperFrames)
 *   npx tsx scripts/scene.ts render <projectId> <itemId>   renderiza a scenes/<itemId>.mp4|.webm
 *   npx tsx scripts/scene.ts all    <projectId>            init (si falta) + render de todas
 *
 * `init` deja un index.html con la marca ya aplicada (colores, tipografías y logo
 * de /assets/brand como variables CSS) y el texto del ítem. Claude lo edita con
 * las skills de HyperFrames antes de renderizar.
 * Overlays (layout "overlay") se renderizan como WebM con transparencia;
 * escenas a pantalla completa como MP4.
 */
import fs from "node:fs";
import path from "node:path";
import type { Brand, EditStyle, Plan, PlanItem, ProjectImage } from "../src/pipeline/types";
import { FORMAT_SIZE, hasMinimumSceneDuration, MIN_SCENE_DURATION_MS, MIN_SCENE_READ_MS, SCENE_TYPES, sceneLayout, sceneSpecFor, splitSceneSize } from "../src/pipeline/types";
import { videoInset } from "../src/edit/layout";
import { projectPaths } from "./lib/config";
import { readJson, run, writeJson } from "./lib/media";
import { loadBrand, loadSettings, projectBrandDir } from "./lib/project";
import { log, setStatus } from "./lib/status";

const RESOLUTION = { vertical: "portrait", horizontal: "landscape", square: "square" } as const;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const brandCss = (brand: Brand, transparent: boolean) => {
  const faces = (brand.fonts.files ?? [])
    .map(
      (f) =>
        `@font-face { font-family: "${f.family}"; src: url("assets/fonts/${f.file}"); font-weight: ${f.weight ?? "100 900"}; font-display: block; }`,
    )
    .join("\n      ");
  return `<style id="brand">
      /* Generado desde /assets/brand/brand.json — usar estas variables */
      ${faces}
      :root {
        --brand-primary: ${brand.colors.primary};
        --brand-secondary: ${brand.colors.secondary};
        --brand-bg: ${brand.colors.background};
        --brand-text: ${brand.colors.text};
        --brand-highlight: ${brand.colors.highlight};
        --font-heading: "${brand.fonts.heading}", "Futura", "Helvetica Neue", sans-serif;
        --font-body: "${brand.fonts.body}", "Futura", "Helvetica Neue", sans-serif;
      }
      html, body { background: ${transparent ? "transparent" : "var(--brand-bg)"}; }
    </style>`;
};

/** Cómo diseñar según el estilo de gráficos elegido en el panel (va al BRIEF.md). */
export const GRAPHICS_BRIEF: Record<EditStyle["graphics"], string> = {
  minimal:
    "MINIMALISTA: mucho espacio vacío, una sola idea por escena, tipografía semibold (no 800), un solo color de acento (--brand-primary) en detalles finos (líneas, subrayados, puntos). Sin cajas pesadas ni bordes gruesos. Animaciones suaves y lentas (fade + desplazamientos cortos, ease power2/sine), sin rebotes.",
  bold:
    "IMPACTANTE: tipografía enorme y pesada (800), palabras clave en --brand-primary, kinetic typography (palabras que entran de a una), bloques de color y alto contraste. Animaciones rápidas y con energía (back.out, expo.out, escalas, golpes al ritmo de la voz).",
  corporate:
    "CORPORATIVO: prolijo y sobrio. Tarjetas limpias con bordes redondeados, íconos simples, jerarquía clara (título + bajada), todo alineado a una grilla. Animaciones de deslizamiento suaves (power3.out), sin efectos llamativos.",
};

/** Variantes de la plantilla inicial según el estilo de gráficos (solo el look CSS). */
const TEMPLATE_STYLE: Record<EditStyle["graphics"], { card: string; title: string }> = {
  minimal: {
    card: "padding: 24px 8px; border-bottom: 3px solid var(--brand-primary);",
    title: "font-weight: 600;",
  },
  bold: {
    card: "padding: 48px 64px; border-radius: 28px; border: 4px solid var(--brand-primary);",
    title: "font-weight: 800;",
  },
  corporate: {
    card: "padding: 40px 56px; border-radius: 20px; border-left: 12px solid var(--brand-primary); background: color-mix(in srgb, var(--brand-text) 8%, var(--brand-bg));",
    title: "font-weight: 700; text-align: left;",
  },
};

/**
 * Personalidad de movimiento de cada estilo: números fijos para que TODAS las
 * escenas de un video se muevan igual. Duraciones en segundos, pensadas para
 * video a 30 fps (no para interfaces: en video el ojo no dispara la animación,
 * así que son más largas que en una web).
 *
 * `enter` es el estado inicial del elemento principal; `ease`/`enterS` cómo y
 * en cuánto llega; `exitEase`/`exitS` cómo se va (la salida dura ~70% de la
 * entrada); `stagger` lo que se espera entre un elemento y el siguiente;
 * `secondary` el retardo de la capa secundaria (sombras, íconos) respecto de
 * la principal; `settleS` el respiro mínimo entre que termina la salida y
 * termina la escena.
 */
export type MotionStyle = {
  name: string;
  enter: string;
  enterS: number;
  ease: string;
  overshoot: string;
  exitS: number;
  exitEase: string;
  exitTo: string;
  stagger: number;
  secondary: number;
  settleS: number;
};

export const MOTION_STYLE: Record<EditStyle["graphics"], MotionStyle> = {
  minimal: {
    name: "sobrio y elegante",
    enter: "{ opacity: 0, y: 28 }",
    enterS: 0.6,
    ease: "power2.out",
    overshoot: "sin rebote (0%): frena y queda quieto",
    exitS: 0.4,
    exitEase: "power2.in",
    exitTo: "opacity: 0, y: -24",
    stagger: 0.08,
    secondary: 0.08,
    settleS: 0.2,
  },
  bold: {
    name: "con energía",
    enter: "{ opacity: 0, y: 70, scale: 0.9 }",
    enterS: 0.4,
    ease: "back.out(1.7)",
    overshoot: "rebote marcado (15-25%): se pasa de largo y vuelve",
    exitS: 0.28,
    exitEase: "power3.in",
    exitTo: "opacity: 0, y: -60, scale: 0.94",
    stagger: 0.05,
    secondary: 0.05,
    settleS: 0.2,
  },
  corporate: {
    name: "prolijo y directo",
    enter: "{ opacity: 0, x: -56 }",
    enterS: 0.5,
    ease: "power3.out",
    overshoot: "casi sin rebote (0-3%): llega y frena limpio",
    exitS: 0.35,
    exitEase: "power2.in",
    exitTo: "opacity: 0, x: 40",
    stagger: 0.07,
    secondary: 0.08,
    settleS: 0.2,
  },
};

/**
 * Criterios de movimiento que van al BRIEF.md de cada escena.
 * Son los mismos números que usa la plantilla inicial: si se rediseña la
 * escena a mano, hay que respetarlos para que todas se muevan igual.
 */
export const motionBrief = (graphics: EditStyle["graphics"], durS: number): string => {
  const m = MOTION_STYLE[graphics];
  const exitAt = Math.max(m.enterS + 0.2, durS - m.settleS - m.exitS);
  return `
## Movimiento (respetar estos números)

Personalidad de este video: **${m.name}**. Es la misma en TODAS las escenas: no
la cambies por escena.

| Qué | Cuánto |
| --- | --- |
| Entrada del elemento principal | ${m.enterS}s con \`${m.ease}\`, desde \`${m.enter}\` |
| Lectura del contenido principal | al menos ${MIN_SCENE_READ_MS / 1000}s continuos completamente visible, sin contar entrada ni salida; puede durar más |
| Freno | ${m.overshoot} |
| Salida | ${m.exitS}s con \`${m.exitEase}\` hacia \`{ ${m.exitTo} }\`, arranca en ${exitAt.toFixed(2)}s |
| Respiro final | al menos ${m.settleS}s entre que termina la salida y termina la escena |
| Escalonado entre elementos | ${m.stagger}s (total del escalonado: menos de 0.5s) |
| Retardo de la capa secundaria | ${m.secondary}s después de la principal |

### Los 4 actos (esta escena dura ${durS}s)

1. **Anticipación** — un gesto mínimo antes de la entrada (comprimir, juntar, atenuar el resto).
2. **Acción** — la entrada del elemento principal: lo que el espectador tiene que leer.
3. **Reacción y lectura** — la capa secundaria responde ${m.secondary}s después (sombra, ícono, línea de acento). Todo el contenido principal debe terminar de entrar como máximo en ${(exitAt - MIN_SCENE_READ_MS / 1000).toFixed(2)}s y permanecer legible hasta la salida. Cada dato que reemplace a otro también necesita al menos ${MIN_SCENE_READ_MS / 1000}s. Si no alcanza, ampliar el plan antes de generar; no acelerar ni reducir la lectura.
4. **Resolución** — salida + respiro. Nunca cortar de golpe en el último cuadro.

### Las tres capas (si falta una, la escena se ve plana)

- **Principal**: el texto o dato que se tiene que leer.
- **Secundaria**: lo que lo acompaña y llega después (sombra, ícono, subrayado, línea).
- **Ambiente**: vida de fondo, lenta y continua (\`sine.inOut\`, loop suave). Nunca protagonista.

### Control antes de renderizar

1. Nada de \`linear\` para movimiento: solo para rotación continua o barras de progreso.
2. Ningún cambio importante solo con opacidad: sumarle posición o escala.
3. Las tres capas presentes.
4. Como máximo un tercio de los elementos moviéndose a la vez.
5. Verificar al menos ${MIN_SCENE_READ_MS / 1000}s entre el final de la última entrada de contenido principal y su salida. Puede ser más según el contenido.
6. La salida termina con el respiro: la escena no corta en movimiento.
`;
};

/** Plantilla inicial: título de marca animado. Claude la reemplaza/mejora. */
const template = (
  item: PlanItem,
  brand: Brand,
  w: number,
  h: number,
  durS: number,
  overlay: boolean,
  graphics: EditStyle["graphics"],
) => {
  const look = TEMPLATE_STYLE[graphics];
  const m = MOTION_STYLE[graphics];
  const text = esc(item.text || item.description.slice(0, 60));
  // Acto 4 (resolución): la salida tiene que terminar con un respiro antes del final.
  const exitAt = Math.max(m.enterS + 0.2, durS - m.settleS - m.exitS);
  const ambientS = Math.max(0.8, (durS - m.settleS) / 2);
  const logo = brand.logo ? `<img id="logo" src="assets/${esc(brand.logo)}" alt="" />` : "";
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${w}, height=${h}" />
    <title>${esc(item.id)} — ${esc(item.type)}</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    ${brandCss(brand, overlay)}
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${w}px; height: ${h}px; overflow: hidden; }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; }
      .clip { position: absolute; inset: 0; }
      /* Todo el contenido vive acá: en overlay esta capa es la que "respira". */
      #stage { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 32px; transform-origin: center center; }
      #card {
        ${overlay ? "background: color-mix(in srgb, var(--brand-bg) 85%, transparent);" : ""}
        max-width: ${Math.round(w * 0.82)}px;
        ${look.card}
      }
      #title {
        font-family: var(--font-heading); color: var(--brand-text);
        font-size: ${Math.round(Math.min(w, h) * 0.085)}px; line-height: 1.1; text-align: center;
        ${look.title}
      }
      #title em { font-style: normal; color: var(--brand-primary); }
      #logo { width: ${Math.round(Math.min(w, h) * 0.18)}px; height: auto; }
      /* Capa ambiente (solo con fondo opaco): un halo lento detrás del contenido.
         En overlay NO va: un degradado grande sobre transparencia se comprime
         mal (deja franjas de color) y además le taparía la cara a la persona. */
      ${overlay ? "" : `#ambient {
        position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
        width: ${Math.round(w)}px; height: ${Math.round(h * 0.6)}px;
        pointer-events: none; filter: blur(70px);
        background: radial-gradient(ellipse at center, color-mix(in srgb, var(--brand-primary) 22%, transparent) 0%, transparent 62%);
      }`}
      /* Capa secundaria: acompaña al elemento principal, llega después */
      #accent {
        width: ${Math.round(Math.min(w, h) * 0.22)}px; height: 6px; border-radius: 3px;
        background: var(--brand-primary); transform-origin: left center;
      }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${durS}" data-width="${w}" data-height="${h}">
      <section id="scene" class="clip" data-start="0" data-duration="${durS}" data-track-index="0">
        <div id="stage">
          ${overlay ? "" : '<div id="ambient"></div>'}
          ${logo}
          <div id="card"><h1 id="title">${text}</h1></div>
          <div id="accent"></div>
        </div>
      </section>
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      // Capa AMBIENTE: vida lenta y continua, nunca protagonista.
      tl.fromTo("#stage", { scale: 1 }, { scale: ${overlay ? "1.02" : "1.012"}, duration: ${ambientS.toFixed(2)}, ease: "sine.inOut", yoyo: true, repeat: 1 }, 0);
      ${overlay ? "" : `tl.fromTo("#ambient", { scale: 0.96, opacity: 0.35 }, { scale: 1.05, opacity: 0.7, duration: ${ambientS.toFixed(2)}, ease: "sine.inOut", yoyo: true, repeat: 1 }, 0);`}
      // Capa PRINCIPAL: entra (acto 2) con la personalidad del estilo.
      tl.fromTo("#card", ${m.enter}, { opacity: 1, x: 0, y: 0, scale: 1, duration: ${m.enterS}, ease: "${m.ease}" }, 0.07);
      // Capa SECUNDARIA: llega DESPUÉS de la principal (acto 3, reacción).
      tl.fromTo("#accent", { scaleX: 0, opacity: 0 }, { scaleX: 1, opacity: 1, duration: ${(m.enterS * 0.7).toFixed(2)}, ease: "${m.ease}" }, ${(0.07 + m.secondary).toFixed(2)});
      ${logo ? `tl.fromTo("#logo", { opacity: 0, y: -30 }, { opacity: 1, y: 0, duration: ${(m.enterS * 0.7).toFixed(2)}, ease: "power3.out" }, ${(0.07 + m.secondary).toFixed(2)});` : ""}
      // Acto 4: salida (≈70% de la entrada) y respiro de ${m.settleS}s antes del final.
      tl.to("#accent", { scaleX: 0, opacity: 0, duration: ${(m.exitS * 0.8).toFixed(2)}, ease: "${m.exitEase}" }, ${exitAt.toFixed(2)});
      tl.to("#card", { ${m.exitTo}, duration: ${m.exitS}, ease: "${m.exitEase}" }, ${exitAt.toFixed(2)});
      ${logo ? `tl.to("#logo", { opacity: 0, y: -24, duration: ${m.exitS}, ease: "${m.exitEase}" }, ${exitAt.toFixed(2)});` : ""}
      ${overlay ? "" : `tl.to("#ambient", { opacity: 0, duration: ${m.exitS}, ease: "${m.exitEase}" }, ${exitAt.toFixed(2)});`}
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
};

const loadPlan = (id: string): Plan => {
  const plan = readJson<Plan | null>(projectPaths(id).plan, null);
  if (!plan) throw new Error("No existe plan.json");
  return plan;
};

const sceneItems = (plan: Plan) =>
  plan.items.filter((i) => SCENE_TYPES.has(i.type) && i.status !== "removed");

const updateItem = (id: string, itemId: string, patch: Partial<PlanItem>) => {
  const p = projectPaths(id);
  const plan = loadPlan(id);
  plan.items = plan.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i));
  writeJson(p.plan, plan);
};

export const initScene = async (id: string, itemId: string, force = false) => {
  const p = projectPaths(id);
  const plan = loadPlan(id);
  const item = plan.items.find((i) => i.id === itemId);
  if (!item) throw new Error(`No hay ítem "${itemId}" en plan.json`);
  if (!hasMinimumSceneDuration(item)) {
    throw new Error(`La escena ${item.id} dura menos de ${MIN_SCENE_DURATION_MS / 1000} segundos. Ajustá el plan antes de generarla.`);
  }
  const settings = loadSettings(id);
  const layout = sceneLayout(item);
  const { width, height } =
    layout === "split" ? splitSceneSize(settings.format, settings.style.split.share) : FORMAT_SIZE[settings.format];
  const dir = path.join(p.scenesSrc, itemId);
  if (fs.existsSync(path.join(dir, "index.html")) && !force) {
    console.log(`Ya existe ${path.relative(p.dir, dir)}/index.html`);
    return dir;
  }
  fs.mkdirSync(p.scenesSrc, { recursive: true });
  if (!fs.existsSync(dir)) {
    await run(
      "npx",
      ["--yes", "hyperframes", "init", itemId, "--example", "blank", "--non-interactive", "--resolution", RESOLUTION[settings.format]],
      { cwd: p.scenesSrc },
    );
  }
  // Copiar assets de marca (logo + fuentes) dentro de la escena
  const brand = loadBrand(id);
  const brandDir = projectBrandDir(id);
  const assets = path.join(dir, "assets");
  fs.mkdirSync(path.join(assets, "fonts"), { recursive: true });
  if (brand.logo && fs.existsSync(path.join(brandDir, brand.logo))) {
    fs.copyFileSync(path.join(brandDir, brand.logo), path.join(assets, brand.logo));
  } else brand.logo = "";
  for (const f of brand.fonts.files ?? []) {
    const src = path.join(brandDir, "fonts", f.file);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(assets, "fonts", f.file));
  }
  // Copiar las imágenes del usuario que use esta escena
  const imgDir = path.join(assets, "img");
  const notes = readJson<ProjectImage[]>(p.imagesMeta, []);
  const usadas: ProjectImage[] = [];
  for (const file of item.images ?? []) {
    const src = path.join(p.images, path.basename(file));
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(imgDir, { recursive: true });
    fs.copyFileSync(src, path.join(imgDir, path.basename(file)));
    usadas.push(notes.find((n) => n.file === path.basename(file)) ?? { file: path.basename(file) });
  }
  const imagesBrief = usadas.length
    ? `\n## Imágenes del usuario\n\nEstán en \`assets/img/\` y hay que usarlas en la escena (no las dejes afuera):\n${usadas
        .map((u) => `- \`assets/img/${u.file}\`${u.note ? ` — ${u.note}` : ""}`)
        .join("\n")}\n\nMostralas con \`<img>\` o como fondo, recortadas con \`object-fit: cover\` para que no se deformen.\n`
    : "";

  // Indicaciones libres del usuario (settings.json): valen también para el diseño
  const extra = settings.instructions?.trim();
  const instructionsBrief = extra ? `\n## Indicaciones del usuario\n\n${extra}\n` : "";

  const durS = Math.max(MIN_SCENE_DURATION_MS / 1000, (item.endMs - item.startMs) / 1000);
  const overlay = layout === "overlay";
  const top = settings.style.split.position === "top";
  const where =
    settings.format === "horizontal"
      ? top
        ? "a la IZQUIERDA (el video va a la derecha)"
        : "a la DERECHA (el video va a la izquierda)"
      : top
        ? "de ARRIBA (el video va abajo)"
        : "de ABAJO (el video va arriba)";
  // pip / frame: la escena ocupa toda la pantalla y el video se dibuja encima,
  // dentro de este rectángulo. La escena tiene que dejarlo libre.
  const hueco = layout === "pip" || layout === "frame" ? videoInset(settings.format, width, height, layout) : null;
  const huecoTxt = hueco
    ? `x=${hueco.x}, y=${hueco.y}, ${hueco.width}x${hueco.height}px (esquinas redondeadas ${hueco.radius}px)`
    : "";
  const layoutText = {
    overlay: "overlay (fondo TRANSPARENTE, se renderiza a WebM con alfa)",
    fullscreen: "pantalla completa (MP4, tapa el video; la voz sigue)",
    split: `pantalla dividida: esta escena ocupa la parte ${where}, ${Math.round(settings.style.split.share * 100)}% de la pantalla (MP4 con fondo)`,
    pip: `la persona en una esquina (MP4 a pantalla completa; su video va chiquito en un recuadro: ${huecoTxt})`,
    frame: `video enmarcado (MP4 a pantalla completa; su video va en una tarjeta centrada: ${huecoTxt})`,
  }[layout];
  const pipNota = `El video de la persona se dibuja ENCIMA de esta escena, en ${huecoTxt}. Ese rectángulo tiene que quedar LIBRE: no pongas nada importante ahí, va a quedar tapado. Diseñá alrededor.\n`;
  const layoutNotes = {
    overlay: "Dejar libre la zona de subtítulos (tercio inferior) y la zona segura de Instagram/TikTok.\n",
    fullscreen: "",
    pip: `${pipNota}El recuadro es chico y va en una esquina: el protagonista es el gráfico. Usá el resto de la pantalla para el contenido.\n`,
    frame: `${pipNota}Es un marco de marca: dejá el título ARRIBA del rectángulo y el logo o una barra de marca ABAJO. El gráfico enmarca, no tapa.\n`,
    split:
      settings.format === "horizontal"
        ? "Componer para media pantalla. Dejar libre el borde inferior (~120px): ahí van los subtítulos.\n"
        : top
          ? `Componer para esta parte de la pantalla. Dejar libre la franja de abajo (~${Math.round(height * 0.15)}px): ahí van los subtítulos, sobre la unión con el video. Contenido importante a más de 260px del borde de arriba (interfaz de Instagram/TikTok) y fuera de los 160px de la derecha.\n`
          : `Componer para esta parte de la pantalla. Dejar libre la franja de arriba (~${Math.round(height * 0.15)}px): ahí van los subtítulos, sobre la unión con el video. Contenido importante a más de 440px del borde de abajo (descripción e interfaz de Instagram/TikTok) y fuera de los 160px de la derecha.\n`,
  }[layout];
  fs.writeFileSync(
    path.join(dir, "index.html"),
    template(item, brand, width, height, durS, overlay, settings.style.graphics),
  );
  fs.writeFileSync(
    path.join(dir, "BRIEF.md"),
    `# Escena ${item.id}\n\n- Tipo: ${item.type}\n- Layout: ${layoutText}\n- Duración: ${durS}s (data-duration del root; no cambiarla)\n- Lienzo: ${width}x${height}\n- Texto: ${item.text ?? "-"}\n- Descripción: ${item.description}\n- Por qué: ${item.reason}\n- Estilo de gráficos: ${GRAPHICS_BRIEF[settings.style.graphics]}\n\nUsar las variables CSS de marca (--brand-*, --font-heading, --font-body) del <style id="brand">.\n${layoutNotes}${motionBrief(settings.style.graphics, durS)}${imagesBrief}${instructionsBrief}`,
  );
  log(id, `[scene] init ${itemId} (${item.type}, ${durS}s, ${layout}, ${width}x${height})`);
  console.log(`Escena lista para editar: ${path.relative(process.cwd(), path.join(dir, "index.html"))}`);
  return dir;
};

export const renderScene = async (id: string, itemId: string) => {
  const p = projectPaths(id);
  const plan = loadPlan(id);
  const item = plan.items.find((i) => i.id === itemId);
  if (!item) throw new Error(`No hay ítem "${itemId}" en plan.json`);
  if (!hasMinimumSceneDuration(item)) {
    throw new Error(`La escena ${item.id} dura menos de ${MIN_SCENE_DURATION_MS / 1000} segundos. Ajustá el plan antes de renderizarla.`);
  }
  const dir = path.join(p.scenesSrc, itemId);
  if (!fs.existsSync(path.join(dir, "index.html"))) throw new Error(`Falta ${dir}/index.html (corré init)`);
  const settings = loadSettings(id);
  const overlay = sceneLayout(item) === "overlay";
  const ext = overlay ? "webm" : "mp4";
  fs.mkdirSync(p.scenes, { recursive: true });
  const out = path.join(p.scenes, `${itemId}.${ext}`);
  setStatus(id, "generating_scenes", `Renderizando escena ${itemId} con HyperFrames…`);
  try {
    await run(
      "npx",
      [
        "--yes",
        "hyperframes",
        "render",
        dir,
        "-o",
        out,
        "--format",
        ext,
        "--fps",
        String(settings.fps),
        "--quality",
        "delivery",
        "--workers",
        "2",
        "--quiet",
      ],
      { cwd: dir },
    );
  } catch (err) {
    updateItem(id, itemId, { status: "error" });
    throw err;
  }
  updateItem(id, itemId, {
    file: `scenes/${itemId}.${ext}`,
    status: "rendered",
    sceneSpec: sceneSpecFor(item, settings),
    prevScene: undefined,
  });
  log(id, `[scene] render ${itemId} -> scenes/${itemId}.${ext}`);
  console.log(`OK scenes/${itemId}.${ext}`);
  return out;
};

const main = async () => {
  const [cmd, id, itemId] = process.argv.slice(2);
  if (!cmd || !id) {
    console.error("Uso: npx tsx scripts/scene.ts <list|init|render|all> <projectId> [itemId] [--force]");
    process.exit(1);
  }
  const force = process.argv.includes("--force");
  if (cmd === "list") {
    for (const it of sceneItems(loadPlan(id))) {
      const dir = path.join(projectPaths(id).scenesSrc, it.id);
      console.log(
        `${it.id}\t${it.type}\t${sceneLayout(it)}\t${(it.startMs / 1000).toFixed(1)}-${(it.endMs / 1000).toFixed(1)}s\tsrc:${fs.existsSync(dir) ? "sí" : "no"}\tfile:${it.file ?? "-"}\t${it.status ?? ""}`,
      );
    }
    return;
  }
  if (cmd === "init") return void (await initScene(id, itemId, force));
  if (cmd === "render") return void (await renderScene(id, itemId));
  if (cmd === "all") {
    const items = sceneItems(loadPlan(id));
    for (const [i, it] of items.entries()) {
      setStatus(id, "generating_scenes", `Escena ${i + 1}/${items.length}: ${it.id}`);
      await initScene(id, it.id);
      await renderScene(id, it.id);
    }
    setStatus(id, "generating_scenes", `${items.length} escenas renderizadas.`);
    return;
  }
  throw new Error(`Comando desconocido: ${cmd}`);
};

if (require.main === module) {
  main().catch((err) => {
    const [, id] = process.argv.slice(2);
    if (id) setStatus(id, "error", "Falló la escena", { error: (err as Error).message });
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
