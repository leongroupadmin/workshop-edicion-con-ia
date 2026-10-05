#!/bin/bash
# Abre el panel de edición de video en el navegador.
# Doble clic en este archivo (o en el acceso directo del Escritorio).
# Para apagar el panel: cerrá esta ventana de Terminal o apretá Control+C.

cd "$(dirname "$0")/.." || exit 1
URL="http://localhost:3000"

printf '\n  Panel de edición de video\n  %s\n\n' "$(pwd)"

# ¿Ya está prendido? Entonces solo abro el navegador.
if lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "  El panel ya estaba abierto. Abriendo el navegador..."
  open "$URL"
  echo
  read -r -p "  Listo. Apretá Enter para cerrar esta ventana. " _
  exit 0
fi

# Dependencias instaladas?
if [ ! -d node_modules ] || [ ! -d app/node_modules ]; then
  echo "  Primera vez: instalando dependencias (tarda unos minutos)..."
  npm install || exit 1
  npm install --prefix app || exit 1
  echo
fi

echo "  Arrancando el panel... (no cierres esta ventana mientras lo uses)"
npm run panel &
PANEL_PID=$!

# Al cerrar la ventana o con Control+C, apago el panel.
trap 'echo; echo "  Apagando el panel..."; kill 0 2>/dev/null; exit 0' INT TERM HUP

# Espero a que el servidor esté listo (hasta 90 segundos) y abro el navegador.
for _ in $(seq 1 90); do
  if lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
    sleep 1
    echo
    echo "  Panel listo: $URL"
    echo
    open "$URL"
    break
  fi
  if ! kill -0 "$PANEL_PID" 2>/dev/null; then
    echo
    echo "  No se pudo arrancar el panel. Mirá el error de arriba."
    read -r -p "  Apretá Enter para cerrar. " _
    exit 1
  fi
  sleep 1
done

wait "$PANEL_PID"
