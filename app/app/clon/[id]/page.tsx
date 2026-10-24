"use client";

import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { PasoClon } from "@/components/PasoClon";
import { Button, Panel, Seg, Spinner } from "@/components/ui";
import { api } from "@/lib/client";
import { contarPalabras, duracionGuion, maxPalabras, segundosPara } from "@/lib/clon/guion";
import { ACENTOS, ACENTO_BASE, MODELOS, NIVELES_SINCRO, energiaDe, modeloDe, registroDe, type Bloque, type ClonJob } from "@/lib/clon/types";

type Estado = {
  job: ClonJob;
  running: boolean;
  interrumpido: boolean;
  claves: { kie: { cargada: boolean }; cartesia: { cargada: boolean } };
};

const input =
  "w-full rounded-lg border border-line bg-black/30 px-3 py-2 text-sm leading-relaxed outline-none focus:border-accent resize-y";

const ESTADO_BLOQUE: Record<Bloque["estado"], { texto: string; clase: string }> = {
  pendiente: { texto: "Pendiente", clase: "text-neutral-500" },
  generando: { texto: "Generando…", clase: "text-sky-300" },
  bajando: { texto: "Bajando…", clase: "text-sky-300" },
  listo: { texto: "Listo", clase: "text-emerald-300" },
  error: { texto: "Falló", clase: "text-red-300" },
};

export default function ClonDetalle({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [clipVisto, setClipVisto] = useState<string | null>(null);
  const editado = useRef(false);
  // Guardado en curso (al salir de un bloque): el botón lo espera antes de avanzar.
  const guardando = useRef<Promise<void> | null>(null);

  useEffect(() => {
    let vivo = true;
    let pidiendo = false;
    const refrescar = async () => {
      if (pidiendo) return;
      pidiendo = true;
      try {
        const r = await api<Estado>(`/api/clon/${id}`, { cache: "no-store" });
        if (!vivo) return;
        setEstado(r);
        if (!editado.current) setTextos(Object.fromEntries(r.job.guion.bloques.map((b) => [b.id, b.texto])));
      } catch (e) {
        if (vivo) setError((e as Error).message);
      } finally {
        pidiendo = false;
      }
    };
    void refrescar();
    const timer = setInterval(refrescar, 2000);
    return () => {
      vivo = false;
      clearInterval(timer);
    };
  }, [id]);


  if (!estado) return <div className="p-6 text-neutral-400">{error || "Cargando…"}</div>;

  const { job, running, interrumpido, claves } = estado;
  const bloques = job.guion.bloques;
  const aprobando = job.paso === "esperando_aprobacion" && !running;
  const reintento = !running && (job.paso === "error" || interrumpido);
  const editable = (b: Bloque) => aprobando || (reintento && job.paso === "error" && job.fallo === "generar" && b.estado === "error");
  const cambios = () => bloques.map((b) => ({ id: b.id, texto: textos[b.id] ?? b.texto }));
  const listos = bloques.filter((b) => b.estado === "listo").length;
  const creditos = bloques.reduce((a, b) => a + (b.creditos ?? 0), 0);
  const modelo = MODELOS[modeloDe(job.settings.modelo)];
  const MAX_PALABRAS = maxPalabras(modelo.bloque);
  const largo = bloques.some((b) => editable(b) && contarPalabras(textos[b.id] ?? b.texto) > MAX_PALABRAS);
  const faltaClave = !claves.kie.cargada ? "Kie" : !claves.cartesia.cargada ? "Cartesia" : "";
  const archivo = (name: string) => `/api/clon/${id}/file/${name}`;
  // final.mp4 se reemplaza al mejorar la sincronización: con otra dirección el
  // reproductor lo carga de cero en vez de mezclarlo con el que ya tenía.
  const version = encodeURIComponent(job.voz?.generadoAt ?? job.voz?.nivel?.toString() ?? "1");
  const video = clipVisto ? archivo(clipVisto) : job.paso === "listo" ? `${archivo("final.mp4")}?v=${version}` : null;
  const vertical = job.settings.formato === "vertical";

  /** Guarda lo editado al salir del bloque (si cambió algo). */
  const guardar = () => {
    if (!editado.current) return;
    guardando.current = guardarAhora().finally(() => (guardando.current = null));
  };
  const guardarAhora = async () => {
    try {
      const r = await api<{ job: ClonJob }>(`/api/clon/${id}`, { method: "PUT", body: JSON.stringify({ bloques: cambios() }) });
      editado.current = false;
      setEstado((s) => (s ? { ...s, job: r.job } : s));
      setTextos(Object.fromEntries(r.job.guion.bloques.map((b) => [b.id, b.texto])));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  /** El único botón: aprobar y crear, o reintentar lo que falló. */
  /** "Mejorar la sincronización": rehace solo el ajuste del video con otro nivel (gratis). */
  const sincronizar = async (nivel: 1 | 2 | 3) => {
    setEnviando(true);
    setError("");
    try {
      const r = await api<{ job: ClonJob }>(`/api/clon/${id}`, { method: "POST", body: JSON.stringify({ accion: "sincro", nivel }) });
      setClipVisto(null);
      setEstado((s) => (s ? { ...s, job: r.job, running: true, interrumpido: false } : s));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  const avanzar = async () => {
    setEnviando(true);
    setError("");
    try {
      await guardando.current;
      const r = await api<{ job: ClonJob }>(`/api/clon/${id}`, {
        method: "POST",
        body: JSON.stringify(editado.current ? { bloques: cambios() } : {}),
      });
      editado.current = false;
      setEstado((s) => (s ? { ...s, job: r.job, running: true, interrumpido: false } : s));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };


  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-line px-5 py-4 lg:px-7">
        <div className="flex items-center gap-3 text-xs text-neutral-500">
          <Link href="/clon" className="hover:text-white">
            ← Todos los clones
          </Link>
        </div>
        <div className="mt-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight" title={job.titulo}>
              {job.titulo}
            </h1>
            <p className="mt-1 text-xs text-neutral-500">
              {job.personaje.nombre} · {modelo.label} ·{" "}
              {job.modo === "broll" ? "Partido con B-roll" : vertical ? "Vertical 9:16" : "Horizontal 16:9"} · {job.settings.resolucion} ·{" "}
              {bloques.length} bloques · unos {duracionGuion(bloques)} s
              {job.guion.origen === "ia" ? ` (objetivo ${job.settings.duracionObjetivoS} s)` : ""}
            </p>
          </div>
          <PasoClon job={job} trabajando={running} />
        </div>
        {running ? (
          <div aria-live="polite" className="mt-3 text-xs text-neutral-400">
            <p>{job.mensaje}</p>
            {job.paso === "generando" && bloques.length ? (
              <progress className="mt-2 h-1 w-full accent-red-500" value={listos} max={bloques.length} />
            ) : (
              <progress className="mt-2 h-1 w-full accent-red-500" />
            )}
          </div>
        ) : null}
        {error || job.error || interrumpido ? (
          <p role="alert" className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error || job.error || "El proceso se interrumpió. Tocá “Reintentar” para seguir donde quedó."}
          </p>
        ) : null}
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_440px] xl:grid-cols-[minmax(0,1fr)_500px] lg:overflow-hidden">
        <section className="min-h-0 overflow-y-auto p-5 lg:p-7 flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-heading text-[13px] font-semibold">Guion en bloques</h2>
            <span className="text-[12px] text-neutral-500">
              {aprobando ? "Editá lo que quieras: se guarda solo." : job.paso === "guion" ? "" : `${listos} de ${bloques.length} clips listos`}
            </span>
          </div>
          {job.paso === "guion" && !bloques.length ? (
            <div className="rounded-xl border border-line bg-panel p-6 text-[13px] text-neutral-400 flex items-center gap-2">
              {running ? <Spinner /> : null}
              {running ? "La IA está escribiendo el guion…" : "Todavía no hay guion."}
            </div>
          ) : null}
          {bloques.map((b, i) => {
            const texto = textos[b.id] ?? b.texto;
            const n = contarPalabras(texto);
            const est = ESTADO_BLOQUE[b.estado];
            const verClip = b.file && !editable(b);
            return (
              <div
                key={b.id}
                onClick={verClip ? () => setClipVisto(b.file!) : undefined}
                className={`rounded-xl border bg-panel p-4 transition ${
                  clipVisto && clipVisto === b.file
                    ? "border-accent/50"
                    : b.estado === "error"
                      ? "border-red-500/30"
                      : "border-line"
                } ${verClip ? "cursor-pointer hover:border-white/20" : ""}`}
              >
                <div className="flex items-center justify-between gap-3 text-[12px]">
                  <span className="font-semibold text-neutral-200">
                    Bloque {i + 1} · {editable(b) ? segundosPara(texto, modelo.bloque) : b.segundos} s
                  </span>
                  <span className={`flex items-center gap-1.5 ${est.clase}`}>
                    {running && (b.estado === "generando" || b.estado === "bajando") ? <Spinner className="w-3 h-3" /> : null}
                    {job.guion.aprobadoAt || b.estado !== "pendiente" ? est.texto : null}
                    {b.creditos ? <span className="text-neutral-500">· {b.creditos} créditos</span> : null}
                    {verClip ? <span className="text-neutral-500">· ▶ ver</span> : null}
                  </span>
                </div>
                {editable(b) ? (
                  <>
                    <textarea
                      className={`${input} mt-2`}
                      rows={2}
                      value={texto}
                      onChange={(e) => {
                        editado.current = true;
                        setTextos({ ...textos, [b.id]: e.target.value });
                      }}
                      onBlur={guardar}
                    />
                    <p className={`mt-1 text-[11px] ${n > MAX_PALABRAS ? "text-red-300" : "text-neutral-500"}`}>
                      {n} palabras ·{" "}
                      {n > MAX_PALABRAS
                        ? aprobando
                          ? `pasa de ${MAX_PALABRAS}: al guardar se parte en dos bloques`
                          : `dejalo en ${MAX_PALABRAS} o menos`
                        : n === 0
                          ? "vacío: se quita al guardar"
                          : `entra en ${segundosPara(texto, modelo.bloque)} s`}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-[14px] leading-relaxed text-neutral-200">{b.texto}</p>
                )}
                {b.error ? <p className="mt-2 text-[12px] text-red-300">{b.error}</p> : null}
              </div>
            );
          })}
        </section>

        <aside className="min-h-0 overflow-y-auto border-t border-line p-5 lg:border-l lg:border-t-0 flex flex-col gap-4 [&>*]:shrink-0">
          <Panel>
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- foto local */}
              <img src={archivo("foto")} alt="" className="w-12 h-12 rounded-lg object-cover" />
              <div className="min-w-0">
                <p className="truncate font-medium">{job.personaje.nombre}</p>
                <p className="truncate text-[12px] text-neutral-500">Voz: {job.personaje.vozNombre || job.personaje.vozId}</p>
                <p className="truncate text-[12px] text-neutral-500">
                  Acento:{" "}
                  {job.personaje.acento === "otro"
                    ? job.personaje.acentoOtro
                    : ACENTOS[job.personaje.acento && job.personaje.acento in ACENTOS ? job.personaje.acento : ACENTO_BASE].label}{" "}
                  · Energía: {energiaDe(job.personaje.energia).label} · Registro: {registroDe(job.personaje.registro).label}
                </p>
              </div>
            </div>
            {job.modo === "broll" && job.broll ? (
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3 text-[12px] text-neutral-400">
                <span>
                  B-roll arriba · {Math.round(job.broll.duracionS)} s · sin su audio
                </span>
                <button className="text-accent underline" onClick={() => setClipVisto(clipVisto === "broll" ? null : "broll")}>
                  {clipVisto === "broll" ? "Ocultar" : "Ver el B-roll"}
                </button>
              </div>
            ) : null}
          </Panel>

          {job.paso === "listo" ? (
            <div className="flex flex-col gap-1.5">
              <div className="font-heading text-[11px] font-semibold uppercase tracking-[0.07em] text-neutral-500">Voz</div>
              {/* Paso 4: comparar la voz que inventó el modelo con la del personaje (Cartesia). */}
              <Seg
                value={clipVisto === "pegado.mp4" ? "original" : clipVisto ? "" : "clon"}
                onChange={(v) => setClipVisto(v === "original" ? "pegado.mp4" : null)}
                options={[
                  { value: "clon", label: `Voz de ${job.personaje.nombre}` },
                  { value: "original", label: "Voz original de la IA" },
                ]}
              />
            </div>
          ) : null}
          <div className={`mx-auto w-full shrink-0 overflow-hidden rounded-xl border border-line bg-black ${vertical ? "aspect-[9/16] max-w-[min(440px,calc(75vh*9/16))]" : "aspect-video"}`}>
            {video ? (
              <video key={video} src={video} controls playsInline className="h-full w-full object-contain" />
            ) : (
              <div className="h-full grid place-items-center p-4 text-center text-[12px] text-neutral-500">
                {listos ? "Tocá un bloque listo para ver su clip." : "Acá vas a ver el video cuando esté listo."}
              </div>
            )}
          </div>
          {clipVisto && clipVisto !== "pegado.mp4" && job.paso === "listo" ? (
            <Button className="w-full py-2.5 text-[14px]" onClick={() => setClipVisto(null)}>
              ▶ Ver el video final
            </Button>
          ) : null}

          {job.voz && job.paso === "listo" ? (
            <p className="text-[12px] text-neutral-500">
              {clipVisto === "pegado.mp4" ? (
                "Así salió de Kie, con la voz que inventó el modelo. "
              ) : job.voz.metodo === "lectura" ? (
                <>
                  Voz de {job.personaje.nombre} leída por Cartesia (emoción “{job.voz.emocion}”) y el video ajustado a esa voz.
                  {job.voz.sincro
                    ? ` 9 de cada 10 palabras caen a menos de ${(job.voz.sincro.p90Ms / 1000).toFixed(2).replace(".", ",")} s de la boca${
                        job.voz.sincro.corridas ? `; ${job.voz.sincro.corridas} quedan más corridas` : ""
                      }.`
                    : ""}
                </>
              ) : (
                <>
                  Voz de {job.personaje.nombre} puesta con Cartesia ({job.personaje.vozNombre || "voz del personaje"}) ·{" "}
                  {job.voz.atempo
                    ? `la voz nueva se corría ${Math.abs(job.voz.desfaseS).toFixed(2)} s y se ajustó su velocidad para que calce con los labios.`
                    : `calza con los labios (diferencia de ${Math.abs(job.voz.desfaseS).toFixed(2)} s).`}
                  {job.voz.gananciaDb
                    ? ` Cartesia la devolvió más ${job.voz.gananciaDb > 0 ? "baja" : "alta"}: se ajustó el volumen ${Math.abs(job.voz.gananciaDb)} dB para igualar al original.`
                    : ""}
                </>
              )}
              {creditos ? ` · ${creditos.toLocaleString("es-AR")} créditos de Kie.` : ""}
            </p>
          ) : null}

          {job.paso === "listo" && job.voz?.metodo === "lectura" && !running ? (
            <div className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-3">
              <div className="font-heading text-[11px] font-semibold uppercase tracking-[0.07em] text-neutral-500">
                Sincronización de labios · {NIVELES_SINCRO[job.voz.nivel ?? 1]} ({job.voz.nivel ?? 1} de 3)
              </div>
              {(job.voz.nivel ?? 1) < 3 ? (
                <Button className="py-2" onClick={() => sincronizar(((job.voz?.nivel ?? 1) + 1) as 2 | 3)} disabled={enviando}>
                  {enviando ? <Spinner /> : null}
                  Mejorar la sincronización → {NIVELES_SINCRO[((job.voz.nivel ?? 1) + 1) as 2 | 3]}
                </Button>
              ) : null}
              <p className="text-[11px] text-neutral-500">
                {(job.voz.nivel ?? 1) < 3
                  ? "Ajusta el video en tramos más cortos para que cada palabra caiga más justa con la boca. A cambio, el cuerpo tiene más cambios de velocidad cortitos. Es gratis y tarda unos segundos."
                  : "Es el ajuste más fino. Lo que queda corrido son vocales que la voz estira donde la boca ya cerró."}
                {(job.voz.nivel ?? 1) > 1 ? (
                  <>
                    {" "}
                    <button
                      className="text-accent underline"
                      onClick={() => sincronizar(((job.voz?.nivel ?? 1) - 1) as 1 | 2)}
                      disabled={enviando}
                    >
                      Volver a {NIVELES_SINCRO[((job.voz.nivel ?? 1) - 1) as 1 | 2]}
                    </button>
                  </>
                ) : null}
              </p>
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            {job.paso === "listo" && job.proyectoId ? (
              <>
                <Link
                  href={`/p/${job.proyectoId}`}
                  className="inline-flex items-center justify-center rounded-lg bg-accent px-3 py-2.5 text-[13px] font-medium text-white hover:bg-accent-hover"
                >
                  Abrir el proyecto de edición →
                </Link>
                <Link
                  href={`/nuevo?clon=${id}`}
                  className="inline-flex items-center justify-center rounded-lg border border-line bg-white/[0.04] px-3 py-2 text-[13px] text-neutral-100 hover:bg-white/[0.08]"
                >
                  Crear otro proyecto con otros ajustes
                </Link>
                <p className="text-[12px] text-neutral-500">Ya pasó a edición. Si querés probar otra marca o estilo, creá otro proyecto: el primero no se toca.</p>
              </>
            ) : job.paso === "listo" ? (
              <>
                <Link href={`/nuevo?clon=${id}`} className="inline-flex items-center justify-center rounded-lg bg-accent px-3 py-2.5 text-[13px] font-medium text-white hover:bg-accent-hover">
                  Pasar a edición →
                </Link>
                <p className="text-[12px] text-neutral-500">
                  {job.modo === "broll"
                    ? "Te lleva a “Nuevo video” con este video ya cargado: elegís la marca y los subtítulos. La edición solo agrega los subtítulos (al medio, entre las dos mitades)."
                    : "Te lleva a “Nuevo video” con este video ya cargado: elegís la marca y cómo querés la edición, como siempre, y recién ahí arranca."}
                </p>
              </>
            ) : running || (job.paso === "guion" && !reintento) ? (
              <Button variant="primary" className="py-2.5" disabled>
                <Spinner />
                {job.paso === "guion" ? "Escribiendo el guion…" : job.paso === "voz" ? "Poniendo la voz…" : "Creando el video…"}
              </Button>
            ) : reintento ? (
              <>
                <Button variant="primary" className="py-2.5" onClick={avanzar} disabled={enviando || largo}>
                  {enviando ? <Spinner /> : null}
                  Reintentar
                </Button>
                <p className="text-[12px] text-neutral-500">
                  {job.fallo === "generar" || (interrumpido && job.paso === "generando")
                    ? "Sigue donde quedó: solo se piden los clips que faltan. Los que ya están no se vuelven a pagar."
                    : job.fallo === "voz" || job.paso === "voz"
                      ? "Vuelve a poner la voz y ajustar el video. Los clips ya están hechos y no se vuelven a pagar."
                      : "Vuelve a escribir el guion."}
                </p>
              </>
            ) : aprobando ? (
              <>
                <Button variant="primary" className="py-2.5" onClick={avanzar} disabled={enviando || !bloques.length || largo || Boolean(faltaClave)}>
                  {enviando ? <Spinner /> : null}
                  Aprobar y crear el video
                </Button>
                {faltaClave ? (
                  <p className="text-[12px] text-amber-300">
                    Falta la clave de {faltaClave}.{" "}
                    <Link href="/personajes" className="underline">
                      Cargala en Personajes
                    </Link>
                  </p>
                ) : (
                  <p className="text-[12px] text-neutral-500">
                    Este es el único paso que gasta créditos: se piden {bloques.length} clip{bloques.length === 1 ? "" : "s"} a Kie (unos{" "}
                    {duracionGuion(bloques)} s de video) y Cartesia lee el guion con la voz del personaje.
                  </p>
                )}
              </>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
