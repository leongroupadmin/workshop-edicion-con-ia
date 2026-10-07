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

const codex = () => process.env.CODEX_CLI_PATH || "/Applications/Codex.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex";

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

/** Estado de la cuenta de ChatGPT que usa Codex CLI, sin exponer credenciales. */
export const leerCuentaOpenAI = async (): Promise<Cuenta> => {
  const bin = codex();
  if (!fs.existsSync(bin)) throw new Error("No encontré Codex CLI en esta Mac.");
  // Codex CLI escribe el estado en stderr (aunque sea exitoso), por eso
  // revisamos ambos canales. No incluimos ninguno en la respuesta al navegador.
  const { stdout, stderr } = await run(bin, ["login", "status"], { timeout: 20_000 });
  const loggedIn = /logged in using chatgpt/i.test(`${stdout}\n${stderr}`);
  return { loggedIn, email: null, plan: loggedIn ? "ChatGPT" : null, via: loggedIn ? "sesión de Codex" : null };
};

/** Abre el login oficial de ChatGPT que administra Codex CLI. */
export const abrirLoginOpenAI = async (): Promise<void> => {
  const bin = codex();
  if (!fs.existsSync(bin)) throw new Error("No encontré Codex CLI en esta Mac.");
  const archivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cuenta-openai-")), "conectar-openai.command");
  fs.writeFileSync(
    archivo,
    [
      "#!/bin/bash",
      "printf '\\n  Conectar cuenta de ChatGPT para el panel\\n  ------------------------------------------\\n\\n'",
      "printf '  Se abrirá el navegador para que inicies sesión y autorices Codex.\\n\\n'",
      `${JSON.stringify(bin)} login`,
      "printf '\\n  Listo. Volvé al panel: esta pantalla se actualiza sola.\\n\\n'",
      'read -r -p "  Apretá Enter para cerrar esta ventana. " _',
      "",
    ].join("\n"),
    { mode: 0o700 },
  );
  await run("/usr/bin/open", ["-a", "Terminal", archivo], { timeout: 15_000 });
};
