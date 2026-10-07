import "server-only";
import {
  query,
  type HookCallback,
  type PreToolUseHookInput,
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { MIN_SCENE_DURATION_MS, SCENE_TYPES } from "../types";
import type { ChatEntry, ChatTool, Plan, PlanItem } from "../types";
import { emit, setRunning, store } from "./bus";
import { ROOT } from "./fsutil";
import {
  appendChat,
  appendLog,
  listVersions,
  paths,
  readChat,
  readMeta,
  readPlan,
  readSettings,
  readStatus,
  writeMeta,
  writePlan,
  writeStatus,
} from "./projects";

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

const ALLOWED_TOOLS = [
  "Bash",
  "Read",
  "Write",
  "Edit",
  "MultiEdit",
  "Glob",
  "Grep",
  "Skill",
  "TodoWrite",
  "WebFetch",
  "WebSearch",
  "Task",
];

const panelContext = (id: string) => `
# Contexto del panel web
Estás atendiendo el chat del panel de edición para el proyecto \`${id}\`
(carpeta \`projects/${id}/\`). Todo pedido se refiere a ese proyecto.
- El usuario NO ve la terminal ni los archivos: contale en el chat, en
  español y en pocas líneas, qué hiciste, qué cambió y qué falta.
- Seguí el pipeline y las reglas de CLAUDE.md. Después del paso 3 (plan.json
  en "draft") frená: el usuario revisa el plan y toca "Renderizar" en el panel,
  que lo aprueba, te pide los gráficos que falten y arma el video. Si te piden
  cambios de configuración (formato, subtítulos, música, estilo), podés decirle
  que están en el panel "Configuración" y se aplican con "Re-renderizar".
- Cada render nuevo: \`npx tsx scripts/render.ts ${id} --note "<pedido>"\`.
  El panel muestra las versiones solo; no hace falta que pases rutas.
- Si necesitás una decisión o un archivo del usuario, preguntalo en el texto
  y terminá el turno (no hay diálogos interactivos).
- La marca de este proyecto está en \`projects/${id}/brand/\`: usá sus colores, logo y fuentes. Solo si esa carpeta no existe, usá \`assets/brand/\`.
- Trabajá solo dentro de este repo. No borres ni pises versions/ ni raw/.
- Escribí SIEMPRE en español, también los comentarios cortos entre pasos.
- Antes de contar qué tiene una versión, verificalo (p.ej. \`music\` en
  versions/vN.json); no afirmes nada que no hayas comprobado.
`;

/** Hook de seguridad: bloquea comandos que podrían borrar videos o salir del repo. */
const guard: HookCallback = async (input) => {
  const i = input as PreToolUseHookInput;
  const deny = (reason: string) => ({
    hookSpecificOutput: {
      hookEventName: "PreToolUse" as const,
      permissionDecision: "deny" as const,
      permissionDecisionReason: reason,
    },
  });
  const ti = (i.tool_input ?? {}) as Record<string, unknown>;
  if (i.tool_name === "Bash") {
    const cmd = String(ti.command ?? "");
    if (/\brm\b[^|;&]*\b(versions|raw)\b/.test(cmd) || /\bmv\b[^|;&]*versions\/v\d+\.mp4/.test(cmd)) {
      return deny("No se pueden borrar ni mover versiones ni el video original.");
    }
    if (/\brm\s+-[a-z]*r[a-z]*\s+(\/|~|\.\.)/.test(cmd)) return deny("Comando de borrado fuera del proyecto bloqueado.");
    if (/\bsudo\b/.test(cmd)) return deny("sudo no está permitido desde el panel.");
  }
  if (["Write", "Edit", "MultiEdit"].includes(i.tool_name)) {
    const fp = path.resolve(ROOT, String(ti.file_path ?? ""));
    if (!fp.startsWith(ROOT + path.sep)) return deny("Solo se puede escribir dentro del proyecto.");
    if (/\/versions\/v\d+\.mp4$/.test(fp) || /\/raw\//.test(fp)) return deny("No se pueden pisar versiones ni el original.");
  }
  return {};
};

const rel = (p: unknown) => (typeof p === "string" ? path.relative(ROOT, path.resolve(ROOT, p)) : "");

const toolSummary = (name: string, input: Record<string, unknown>): ChatTool => {
  let summary = "";
  if (name === "Bash") summary = String(input.description || input.command || "").slice(0, 120);
  else if (["Read", "Write", "Edit", "MultiEdit"].includes(name)) summary = rel(input.file_path);
  else if (name === "Skill") summary = String(input.skill ?? input.command ?? "");
  else if (name === "Glob" || name === "Grep") summary = String(input.pattern ?? "");
  else if (name === "TodoWrite") summary = "actualiza su lista de tareas";
  else if (name === "Task") summary = String(input.description ?? "");
  else summary = JSON.stringify(input).slice(0, 100);
  return { name, summary };
};

export const friendlyError = (msg: string) => {
  if (/api key|apiKey|authentication|401|invalid x-api-key|not logged in|login|OAuth|credit balance/i.test(msg)) {
    return `Claude no pudo autenticarse. Iniciá sesión una vez con: cd app && npm run claude:login (o completá app/.env.local) y reintentá.\n\nDetalle: ${msg}`;
  }
  return msg;
};

export type AgentKind = "chat" | "plan" | "approve" | "changes";

export const isBusy = (id: string) => store.running.has(id);

/**
 * Manda un mensaje a Claude para este proyecto. La sesión se guarda en
 * project.json (sessionId) y se reanuda en cada pedido para mantener el contexto.
 */
export const runAgent = (
  id: string,
  text: string,
  opts: {
    kind?: AgentKind;
    visibleText?: string;
    role?: ChatEntry["role"];
    /** Se llama al terminar (con el error, o null si salió bien); sirve para encadenar el render. */
    onDone?: (error: string | null) => void;
  } = {},
) => {
  // La generación de escenas conserva el agente de Claude: es el que hoy tiene
  // el entorno local, las skills de HyperFrames y los permisos acotados para
  // crear los archivos que después usa Remotion. Plan y chat sí respetan el
  // proveedor elegido en la configuración del proyecto.
  if (readSettings(id).aiProvider === "openai" && opts.kind !== "approve") return runOpenAiAgent(id, text, opts);
  if (isBusy(id)) throw new Error("Claude o un render ya están trabajando en este proyecto. Esperá a que termine.");
  const kind = opts.kind ?? "chat";

  appendChat(id, {
    id: crypto.randomUUID(),
    role: opts.role ?? "user",
    text: opts.visibleText ?? text,
    createdAt: new Date().toISOString(),
  });

  const entry: ChatEntry = {
    id: crypto.randomUUID(),
    role: "assistant",
    text: "",
    createdAt: new Date().toISOString(),
    tools: [],
  };
  store.live.set(id, entry);
  emit(id, { type: "chat", entry: { ...entry } });

  const abort = new AbortController();
  setRunning(id, { kind: "agent", label: "Claude está trabajando…", abort: () => abort.abort() });

  if (kind === "plan") writeStatus(id, "planning", "Claude está armando el plan de edición…");
  if (kind === "approve") writeStatus(id, "generating_scenes", "Claude está generando las escenas con HyperFrames…");
  if (kind === "changes") writeStatus(id, "planning", "Claude está ajustando el plan…");

  const versionsBefore = listVersions(id).at(-1)?.version ?? 0;
  void (async () => {
    const resume = readMeta(id).sessionId;
    try {
      await consume(id, entry, text, abort, resume);
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      // Si la sesión guardada ya no existe, arrancar una nueva.
      if (resume && /session|No conversation found|resume/i.test(msg) && !entry.text) {
        appendLog(id, "agent.log", `No se pudo reanudar la sesión ${resume}; se crea una nueva.`);
        writeMeta(id, { sessionId: undefined });
        try {
          await consume(id, entry, text, abort, undefined);
        } catch (err2) {
          entry.error = friendlyError((err2 as Error).message);
        }
      } else if (abort.signal.aborted) {
        entry.error = "Detenido por el usuario.";
      } else {
        entry.error = friendlyError(msg);
      }
    } finally {
      store.live.delete(id);
      appendChat(id, entry);
      setRunning(id, null);
      if (opts.onDone) opts.onDone(entry.error ?? null);
      else reconcile(id, kind, versionsBefore, entry);
      emit(id, { type: "refresh" });
    }
  })();
  return entry.id;
};

const consume = async (
  id: string,
  entry: ChatEntry,
  prompt: string,
  abort: AbortController,
  resume: string | undefined,
) => {
  const q = query({
    prompt,
    options: {
      cwd: ROOT,
      resume,
      model: MODEL,
      settingSources: ["project"],
      skills: "all",
      systemPrompt: { type: "preset", preset: "claude_code", append: panelContext(id) },
      permissionMode: "acceptEdits",
      allowedTools: ALLOWED_TOOLS,
      disallowedTools: ["AskUserQuestion", "EnterPlanMode", "ExitPlanMode"],
      includePartialMessages: true,
      abortController: abort,
      hooks: { PreToolUse: [{ hooks: [guard] }] },
      env: { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: "editor-panel/1.0" },
      stderr: (d) => appendLog(id, "agent.log", `[stderr] ${d.trim()}`),
    },
  });

  let sawDeltaInMessage = false;
  for await (const msg of q as AsyncIterable<SDKMessage>) {
    if (msg.type === "system" && msg.subtype === "init") {
      writeMeta(id, { sessionId: msg.session_id });
      appendLog(id, "agent.log", `Sesión ${msg.session_id} · modelo ${msg.model} · credencial ${msg.apiKeySource}`);
      continue;
    }
    if (msg.type === "stream_event") {
      if (msg.parent_tool_use_id) continue; // subagentes
      const ev = msg.event;
      if (ev.type === "message_start") sawDeltaInMessage = false;
      if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
        sawDeltaInMessage = true;
        entry.text += ev.delta.text;
        emit(id, { type: "delta", entryId: entry.id, text: ev.delta.text });
      }
      continue;
    }
    if (msg.type === "assistant") {
      if (msg.parent_tool_use_id) continue;
      for (const block of msg.message.content) {
        if (block.type === "tool_use") {
          const tool = toolSummary(block.name, (block.input ?? {}) as Record<string, unknown>);
          entry.tools!.push(tool);
          appendLog(id, "agent.log", `[tool] ${tool.name}: ${tool.summary}`);
          emit(id, { type: "tool", entryId: entry.id, tool });
          // Separar el texto de antes y después de las herramientas
          if (entry.text && !entry.text.endsWith("\n\n")) {
            entry.text += "\n\n";
            emit(id, { type: "delta", entryId: entry.id, text: "\n\n" });
          }
        } else if (block.type === "text" && !sawDeltaInMessage) {
          entry.text += block.text;
          emit(id, { type: "delta", entryId: entry.id, text: block.text });
        }
      }
      continue;
    }
    if (msg.type === "result") {
      entry.costUsd = msg.total_cost_usd;
      if (msg.subtype !== "success" || msg.is_error) {
        const detail = "result" in msg && typeof msg.result === "string" ? msg.result : msg.subtype;
        entry.error = friendlyError(detail || "Claude terminó con un error.");
      }
      appendLog(id, "agent.log", `[result] ${msg.subtype} · ${msg.num_turns} turnos · US$ ${msg.total_cost_usd?.toFixed(3)}`);
    }
  }
  entry.text = entry.text.trim();
};

/**
 * Implementación separada para OpenAI. No toca la sesión de Claude ni sus
 * credenciales: usa la sesión de ChatGPT ya iniciada en Codex CLI. No requiere
 * API key ni lee los tokens; Codex CLI los administra en su propio almacén.
 * Guardamos el contexto del proyecto localmente para que cada llamada pueda
 * entender el video y el plan vigente.
 */
const CODEX_BIN = process.env.CODEX_CLI_PATH || "/Applications/Codex.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex";
// Terra ofrece buena calidad de planificación con un costo muy inferior a Astra.
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.6-terra";

type RunOptions = {
  kind?: AgentKind;
  visibleText?: string;
  role?: ChatEntry["role"];
  onDone?: (error: string | null) => void;
};

const projectContext = (id: string) => {
  const p = paths(id);
  const transcript = fs.existsSync(p.cutTranscript) ? fs.readFileSync(p.cutTranscript, "utf8").slice(0, 50_000) : "(aún no disponible)";
  const plan = readPlan(id);
  const history = readChat(id).slice(-12).map((entry) => `${entry.role}: ${entry.text}`).join("\n");
  return `Proyecto ${id}. Ajustes: ${JSON.stringify(readSettings(id))}\n\nPlan actual: ${JSON.stringify(plan)}\n\nConversación reciente:\n${history}\n\nTranscripción del video ya cortado:\n${transcript}`;
};

const validPlan = (value: unknown): Plan | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.items)) return null;
  const allowed = new Set(["title", "motion_graphic", "overlay", "lower_third", "broll", "transition", "sfx", "zoom"]);
  const items: PlanItem[] = [];
  for (const [index, item] of raw.items.entries()) {
    if (!item || typeof item !== "object") return null;
    const it = item as Record<string, unknown>;
    const type = typeof it.type === "string" && allowed.has(it.type) ? it.type as PlanItem["type"] : null;
    const startMs = Number(it.startMs);
    const endMs = Number(it.endMs);
    if (!type || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
    if (SCENE_TYPES.has(type) && endMs - startMs < MIN_SCENE_DURATION_MS) return null;
    items.push({
      id: typeof it.id === "string" && /^[a-z0-9_-]+$/i.test(it.id) ? it.id : `item-${index + 1}`,
      type,
      startMs: Math.max(0, Math.round(startMs)),
      endMs: Math.round(endMs),
      description: typeof it.description === "string" ? it.description.slice(0, 1000) : "",
      reason: typeof it.reason === "string" ? it.reason.slice(0, 1000) : "",
      ...(typeof it.text === "string" ? { text: it.text.slice(0, 300) } : {}),
      ...(it.layout === "overlay" || it.layout === "fullscreen" || it.layout === "split" ? { layout: it.layout } : {}),
      ...(typeof it.transition === "string" ? { transition: it.transition.slice(0, 80) } : {}),
      ...(Number.isFinite(Number(it.scale)) ? { scale: Number(it.scale) } : {}),
      ...(typeof it.hideCaptions === "boolean" ? { hideCaptions: it.hideCaptions } : {}),
      status: "pending",
    });
  }
  return {
    version: 1,
    status: "draft",
    createdAt: new Date().toISOString(),
    ...(typeof raw.summary === "string" ? { summary: raw.summary.slice(0, 2000) } : {}),
    ...(Array.isArray(raw.keywords) ? { keywords: raw.keywords.filter((x): x is string => typeof x === "string").slice(0, 30) } : {}),
    items,
  };
};

/** Codex puede envolver la salida estructurada en un bloque Markdown. */
const parseOpenAiReply = (raw: string): { reply?: unknown; plan?: unknown } => {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = (fenced ?? raw).trim();
  try {
    return JSON.parse(candidate) as { reply?: unknown; plan?: unknown };
  } catch {
    const start = candidate.indexOf("{");
    if (start >= 0) {
      let depth = 0;
      let quoted = false;
      let escaped = false;
      for (let i = start; i < candidate.length; i++) {
        const char = candidate[i];
        if (quoted) {
          if (escaped) escaped = false;
          else if (char === "\\") escaped = true;
          else if (char === '"') quoted = false;
          continue;
        }
        if (char === '"') quoted = true;
        else if (char === "{") depth++;
        else if (char === "}" && --depth === 0) {
          return JSON.parse(candidate.slice(start, i + 1)) as { reply?: unknown; plan?: unknown };
        }
      }
    }
    throw new Error("OpenAI no devolvió una respuesta válida. Reintentá.");
  }
};

const openAiRequest = async (instructions: string, input: string, signal: AbortSignal) => {
  if (!fs.existsSync(CODEX_BIN)) throw new Error("No encontré Codex CLI para usar tu cuenta de ChatGPT.");
  const prompt = `${instructions}\n\n${input}`;
  const args = ["exec", "--json", "--ephemeral", "--sandbox", "read-only", "-C", ROOT];
  args.push("--model", OPENAI_MODEL);
  args.push(prompt);
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(CODEX_BIN, args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const stop = () => child.kill("SIGTERM");
    signal.addEventListener("abort", stop, { once: true });
    child.stdout.on("data", (chunk: Buffer) => { out += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { err += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      signal.removeEventListener("abort", stop);
      if (signal.aborted) return reject(new Error("Detenido por el usuario."));
      if (code !== 0) return reject(new Error(err.trim() || `Codex terminó con código ${code}.`));
      const messages = out
        .split("\n")
        .flatMap((line) => {
          try { return [JSON.parse(line) as { type?: string; item?: { type?: string; text?: string } }]; } catch { return []; }
        })
        .filter((event) => event.type === "item.completed" && event.item?.type === "agent_message")
        .map((event) => event.item?.text ?? "");
      const text = messages.join("\n").trim();
      if (!text) return reject(new Error("Codex no devolvió una respuesta."));
      resolve(text);
    });
  });
};

const runOpenAiAgent = (id: string, text: string, opts: RunOptions = {}) => {
  if (isBusy(id)) throw new Error("OpenAI o un render ya están trabajando en este proyecto. Esperá a que termine.");
  const kind = opts.kind ?? "chat";
  appendChat(id, { id: crypto.randomUUID(), role: opts.role ?? "user", text: opts.visibleText ?? text, createdAt: new Date().toISOString() });
  const entry: ChatEntry = { id: crypto.randomUUID(), role: "assistant", text: "", createdAt: new Date().toISOString(), tools: [] };
  store.live.set(id, entry);
  emit(id, { type: "chat", entry: { ...entry } });
  const abort = new AbortController();
  setRunning(id, { kind: "agent", label: "OpenAI está trabajando…", abort: () => abort.abort() });
  if (kind === "plan") writeStatus(id, "planning", "OpenAI está armando el plan de edición…");
  if (kind === "changes") writeStatus(id, "planning", "OpenAI está ajustando el plan…");
  const versionsBefore = listVersions(id).at(-1)?.version ?? 0;
  void (async () => {
    try {
      const wantsPlan = kind === "plan" || kind === "changes";
      const instructions = `Sos la IA de una app de edición de video. Respondé SIEMPRE con JSON válido, sin Markdown: {"reply":"respuesta breve en español","plan":null}. Si el pedido es armar o cambiar el plan de edición, reemplazá null con el plan completo. El plan debe tener version:1, summary, keywords y items. Cada item requiere id, type, startMs, endMs, description y reason. Usá solo title, motion_graphic, overlay, lower_third, broll, transition, sfx o zoom. REGLA INVIOLABLE: title, motion_graphic, overlay, lower_third y broll deben durar al menos 2000 ms (endMs - startMs >= 2000); no aplica a subtítulos, transiciones, zooms ni efectos de sonido. El plan queda en borrador; no generes escenas ni renderices.${wantsPlan ? " Este pedido exige que plan no sea null." : ""}`;
      const request = wantsPlan
        ? "Armá o actualizá el plan de edición usando la transcripción, los ajustes y el plan actual incluidos en el contexto."
        : text;
      const context = `${projectContext(id)}\n\nPedido: ${request}`;
      let parsed = parseOpenAiReply(await openAiRequest(instructions, context, abort.signal));
      // Algunos turnos de Codex responden el envoltorio de chat con plan:null,
      // aun cuando el pedido inicial es explícitamente de planificación. En ese
      // caso hacemos un único repreguntado acotado, con el contrato sin
      // ambigüedad, antes de marcar el proyecto como fallido.
      if (wantsPlan && !parsed.plan) {
        const retryInstructions = `Respondé ÚNICAMENTE JSON válido, sin Markdown ni texto adicional. La respuesta DEBE tener esta forma: {"reply":"resumen breve en español","plan":{"version":1,"summary":"...","keywords":["..."],"items":[...]}}. plan no puede ser null. Cada item exige id, type, startMs, endMs, description y reason. Tipos permitidos: title, motion_graphic, overlay, lower_third, broll, transition, sfx, zoom. REGLA INVIOLABLE: cada title, motion_graphic, overlay, lower_third o broll debe durar 2000 ms o más. Armá ahora el plan completo con el contexto recibido.`;
        parsed = parseOpenAiReply(await openAiRequest(retryInstructions, context, abort.signal));
      }
      if (parsed.plan) {
        const plan = validPlan(parsed.plan);
        if (!plan) throw new Error("OpenAI devolvió un plan incompleto. Reintentá.");
        writePlan(id, plan);
        entry.tools!.push({ name: "Write", summary: "plan.json" });
        entry.text = typeof parsed.reply === "string" ? parsed.reply : plan.summary || "Plan actualizado.";
      } else {
        if (wantsPlan) throw new Error("OpenAI no devolvió un plan. Reintentá.");
        entry.text = typeof parsed.reply === "string" ? parsed.reply : "OpenAI no devolvió una respuesta.";
      }
      emit(id, { type: "delta", entryId: entry.id, text: entry.text });
    } catch (err) {
      entry.error = abort.signal.aborted ? "Detenido por el usuario." : (err as Error).message;
    } finally {
      store.live.delete(id);
      appendChat(id, entry);
      setRunning(id, null);
      if (opts.onDone) opts.onDone(entry.error ?? null);
      else reconcile(id, kind, versionsBefore, entry);
      emit(id, { type: "refresh" });
    }
  })();
  return entry.id;
};

/** Deja status.json coherente con lo que pasó en el turno de la IA elegida. */
const reconcile = (id: string, kind: AgentKind, versionsBefore: number, entry: ChatEntry) => {
  const provider = readSettings(id).aiProvider === "openai" ? "OpenAI" : "Claude";
  const status = readStatus(id);
  const plan = readPlan(id);
  const versionsNow = listVersions(id).at(-1)?.version ?? 0;
  if (entry.error && status.step !== "error") {
    writeStatus(id, "error", `${provider} no pudo completar el pedido`, { error: entry.error });
    return;
  }
  if (status.step === "error") return;
  if (versionsNow > versionsBefore) {
    if (status.step !== "done") writeStatus(id, "done", `Versión v${versionsNow} lista.`);
    return;
  }
  if (plan && plan.status === "draft") {
    writeStatus(id, "awaiting_approval", "Plan listo: revisalo y tocá Renderizar.");
    return;
  }
  if (["planning", "generating_scenes", "assembling", "rendering"].includes(status.step)) {
    writeStatus(id, versionsNow ? "done" : "idle", kind === "plan" ? `${provider} no dejó un plan. Pedíselo por el chat.` : `${provider} terminó.`);
  }
};
