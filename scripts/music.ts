/**
 * Música de fondo desde la biblioteca de HeyGen (más de 10.000 temas).
 *
 * Uso:
 *   npx tsx scripts/music.ts search "<estilo>" [--limit 8]   lista temas que coinciden
 *   npx tsx scripts/music.ts pick <projectId> "<estilo>"    baja el mejor tema a assets/music/
 *                                                          y lo deja elegido en settings.json
 *
 * El estilo se describe en inglés o español, concreto: "uplifting corporate
 * piano", "lofi chill", "epic motivational", "acoustic warm", "electronic
 * energetic"… Necesita la sesión de HeyGen (npx hyperframes auth login).
 */
import fs from "node:fs";
import { MUSIC_DIR, projectPaths } from "./lib/config";
import { downloadMusic, searchMusic } from "./lib/heygen";
import { readJson, writeJson } from "./lib/media";
import { log } from "./lib/status";

const main = async () => {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "search") {
    const query = rest.filter((a) => !a.startsWith("--"))[0];
    const li = rest.indexOf("--limit");
    if (!query) throw new Error('Uso: npx tsx scripts/music.ts search "<estilo>"');
    const results = await searchMusic(query, li >= 0 ? Number(rest[li + 1]) : 8);
    for (const r of results) {
      console.log(`${r.name} · ${r.durationS ? `${Math.round(r.durationS)}s` : "?"}`);
    }
    if (!results.length) console.log("Sin resultados: probá con otro estilo.");
    return;
  }
  if (cmd === "pick") {
    const [id, query] = rest;
    if (!id || !query) throw new Error('Uso: npx tsx scripts/music.ts pick <projectId> "<estilo>"');
    const p = projectPaths(id);
    if (!fs.existsSync(p.dir)) throw new Error(`No existe el proyecto ${id}`);
    const [best] = await searchMusic(query, 5);
    if (!best) throw new Error(`No encontré música para "${query}". Probá con otro estilo.`);
    const file = await downloadMusic(best, MUSIC_DIR);
    const settings = readJson<Record<string, unknown>>(p.settings, {});
    const music = { ...((settings.music as Record<string, unknown>) ?? {}), enabled: true, track: file };
    writeJson(p.settings, { ...settings, music });
    log(id, `[music] "${query}" → assets/music/${file} (${best.name})`);
    console.log(`Música elegida: ${best.name} → assets/music/${file}`);
    return;
  }
  throw new Error('Uso: npx tsx scripts/music.ts search "<estilo>" | pick <projectId> "<estilo>"');
};

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

