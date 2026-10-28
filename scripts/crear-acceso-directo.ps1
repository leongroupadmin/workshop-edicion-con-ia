# Crea (o vuelve a crear) el acceso directo "Editor LG" en el Escritorio, con su ícono.
# Versión Windows de crear-app.command. Útil si lo borraste o si instalás el proyecto en otra PC.
# Uso: clic derecho > "Ejecutar con PowerShell", o:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\crear-acceso-directo.ps1

$raiz = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$escritorio = [Environment]::GetFolderPath("Desktop")
$lnk = Join-Path $escritorio "Editor LG.lnk"

$acceso = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$acceso.TargetPath = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$acceso.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$raiz\scripts\abrir-panel.ps1`""
$acceso.WorkingDirectory = $raiz
$acceso.IconLocation = "$raiz\scripts\icono\panel.ico,0"
$acceso.Description = "Editor LG · edición automática de video"
$acceso.Save()

Write-Host "`n  Listo: `"Editor LG`" está en tu Escritorio ($escritorio).`n"
