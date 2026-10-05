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
import type { Brand, EditStyle, Plan, PlanItem } from "../src/pipeline/types";
import { FORMAT_SIZE, SCENE_TYPES, sceneLayout, sceneSpecFor, splitSceneSize } from "../src/pipeline/types";
import { BRAND_DIR, projectPaths } from "./lib/config";
import { readJson, run, writeJson } from "./lib/media";
import { loadBrand, loadSettings } from "./lib/project";
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

/** Variantes de la plantilla inicial según el estilo de gráficos. */
const TEMPLATE_STYLE: Record<EditStyle["graphics"], { card: string; title: string; enter: string; ease: string }> = {
  minimal: {
    card: "padding: 24px 8px; border-bottom: 3px solid var(--brand-primary);",
    title: "font-weight: 600;",
    enter: "{ opacity: 0, y: 24 }",
    ease: "power2.out",
  },
  bold: {
    card: "padding: 48px 64px; border-radius: 28px; border: 4px solid var(--brand-primary);",
    title: "font-weight: 800;",
    enter: "{ opacity: 0, y: 60, scale: 0.92 }",
    ease: "back.out(1.6)",
  },
  corporate: {
    card: "padding: 40px 56px; border-radius: 20px; border-left: 12px solid var(--brand-primary); background: color-mix(in srgb, var(--brand-text) 8%, var(--brand-bg));",
    title: "font-weight: 700; text-align: left;",
    enter: "{ opacity: 0, x: -60 }",
    ease: "power3.out",
  },
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
  const text = esc(item.text || item.description.slice(0, 60));
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
      .clip { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 32px; }
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
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${durS}" data-width="${w}" data-height="${h}">
      <section id="scene" class="clip" data-start="0" data-duration="${durS}" data-track-index="0">
        ${logo}
        <div id="card"><h1 id="title">${text}</h1></div>
      </section>
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      tl.fromTo("#card", ${look.enter}, { opacity: 1, x: 0, y: 0, scale: 1, duration: 0.5, ease: "${look.ease}" }, 0.05);
      ${logo ? 'tl.fromTo("#logo", { opacity: 0, y: -30 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }, 0);' : ""}
      tl.to("#card", { opacity: 0, y: -40, duration: 0.35, ease: "power2.in" }, ${Math.max(0.6, durS - 0.4).toFixed(2)});
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
  const brand = loadBrand();
  const assets = path.join(dir, "assets");
  fs.mkdirSync(path.join(assets, "fonts"), { recursive: true });
  if (brand.logo && fs.existsSync(path.join(BRAND_DIR, brand.logo))) {
    fs.copyFileSync(path.join(BRAND_DIR, brand.logo), path.join(assets, brand.logo));
  } else brand.logo = "";
  for (const f of brand.fonts.files ?? []) {
    const src = path.join(BRAND_DIR, "fonts", f.file);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(assets, "fonts", f.file));
  }
  const durS = Math.max(0.5, Math.round((item.endMs - item.startMs) / 100) / 10);
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
  const layoutText = {
    overlay: "overlay (fondo TRANSPARENTE, se renderiza a WebM con alfa)",
    fullscreen: "pantalla completa (MP4, tapa el video; la voz sigue)",
    split: `pantalla dividida: esta escena ocupa la parte ${where}, ${Math.round(settings.style.split.share * 100)}% de la pantalla (MP4 con fondo)`,
  }[layout];
  const layoutNotes = {
    overlay: "Dejar libre la zona de subtítulos (tercio inferior) y la zona segura de Instagram/TikTok.\n",
    fullscreen: "",
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
    `# Escena ${item.id}\n\n- Tipo: ${item.type}\n- Layout: ${layoutText}\n- Duración: ${durS}s (data-duration del root; no cambiarla)\n- Lienzo: ${width}x${height}\n- Texto: ${item.text ?? "-"}\n- Descripción: ${item.description}\n- Por qué: ${item.reason}\n- Estilo de gráficos: ${GRAPHICS_BRIEF[settings.style.graphics]}\n\nUsar las variables CSS de marca (--brand-*, --font-heading, --font-body) del <style id="brand">.\n${layoutNotes}`,
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
