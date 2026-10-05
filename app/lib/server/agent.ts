import "server-only";
import {
  query,
  type HookCallback,
  type PreToolUseHookInput,
  type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import crypto from "node:crypto";
import path from "node:path";
import type { ChatEntry, ChatTool } from "../types";
import { emit, setRunning, store } from "./bus";
import { ROOT } from "./fsutil";
import {
  appendChat,
  appendLog,
  listVersions,
  readMeta,
  readPlan,
  readStatus,
  writeMeta,
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

/** Deja status.json coherente con lo que pasó en el turno de Claude. */
const reconcile = (id: string, kind: AgentKind, versionsBefore: number, entry: ChatEntry) => {
  const status = readStatus(id);
  const plan = readPlan(id);
  const versionsNow = listVersions(id).at(-1)?.version ?? 0;
  if (entry.error && status.step !== "error") {
    writeStatus(id, "error", "Claude no pudo completar el pedido", { error: entry.error });
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
    writeStatus(id, versionsNow ? "done" : "idle", kind === "plan" ? "Claude no dejó un plan. Pedíselo por el chat." : "Claude terminó.");
  }
};
