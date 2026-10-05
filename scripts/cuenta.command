#!/bin/bash
# Muestra con qué cuenta de Claude funciona el panel y permite cambiarla.
# Doble clic, o desde la terminal: npm run cuenta

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"

# El ejecutable cambia según el tipo de Mac (Apple Silicon o Intel).
CLAUDE=""
for d in "$RAIZ"/app/node_modules/@anthropic-ai/claude-agent-sdk-darwin-*/claude; do
  [ -x "$d" ] && CLAUDE="$d" && break
done

if [ -z "$CLAUDE" ]; then
  echo
  echo "  No encuentro Claude. Instalá primero las dependencias del panel:"
  echo "      npm install --prefix app"
  echo
  read -r -p "  Apretá Enter para cerrar. " _
  exit 1
fi

mostrar_cuenta() {
  "$CLAUDE" auth status 2>/dev/null | node -e '
    let t = "";
    process.stdin.on("data", (d) => (t += d));
    process.stdin.on("end", () => {
      let j = {};
      try { j = JSON.parse(t); } catch { }
      if (!j.loggedIn) { console.log("  Sin sesión iniciada."); return; }
      const plan = j.subscriptionType ? j.subscriptionType.toUpperCase() : "—";
      const via = j.authMethod === "claude.ai" ? "suscripción" : "clave de API";
      console.log(`  Cuenta: ${j.email || "—"}`);
      console.log(`  Plan:   ${plan} (entra por ${via})`);
    });
  '
}

printf '\n  Cuenta de Claude que usa el panel\n  ---------------------------------\n\n'
mostrar_cuenta
printf '\n'
read -r -p "  ¿Querés cambiar de cuenta? (s/n) " RESP
case "$RESP" in
  s|S|si|Si|SI|y|Y)
    printf '\n  Cerrando la sesión actual...\n'
    "$CLAUDE" auth logout >/dev/null 2>&1
    printf '\n  Ahora se abre el navegador para que entres con la OTRA cuenta.\n'
    printf '  Importante: si el navegador ya está con la cuenta vieja, cerrá sesión\n'
    printf '  ahí o usá una ventana de incógnito.\n\n'
    "$CLAUDE" auth login
    printf '\n  ---------------------------------\n'
    mostrar_cuenta
    printf '\n  Si el panel está abierto, cerralo y volvé a abrirlo para que tome\n  la cuenta nueva.\n'
    ;;
  *)
    printf '\n  Listo, no cambié nada.\n'
    ;;
esac

printf '\n'
read -r -p "  Apretá Enter para cerrar esta ventana. " _
