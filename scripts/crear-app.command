#!/bin/bash
# Vuelve a crear la aplicación "Clipo" en el Escritorio, con su ícono.
# Útil si la borraste o si estás instalando el proyecto en otra Mac.

set -e
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
APP="$HOME/Desktop/Clipo.app"
TMP="$(mktemp -d)"

cat > "$TMP/applet.applescript" <<APPLESCRIPT
on run
	do shell script "open -a Terminal " & quoted form of "$RAIZ/scripts/abrir-panel.command"
end run
APPLESCRIPT

rm -rf "$APP"
osacompile -o "$APP" "$TMP/applet.applescript"
rm -f "$APP/Contents/Resources/Assets.car"
cp "$RAIZ/scripts/icono/panel.icns" "$APP/Contents/Resources/applet.icns"
/usr/libexec/PlistBuddy -c "Delete :CFBundleIconName" "$APP/Contents/Info.plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Set :CFBundleIconFile applet" "$APP/Contents/Info.plist"
codesign --force --deep -s - "$APP" >/dev/null 2>&1 || true
chmod +x "$RAIZ/scripts/abrir-panel.command"
touch "$APP"
killall Dock 2>/dev/null || true
rm -rf "$TMP"

echo
echo "  Listo: \"Clipo\" está en tu Escritorio."
echo
read -r -p "  Apretá Enter para cerrar esta ventana. " _
