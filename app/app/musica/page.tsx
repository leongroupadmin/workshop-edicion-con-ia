"use client";

import { useEffect, useRef, useState } from "react";
import { MusicSearch } from "@/components/MusicSearch";
import { Button, ConfirmDialog, Panel, TrashIcon } from "@/components/ui";
import { api, uploadFile } from "@/lib/client";

type Audios = { tracks: string[]; sfx: string[] };

const FilePick = ({ accept, label, onFile }: { accept: string; label: string; onFile: (f: File) => void }) => {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      <Button onClick={() => ref.current?.click()}>{label}</Button>
    </>
  );
};

export default function MusicPage() {
  const [music, setMusic] = useState<Audios>({ tracks: [], sfx: [] });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Audio que se está por borrar (nombre + si es efecto de sonido)
  const [borrar, setBorrar] = useState<{ file: string; sfx: boolean } | null>(null);

  const load = async () => setMusic(await api<Audios>("/api/music"));
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial
    void load();
  }, []);

  const upload = async (url: string, f: File, ok: string) => {
    setBusy(true);
    setMsg(`Subiendo ${f.name}…`);
    try {
      await uploadFile(url, f, () => {});
      await load();
      setMsg(ok);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-5xl w-full mx-auto px-6 py-8 flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Música</h1>
        <p className="text-neutral-400 mt-1">
          Se guarda en <code className="text-neutral-300">/assets/music</code> y está disponible para todos los videos.
          La música de fondo baja sola cuando hablás; los efectos los elige Claude en el plan.
        </p>
      </div>
      {msg ? <p className="text-[13px] text-neutral-300">{msg}</p> : null}

      <MusicSearch
        onAdded={async (file) => {
          await load();
          setMsg(`Música agregada: ${file}. Ya la podés elegir en la Configuración de cada video.`);
        }}
      />

      <Panel title="Tu música y efectos de sonido" bodyClassName="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
        {(["tracks", "sfx"] as const).map((k) => (
          <div key={k} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-neutral-300">{k === "tracks" ? "Música de fondo" : "Efectos de sonido (whoosh, pop…)"}</span>
              <FilePick
                accept=".mp3,.wav,.m4a,.aac,.ogg"
                label="Subir"
                onFile={(f) => upload(`/api/music${k === "sfx" ? "?sfx=1" : ""}`, f, "Audio subido.")}
              />
            </div>
            {music[k].length ? (
              <ul className="flex flex-col gap-1.5">
                {music[k].map((t) => (
                  <li key={t} className="flex items-center gap-2 text-[12px]">
                    <span className="flex-1 truncate text-neutral-300">{t}</span>
                    <audio controls preload="none" src={`/api/music?play=${encodeURIComponent(k === "sfx" ? `sfx/${t}` : t)}`} className="h-7 w-48" />
                    <button
                      type="button"
                      aria-label={`Eliminar ${t}`}
                      disabled={busy}
                      onClick={() => setBorrar({ file: t, sfx: k === "sfx" })}
                      className="shrink-0 text-neutral-500 hover:text-red-300 disabled:opacity-40"
                    >
                      <TrashIcon />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] text-neutral-500">Nada cargado todavía.</p>
            )}
          </div>
        ))}
      </Panel>

      {borrar ? (
        <ConfirmDialog
          title={`¿Eliminar “${borrar.file}”?`}
          confirmLabel="Eliminar audio"
          onClose={() => setBorrar(null)}
          onConfirm={async () => {
            const r = await api<Audios>(
              `/api/music?file=${encodeURIComponent(borrar.file)}${borrar.sfx ? "&sfx=1" : ""}`,
              { method: "DELETE" },
            );
            setMusic({ tracks: r.tracks, sfx: r.sfx });
            setBorrar(null);
            setMsg(`Eliminado: ${borrar.file}.`);
          }}
        >
          Va a la <b className="text-neutral-200">Papelera de tu Mac</b>: si te arrepentís, lo recuperás desde ahí.
          {borrar.sfx ? (
            <span className="block mt-2">
              Si algún plan ya lo tenía puesto, ese sonido no va a sonar hasta que elijas otro.
            </span>
          ) : (
            <span className="block mt-2">
              Los videos ya renderizados no cambian. Si era la música elegida, los videos nuevos arrancan sin música.
            </span>
          )}
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
