/**
 * Música de fondo desde la biblioteca de HeyGen (búsqueda, NO generación).
 * Usa la sesión de `npx hyperframes auth login` (~/.heygen/credentials). Solo
 * se baja el audio a tu compu; no se sube nada.
 * Copia de scripts/lib/heygen.ts para el panel (mantener en sync).
 */
import "server-only";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = "https://api.heygen.com/v3";

export type MusicResult = {
  id: string;
  name: string;
  description: string;
  durationS: number | null;
  url: string;
};

const readCredential = (): Record<string, string> | "expired" | null => {
  if (process.env.HEYGEN_API_KEY) return { "X-Api-Key": process.env.HEYGEN_API_KEY };
  const file = path.join(process.env.HEYGEN_CONFIG_DIR || path.join(os.homedir(), ".heygen"), "credentials");
  let raw = "";
  try {
    raw = fs.readFileSync(file, "utf8").trim();
  } catch {
    return null;
  }
  if (!raw) return null;
  if (!raw.startsWith("{")) return { "X-Api-Key": raw };
  try {
    const cred = JSON.parse(raw);
    const o = cred.oauth;
    if (o?.access_token) {
      const expired = o.expires_at && new Date(o.expires_at).getTime() - 60_000 < Date.now();
      if (!expired) return { Authorization: `Bearer ${o.access_token}`, "X-HeyGen-Source": "cli" };
      if (!cred.api_key) return "expired";
    }
    return cred.api_key ? { "X-Api-Key": cred.api_key } : null;
  } catch {
    return null;
  }
};

/** Encabezados de la sesión de HeyGen (renueva la sesión si venció). */
export const heygenHeaders = (): Record<string, string> => {
  let cred = readCredential();
  if (cred === "expired") {
    // En Windows npx es un .cmd: necesita la consola (los argumentos son fijos, sin espacios).
    spawnSync("npx", ["--yes", "hyperframes", "auth", "refresh"], { stdio: "ignore", shell: process.platform === "win32" });
    cred = readCredential();
  }
  if (!cred || cred === "expired") {
    throw new Error("No hay sesión de HeyGen. Iniciala una vez con: npx hyperframes auth login");
  }
  return { ...cred, "X-HeyGen-Client-Source": "media-use" };
};

export const searchMusic = async (query: string, limit = 8): Promise<MusicResult[]> => {
  const params = new URLSearchParams({ query, type: "music", limit: String(Math.min(50, limit)) });
  const res = await fetch(`${BASE}/audio/sounds?${params}`, { headers: heygenHeaders() });
  if (!res.ok) throw new Error(`HeyGen respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const payload = await res.json();
  const data = payload?.data ?? payload;
  const list: Record<string, unknown>[] = Array.isArray(data) ? data : data && typeof data === "object" ? Object.values(data) : [];
  return list
    .filter((r) => typeof r.audio_url === "string")
    .map((r, i) => ({
      id: String(r.id ?? r.sound_id ?? `${query}-${i}`),
      // El "name" de HeyGen es un código ("Astral Generated Music: 647f…"); la descripción dice cómo suena
      name: String(r.description || r.name || `Tema ${i + 1}`),
      description: String(r.description ?? ""),
      durationS: typeof r.duration === "number" ? r.duration : null,
      url: r.audio_url as string,
    }));
};

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "tema";

/** Baja un tema a `dir` y devuelve el nombre del archivo (si ya estaba bajado, lo reusa). */
export const downloadMusic = async (r: MusicResult, dir: string): Promise<string> => {
  const ext = /\.(mp3|wav|m4a|aac|ogg)(\?|$)/i.exec(r.url)?.[1]?.toLowerCase() ?? "mp3";
  const name = `${slug(r.name).slice(0, 44).replace(/-+$/, "")}-${r.id.slice(0, 6)}.${ext}`;
  if (fs.existsSync(path.join(dir, name))) return name;
  const res = await fetch(r.url);
  if (!res.ok) throw new Error(`No se pudo bajar el tema (${res.status}).`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), Buffer.from(await res.arrayBuffer()));
  return name;
};
