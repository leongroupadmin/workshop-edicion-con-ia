"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { api, uploadFile } from "@/lib/client";
import type { ChatEntry, ProjectImage, ProjectState } from "@/lib/types";
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
  const [images, setImages] = useState<ProjectImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [imageInputError, setImageInputError] = useState<string | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
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
      const attachmentContext = images.length
        ? `\n\nArchivos adjuntos para este pedido: ${images.map((image) => image.file).join(", ")}`
        : "";
      await api(`/api/projects/${id}/chat`, {
        method: "POST",
        body: JSON.stringify({ message: `${text.trim()}${attachmentContext}` }),
      });
      setText("");
      setImages([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const uploadImages = async (files: File[]) => {
    if (!files.length) return;
    setUploading(true);
    setImageInputError(null);
    try {
      for (const file of files) {
        const endpoint = file.type.startsWith("video/") ? "broll" : "images";
        const result = await uploadFile(`/api/projects/${id}/${endpoint}`, file, () => {});
        if (typeof result.file === "string") setImages((current) => [...current, { file: result.file as string, note: "" }]);
      }
    } catch (e) {
      setImageInputError(e instanceof Error ? e.message : "No se pudo subir el archivo.");
    } finally {
      setUploading(false);
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
        {images.length ? (
          <div className="flex flex-wrap gap-1.5">
            {images.map((image) => (
              <div key={image.file} className="flex items-center gap-1 rounded-md border border-line bg-panel-2 px-1.5 py-1 text-[11px] text-neutral-300">
                {/[.]mp4$|[.]mov$|[.]webm$|[.]m4v$/i.test(image.file) ? (
                  <video src={`/api/projects/${id}/file/broll/${encodeURIComponent(image.file)}`} muted className="h-7 w-7 rounded object-cover" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- miniatura del archivo local
                  <img src={`/api/projects/${id}/file/images/${encodeURIComponent(image.file)}`} alt="" className="h-7 w-7 rounded object-cover" />
                )}
                <span className="max-w-[150px] truncate">{image.file}</span>
              </div>
            ))}
          </div>
        ) : null}
        {images.length ? (
          <div className="rounded-md border border-accent/30 bg-accent/5 px-2 py-1.5 text-[12px] text-neutral-300">
            Escribí qué querés que haga la IA con estos archivos antes de enviar el mensaje.
          </div>
        ) : null}
        {imageInputError ? <div className="text-[12px] text-red-300">{imageInputError}</div> : null}
        <div className="flex gap-2 items-end">
          <input
            ref={imageInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/svg+xml,video/mp4,video/quicktime,video/webm,video/x-m4v"
            multiple
            className="hidden"
            onChange={(event) => {
              void uploadImages(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
          <Button
            variant="ghost"
            aria-label="Adjuntar imágenes o videos"
            title="Adjuntar imágenes o videos para usar en el video"
            onClick={() => imageInput.current?.click()}
            disabled={busy || sending || uploading}
            className="h-[42px] px-3 text-lg"
          >
            {uploading ? <Spinner /> : "📎"}
          </Button>
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
            placeholder={
              busy
                ? "Esperá a que termine el proceso actual…"
                : images.length
                  ? `¿Cómo querés usar ${images.length === 1 ? "este archivo" : "estos archivos"} en el video?`
                  : `Pedile un cambio a ${assistantName}…`
            }
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
