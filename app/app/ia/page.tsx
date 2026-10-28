"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Panel, Row, Seg, Spinner } from "@/components/ui";
import { api } from "@/lib/client";
import type { Settings } from "@/lib/types";

type Cuenta = { loggedIn: boolean; email: string | null; plan: string | null; via: string | null };
type Estado = {
  cuenta: Cuenta | null;
  cuentaError: string | null;
  openai: Cuenta | null;
  openaiError: string | null;
  aiProvider: Settings["aiProvider"];
};

/** Pestaña "IA": cuentas de Claude y de ChatGPT, y con cuál arrancan los videos nuevos. */
export default function IaPage() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [email, setEmail] = useState("");
  const [esperando, setEsperando] = useState(false);
  const [esperandoOpenAI, setEsperandoOpenAI] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Email que había cuando empezó el cambio: sirve para saber si ya cambió.
  const anterior = useRef<string | null>(null);

  const cargar = async () => {
    try {
      const r = await api<Estado>("/api/ia");
      setEstado(r);
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pude leer las cuentas.");
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
      const c = (await cargar())?.cuenta;
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
      if ((await cargar())?.openai?.loggedIn) {
        setEsperandoOpenAI(false);
        setMsg("Listo: ChatGPT quedó conectado.");
      } else if (Date.now() - desde > 5 * 60_000) {
        setEsperandoOpenAI(false);
        setMsg("Pasaron 5 minutos y ChatGPT no terminó de conectarse. Probá de nuevo.");
      }
    }, 2500);
    return () => clearInterval(t);
  }, [esperandoOpenAI]);

  const pedir = async (body: object, fallo: string) => {
    setError(null);
    setMsg(null);
    try {
      await api("/api/ia", { method: "POST", body: JSON.stringify(body) });
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : fallo);
      return false;
    }
  };

  const cambiar = async () => {
    anterior.current = estado?.cuenta?.email ?? null;
    if (await pedir({ action: "cambiar", email: email.trim() }, "No pude abrir el ingreso a Claude.")) setEsperando(true);
  };

  const conectarOpenAI = async () => {
    if (await pedir({ action: "conectar-openai" }, "No pude abrir el ingreso a ChatGPT.")) setEsperandoOpenAI(true);
  };

  const elegir = async (aiProvider: Settings["aiProvider"]) => {
    if (!estado) return;
    setEstado({ ...estado, aiProvider });
    if (await pedir({ action: "proveedor", aiProvider }, "No pude guardar la IA elegida.")) {
      setMsg(`Los videos nuevos arrancan con ${aiProvider === "openai" ? "ChatGPT" : "Claude"}.`);
    }
  };

  const cuenta = estado?.cuenta;
  const openai = estado?.openai;

  return (
    <div className="p-6 flex flex-col gap-4 max-w-2xl w-full mx-auto">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">Inteligencia artificial</h1>
        <p className="text-[13px] text-muted mt-1">
          Acá se conectan las cuentas de Claude y de ChatGPT que usa el panel, y se elige con cuál arrancan los videos
          nuevos (en cada proyecto se puede cambiar después). Las dos usan tu suscripción mensual: no hace falta
          ninguna clave de API.
        </p>
      </div>

      {msg ? <div className="text-[13px] text-emerald-700">{msg}</div> : null}
      {error ? <div className="text-[13px] text-red-700">{error}</div> : null}

      <Panel title="IA para los videos nuevos">
        {estado ? (
          <Row label="Arma el plan y responde el chat">
            <Seg
              value={estado.aiProvider}
              onChange={(v) => void elegir(v)}
              options={[
                { value: "anthropic", label: "Claude" },
                { value: "openai", label: "ChatGPT" },
              ]}
            />
          </Row>
        ) : (
          <div className="flex items-center gap-2 text-[13px] text-muted">
            <Spinner /> Leyendo…
          </div>
        )}
        <p className="text-[12px] text-muted mt-3">
          Los gráficos (escenas de HyperFrames) los diseña siempre Claude, aunque el plan lo arme ChatGPT.
        </p>
      </Panel>

      <Panel title="Claude">
        <div className="flex flex-col gap-3">
          {estado === null ? (
            <div className="flex items-center gap-2 text-[13px] text-muted">
              <Spinner /> Leyendo…
            </div>
          ) : cuenta?.loggedIn ? (
            <div className="flex flex-col gap-1">
              <div className="text-[15px] font-medium">{cuenta.email ?? "—"}</div>
              <div className="text-[13px] text-muted">
                Plan {cuenta.plan ?? "—"}
                {cuenta.via ? ` · entra por ${cuenta.via}` : ""}
              </div>
              {cuenta.via === "clave de API" ? (
                <div className="text-[13px] text-amber-700 mt-1">
                  Está usando una clave de API (se cobra aparte), no tu suscripción. Tocá “Cambiar cuenta” y entrá con tu
                  cuenta de Claude Pro o Max.
                </div>
              ) : null}
            </div>
          ) : (
            <div className="text-[13px] text-amber-700">
              {estado.cuentaError ?? "No hay ninguna cuenta de Claude conectada: el panel no va a poder editar hasta que entres con una."}
            </div>
          )}

          <div className="border-t border-line pt-3 flex flex-col gap-2">
            <label className="text-[12px] uppercase tracking-wide text-muted">
              {cuenta?.loggedIn ? "Cambiar de cuenta" : "Conectar una cuenta"}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo de la cuenta (opcional)"
                disabled={esperando}
                className="flex-1 min-w-[240px] rounded-md border border-line bg-panel-2 px-3 py-1.5 text-[13px] outline-none focus:border-muted disabled:opacity-40"
              />
              <Button variant="primary" onClick={() => void cambiar()} disabled={esperando}>
                {esperando ? "Esperando…" : cuenta?.loggedIn ? "Cambiar cuenta" : "Conectar Claude"}
              </Button>
            </div>
            <p className="text-[12px] text-muted">
              Se abre una ventana de Terminal y después el navegador para que entres. Si el navegador ya está con otra
              cuenta, cerrá sesión ahí o usá una ventana de incógnito. El correo solo sirve para que la página de ingreso
              venga completada. Usa tu suscripción de Claude (Pro o Max): lo que edites consume de su límite de uso.
            </p>
          </div>

          {esperando ? (
            <div className="flex items-center gap-2 text-[13px] text-fg-2">
              <Spinner /> Terminá de entrar en la ventana que se abrió. Esta pantalla se actualiza sola.
            </div>
          ) : null}
        </div>
      </Panel>

      <Panel title="ChatGPT">
        <div className="flex flex-col gap-3">
          {estado === null ? (
            <div className="flex items-center gap-2 text-[13px] text-muted">
              <Spinner /> Leyendo…
            </div>
          ) : openai?.loggedIn ? (
            <div className="text-[13px] text-emerald-700">Conectado con tu cuenta de ChatGPT mediante Codex.</div>
          ) : (
            <div className="text-[13px] text-amber-700">
              {estado.openaiError ?? "Todavía no hay una cuenta de ChatGPT conectada."}
            </div>
          )}
          <div className="border-t border-line pt-3 flex items-center gap-3">
            <Button variant="primary" onClick={() => void conectarOpenAI()} disabled={esperandoOpenAI || !!estado?.openaiError}>
              {esperandoOpenAI ? "Esperando…" : openai?.loggedIn ? "Cambiar cuenta" : "Conectar ChatGPT"}
            </Button>
            <p className="text-[12px] text-muted">
              Usa tu suscripción de ChatGPT (Plus o Pro) a través de la app Codex de OpenAI, que tiene que estar
              instalada en la Mac. Se abre una Terminal y después el navegador para autorizar la cuenta.
            </p>
          </div>
          {esperandoOpenAI ? (
            <div className="flex items-center gap-2 text-[13px] text-fg-2">
              <Spinner /> Terminá de autorizar en la ventana que se abrió. Esta pantalla se actualiza sola.
            </div>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
