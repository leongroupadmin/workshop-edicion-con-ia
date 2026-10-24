"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, ConfirmDialog, Panel, Row, Seg, Spinner, TrashIcon } from "@/components/ui";
import { api, uploadFile } from "@/lib/client";
import {
  ACENTOS,
  ACENTO_BASE,
  ENCUADRE_BASE,
  ENERGIAS,
  REGISTROS,
  REGISTRO_BASE,
  type Registro,
  ENERGIA_BASE,
  RESTRICCIONES,
  RESTRICCIONES_BASE,
  type Acento,
  type Energia,
  type Personaje,
  type Restriccion,
} from "@/lib/clon/types";

type EstadoClave = { cargada: boolean; origen: "entorno" | "panel" | null };
type Claves = { kie: EstadoClave; cartesia: EstadoClave };
type Voz = { id: string; name: string; description?: string; language?: string };

const input =
  "w-full rounded-lg border border-line bg-black/30 px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50";

const VACIO = {
  nombre: "",
  descripcion: "",
  encuadre: ENCUADRE_BASE,
  vozId: "",
  vozNombre: "",
  acento: ACENTO_BASE as Acento,
  acentoOtro: "",
  restricciones: RESTRICCIONES_BASE as Restriccion[],
  energia: ENERGIA_BASE as Energia,
  registro: REGISTRO_BASE as Registro,
};

const esEspanol = (v: Voz) => (v.language ?? "").toLowerCase().startsWith("es");

/** Un campo de clave: se pega, se prueba y, si funciona, queda guardada. */
const CampoClave = ({
  servicio,
  nombre,
  estado,
  onCambio,
}: {
  servicio: "kie" | "cartesia";
  nombre: string;
  estado?: EstadoClave;
  onCambio: (c: Claves) => void;
}) => {
  const [valor, setValor] = useState("");
  const [probando, setProbando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null);

  const probar = async () => {
    setProbando(true);
    setResultado(null);
    try {
      const r = await api<{ ok: boolean; mensaje: string; guardada: boolean; claves: Claves }>("/api/personajes/claves", {
        method: "POST",
        body: JSON.stringify({ servicio, clave: valor }),
      });
      setResultado({ ok: r.ok, mensaje: r.guardada ? `${r.mensaje} Quedó guardada.` : r.mensaje });
      if (r.guardada) setValor("");
      onCambio(r.claves);
    } catch (e) {
      setResultado({ ok: false, mensaje: (e as Error).message });
    } finally {
      setProbando(false);
    }
  };

  const chip = !estado
    ? null
    : estado.origen === "entorno"
      ? { texto: "Cargada (del sistema)", clase: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" }
      : estado.cargada
        ? { texto: "Cargada", clase: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" }
        : { texto: "Falta cargarla", clase: "border-amber-400/30 bg-amber-400/10 text-amber-300" };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold">{nombre}</span>
        {chip ? <span className={`rounded-full border px-2 py-0.5 text-[11px] ${chip.clase}`}>{chip.texto}</span> : null}
      </div>
      <div className="flex gap-2">
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          className={input}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder={estado?.cargada ? "•••••••• (pegá otra para cambiarla)" : "Pegá la clave acá"}
          aria-label={`Clave de ${nombre}`}
        />
        <Button onClick={probar} disabled={probando || (!valor.trim() && !estado?.cargada)}>
          {probando ? <Spinner /> : null}
          Probar conexión
        </Button>
      </div>
      {resultado ? (
        <p className={`text-[12px] ${resultado.ok ? "text-emerald-300" : "text-red-300"}`}>{resultado.mensaje}</p>
      ) : null}
    </div>
  );
};

export default function PersonajesPage() {
  const [personajes, setPersonajes] = useState<Personaje[] | null>(null);
  const [claves, setClaves] = useState<Claves | null>(null);
  const [voces, setVoces] = useState<Voz[] | null>(null);
  const [errorVoces, setErrorVoces] = useState("");
  const [faltaCartesia, setFaltaCartesia] = useState(false);
  // Personaje que se está editando (null = uno nuevo).
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState(VACIO);
  const [foto, setFoto] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [borrando, setBorrando] = useState<Personaje | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    const r = await api<{ personajes: Personaje[]; claves: Claves }>("/api/personajes");
    setPersonajes(r.personajes);
    setClaves(r.claves);
    return r.personajes;
  }, []);

  const cargarVoces = useCallback(async () => {
    setErrorVoces("");
    try {
      const r = await api<{ voces: Voz[]; faltaClave: boolean }>("/api/personajes/voces");
      setVoces(r.voces);
      setFaltaCartesia(r.faltaClave);
    } catch (e) {
      setVoces([]);
      setErrorVoces((e as Error).message);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial
    cargar().catch((e) => setAviso({ ok: false, texto: (e as Error).message }));
    void cargarVoces();
  }, [cargar, cargarVoces]);

  /** Foto elegida (todavía sin subir) y su vista previa. */
  const cambiarFoto = (f: File | null) => {
    setFoto(f);
    setFotoPreview((previa) => {
      if (previa) URL.revokeObjectURL(previa);
      return f ? URL.createObjectURL(f) : null;
    });
  };

  const elegir = (p: Personaje | null) => {
    setEditando(p?.slug ?? null);
    setForm(
      p
        ? {
            nombre: p.nombre,
            descripcion: p.descripcion,
            encuadre: p.encuadre,
            vozId: p.vozId,
            vozNombre: p.vozNombre ?? "",
            acento: p.acento ?? ACENTO_BASE,
            acentoOtro: p.acentoOtro ?? "",
            restricciones: p.restricciones ?? RESTRICCIONES_BASE,
            energia: p.energia ?? ENERGIA_BASE,
            registro: p.registro ?? REGISTRO_BASE,
          }
        : VACIO,
    );
    cambiarFoto(null);
    setAviso(null);
  };

  const actual = personajes?.find((p) => p.slug === editando) ?? null;
  const tieneFoto = Boolean(foto || actual?.foto);

  const guardar = async () => {
    setGuardando(true);
    setAviso(null);
    try {
      const vozNombre = voces?.find((v) => v.id === form.vozId)?.name ?? form.vozNombre;
      const datos = JSON.stringify({ ...form, vozNombre });
      const { personaje } = editando
        ? await api<{ personaje: Personaje }>(`/api/personajes/${editando}`, { method: "PUT", body: datos })
        : await api<{ personaje: Personaje }>("/api/personajes", { method: "POST", body: datos });
      if (foto) await uploadFile(`/api/personajes/${personaje.slug}/foto`, foto, () => {});
      await cargar();
      setEditando(personaje.slug);
      cambiarFoto(null);
      setAviso({ ok: true, texto: "Personaje guardado." });
    } catch (e) {
      setAviso({ ok: false, texto: (e as Error).message });
    } finally {
      setGuardando(false);
    }
  };

  const fotoDe = (p: Personaje) => `/api/personajes/${p.slug}/foto?v=${encodeURIComponent(p.updatedAt)}`;
  const vozActualFuera = form.vozId && voces && !voces.some((v) => v.id === form.vozId);

  return (
    <div className="max-w-6xl w-full mx-auto px-6 py-8 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Personajes</h1>
        <p className="text-neutral-400 mt-1">
          Los personajes que hablan en los videos de la pestaña Clon: su foto, cómo son, cómo se los filma y con qué voz hablan.
        </p>
      </div>

      <Panel title="Claves de API">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <CampoClave servicio="kie" nombre="Kie (crea los videos)" estado={claves?.kie} onCambio={setClaves} />
          <CampoClave
            servicio="cartesia"
            nombre="Cartesia (pone la voz)"
            estado={claves?.cartesia}
            onCambio={(c) => {
              setClaves(c);
              void cargarVoces();
            }}
          />
        </div>
        <p className="mt-4 text-[12px] text-neutral-500">
          Se guardan solo en esta computadora y nunca se muestran de nuevo. Cada clave la sacás de tu cuenta en kie.ai y en cartesia.ai.
        </p>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-5 items-start">
        <Panel
          title="Biblioteca"
          right={
            <Button variant="ghost" onClick={() => elegir(null)}>
              + Nuevo
            </Button>
          }
          bodyClassName="p-2"
        >
          {personajes === null ? (
            <p className="p-3 text-neutral-500 text-[13px]">Cargando…</p>
          ) : personajes.length === 0 ? (
            <p className="p-3 text-neutral-500 text-[13px]">Todavía no hay personajes. Creá el primero con el formulario.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {personajes.map((p) => (
                <li key={p.slug} className="group flex items-center gap-1">
                  <button
                    onClick={() => elegir(p)}
                    className={`flex-1 min-w-0 flex items-center gap-3 rounded-lg border px-2 py-2 text-left transition ${
                      editando === p.slug ? "border-accent/40 bg-accent-soft" : "border-transparent hover:bg-white/[0.05]"
                    }`}
                  >
                    {p.foto ? (
                      // eslint-disable-next-line @next/next/no-img-element -- foto local
                      <img src={fotoDe(p)} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                    ) : (
                      <span className="w-10 h-10 rounded-lg bg-white/[0.06] grid place-items-center text-neutral-500 shrink-0">?</span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{p.nombre}</span>
                      <span className="block truncate text-[12px] text-neutral-500">
                        {!p.foto ? "Falta la foto" : p.vozNombre || (p.vozId ? "Voz elegida" : "Falta la voz")}
                      </span>
                    </span>
                  </button>
                  <button
                    onClick={() => setBorrando(p)}
                    className="p-2 rounded-lg text-neutral-500 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-red-300 hover:bg-red-500/10"
                    aria-label={`Eliminar ${p.nombre}`}
                  >
                    <TrashIcon />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={editando ? `Editar: ${actual?.nombre ?? ""}` : "Nuevo personaje"}>
          <div className="grid grid-cols-1 md:grid-cols-[180px_minmax(0,1fr)] gap-5">
            <div className="flex flex-col gap-2">
              <Row label="Foto">
                <button
                  type="button"
                  onClick={() => picker.current?.click()}
                  className="aspect-[3/4] w-full rounded-xl border border-dashed border-white/20 bg-white/[.02] overflow-hidden grid place-items-center hover:border-accent/60"
                >
                  {fotoPreview || actual?.foto ? (
                    // eslint-disable-next-line @next/next/no-img-element -- foto local
                    <img src={fotoPreview ?? fotoDe(actual!)} alt="Foto del personaje" className="w-full h-full object-cover" />
                  ) : (
                    <span className="px-3 text-center text-[12px] text-neutral-500">Elegir foto · JPG, PNG o WEBP</span>
                  )}
                </button>
                <input
                  ref={picker}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  aria-label="Foto del personaje"
                  onChange={(e) => {
                    cambiarFoto(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
              </Row>
              <p className="text-[11px] text-neutral-500">
                Una foto clara de frente, con buena luz. Es la cara que va a tener en todos los clips.
              </p>
            </div>
            <div className="flex flex-col gap-4">
              <Row label="Nombre">
                <input className={input} value={form.nombre} maxLength={60} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Por ejemplo: Sofía" />
              </Row>
              <Row label="Descripción">
                <textarea
                  className={input}
                  rows={3}
                  maxLength={600}
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                  placeholder="Cómo es y cómo habla. Por ejemplo: mujer de 30 años, cálida y segura, habla con energía."
                />
              </Row>
              <Row label="Encuadre">
                <textarea
                  className={input}
                  rows={2}
                  maxLength={400}
                  value={form.encuadre}
                  onChange={(e) => setForm({ ...form, encuadre: e.target.value })}
                />
                <span className="text-[11px] text-neutral-500">
                  Se repite igual en todos los clips para que la cámara no salte de uno a otro.
                </span>
              </Row>
              <Row label="Acento">
                <select
                  className={input}
                  value={form.acento}
                  onChange={(e) => setForm({ ...form, acento: e.target.value as Acento })}
                >
                  {(Object.keys(ACENTOS) as Acento[]).map((a) => (
                    <option key={a} value={a}>
                      {ACENTOS[a].label}
                    </option>
                  ))}
                </select>
                {form.acento === "otro" ? (
                  <input
                    className={input}
                    value={form.acentoOtro}
                    maxLength={120}
                    onChange={(e) => setForm({ ...form, acentoOtro: e.target.value })}
                    placeholder="Por ejemplo: rosarino, santafesino, venezolano de Caracas"
                  />
                ) : null}
                <span className="text-[11px] text-neutral-500">
                  Se le pide al video y también a la IA cuando escribe el guion (voseo o tuteo). Conviene que la voz de
                  Cartesia sea del mismo acento.
                </span>
              </Row>
              <Row label="Energía al hablar">
                <Seg
                  value={form.energia}
                  onChange={(energia) => setForm({ ...form, energia })}
                  options={(Object.keys(ENERGIAS) as Energia[]).map((e) => ({ value: e, label: ENERGIAS[e].label }))}
                />
                <span className="text-[11px] text-neutral-500">
                  {ENERGIAS[form.energia].nota} Es la emoción con la que Cartesia lee el guion (“{ENERGIAS[form.energia].cartesia}”) y
                  también se le pide al video para que la cara acompañe; el cuerpo queda sereno.
                </span>
              </Row>
              <Row label="Registro">
                <Seg
                  value={form.registro}
                  onChange={(registro) => setForm({ ...form, registro })}
                  options={(Object.keys(REGISTROS) as Registro[]).map((r) => ({ value: r, label: REGISTROS[r].label }))}
                />
                <span className="text-[11px] text-neutral-500">
                  {REGISTROS[form.registro].nota} Le dice a la IA qué tan formal escribir el guion; el acento (voseo o tuteo) no cambia.
                </span>
              </Row>
              <Row label="Lo que el video NO tiene que traer">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                  {(Object.keys(RESTRICCIONES) as Restriccion[]).map((r) => (
                    <label key={r} className="flex items-center gap-2 text-[13px] text-neutral-300">
                      <input
                        type="checkbox"
                        checked={form.restricciones.includes(r)}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            restricciones: e.target.checked ? [...form.restricciones, r] : form.restricciones.filter((x) => x !== r),
                          })
                        }
                      />
                      {RESTRICCIONES[r].label}
                    </label>
                  ))}
                </div>
                <span className="text-[11px] text-neutral-500">
                  Lo tildado se le pide al video en cada clip. Música, subtítulos y gráficos se ponen después, en la edición.
                </span>
              </Row>
              <Row label="Voz (Cartesia)">
                {faltaCartesia ? (
                  <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-200">
                    Para elegir la voz primero cargá la clave de Cartesia arriba y tocá “Probar conexión”.
                  </p>
                ) : voces === null ? (
                  <p className="text-[12px] text-neutral-500 flex items-center gap-2">
                    <Spinner /> Trayendo las voces…
                  </p>
                ) : (
                  <select className={input} value={form.vozId} onChange={(e) => setForm({ ...form, vozId: e.target.value })}>
                    <option value="">Elegí una voz</option>
                    {vozActualFuera ? <option value={form.vozId}>{form.vozNombre || "Voz guardada"}</option> : null}
                    {[
                      { label: "En español", lista: voces.filter(esEspanol) },
                      { label: "Otros idiomas", lista: voces.filter((v) => !esEspanol(v)) },
                    ]
                      .filter((g) => g.lista.length)
                      .map((g) => (
                        <optgroup key={g.label} label={g.label}>
                          {g.lista.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name}
                              {v.description ? ` — ${v.description.slice(0, 60)}` : ""}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                  </select>
                )}
                {errorVoces ? <span className="text-[12px] text-red-300">{errorVoces}</span> : null}
                <input
                  className={`${input} font-mono text-[12px]`}
                  value={form.vozId}
                  maxLength={120}
                  spellCheck={false}
                  onChange={(e) => setForm({ ...form, vozId: e.target.value.trim(), vozNombre: "" })}
                  placeholder="…o pegá acá el id de la voz (por ejemplo, una voz clonada tuya)"
                  aria-label="Id de la voz de Cartesia"
                />
                <span className="text-[11px] text-neutral-500">
                  Es el id de la voz en Cartesia: sale solo al elegirla de la lista, o lo copiás de tu cuenta en cartesia.ai.
                </span>
              </Row>
              <div className="flex items-center gap-3 pt-1">
                <Button variant="primary" onClick={guardar} disabled={guardando || !form.nombre.trim()}>
                  {guardando ? <Spinner /> : null}
                  {editando ? "Guardar cambios" : "Crear personaje"}
                </Button>
                {aviso ? <span className={`text-[13px] ${aviso.ok ? "text-emerald-300" : "text-red-300"}`}>{aviso.texto}</span> : null}
                {!aviso && !tieneFoto ? <span className="text-[12px] text-neutral-500">Sin foto no se puede usar en un clon.</span> : null}
              </div>
            </div>
          </div>
        </Panel>
      </div>

      {borrando ? (
        <ConfirmDialog
          title={`¿Eliminar a ${borrando.nombre}?`}
          onClose={() => setBorrando(null)}
          onConfirm={async () => {
            await api(`/api/personajes/${borrando.slug}`, { method: "DELETE" });
            if (editando === borrando.slug) elegir(null);
            setBorrando(null);
            await cargar();
          }}
        >
          Su foto y sus datos van a la Papelera de la Mac (se pueden recuperar). Los clones que ya hiciste con este personaje no se tocan.
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
