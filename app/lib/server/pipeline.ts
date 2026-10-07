import "server-only";
import fs from "node:fs";
import path from "node:path";
import { LAYOUT_LABELS, mixedLayout, PACE_LABELS, SCENE_TYPES, sceneLayout } from "../defaults";
import type { EditStyle, Plan, PlanItem, SceneLayout } from "../types";
import { runAgent } from "./agent";
import { imagesPromptBlock } from "./images";
import { runScript } from "./jobs";
import { paths, readPlan, readSettings, writePlan, writeStatus } from "./projects";

const PLAN_BASE = `El video ya está transcripto y cortado (pasos 1 y 2 listos).
Hacé el paso 3 del pipeline: leé cut.transcript.json, fijate qué efectos de
sonido hay en assets/music/sfx y la marca del proyecto en brand/ (si no existe,
usá assets/brand como compatibilidad para proyectos anteriores), y escribí
plan.json en borrador con títulos, motion graphics, overlays, transiciones,
zooms y efectos (con timestamp y por qué). Respetá el estilo de edición de
settings.json (style.graphicsCount = cantidad EXACTA de gráficos repartidos
parejos si es mayor a 0, style.pace = cuántos elementos, style.graphics = estilo visual,
style.autoZoom, style.layoutUse; ver CLAUDE.md). Si settings.music.enabled es
true y settings.music.track está vacío, elegí la música de fondo según el tono
del video con: npx tsx scripts/music.ts pick <id> "<estilo en inglés>" (y
contame cuál elegiste). Después resumime el plan en
pocas líneas y terminá ahí: lo reviso y toco "Renderizar" en el panel (eso lo
aprueba). REGLA INVIOLABLE: cada título, motion graphic, overlay, lower third o
b-roll debe durar al menos 2000 ms. No aplica a subtítulos, transiciones,
zooms ni efectos de sonido. No generes escenas todavía.`;

/** Indicaciones libres que escribió el usuario para este video (si hay). */
const instructionsBlock = (id: string) => {
  const txt = readSettings(id).instructions?.trim();
  return txt
    ? `\n\nIndicaciones del usuario para ESTE video (respetalas en el plan y en cada escena):\n--- inicio ---\n${txt}\n--- fin ---`
    : "";
};

/** El pedido del plan, con las imágenes y las indicaciones del usuario (si hay). */
export const planPrompt = (id: string) => PLAN_BASE.replace("<id>", id) + imagesPromptBlock(id) + instructionsBlock(id);

/** Pasos 1 y 2 (sin Claude) y, si salen bien, Claude propone el plan (paso 3). */
export const startPrepare = (id: string, autoPlan = true) => {
  writeStatus(id, "transcribing", "Preparando…");
  runScript(id, "Transcribir y cortar", "pipeline.ts", [], (ok) => {
    if (!ok || !autoPlan) return;
    try {
      runAgent(id, planPrompt(id), {
        kind: "plan",
        role: "system",
        visibleText: `Video transcripto y cortado. Pidiéndole a ${readSettings(id).aiProvider === "openai" ? "OpenAI" : "Claude"} el plan de edición…`,
      });
    } catch (err) {
      writeStatus(id, "error", "No se pudo pedir el plan", { error: (err as Error).message });
    }
  });
};

export const requestPlanChanges = (id: string, message: string, visibleText?: string) => {
  const plan = readPlan(id);
  if (plan && plan.status === "approved") {
    plan.status = "draft";
    writePlan(id, plan);
  }
  return runAgent(
    id,
    `Cambios al plan de edición: ${message}\nActualizá plan.json (queda en borrador, status "draft") y resumime qué cambiaste. No generes escenas todavía.`,
    { kind: "changes", visibleText: visibleText ?? `✏️ Cambios al plan: ${message}` },
  );
};

export const setItemRemoved = (id: string, itemId: string, removed: boolean) => {
  const plan = readPlan(id);
  if (!plan) throw new Error("No hay plan.");
  plan.items = plan.items.map((i) =>
    i.id === itemId ? { ...i, status: removed ? "removed" : i.file ? "rendered" : plan.status === "approved" ? "approved" : "pending" } : i,
  );
  writePlan(id, plan);
  return plan;
};

/**
 * Cambia cómo aparece una escena. Si ya estaba generada, se le saca el archivo
 * para que el botón Renderizar le pida a Claude regenerarla (ver build.ts); si
 * se vuelve a un formato que ya tenía generado, se recupera sin regenerar.
 */
const applyLayout = (id: string, plan: Plan, item: PlanItem, layout: SceneLayout) => {
  const current = sceneLayout(item);
  item.layout = layout;
  if (current === layout) return false;
  const prev = item.prevScene;
  const canRestore = prev?.layout === layout && fs.existsSync(path.join(paths(id).dir, prev.file));
  if (item.file) item.prevScene = { layout: current, file: item.file };
  else if (canRestore) delete item.prevScene;
  if (canRestore) {
    item.file = prev!.file;
    item.status = "rendered";
  } else if (item.file) {
    delete item.file;
    item.status = plan.status === "approved" ? "approved" : "pending";
  }
  return true;
};

export const setItemLayout = (id: string, itemId: string, layout: SceneLayout) => {
  const plan = readPlan(id);
  if (!plan) throw new Error("No hay plan.");
  const item = plan.items.find((i) => i.id === itemId);
  if (!item || !SCENE_TYPES.has(item.type)) throw new Error("Ese elemento no tiene escena.");
  if (!(layout in LAYOUT_LABELS)) throw new Error("Formato de escena inválido.");
  applyLayout(id, plan, item, layout);
  writePlan(id, plan);
  return plan;
};

/**
 * Aplica "Cómo se ven los gráficos" al plan actual (todo encima del video, todo
 * en pantalla dividida, todo a pantalla completa, o "combinado": los tres
 * rotando sin repetir). Con "auto" no toca nada: los layouts los eligió Claude.
 * Devuelve cuántos gráficos cambiaron.
 */
export const applyLayoutUse = (id: string, use: EditStyle["layoutUse"]) => {
  const plan = readPlan(id);
  if (!plan || use === "auto") return { changed: 0 };
  // En "combinado" el orden importa: se rota siguiendo la línea de tiempo.
  const items = plan.items
    .filter((i) => SCENE_TYPES.has(i.type) && i.status !== "removed")
    .sort((a, b) => a.startMs - b.startMs);
  let changed = 0;
  let prev: SceneLayout | undefined;
  items.forEach((item, index) => {
    const current = sceneLayout(item);
    const target = use === "mixed" ? mixedLayout(index, Boolean(item.images?.length), prev) : use;
    prev = target;
    if (target === current) return;
    applyLayout(id, plan, item, target);
    changed++;
  });
  if (changed) writePlan(id, plan);
  return { changed };
};

/** Claude rehace el plan con el ritmo actual (los gráficos que cambien los genera el botón Renderizar). */
export const replanWithStyle = (id: string) => {
  const plan = readPlan(id);
  if (!plan) throw new Error("Todavía no hay plan: el ritmo se va a usar cuando Claude lo arme.");
  const { pace, graphicsCount } = readSettings(id).style;
  const count = graphicsCount
    ? ` y EXACTAMENTE ${graphicsCount} gráficos (ítems con escena) repartidos parejos en todo el video (uno cada duración/${graphicsCount})`
    : "";
  return requestPlanChanges(
    id,
    `rehacé el plan con el ritmo "${pace}"${count} según settings.json (ver CLAUDE.md). Respetá style.layoutUse y mantené los ítems que sigan sirviendo.${instructionsBlock(id)}`,
    `🎨 Rehacé el plan con ritmo ${PACE_LABELS[pace].toLowerCase()}${graphicsCount ? ` y ${graphicsCount} gráficos` : ""}.`,
  );
};
