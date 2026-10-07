import "server-only";
import fs from "node:fs";
import path from "node:path";
import { LAYOUT_LABELS, SCENE_TYPES, TYPE_LABELS, sceneLayout, sceneSpecFor } from "../defaults";
import { hasMinimumSceneDuration, MIN_SCENE_DURATION_MS } from "../types";
import type { BuildInfo, CutsFile, Plan, PlanItem, ProjectState, SceneSpec, Settings } from "../types";
import { isBusy, runAgent } from "./agent";
import { describeChanges } from "./describe";
import { readJson } from "./fsutil";
import { runScript } from "./jobs";
import {
  getProjectState,
  lastRenderedSettings,
  listVersions,
  paths,
  readPlan,
  readSettings,
  writePlan,
  writeStatus,
} from "./projects";

/**
 * El botón "Renderizar / Re-renderizar" del panel: hace TODO lo necesario para
 * que el video quede como está configurado (aprobar el plan, re-cortar si
 * cambiaron los cortes, que Claude genere solo los gráficos que faltan o
 * cambiaron, y armar la versión nueva).
 */

/** Preset de corte con el que está hecho el cut.mp4 actual (null = a mano o sin cortar). */
const appliedCutStyle = (id: string) => {
  const p = paths(id);
  if (!fs.existsSync(p.cut)) return null;
  const applied = readJson<CutsFile | null>(p.cutsApplied, null);
  if (applied) return applied.style ?? null;
  return "normal"; // cortes hechos antes de que existieran los presets
};

const sameSpec = (a: SceneSpec, b: SceneSpec) =>
  a.layout === b.layout && a.width === b.width && a.height === b.height && a.graphics === b.graphics;

/** Gráficos que hay que generar (o regenerar) para que el video quede como está configurado. */
export const scenesToGenerate = (id: string, plan: Plan | null, settings: Settings): PlanItem[] =>
  (plan?.items ?? []).filter((it) => {
    if (!SCENE_TYPES.has(it.type) || it.status === "removed") return false;
    if (!it.file || !fs.existsSync(path.join(paths(id).dir, it.file))) return true;
    const want = sceneSpecFor(it, settings);
    if (it.sceneSpec) return !sameSpec(it.sceneSpec, want);
    // Escenas viejas sin datos: solo si el tipo de archivo no corresponde (overlay = .webm con transparencia)
    return (want.layout === "overlay") !== it.file.endsWith(".webm");
  });

/** Lo que importa del plan para el video, para saber si cambió desde el último render. */
const planKey = (plan: Plan | null) =>
  JSON.stringify([
    (plan?.items ?? [])
      .filter((i) => i.status !== "removed")
      .map((i) => [
        i.id,
        i.type,
        i.startMs,
        i.endMs,
        i.text ?? "",
        SCENE_TYPES.has(i.type) ? sceneLayout(i) : "",
        i.file ?? "",
        i.sound ?? "",
        i.transition ?? "",
        i.scale ?? 0,
        Boolean(i.hideCaptions),
      ])
      .sort(),
    plan?.keywords ?? [],
  ]);

const itemLabel = (i: PlanItem) => `“${i.text || TYPE_LABELS[i.type] || i.id}”`;

export const buildInfo = (id: string): BuildInfo => {
  const p = paths(id);
  const settings = readSettings(id);
  const plan = readPlan(id);
  const scenes = scenesToGenerate(id, plan, settings);
  const last = listVersions(id).at(-1);
  const applied = appliedCutStyle(id);
  const hasSplit = (plan?.items ?? []).some((i) => i.status !== "removed" && SCENE_TYPES.has(i.type) && sceneLayout(i) === "split");

  const pending: string[] = [];
  if (last) {
    const lastSettings = lastRenderedSettings(id);
    if (lastSettings) pending.push(...describeChanges(lastSettings, settings, { renderOnly: true, hasSplit }));
    const meta = readJson<{ planUsed?: Plan | null; planApplied?: boolean } | null>(
      path.join(p.versions, `v${last.version}.json`),
      null,
    );
    const hasItems = (plan?.items ?? []).some((i) => i.status !== "removed");
    if (plan && meta && "planUsed" in meta) {
      if (planKey(meta.planUsed ?? null) !== planKey(plan)) {
        pending.push(meta.planUsed ? "cambios en el plan" : "los gráficos del plan (la última versión salió sin ellos)");
      }
    } else if (plan && hasItems && meta?.planApplied === false) {
      // Versiones viejas (sin planUsed): solo sabemos si salieron con o sin plan
      pending.push("los gráficos del plan (la última versión salió sin ellos)");
    }
  }
  if (scenes.length) pending.push(`${scenes.length === 1 ? "1 gráfico" : `${scenes.length} gráficos`} para generar con Claude`);

  return {
    mode: !fs.existsSync(p.cut) ? "waiting" : !last ? "render" : pending.length ? "rerender" : "uptodate",
    pending: Array.from(new Set(pending)),
    scenes: scenes.map((i) => ({ id: i.id, label: `${itemLabel(i)} · ${LAYOUT_LABELS[sceneLayout(i)].toLowerCase()}` })),
    recut: applied !== null && applied !== settings.style.cut,
    planDraft: plan?.status === "draft",
  };
};

/** Estado del proyecto + qué haría el botón de render. */
export const fullState = (id: string): ProjectState => ({ ...getProjectState(id), build: buildInfo(id) });

/** Renderizar en el panel = aprobar el plan (Claude genera los gráficos dentro del mismo botón). */
const markApproved = (id: string) => {
  const plan = readPlan(id);
  if (!plan || plan.status === "approved") return;
  plan.status = "approved";
  plan.approvedAt = new Date().toISOString();
  plan.items = plan.items.map((i) =>
    i.status === "removed" ? i : { ...i, status: i.file ? "rendered" : "approved" },
  );
  writePlan(id, plan);
};

const scenesPrompt = (id: string, items: PlanItem[]) => `Tocaron "Renderizar" en el panel: el plan está aprobado.
Generá SOLO las escenas de estos ítems, con los ajustes actuales de settings.json:
${items.map((i) => `- ${i.id} · ${i.type} · ${LAYOUT_LABELS[sceneLayout(i)].toLowerCase()} · ${i.text ? `"${i.text}"` : i.description}`).join("\n")}
Para cada uno: npx tsx scripts/scene.ts init ${id} <itemId> --force (crea la plantilla con el formato, tamaño y
estilo actuales), diseñala según su BRIEF.md y el estilo de gráficos con las skills de HyperFrames,
npx hyperframes lint projects/${id}/scenes-src/<itemId> y npx tsx scripts/scene.ts render ${id} <itemId>.
NO corras scripts/render.ts: el panel arma el video cuando termines. Al final contame en 1-2 líneas qué hiciste.`;

export const build = (id: string) => {
  if (isBusy(id)) throw new Error("Ya hay algo trabajando en este proyecto. Esperá a que termine.");
  const invalidScenes = (readPlan(id)?.items ?? []).filter((item) => item.status !== "removed" && !hasMinimumSceneDuration(item));
  if (invalidScenes.length) {
    throw new Error(
      `El plan tiene ${invalidScenes.length === 1 ? "una escena" : `${invalidScenes.length} escenas`} de menos de ${MIN_SCENE_DURATION_MS / 1000} segundos. Pedile a la IA que rehaga el plan antes de renderizar.`,
    );
  }
  const info = buildInfo(id);
  if (info.mode === "waiting") throw new Error("El video todavía se está preparando (transcripción y corte).");
  const note = !listVersions(id).length
    ? "Primera versión"
    : info.pending.length
      ? `Cambios: ${info.pending.join(", ")}`
      : "Re-render";

  markApproved(id);

  const render = () => {
    writeStatus(id, "assembling", "Armando el video…");
    runScript(id, "Renderizar", "render.ts", ["--note", note]);
  };

  const scenes = () => {
    const missing = scenesToGenerate(id, readPlan(id), readSettings(id));
    if (!missing.length) return render();
    runAgent(id, scenesPrompt(id, missing), {
      kind: "approve",
      visibleText: `🎬 Generá ${missing.length === 1 ? "el gráfico" : `los ${missing.length} gráficos`}: ${missing.map(itemLabel).join(", ")}.`,
      onDone: (error) => {
        if (error) return void writeStatus(id, "error", "Claude no pudo generar los gráficos", { error });
        const still = scenesToGenerate(id, readPlan(id), readSettings(id));
        if (still.length) {
          return void writeStatus(id, "error", "Faltaron gráficos", {
            error: `No se generaron: ${still.map(itemLabel).join(", ")}. Tocá Renderizar para reintentar.`,
          });
        }
        render();
      },
    });
  };

  if (info.recut) {
    writeStatus(id, "cutting", "Re-cortando el video con el estilo nuevo…");
    runScript(id, "Re-cortar", "cut.ts", [], (ok) => {
      if (ok) scenes();
    });
  } else scenes();
};
