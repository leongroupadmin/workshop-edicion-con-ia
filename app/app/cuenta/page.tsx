"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Panel, Spinner } from "@/components/ui";
import { api } from "@/lib/client";

type Cuenta = { loggedIn: boolean; email: string | null; plan: string | null; via: string | null };

export default function CuentaPage() {
  const [cuenta, setCuenta] = useState<Cuenta | null>(null);
  const [openai, setOpenai] = useState<Cuenta | null>(null);
  const [email, setEmail] = useState("");
  const [esperando, setEsperando] = useState(false);
  const [esperandoOpenAI, setEsperandoOpenAI] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Email que había cuando empezó el cambio: sirve para saber si ya cambió.
  const anterior = useRef<string | null>(null);

  const cargar = async () => {
    try {
      const r = await api<{ cuenta: Cuenta; openai: Cuenta }>("/api/cuenta");
      setCuenta(r.cuenta);
      setOpenai(r.openai);
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pude leer la cuenta.");
      return null;
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial
    void cargar();
  }, []);

  // Mientras se hace el login en la Terminal, pregunto cada tanto si ya cambió.
  useEffect(() => {
    if (!esperando) return;
    const desde = Date.now();
    const t = setInterval(async () => {
      const r = await cargar();
      const c = r?.cuenta;
      if (c?.loggedIn && c.email && c.email !== anterior.current) {
        setEsperando(false);
        setMsg(`Listo: el panel ahora usa ${c.email}.`);
      } else if (Date.now() - desde > 5 * 60_000) {
        setEsperando(false);
        setMsg("Pasaron 5 minutos y la cuenta no cambió. Si cerraste la Terminal sin terminar, probá de nuevo.");
      }
    }, 2500);
    return () => clearInterval(t);
  }, [esperando]);

  useEffect(() => {
    if (!esperandoOpenAI) return;
    const desde = Date.now();
    const t = setInterval(async () => {
      const r = await cargar();
      if (r?.openai.loggedIn) {
        setEsperandoOpenAI(false);
        setMsg("Listo: OpenAI quedó conectada con tu cuenta de ChatGPT.");
      } else if (Date.now() - desde > 5 * 60_000) {
        setEsperandoOpenAI(false);
        setMsg("Pasaron 5 minutos y OpenAI no terminó de conectarse. Probá de nuevo.");
      }
    }, 2500);
    return () => clearInterval(t);
  }, [esperandoOpenAI]);

  const cambiar = async () => {
    setError(null);
    setMsg(null);
    anterior.current = cuenta?.email ?? null;
    try {
      await api("/api/cuenta", { method: "POST", body: JSON.stringify({ action: "cambiar", email: email.trim() }) });
      setEsperando(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pude abrir el login.");
    }
  };

  const conectarOpenAI = async () => {
    setError(null);
    setMsg(null);
    try {
      await api("/api/cuenta", { method: "POST", body: JSON.stringify({ action: "conectar-openai" }) });
      setEsperandoOpenAI(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pude abrir el login de OpenAI.");
    }
  };

  return (
    <div className="p-6 flex flex-col gap-4 max-w-2xl w-full mx-auto">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">Cuenta de Claude</h1>
        <p className="text-[13px] text-neutral-400 mt-1">
          Es la cuenta que arma los planes de edición y diseña los gráficos. Lo que edites acá consume del límite de uso
          de esa cuenta.
        </p>
      </div>

      <Panel title="Cuenta en uso">
        <div className="flex flex-col gap-3">
          {cuenta === null ? (
            <div className="flex items-center gap-2 text-[13px] text-neutral-400">
              <Spinner /> Leyendo…
            </div>
          ) : cuenta.loggedIn ? (
            <div className="flex flex-col gap-1">
              <div className="text-[15px] font-medium">{cuenta.email ?? "—"}</div>
              <div className="text-[13px] text-neutral-400">
                Plan {cuenta.plan ?? "—"}
                {cuenta.via ? ` · entra por ${cuenta.via}` : ""}
              </div>
            </div>
          ) : (
            <div className="text-[13px] text-amber-300">
              No hay ninguna cuenta conectada: el panel no va a poder editar hasta que entres con una.
            </div>
          )}

          <div className="border-t border-line pt-3 flex flex-col gap-2">
            <label className="text-[12px] uppercase tracking-wide text-neutral-500">Cambiar de cuenta</label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo de la otra cuenta (opcional)"
                disabled={esperando}
                className="flex-1 min-w-[240px] rounded-md border border-line bg-black/30 px-3 py-1.5 text-[13px] outline-none focus:border-neutral-500 disabled:opacity-40"
              />
              <Button variant="primary" onClick={() => void cambiar()} disabled={esperando}>
                {esperando ? "Esperando…" : "Cambiar cuenta"}
              </Button>
            </div>
            <p className="text-[12px] text-neutral-500">
              Se abre una ventana de Terminal y después el navegador para que entres. Si el navegador ya está con la
              cuenta vieja, cerrá sesión ahí o usá una ventana de incógnito. El correo de arriba solo sirve para que la
              página de ingreso venga completada.
            </p>
          </div>

          {esperando ? (
            <div className="flex items-center gap-2 text-[13px] text-neutral-300">
              <Spinner /> Terminá de entrar en la ventana que se abrió. Esta pantalla se actualiza sola.
            </div>
          ) : null}
          {msg ? <div className="text-[13px] text-emerald-300">{msg}</div> : null}
          {error ? <div className="text-[13px] text-red-300">{error}</div> : null}
        </div>
      </Panel>

      <p className="text-[12px] text-neutral-500">
        Se usa una cuenta por vez. Si tenías una edición corriendo cuando cambiaste, dejala terminar: la cuenta nueva se
        aplica a lo que arranque después.
      </p>

      <div className="border-t border-line pt-5 flex flex-col gap-4">
        <div>
          <h2 className="text-[18px] font-semibold tracking-tight">Cuenta de OpenAI</h2>
          <p className="text-[13px] text-neutral-400 mt-1">Sirve para el plan y el chat cuando elegís OpenAI en un proyecto.</p>
        </div>
        <Panel title="Cuenta en uso">
          <div className="flex flex-col gap-3">
            {openai === null ? (
              <div className="flex items-center gap-2 text-[13px] text-neutral-400"><Spinner /> Leyendo…</div>
            ) : openai.loggedIn ? (
              <div className="text-[13px] text-emerald-300">Conectada con tu cuenta de ChatGPT mediante Codex.</div>
            ) : (
              <div className="text-[13px] text-amber-300">Todavía no hay una cuenta de ChatGPT conectada.</div>
            )}
            <div className="border-t border-line pt-3 flex items-center gap-3">
              <Button variant="primary" onClick={() => void conectarOpenAI()} disabled={esperandoOpenAI}>
                {esperandoOpenAI ? "Esperando…" : openai?.loggedIn ? "Cambiar cuenta" : "Conectar ChatGPT"}
              </Button>
              <p className="text-[12px] text-neutral-500">Se abre una Terminal y después el navegador para autorizar la cuenta.</p>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
