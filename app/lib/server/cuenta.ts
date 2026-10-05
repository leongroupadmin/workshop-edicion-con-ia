import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { ROOT } from "./fsutil";

const run = promisify(execFile);

export type Cuenta = {
  loggedIn: boolean;
  email: string | null;
  plan: string | null;
  /** "suscripción" (claude.ai) o "clave de API" (console). */
  via: string | null;
};

/** El ejecutable del SDK cambia según el tipo de Mac (arm64 / x64). */
const binario = (): string => {
  const dir = path.join(ROOT, "app", "node_modules", "@anthropic-ai");
  const paquete = fs.existsSync(dir)
    ? fs.readdirSync(dir).find((d) => d.startsWith("claude-agent-sdk-") && fs.existsSync(path.join(dir, d, "claude")))
    : undefined;
  if (!paquete) throw new Error("No encuentro Claude. Instalá las dependencias del panel: npm install --prefix app");
  return path.join(dir, paquete, "claude");
};

/** Con qué cuenta está funcionando el panel ahora mismo. */
export const leerCuenta = async (): Promise<Cuenta> => {
  const { stdout } = await run(binario(), ["auth", "status"], { timeout: 20_000 });
  const j = JSON.parse(stdout) as {
    loggedIn?: boolean;
    email?: string;
    subscriptionType?: string;
    authMethod?: string;
  };
  return {
    loggedIn: Boolean(j.loggedIn),
    email: j.email ?? null,
    plan: j.subscriptionType ? j.subscriptionType.toUpperCase() : null,
    via: j.authMethod === "claude.ai" ? "suscripción" : j.loggedIn ? "clave de API" : null,
  };
};

export const cerrarSesion = async (): Promise<void> => {
  await run(binario(), ["auth", "logout"], { timeout: 30_000 });
};

/**
 * Abre una ventana de Terminal que cierra la sesión actual y arranca el login
 * de la otra cuenta (el navegador lo abre Claude). El panel después pregunta
 * cada tanto por `leerCuenta` hasta ver la cuenta nueva.
 *
 * Va por Terminal a propósito: el login es interactivo y necesita una consola
 * de verdad para mostrar el código y esperar al navegador.
 */
export const abrirLogin = async (email?: string): Promise<void> => {
  const claude = binario();
  // El email viene del navegador: solo lo paso si tiene forma de email.
  const limpio = email && /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email) ? email : "";
  const archivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cuenta-")), "cambiar-cuenta.command");
  fs.writeFileSync(
    archivo,
    [
      "#!/bin/bash",
      "printf '\\n  Cambiar la cuenta de Claude del panel\\n  ------------------------------------\\n\\n'",
      "printf '  Cerrando la sesión actual...\\n\\n'",
      `${JSON.stringify(claude)} auth logout >/dev/null 2>&1`,
      "printf '  Ahora entrá con la OTRA cuenta en el navegador.\\n'",
      "printf '  Si el navegador ya está con la cuenta vieja, cerrá sesión ahí\\n'",
      "printf '  o usá una ventana de incógnito.\\n\\n'",
      limpio
        ? `${JSON.stringify(claude)} auth login --email ${JSON.stringify(limpio)}`
        : `${JSON.stringify(claude)} auth login`,
      "printf '\\n  Listo. Volvé al panel: ya se actualiza solo.\\n\\n'",
      'read -r -p "  Apretá Enter para cerrar esta ventana. " _',
      "",
    ].join("\n"),
    { mode: 0o700 },
  );
  await run("/usr/bin/open", ["-a", "Terminal", archivo], { timeout: 15_000 });
};
