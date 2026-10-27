"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Panel, Spinner } from "./ui";

type Result = { id: string; name: string; durationS: number | null; url: string };

const SUGGESTIONS = [
  { label: "Corporativo inspirador", q: "uplifting corporate inspiring" },
  { label: "Lofi tranquilo", q: "lofi chill calm" },
  { label: "Motivacional épico", q: "epic motivational cinematic" },
  { label: "Electrónica con energía", q: "energetic electronic upbeat" },
  { label: "Acústico cálido", q: "warm acoustic guitar positive" },
  { label: "Lujo / premium", q: "elegant luxury piano minimal" },
];

/** Buscar y agregar música de la biblioteca de HeyGen (se baja a /assets/music). */
export const MusicSearch = ({ onAdded }: { onAdded: (file: string) => void }) => {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const search = async (text: string) => {
    if (!text.trim()) return;
    setQ(text);
    setQuery(text);
    setError(null);
    setLoading(true);
    try {
      const r = await api<{ results: Result[] }>(`/api/music/search?q=${encodeURIComponent(text)}`);
      setResults(r.results);
    } catch (e) {
      setError((e as Error).message);
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  const add = async (r: Result) => {
    setAdding(r.id);
    setError(null);
    try {
      const { file } = await api<{ file: string }>("/api/music/add", {
        method: "POST",
        body: JSON.stringify({ q: query, id: r.id }),
      });
      setAdded((a) => ({ ...a, [r.id]: file }));
      onAdded(file);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(null);
    }
  };

  return (
    <Panel
      title="Buscar música de fondo"
      right={<span className="text-[11px] text-muted">biblioteca de HeyGen · más de 10.000 temas</span>}
      bodyClassName="p-4 flex flex-col gap-3"
    >
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search(q);
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="¿Qué onda buscás? (en inglés encuentra más: lofi, corporate, epic…)"
          className="flex-1 bg-panel-2 border border-line rounded-md px-3 py-1.5 text-[13px] outline-none focus:border-accent/60"
        />
        <Button variant="primary" type="submit" disabled={loading || !q.trim()}>
          {loading ? <Spinner /> : null}
          Buscar
        </Button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.q}
            type="button"
            onClick={() => void search(s.q)}
            className="text-[12px] px-2.5 py-1 rounded-full border border-line text-fg-2 hover:border-accent/60 hover:text-fg"
          >
            {s.label}
          </button>
        ))}
      </div>

      {error ? <p className="text-[12px] text-red-700">{error}</p> : null}

      {results ? (
        results.length ? (
          <ul className="flex flex-col divide-y divide-line border border-line rounded-lg">
            {results.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-[12px]">
                <span className="flex-1 min-w-48 text-fg">
                  {r.name}
                  {r.durationS ? <span className="text-muted"> · {Math.round(r.durationS)} s</span> : null}
                </span>
                <audio controls preload="none" src={r.url} className="h-7 w-56" />
                {added[r.id] ? (
                  <span className="text-emerald-700 w-28 text-right">✓ Agregada</span>
                ) : (
                  <Button className="w-28" disabled={adding !== null} onClick={() => void add(r)}>
                    {adding === r.id ? <Spinner /> : null}
                    Agregar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-muted">Sin resultados. Probá con otras palabras.</p>
        )
      ) : (
        <p className="text-[12px] text-muted">
          Escuchá los temas acá y tocá “Agregar”: quedan en tu música y los podés elegir en la Configuración de cada video. Si no
          elegís ninguno, Claude elige uno según el tono del video.
        </p>
      )}
    </Panel>
  );
};
