# Preparación para el workshop

**Workshop · Edición de videos automática**

Hacé esto antes del workshop. Si llegás con todo instalado, usamos las 3 horas para editar videos y personalizar tu editor, no para esperar descargas.

**6 pasos · unos 45 minutos, casi todo esperando descargas · Mac o Windows**

## Qué necesitás

| | |
|---|---|
| **Una compu** | Mac, o Windows 10 u 11. Con 8 GB de RAM alcanza; 16 GB va mejor. |
| **6 GB libres** | Entre el programa, el modelo de transcripción y tus videos. |
| **Claude Pro** | La suscripción de USD 20 por mes alcanza. Max también sirve. |
| **Buena conexión** | Hay que bajar unos 2,5 GB en total. |

---

## 1. Instalá Claude Code · 5 minutos

Es la app desde donde le vas a hablar a Claude para instalar y modificar tu editor.

- Bajá la app de escritorio de Claude desde [claude.ai/download](https://claude.ai/download) e iniciá sesión con tu cuenta **Pro**.
- Entrá a la pestaña **Code**: ahí se usa Claude Code.

- [ ] Listo

## 2. Instalá Node.js, Git y FFmpeg · 10 a 15 minutos

Son las tres herramientas que usa el editor por dentro. Se instalan una sola vez.

### En Windows

Abrí **PowerShell** (buscalo en el menú Inicio) y pegá esta línea. Va a pedir permiso un par de veces: aceptá.

```powershell
winget install -e --id OpenJS.NodeJS.LTS; winget install -e --id Git.Git; winget install -e --id Gyan.FFmpeg
```

> Cuando termine, **cerrá PowerShell y Claude** y volvé a abrirlos, para que encuentren lo que instalaste.

### En Mac

Abrí la app **Terminal**. Si no tenés Homebrew, instalalo primero con esta línea (te pide la contraseña de tu Mac):

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Después instalá las tres herramientas:

```bash
brew install node git ffmpeg
```

> Si Homebrew te dice al final que corras dos líneas para agregarlo al PATH, **copialas y corrélas** antes de seguir.

- [ ] Listo

## 3. Bajá el proyecto · 2 minutos

Es el archivo base del editor. Lo vas a tener en tu compu, es tuyo.

- Entrá a [github.com/leongroupadmin/workshop-edicion-con-ia](https://github.com/leongroupadmin/workshop-edicion-con-ia).
- Tocá el botón verde **Code** y después **Download ZIP**.
- Descomprimilo en **Documentos**. Te queda una carpeta llamada `workshop-edicion-con-ia-main`.

- [ ] Listo

## 4. Pedile a Claude que lo instale · 15 a 25 minutos

En Claude Code, elegí la carpeta del proyecto como carpeta de trabajo y pegá este mensaje. Claude hace todo y te va contando.

```text
Este proyecto es Editor LG, un editor automático de videos hablados. Leé el CLAUDE.md y dejalo listo para usar en esta compu:

1. Verificá que estén instalados Node.js 20 o más nuevo, Git y FFmpeg con ffprobe. Si falta algo, explicame cómo instalarlo y esperá.
2. Instalá las dependencias del proyecto y del panel (npm install, y npm install --prefix app).
3. Instalá whisper.cpp con el modelo de transcripción (npm run setup:whisper). Baja 1,5 GB: avisame cuando termine.
4. Restaurá las skills del proyecto con: npx skills install -a claude-code
5. Creá el acceso directo "Editor LG" en el Escritorio. En Windows con scripts/crear-acceso-directo.ps1; en Mac con scripts/crear-app.command.
6. Abrí el panel y fijate que cargue bien.

Explicame cada paso en simple, sin código. Si algo falla, arreglalo antes de seguir.
```

> Claude te va a pedir permiso para correr comandos: **aceptá**. La descarga del modelo es lo que más tarda.

- [ ] Listo

## 5. Probá que abre · 3 minutos

- Hacé **doble clic en "Editor LG"** en el Escritorio. Se abre una ventana negra (no la cierres) y después el panel en el navegador.
- Entrá a la pestaña **IA**: tiene que aparecer tu cuenta de Claude conectada. Si no, tocá **Conectar Claude** y seguí los pasos.
- No hace falta que subas un video todavía: eso lo hacemos juntos en el workshop.

- [ ] Listo

## 6. Prepará tu material

Lo vamos a usar en vivo para editar y personalizar tu editor.

- **Dos videos** tuyos, de 30 a 60 segundos, verticales, hablando a cámara (MP4 o MOV). Cortitos: así se procesan rápido y gastan poco de tu plan.
- **Tu logo** en PNG, ideal con fondo transparente.
- Opcional: **una música** libre de derechos en MP3 para el fondo.

- [ ] Listo

---

## Si algo falla

- **Pegale el error a Claude tal cual aparece**, sin resumirlo, y pedile que lo arregle. Casi siempre lo resuelve solo.
- Si no se resuelve, **anotá en qué paso quedaste** y traé el error al workshop: lo vemos al principio.
- Aunque no llegues a terminar, conectate igual: el paso 4 se puede hacer durante la primera parte del workshop.

---

Workshop de León Group · Editor LG. Material de uso educativo.
