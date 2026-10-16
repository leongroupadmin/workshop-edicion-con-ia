// Sends only invented text; never reads a video, transcript or project file.
import { selectClips } from "./select";
import { CLIP_DEFAULTS } from "../../src/clips/types";
import type { Transcript } from "../../src/pipeline/types";
const words =
  "Una idea sencilla para organizar tu día es elegir una sola prioridad antes de abrir el correo Así empezás por lo importante y evitás distraerte con tareas menores Esta es una transcripción ficticia creada exclusivamente para probar el selector de clips"
    .split(" ")
    .map((text, i) => ({
      text,
      startMs: i * 600,
      endMs: i * 600 + 500,
      confidence: 1,
    }));
const transcript: Transcript = {
  version: 1,
  source: "synthetic",
  language: "es",
  model: "synthetic",
  durationMs: words.length * 600,
  createdAt: "",
  text: words.map((w) => w.text).join(" "),
  words,
};
selectClips(transcript, {
  ...CLIP_DEFAULTS,
  aiProvider: process.argv[2] === "openai" ? "openai" : "anthropic",
  brand: "demo",
  minSeconds: 5,
  maxSeconds: 30,
  count: 1,
  instructions:
    "Usá solo la idea sobre organizar el día. El texto es ficticio.",
})
  .then((c) => console.log(JSON.stringify(c)))
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
