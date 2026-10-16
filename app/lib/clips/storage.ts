import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const ROOT =
  process.env.REPO_ROOT ||
  path.resolve(
    process.cwd(),
    path.basename(process.cwd()) === "app" ? ".." : ".",
  );
import type { ClipJob } from "./types";
export const CLIPS_DIR = path.join(ROOT, "clips");
export function clipDir(id: string) {
  if (!/^c-[a-f0-9-]{36}$/.test(id))
    throw new Error("Proyecto de Clips inválido.");
  return path.join(CLIPS_DIR, id);
}
export function readJob(id: string): ClipJob {
  const job = JSON.parse(
    fs.readFileSync(path.join(clipDir(id), "job.json"), "utf8"),
  ) as ClipJob;
  if (job.schema !== "clips-v2" || job.id !== id)
    throw new Error("Proyecto de Clips inválido.");
  return job;
}
export function saveJob(job: ClipJob) {
  const dir = clipDir(job.id);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.job-${crypto.randomUUID()}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(job, null, 2));
  fs.renameSync(tmp, path.join(dir, "job.json"));
}
export function busy(id: string) {
  const lock = path.join(clipDir(id), ".lock");
  try {
    const pid = Number(fs.readFileSync(lock, "utf8"));
    if (!Number.isInteger(pid) || pid <= 0) return false;
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
export function claim(id: string) {
  const lock = path.join(clipDir(id), ".lock");
  if (busy(id)) throw new Error("Este proyecto ya está trabajando.");
  fs.rmSync(lock, { force: true });
  fs.writeFileSync(lock, String(process.pid), { flag: "wx" });
  return () => fs.rmSync(lock, { force: true });
}
