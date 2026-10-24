"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PasoClon } from "@/components/PasoClon";
import { Button, ConfirmDialog, Panel, Row, Seg, Spinner, TrashIcon } from "@/components/ui";
import { api, fmtDate, uploadFile } from "@/lib/client";
import { duracionGuion, partirGuion, segundosPara } from "@/lib/clon/guion";
import {
  BROLL_MAX_S,
  BROLL_MIN_S,
  CLON_DEFAULTS,
  DURACIONES_OBJETIVO,
  MODELOS,
  type ClonJob,
  type ClonModelo,
  type ClonSettings,
  type Personaje,
} from "@/lib/clon/types";

const input =
  "w-full rounded-lg border border-line bg-black/30 px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50";

const fmtSeg = (s: number) => (s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} min`);

export default function ClonPage() {
  const router = useRouter();
  const [personajes, setPersonajes] = useState<Personaje[] | null>(null);
  const [clones, setClones] = useState<ClonJob[] | null>(null);
  const [personaje, setPersonaje] = useState("");
  const [settings, setSettings] = useState<ClonSettings>(CLON_DEFAULTS);
  const [modo, setModo] = useState<"pegar" | "ia">("pegar");
  const [texto, setTexto] = useState("");
  // Con IA: gancho y CTA opcionales, van tal cual y la IA escribe el resto.
  const [hook, setHook] = useState("");
  const [cta, setCta] = useState("");
  const [titulo, setTitulo] = useState("");
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState("");
  const [borrando, setBorrando] = useState<ClonJob | null>(null);
  // Clon + B-roll: pantalla partida, B-roll arriba y el personaje abajo.
  const [tipo, setTipo] = useState<"normal" | "broll">("normal");
  const [broll, setBroll] = useState<File | null>(null);
  const [brollS, setBrollS] = useState<number | null>(null);
  const [subida, setSubida] = useState<number | null>(null);
  const conBroll = tipo === "broll";
  // Con B-roll el guion lo escribe siempre la IA, para que dure lo mismo que el B-roll.
  const modoGuion = conBroll ? "ia" : modo;

  /** Elige el B-roll y mide cuánto dura (desde el navegador, antes de subirlo). */
  const elegirBroll = (f: File | null) => {
    setBroll(f);
    setBrollS(null);
    if (!f) return;
    const url = URL.createObjectURL(f);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      setBrollS(Number.isFinite(v.duration) ? v.duration : null);
      URL.revokeObjectURL(url);
    };
    v.onerror = () => URL.revokeObjectURL(url);
    v.src = url;
  };

  const cargarClones = () => api<{ clones: ClonJob[] }>("/api/clon").then((r) => setClones(r.clones));

  useEffect(() => {
    api<{ personajes: Personaje[] }>("/api/personajes")
      .then((r) => {
        setPersonajes(r.personajes);
        const usable = r.personajes.find((p) => p.foto && p.vozId);
        if (usable) setPersonaje((actual) => actual || usable.slug);
      })
      .catch((e) => setError((e as Error).message));
    cargarClones().catch((e) => setError((e as Error).message));
  }, []);

  // Cómo queda partido el guion pegado (se calcula igual que en el servidor).
  const vista = useMemo(() => {
    if (modoGuion !== "pegar" || !texto.trim()) return null;
    const reglas = MODELOS[settings.modelo].bloque;
    const bloques = partirGuion(texto, reglas).map((t) => ({ segundos: segundosPara(t, reglas) }));
    return { bloques: bloques.length, segundos: duracionGuion(bloques) };
  }, [modoGuion, texto, settings.modelo]);

  const elegido = personajes?.find((p) => p.slug === personaje);
  const falta = !elegido
    ? "Elegí un personaje."
    : conBroll && !broll
      ? "Elegí el video de B-roll."
      : conBroll && brollS !== null && (brollS < BROLL_MIN_S || brollS > BROLL_MAX_S)
        ? `El B-roll tiene que durar entre ${BROLL_MIN_S} s y ${BROLL_MAX_S / 60} minutos.`
    : !elegido.foto
      ? "Ese personaje no tiene foto."
      : !elegido.vozId
        ? "Ese personaje no tiene voz."
        : !texto.trim() && !(modoGuion === "ia" && (hook.trim() || cta.trim()))
          ? modoGuion === "pegar"
            ? "Pegá el guion."
            : "Contá de qué trata el video."
          : "";

  const crear = async () => {
    setCreando(true);
    setError("");
    try {
      const datos = { personaje, settings, modo: modoGuion, texto, titulo, ...(modoGuion === "ia" ? { hook, cta } : {}) };
      if (conBroll && broll) {
        setSubida(0);
        const r = await uploadFile("/api/clon/broll", broll, setSubida, { "x-datos": encodeURIComponent(JSON.stringify(datos)) });
        router.push(`/clon/${r.id as string}`);
        return;
      }
      const r = await api<{ id: string }>("/api/clon", { method: "POST", body: JSON.stringify(datos) });
      router.push(`/clon/${r.id}`);
    } catch (e) {
      setError((e as Error).message);
      setCreando(false);
      setSubida(null);
    }
  };

  return (
    <div className="max-w-6xl w-full mx-auto px-6 py-8 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Clon</h1>
        <p className="text-neutral-400 mt-1">
          Creá un video de un personaje hablando: elegís quién habla y qué dice, lo aprobás y se arma solo. Después lo pasás a
          edición como cualquier video.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
        <Panel title="Nuevo clon">
          <div className="flex flex-col gap-5">
            <Row label="Tipo de video">
              <Seg
                value={tipo}
                onChange={setTipo}
                options={[
                  { value: "normal", label: "Clon" },
                  { value: "broll", label: "Clon + B-roll" },
                ]}
              />
              {conBroll ? (
                <div className="flex flex-col gap-2">
                  <span className="text-[12px] text-neutral-500">
                    Pantalla partida 50 / 50: tu B-roll arriba (sin su audio) y el personaje abajo. El guion dura lo mismo que el B-roll.
                    Después pasa a edición solo para los subtítulos.
                  </span>
                  <label className="flex items-center gap-3 rounded-xl border border-dashed border-white/20 bg-white/[.02] px-4 py-3 cursor-pointer hover:border-accent/60">
                    <span className="text-[13px] font-medium">{broll ? broll.name : "Elegir el video de B-roll"}</span>
                    <span className="text-[12px] text-neutral-500">
                      {broll
                        ? brollS !== null
                          ? `${fmtSeg(Math.round(brollS))}`
                          : "midiendo…"
                        : `MP4, MOV, WEBM · de ${BROLL_MIN_S} s a ${BROLL_MAX_S / 60} min`}
                    </span>
                    <input
                      type="file"
                      accept="video/*,.mov,.mkv"
                      className="hidden"
                      aria-label="Video de B-roll"
                      onChange={(e) => elegirBroll(e.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>
              ) : null}
            </Row>

            <Row label="1. Personaje">
              {personajes === null ? (
                <p className="text-[13px] text-neutral-500">Cargando…</p>
              ) : personajes.length === 0 ? (
                <p className="text-[13px] text-neutral-400">
                  Todavía no tenés personajes.{" "}
                  <Link href="/personajes" className="text-accent underline">
                    Creá uno en Personajes
                  </Link>
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {personajes.map((p) => (
                    <button
                      key={p.slug}
                      onClick={() => setPersonaje(p.slug)}
                      className={`rounded-xl border p-2 text-left transition ${
                        personaje === p.slug ? "border-accent/50 bg-accent-soft" : "border-line hover:border-white/20 hover:bg-white/[0.03]"
                      }`}
                    >
                      {p.foto ? (
                        // eslint-disable-next-line @next/next/no-img-element -- foto local
                        <img
                          src={`/api/personajes/${p.slug}/foto?v=${encodeURIComponent(p.updatedAt)}`}
                          alt=""
                          className="aspect-square w-full rounded-lg object-cover"
                        />
                      ) : (
                        <span className="aspect-square w-full rounded-lg bg-white/[0.05] grid place-items-center text-[11px] text-neutral-500">
                          Sin foto
                        </span>
                      )}
                      <span className="mt-1.5 block truncate text-[13px] font-medium">{p.nombre}</span>
                      <span className="block truncate text-[11px] text-neutral-500">
                        {!p.foto ? "Falta la foto" : !p.vozId ? "Falta la voz" : p.vozNombre || "Listo"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </Row>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Row label="Modelo de video">
                  <Seg
                    value={settings.modelo}
                    onChange={(modelo: ClonModelo) => {
                      const resoluciones: readonly string[] = MODELOS[modelo].resoluciones;
                      // Si la resolución elegida no existe en el modelo nuevo, se pasa a 720p.
                      setSettings({ ...settings, modelo, resolucion: resoluciones.includes(settings.resolucion) ? settings.resolucion : "720p" });
                    }}
                    options={(Object.keys(MODELOS) as ClonModelo[]).map((m) => ({ value: m, label: MODELOS[m].label }))}
                  />
                  <span className="text-[12px] text-neutral-500">{MODELOS[settings.modelo].nota}</span>
                </Row>
              </div>
              <Row label="Formato">
                {conBroll ? (
                  <p className="text-[13px] text-neutral-400 py-1.5">Vertical 9:16, partido en dos</p>
                ) : (
                  <Seg
                    value={settings.formato}
                    onChange={(formato) => setSettings({ ...settings, formato })}
                    options={[
                      { value: "vertical", label: "Vertical 9:16" },
                      { value: "horizontal", label: "Horizontal 16:9" },
                    ]}
                  />
                )}
              </Row>
              <Row label="Resolución">
                <Seg
                  value={settings.resolucion}
                  onChange={(resolucion) => setSettings({ ...settings, resolucion })}
                  options={MODELOS[settings.modelo].resoluciones.map((r) => ({ value: r, label: r === "4k" ? "4K" : r }))}
                />
              </Row>
            </div>

            <Row label="2. Guion">
              {conBroll ? null : (
                <Seg
                  value={modo}
                  onChange={setModo}
                  options={[
                    { value: "pegar", label: "Lo pego yo" },
                    { value: "ia", label: "Que lo escriba la IA" },
                  ]}
                />
              )}
              {modoGuion === "ia" ? (
                <div className="flex flex-col gap-1.5 pt-1">
                  <div className="text-[12px] text-neutral-400">¿Qué IA lo escribe?</div>
                  <Seg
                    value={settings.aiProvider ?? "anthropic"}
                    onChange={(aiProvider) => setSettings({ ...settings, aiProvider })}
                    options={[
                      { value: "anthropic", label: "Claude" },
                      { value: "openai", label: "OpenAI" },
                    ]}
                  />
                </div>
              ) : null}
              {/* Solo hace falta si escribe la IA: con un guion pegado, la duración sale del texto. */}
              {modo === "ia" && !conBroll ? (
                <div className="flex flex-col gap-1.5 pt-1">
                  <div className="text-[12px] text-neutral-400">¿Cuánto tiene que durar el video?</div>
                  <Seg
                    cols={5}
                    value={String(settings.duracionObjetivoS)}
                    onChange={(v) => setSettings({ ...settings, duracionObjetivoS: Number(v) })}
                    options={DURACIONES_OBJETIVO.map((d) => ({ value: String(d), label: fmtSeg(d) }))}
                  />
                  <span className="text-[12px] text-neutral-500">
                    Es el largo del video terminado: la IA escribe para ese tiempo. Se arma pegando varios clips de hasta{" "}
                    {MODELOS[settings.modelo].bloque.max} s (unos{" "}
                    {Math.max(1, Math.round(settings.duracionObjetivoS / MODELOS[settings.modelo].bloque.objetivo))} con{" "}
                    {MODELOS[settings.modelo].label}).
                  </span>
                </div>
              ) : null}
              <textarea
                className={input}
                rows={8}
                maxLength={8000}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={
                  modoGuion === "pegar"
                    ? "Pegá acá el texto exacto que va a decir el personaje."
                    : conBroll
                      ? "Contá de qué trata el B-roll y qué querés que diga el personaje sobre eso. Por ejemplo: es un recorrido por nuestra oficina nueva; que cuente qué hacemos y que terminen escribiendo INFO."
                      : "Contá de qué trata el video, a quién le habla y qué querés que haga quien lo mira. Por ejemplo: 3 errores al empezar a vender por Instagram, para emprendedores, que terminen escribiendo INFO."
                }
              />
              {modoGuion === "ia" ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[12px] text-neutral-400">Gancho (opcional)</span>
                    <textarea
                      className={input}
                      rows={2}
                      maxLength={300}
                      value={hook}
                      onChange={(e) => setHook(e.target.value)}
                      placeholder="La primera frase. Ej: ¿Sabías que el 80 % de los anuncios pierden plata?"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[12px] text-neutral-400">CTA / cierre (opcional)</span>
                    <textarea
                      className={input}
                      rows={2}
                      maxLength={300}
                      value={cta}
                      onChange={(e) => setCta(e.target.value)}
                      placeholder="La última frase. Ej: Escribime INFO y te cuento cómo."
                    />
                  </label>
                  <span className="text-[12px] text-neutral-500 sm:col-span-2">
                    Lo que escribas acá va palabra por palabra al principio y al final; la IA arma todo el medio.
                  </span>
                </div>
              ) : null}
              <span className="text-[12px] text-neutral-500">
                {modoGuion === "pegar"
                  ? vista
                    ? `Queda en ${vista.bloques} bloque${vista.bloques === 1 ? "" : "s"} de hasta ${MODELOS[settings.modelo].bloque.max} s · el video va a durar unos ${fmtSeg(vista.segundos)}.`
                    : `Se parte solo en bloques de hasta ${MODELOS[settings.modelo].bloque.max} segundos (uno por clip). Lo revisás antes de crear el video.`
                  : conBroll
                    ? `La IA lo escribe para que dure lo mismo que el B-roll${brollS ? ` (${fmtSeg(Math.round(brollS))})` : ""}, ya partido en bloques. Lo revisás y lo podés cambiar antes de crear el video.`
                    : `La IA lo escribe para unos ${fmtSeg(settings.duracionObjetivoS)}, ya partido en bloques. Lo revisás y lo podés cambiar antes de crear el video.`}
              </span>
            </Row>

            <Row label="Título (opcional)">
              <input className={input} value={titulo} maxLength={120} onChange={(e) => setTitulo(e.target.value)} placeholder="Si lo dejás vacío, sale de las primeras palabras" />
            </Row>

            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" className="py-2.5 px-4" onClick={crear} disabled={creando || Boolean(falta)}>
                {creando ? <Spinner /> : null}
                {subida !== null && subida < 1
                  ? `Subiendo el B-roll… ${Math.round(subida * 100)}%`
                  : modoGuion === "pegar"
                    ? "Partir el guion en bloques"
                    : "Escribir el guion"}
              </Button>
              <span className="text-[12px] text-neutral-500">{error ? null : falta || "Todavía no se gasta nada: primero revisás el guion."}</span>
            </div>
            {error ? <p className="text-[13px] text-red-300">{error}</p> : null}
          </div>
        </Panel>

        <Panel title="Tus clones" bodyClassName="p-2">
          {clones === null ? (
            <p className="p-3 text-[13px] text-neutral-500">Cargando…</p>
          ) : clones.length === 0 ? (
            <p className="p-3 text-[13px] text-neutral-500">Todavía no creaste ninguno.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {clones.map((c) => (
                <li key={c.id} className="group flex items-center gap-1">
                  <Link href={`/clon/${c.id}`} className="flex-1 min-w-0 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.05]">
                    {/* eslint-disable-next-line @next/next/no-img-element -- foto local */}
                    <img src={`/api/clon/${c.id}/file/foto`} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{c.titulo}</span>
                      <span className="block truncate text-[11px] text-neutral-500">
                        {c.personaje.nombre}{c.modo === "broll" ? " · con B-roll" : ""} · {fmtDate(c.createdAt)}
                      </span>
                    </span>
                    <PasoClon job={c} />
                  </Link>
                  <button
                    onClick={() => setBorrando(c)}
                    className="p-2 rounded-lg text-neutral-500 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-red-300 hover:bg-red-500/10"
                    aria-label={`Eliminar ${c.titulo}`}
                  >
                    <TrashIcon />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {borrando ? (
        <ConfirmDialog
          title={`¿Eliminar “${borrando.titulo}”?`}
          onClose={() => setBorrando(null)}
          onConfirm={async () => {
            await api(`/api/clon/${borrando.id}`, { method: "DELETE" });
            setBorrando(null);
            await cargarClones();
          }}
        >
          El guion, los clips y el video van a la Papelera de la Mac (se pueden recuperar).
          {borrando.proyectoId ? " El proyecto de edición que creaste con este video no se toca." : ""}
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
