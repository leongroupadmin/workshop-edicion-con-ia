import { execFile, execFileSync, spawn } from "node:child_process";
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

const WINDOWS = process.platform === "win32";

let codexWindows: string | undefined;
/**
 * En Windows, Codex viene en la app de la Microsoft Store: la carpeta cambia
 * con cada actualización, así que se la pregunto al sistema (una vez).
 */
const codexDeLaStore = (): string => {
  if (codexWindows === undefined) {
    try {
      const dir = execFileSync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", "(Get-AppxPackage OpenAI.Codex | Select-Object -First 1).InstallLocation"],
        { encoding: "utf8", timeout: 15_000, windowsHide: true },
      ).trim();
      codexWindows = dir ? path.join(dir, "app", "resources", "codex.exe") : "";
    } catch {
      codexWindows = "";
    }
  }
  return codexWindows;
};

export const codex = () =>
  process.env.CODEX_CLI_PATH ||
  (WINDOWS ? codexDeLaStore() : "/Applications/Codex.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex");

const SIN_CODEX = WINDOWS
  ? "No encontré la app Codex en esta PC. Instalá la app Codex de OpenAI (Microsoft Store) y volvé a abrir esta pestaña."
  : "No encontré la app Codex en esta Mac. Instalá la app Codex de OpenAI y volvé a abrir esta pestaña.";

/** El ejecutable del SDK cambia según el sistema (Mac arm64 / x64, Windows x64 / arm64). */
const binario = (): string => {
  const dir = path.join(ROOT, "app", "node_modules", "@anthropic-ai");
  const nombre = WINDOWS ? "claude.exe" : "claude";
  const paquete = fs.existsSync(dir)
    ? fs.readdirSync(dir).find((d) => d.startsWith("claude-agent-sdk-") && fs.existsSync(path.join(dir, d, nombre)))
    : undefined;
  if (!paquete) throw new Error("No encuentro Claude. Instalá las dependencias del panel: npm install --prefix app");
  return path.join(dir, paquete, nombre);
};

/**
 * Abre una consola nueva con un script. En Mac es un .command en Terminal;
 * en Windows un .cmd en su propia ventana. `lineas` son comandos ya armados
 * para ese sistema.
 */
const abrirConsola = async (nombre: string, lineas: string[]): Promise<void> => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cuenta-"));
  if (WINDOWS) {
    const archivo = path.join(dir, `${nombre}.cmd`);
    // chcp 65001: para que los acentos se vean bien en la consola.
    fs.writeFileSync(archivo, ["@echo off", "chcp 65001 >nul", ...lineas, ""].join("\r\n"));
    // Argumentos tal cual: `start` toma el primer texto entre comillas como título.
    spawn("cmd.exe", ["/c", `start "" "${archivo}"`], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      windowsVerbatimArguments: true,
    }).unref();
    return;
  }
  const archivo = path.join(dir, `${nombre}.command`);
  fs.writeFileSync(archivo, ["#!/bin/bash", ...lineas, ""].join("\n"), { mode: 0o700 });
  await run("/usr/bin/open", ["-a", "Terminal", archivo], { timeout: 15_000 });
};

/** Ruta o texto entre comillas para la consola (en Windows sin escapar las barras). */
const citar = (s: string) => (WINDOWS ? `"${s}"` : JSON.stringify(s));

/** Un texto en la consola: `printf` en Mac, `echo` en Windows. */
const decir = (texto: string) =>
  WINDOWS ? (texto ? `echo   ${texto}` : "echo.") : `printf '  ${texto.replace(/'/g, "")}\\n'`;
const esperarEnter = WINDOWS
  ? 'set /p "_=  Apretá Enter para cerrar esta ventana. "'
  : 'read -r -p "  Apretá Enter para cerrar esta ventana. " _';

/** Con qué cuenta está funcionando el panel ahora mismo. */
export const leerCuenta = async (): Promise<Cuenta> => {
  const { stdout } = await run(binario(), ["auth", "status"], { timeout: 20_000, windowsHide: true });
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

/**
 * Abre una ventana de Terminal que cierra la sesión actual y arranca el login
 * de la otra cuenta (el navegador lo abre Claude). El panel después pregunta
 * cada tanto por `leerCuenta` hasta ver la cuenta nueva.
 *
 * Va por consola a propósito: el login es interactivo y necesita una consola
 * de verdad para mostrar el código y esperar al navegador.
 */
export const abrirLogin = async (email?: string): Promise<void> => {
  const claude = binario();
  // El email viene del navegador: solo lo paso si tiene forma de email.
  const limpio = email && /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email) ? email : "";
  const nulo = WINDOWS ? "nul" : "/dev/null";
  await abrirConsola("cambiar-cuenta", [
    decir(""),
    decir("Cambiar la cuenta de Claude del panel"),
    decir("------------------------------------"),
    decir(""),
    decir("Cerrando la sesión actual..."),
    decir(""),
    `${citar(claude)} auth logout >${nulo} 2>&1`,
    decir("Ahora entrá con la OTRA cuenta en el navegador."),
    decir("Si el navegador ya está con la cuenta vieja, cerrá sesión ahí"),
    decir("o usá una ventana de incógnito."),
    decir(""),
    limpio
      ? `${citar(claude)} auth login --claudeai --email ${citar(limpio)}`
      : `${citar(claude)} auth login --claudeai`,
    decir(""),
    decir("Listo. Volvé al panel: ya se actualiza solo."),
    decir(""),
    esperarEnter,
  ]);
};

/** Estado de la cuenta de ChatGPT que usa Codex CLI, sin exponer credenciales. */
export const leerCuentaOpenAI = async (): Promise<Cuenta> => {
  const bin = codex();
  if (!bin || !fs.existsSync(bin)) throw new Error(SIN_CODEX);
  // Codex CLI escribe el estado en stderr (aunque sea exitoso), por eso
  // revisamos ambos canales. No incluimos ninguno en la respuesta al navegador.
  const { stdout, stderr } = await run(bin, ["login", "status"], { timeout: 20_000, windowsHide: true });
  const loggedIn = /logged in using chatgpt/i.test(`${stdout}\n${stderr}`);
  return { loggedIn, email: null, plan: loggedIn ? "ChatGPT" : null, via: loggedIn ? "sesión de Codex" : null };
};

/** Abre el login oficial de ChatGPT que administra Codex CLI. */
export const abrirLoginOpenAI = async (): Promise<void> => {
  const bin = codex();
  if (!bin || !fs.existsSync(bin)) throw new Error(SIN_CODEX);
  await abrirConsola("conectar-openai", [
    decir(""),
    decir("Conectar cuenta de ChatGPT para el panel"),
    decir("------------------------------------------"),
    decir(""),
    decir("Se abrirá el navegador para que inicies sesión y autorices Codex."),
    decir(""),
    `${citar(bin)} login`,
    decir(""),
    decir("Listo. Volvé al panel: esta pantalla se actualiza sola."),
    decir(""),
    esperarEnter,
  ]);
};
