"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { api } from "@/lib/client";
import type { ChatEntry, ProjectState } from "@/lib/types";
import { Button, Panel, Spinner } from "./ui";

const TOOL_ICON: Record<string, string> = {
  Bash: "⌘",
  Read: "📄",
  Write: "✍️",
  Edit: "✏️",
  MultiEdit: "✏️",
  Skill: "🧩",
  Glob: "🔎",
  Grep: "🔎",
  TodoWrite: "☑️",
  WebFetch: "🌐",
  WebSearch: "🌐",
  Task: "🤖",
};

const Tools = ({ tools, live }: { tools: ChatEntry["tools"]; live?: boolean }) => {
  const [open, setOpen] = useState(false);
  if (!tools?.length) return null;
  const shown = open ? tools : tools.slice(-3);
  return (
    <div className="mt-2 rounded-md border border-line bg-black/30 text-[11px] text-neutral-400">
      <button onClick={() => setOpen((o) => !o)} className="w-full text-left px-2 py-1 hover:text-neutral-200">
        {live ? "Trabajando" : "Hizo"} {tools.length} paso{tools.length > 1 ? "s" : ""} {open ? "▾" : "▸"}
      </button>
      <ul className="px-2 pb-1.5 flex flex-col gap-0.5">
        {shown.map((t, i) => (
          <li key={i} className="truncate font-mono">
            <span className="mr-1">{TOOL_ICON[t.name] ?? "•"}</span>
            {t.summary || t.name}
          </li>
        ))}
      </ul>
    </div>
  );
};

const Message = ({ e, live }: { e: ChatEntry; live?: boolean }) => {
  if (e.role === "user") {
    return (
      <div className="self-end max-w-[88%] rounded-xl rounded-br-sm bg-accent text-white px-3 py-2 whitespace-pre-wrap">
        {e.text}
      </div>
    );
  }
  if (e.role === "system") {
    return <div className="self-center text-[11px] text-neutral-500 text-center px-4">{e.text}</div>;
  }
  return (
    <div className="self-start max-w-[95%] rounded-xl rounded-bl-sm bg-panel-2 border border-line px-3 py-2">
      {e.text ? (
        <div className="md leading-relaxed">
          <ReactMarkdown>{e.text}</ReactMarkdown>
        </div>
      ) : live ? (
        <div className="flex items-center gap-2 text-neutral-400">
          <Spinner /> Pensando…
        </div>
      ) : null}
      <Tools tools={e.tools} live={live} />
      {e.error ? (
        <div className="mt-2 text-[12px] text-red-300 whitespace-pre-wrap border-t border-red-500/20 pt-2">⚠️ {e.error}</div>
      ) : null}
      {typeof e.costUsd === "number" && e.costUsd > 0 ? (
        <div className="mt-1 text-[10px] text-neutral-600">US$ {e.costUsd.toFixed(3)}</div>
      ) : null}
    </div>
  );
};

export const Chat = ({ id, state, live }: { id: string; state: ProjectState; live: ChatEntry | null }) => {
  const assistantName = state.settings.aiProvider === "openai" ? "OpenAI" : "Claude";
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const busy = Boolean(state.running);

  useEffect(() => {
    // Scrollear solo la lista del chat (no la página entera)
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.chat.length, live?.text, live?.tools?.length]);

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    setError(null);
    try {
      await api(`/api/projects/${id}/chat`, { method: "POST", body: JSON.stringify({ message: text }) });
      setText("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const suggestions = state.versions.length
    ? ["Hacé los subtítulos más grandes", "Agregá un título al principio", "Cambiá la transición del medio por un fade"]
    : ["¿Qué cortaste del video?", "Proponé el plan de edición"];

  return (
    <Panel title={`Chat con ${assistantName}`} className="h-full" bodyClassName="flex-1 flex flex-col min-h-0">
      <div ref={scroller} className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-3">
        {state.chat.length === 0 && !live ? (
          <div className="text-neutral-500 text-[13px] p-2">
            Escribile a {assistantName} qué querés cambiar del video en lenguaje normal. Recuerda todo lo que hablaron en este proyecto.
          </div>
        ) : null}
        {state.chat.map((e) => (live && e.id === live.id ? null : <Message key={e.id} e={e} />))}
        {live ? <Message e={live} live /> : null}
      </div>
      <div className="border-t border-line p-3 flex flex-col gap-2">
        {!busy && !text ? (
          <div className="flex flex-wrap gap-1">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => setText(s)}
                className="text-[11px] px-2 py-1 rounded-full border border-line text-neutral-400 hover:text-white hover:border-neutral-500"
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}
        {error ? <div className="text-[12px] text-red-300">{error}</div> : null}
        <div className="flex gap-2 items-end">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={2}
            placeholder={busy ? "Esperá a que termine el proceso actual…" : `Pedile un cambio a ${assistantName}…`}
            className="flex-1 resize-none bg-panel-2 border border-line rounded-lg px-3 py-2 outline-none focus:border-accent/60"
          />
          <Button variant="primary" onClick={send} disabled={busy || sending || !text.trim()} className="h-[42px] px-4">
            Enviar
          </Button>
        </div>
      </div>
    </Panel>
  );
};
