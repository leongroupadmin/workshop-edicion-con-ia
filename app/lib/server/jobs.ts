import "server-only";
import { spawn } from "node:child_process";
import path from "node:path";
import { emit, setRunning, store } from "./bus";
import { ROOT } from "./fsutil";
import { appendLog, readStatus, writeStatus } from "./projects";

/**
 * Corre un script del pipeline (scripts/*.ts) sin pasar por Claude.
 * Los scripts actualizan status.json; acá solo guardamos la salida en
 * logs/jobs.log y avisamos al panel cuando terminan.
 */
export const runScript = (
  id: string,
  label: string,
  script: string,
  args: string[],
  onDone?: (ok: boolean) => void,
) => {
  if (store.running.has(id)) throw new Error("Ya hay un proceso corriendo en este proyecto. Esperá a que termine.");
  const tsx = path.join(ROOT, "node_modules", ".bin", "tsx");
  const child = spawn(tsx, [path.join("scripts", script), id, ...args], {
    cwd: ROOT,
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  appendLog(id, "jobs.log", `$ tsx scripts/${script} ${id} ${args.join(" ")}`);
  setRunning(id, { kind: "job", label, abort: () => child.kill("SIGTERM") });

  const recent: string[] = [];
  const onData = (d: Buffer) => {
    for (const line of d.toString().split("\n")) {
      if (line.trim()) {
        recent.push(line.trim());
        if (recent.length > 8) recent.shift();
      }
      // Las líneas de progreso de Remotion son muy repetitivas; no ensuciar el log
      if (line.trim() && !/DeprecationWarning|trace-deprecation/.test(line)) appendLog(id, "jobs.log", line);
    }
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  child.on("close", (code) => {
    setRunning(id, null);
    const ok = code === 0;
    if (!ok && readStatus(id).step !== "error") {
      writeStatus(id, "error", `Falló: ${label}`, {
        error: recent.filter((l) => !/DeprecationWarning|trace-deprecation/.test(l)).slice(-5).join("\n") || `El proceso terminó con código ${code}.`,
      });
    }
    emit(id, { type: "refresh" });
    onDone?.(ok);
  });
  child.on("error", (err) => {
    setRunning(id, null);
    writeStatus(id, "error", `No se pudo iniciar: ${label}`, { error: err.message });
  });
};
