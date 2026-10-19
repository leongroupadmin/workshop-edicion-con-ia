/**
 * Renderiza un videíto de muestra de cada transición para la pestaña
 * "Transiciones" del panel → app/public/transitions/<tipo>.mp4.
 * Volver a correrlo si cambia src/edit/transitions.tsx.
 *
 * Uso: npx tsx scripts/transition-demos.ts [tipo…]   (sin tipos: todas)
 */
import { renderMedia, selectComposition } from "@remotion/renderer";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/config";
import { getBundle } from "./render";

const KINDS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["flash", "fade", "wipe", "zoom", "whip", "blur", "glitch", "lightleak", "shake", "zoomblur", "spin", "iris", "blinds", "filmburn"];

const main = async () => {
  const outDir = path.join(ROOT, "app", "public", "transitions");
  fs.mkdirSync(outDir, { recursive: true });
  const serveUrl = await getBundle(() => {});
  for (const kind of KINDS) {
    const inputProps = { kind };
    const composition = await selectComposition({ serveUrl, id: "TransitionDemo", inputProps });
    const out = path.join(outDir, `${kind}.mp4`);
    await renderMedia({ composition, serveUrl, inputProps, codec: "h264", muted: true, crf: 26, outputLocation: out });
    console.log(`OK ${path.relative(ROOT, out)}`);
  }
};

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
