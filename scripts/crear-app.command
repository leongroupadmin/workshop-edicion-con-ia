#!/bin/bash
# Vuelve a crear la aplicación "Editor LG" en el Escritorio, con su ícono.
# Útil si la borraste o si estás instalando el proyecto en otra Mac.

set -e
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
NPM="$(command -v npm)"
NODE="$(command -v node)"
NODE_REAL="$(readlink "$NODE" 2>/dev/null || printf '%s' "$NODE")"
APP="$HOME/Desktop/Editor LG.app"
AGENTE="$HOME/Library/LaunchAgents/com.editorlg.panel.plist"
UID_ACTUAL="$(id -u)"
TMP="$(mktemp -d)"

# launchd mantiene el servidor vivo aunque el acceso directo ya haya terminado.
mkdir -p "$(dirname "$AGENTE")" "$HOME/Library/Logs"
cat > "$AGENTE" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.editorlg.panel</string>
  <key>ProgramArguments</key><array>
    <string>$NPM</string><string>run</string><string>panel</string>
  </array>
  <key>WorkingDirectory</key><string>$RAIZ</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$(dirname "$NODE_REAL"):$(dirname "$NPM"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/Editor-LG.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/Editor-LG.log</string>
</dict></plist>
PLIST
launchctl bootout "gui/$UID_ACTUAL" "$AGENTE" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$UID_ACTUAL" "$AGENTE"

cat > "$TMP/applet.applescript" <<APPLESCRIPT
on run
	do shell script "launchctl kickstart -kp gui/$UID_ACTUAL/com.editorlg.panel"
	open location "http://localhost:3000"
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
echo "  Listo: \"Editor LG\" está en tu Escritorio."
echo
read -r -p "  Apretá Enter para cerrar esta ventana. " _
