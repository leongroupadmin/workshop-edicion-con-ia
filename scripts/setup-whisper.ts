/**
 * Instala whisper.cpp dentro del proyecto (./whisper.cpp) y descarga el modelo.
 * Uso: npx tsx scripts/setup-whisper.ts
 */
import {
  downloadWhisperModel,
  installWhisperCpp,
} from "@remotion/install-whisper-cpp";
import fs from "node:fs";
import path from "node:path";
import { WHISPER_MODEL, WHISPER_PATH, WHISPER_VERSION } from "./lib/config";

const main = async () => {
  console.log(`Instalando whisper.cpp ${WHISPER_VERSION} en ${WHISPER_PATH}…`);
  await installWhisperCpp({ to: WHISPER_PATH, version: WHISPER_VERSION });
  // En Windows el zip precompilado trae los binarios en Release/, pero
  // transcribe() de Remotion los busca en build/bin/ (desde 1.7.4).
  const release = path.join(WHISPER_PATH, "Release");
  const bin = path.join(WHISPER_PATH, "build", "bin");
  if (process.platform === "win32" && fs.existsSync(release)) {
    fs.cpSync(release, bin, { recursive: true });
  }

  console.log(`Descargando modelo "${WHISPER_MODEL}"…`);
  let last = -1;
  await downloadWhisperModel({
    model: WHISPER_MODEL,
    folder: WHISPER_PATH,
    onProgress: (downloaded, total) => {
      const pct = Math.floor((downloaded / total) * 100);
      if (pct !== last && pct % 5 === 0) {
        last = pct;
        console.log(`  modelo: ${pct}%`);
      }
    },
  });
  // Marca de "modelo completo": transcribe.ts la exige para no usar un archivo a medio bajar.
  fs.writeFileSync(path.join(WHISPER_PATH, `.ready-${WHISPER_MODEL}`), new Date().toISOString());
  console.log("Whisper listo.");
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
