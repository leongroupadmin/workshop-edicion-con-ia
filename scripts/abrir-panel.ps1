# Abre Editor LG (el panel de edición de video) en el navegador. Versión Windows de abrir-panel.command.
# Doble clic en el acceso directo "Editor LG" del Escritorio (lo crea crear-acceso-directo.ps1).
# Para apagar el panel: cerrá esta ventana o apretá Control+C.

Set-Location (Join-Path $PSScriptRoot "..")
$Host.UI.RawUI.WindowTitle = "Editor LG"
$URL = "http://localhost:3000"

function Escuchando {
  [bool](Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)
}

Write-Host "`n  Editor LG · edición automática de video`n  $(Get-Location)`n"

# ¿Ya está prendido? Entonces solo abro el navegador.
if (Escuchando) {
  Write-Host "  Editor LG ya estaba abierto. Abriendo el navegador..."
  Start-Process $URL
  Start-Sleep 3
  exit 0
}

# Dependencias instaladas?
if (-not (Test-Path node_modules) -or -not (Test-Path app\node_modules)) {
  Write-Host "  Primera vez: instalando dependencias (tarda unos minutos)..."
  npm.cmd install
  if ($LASTEXITCODE -ne 0) { Read-Host "  Falló la instalación. Apretá Enter para cerrar"; exit 1 }
  npm.cmd install --prefix app
  if ($LASTEXITCODE -ne 0) { Read-Host "  Falló la instalación. Apretá Enter para cerrar"; exit 1 }
  Write-Host ""
}

# En segundo plano: espero a que el servidor esté listo (hasta 90 segundos) y abro el navegador.
$espera = @"
for (`$i = 0; `$i -lt 90; `$i++) {
  if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) {
    Start-Sleep 1; Start-Process '$URL'; break
  }
  Start-Sleep 1
}
"@
$cod = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($espera))
Start-Process powershell.exe -WindowStyle Hidden -ArgumentList "-NoProfile", "-EncodedCommand", $cod

Write-Host "  Arrancando Editor LG... (no cierres esta ventana mientras lo uses)`n"
npm.cmd run panel

# Si llegó acá, el panel se apagó (Control+C o un error).
Write-Host "`n  Editor LG se apagó. Si hubo un error, está arriba."
Read-Host "  Apretá Enter para cerrar"
