"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { TRANSITIONS } from "@/lib/transitions";

/** Catálogo de transiciones: cada una con su muestra en loop, cuándo la usa Claude y si puede usarla. */
export default function TransitionsPage() {
  const [off, setOff] = useState<string[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ off: string[] }>("/api/transitions")
      .then((r) => setOff(r.off))
      .catch((e: Error) => setError(e.message));
  }, []);

  const toggle = (id: string, on: boolean) => {
    setOff((o) => (on ? (o ?? []).filter((x) => x !== id) : [...(o ?? []), id]));
    setError("");
    api<{ off: string[] }>("/api/transitions", { method: "POST", body: JSON.stringify({ id, on }) })
      .then((r) => setOff(r.off))
      .catch((e: Error) => setError(e.message));
  };

  const onCount = off ? TRANSITIONS.length - off.length : TRANSITIONS.length;

  return (
    <div className="max-w-6xl w-full mx-auto px-6 py-8 flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Transiciones</h1>
        <p className="text-neutral-400 mt-1">
          Claude elige entre las que están prendidas según lo que pasa en el video ({onCount} de {TRANSITIONS.length}).
          Apagá las que no te gusten y no las va a usar en los próximos planes, salvo que se la pidas por el chat (por
          ejemplo: “poné un destello de luz antes del cierre”). Vale para todos los videos.
        </p>
        {error ? <p className="mt-2 text-[13px] text-red-300">{error}</p> : null}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {TRANSITIONS.map((t) => {
          const on = !off?.includes(t.id);
          return (
            <div
              key={t.id}
              className={`flex flex-col overflow-hidden rounded-xl border bg-panel transition ${
                on ? "border-line" : "border-line/60 opacity-50"
              }`}
            >
              <video
                src={`/transitions/${t.id}.mp4`}
                autoPlay
                loop
                muted
                playsInline
                className={`aspect-[4/5] w-full bg-black object-cover ${on ? "" : "grayscale"}`}
              />
              <div className="flex flex-1 flex-col gap-1.5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-[14px] font-semibold text-neutral-100">{t.name}</h2>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={`${on ? "Apagar" : "Prender"} ${t.name}`}
                    title={on ? "Prendida: Claude la puede usar" : "Apagada: Claude no la usa"}
                    disabled={off === null}
                    onClick={() => toggle(t.id, !on)}
                    className={`relative h-5 w-9 shrink-0 rounded-full border transition disabled:opacity-40 ${
                      on ? "border-accent bg-accent" : "border-line bg-black/40"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all ${
                        on ? "left-[18px]" : "left-0.5"
                      }`}
                    />
                  </button>
                </div>
                <span className="text-[11px] tabular-nums text-neutral-500">{t.duration}</span>
                <p className="text-[12px] leading-snug text-neutral-300">{t.what}</p>
                <p className="text-[12px] leading-snug text-neutral-500">
                  <span className="text-neutral-400">Cuándo:</span> {t.when}
                </p>
                {t.sound ? <p className="text-[11px] text-emerald-300/80">🔊 {t.sound}</p> : null}
                <code className="mt-auto pt-1 text-[10px] text-neutral-600">{t.id}</code>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
