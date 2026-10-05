import fs from "node:fs";
import path from "node:path";
import type { PipelineStep, ProjectStatus } from "../../src/pipeline/types";
import { projectPaths } from "./config";
import { writeJson } from "./media";

/**
 * Actualiza projects/<id>/status.json y deja una línea en logs/pipeline.log.
 * El panel lee estos archivos para mostrar el paso actual.
 * Si no hay proyecto (script corrido sobre un archivo suelto), solo loguea.
 */
export const setStatus = (
  projectId: string | null,
  step: PipelineStep,
  message: string,
  extra: Partial<ProjectStatus> = {},
) => {
  console.log(`[${step}] ${message}`);
  if (!projectId) return;
  const p = projectPaths(projectId);
  if (!fs.existsSync(p.dir)) return;
  const status: ProjectStatus = {
    step,
    message,
    updatedAt: new Date().toISOString(),
    ...extra,
  };
  writeJson(p.status, status);
  log(projectId, `[${step}] ${message}${extra.error ? `\n${extra.error}` : ""}`);
};

export const log = (projectId: string | null, line: string) => {
  if (!projectId) return;
  const p = projectPaths(projectId);
  fs.mkdirSync(p.logs, { recursive: true });
  fs.appendFileSync(
    path.join(p.logs, "pipeline.log"),
    `${new Date().toISOString()} ${line}\n`,
  );
};

/** Deduce el id de proyecto si el archivo vive dentro de projects/<id>/. */
export const projectIdFromPath = (file: string): string | null => {
  const parts = path.resolve(file).split(path.sep);
  const i = parts.lastIndexOf("projects");
  return i >= 0 && parts[i + 1] ? parts[i + 1] : null;
};
