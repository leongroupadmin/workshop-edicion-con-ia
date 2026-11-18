# Instalá tu editor

**Workshop · Edición de videos automática**

Los pasos que hacemos juntos al empezar el workshop, desde cero. Mientras tu compu descarga e instala, seguimos con la clase: no hace falta que mires la pantalla todo el tiempo.

**6 pasos · unos 45 minutos, casi todo esperando descargas · Mac o Windows**

> **Todo se hace desde el chat de Claude Code.** No hace falta abrir ninguna terminal ni escribir comandos: copiás un mensaje, lo pegás en Claude y él instala todo, explicándote cada paso.

## Qué necesitás

| | |
|---|---|
| **Una compu** | Mac, o Windows 10 u 11. Con 8 GB de RAM alcanza; 16 GB va mejor. |
| **6 GB libres** | Entre el programa, el modelo de transcripción y tus videos. |
| **Claude Pro** | La suscripción de USD 20 por mes alcanza. Max también sirve. |
| **Buena conexión** | Hay que bajar unos 2,5 GB en total. |

---

## 1. Instalá la app de Claude · 5 minutos

Es la app desde donde le vas a hablar a Claude para instalar y modificar tu editor. Es lo único que se instala a mano.

- Bajá la app de escritorio de Claude desde [claude.ai/download](https://claude.ai/download), instalala e iniciá sesión con tu cuenta **Pro**.
- Arriba vas a ver la pestaña **Code**: ahí se usa Claude Code.

- [ ] Listo

## 2. Creá la carpeta del editor · 2 minutos

Una carpeta vacía donde va a vivir tu editor.

- En **Documentos**, creá una carpeta nueva llamada **Editor LG**.
- En Claude, entrá a la pestaña **Code**, empezá una sesión nueva y elegí esa carpeta como carpeta de trabajo.

- [ ] Listo

## 3. Pedile a Claude que prepare la compu · 10 a 15 minutos

Copiá este mensaje y pegalo en el chat. Claude revisa qué falta e instala las herramientas que usa el editor: Node.js, Git y FFmpeg.

```text
Voy a instalar Editor LG, un editor automático de videos hablados. Primero preparemos esta compu.

Fijate qué sistema operativo tengo y si están instalados Node.js 20 o más nuevo, Git y FFmpeg con ffprobe. Instalá lo que falte, de a uno, explicándome en simple qué hacés:
- En Windows usá winget.
- En Mac usá instaladores que abran su propia ventana cuando haga falta mi contraseña. Nunca me pidas que escriba una contraseña en este chat.

Si aparece una ventana pidiendo permiso, decime qué tocar. Al final contame si quedó todo instalado.
```

- Claude te va a pedir permiso para hacer cosas en tu compu: **aceptá**.
- Puede aparecer una ventana de Windows o de Mac pidiendo permiso o tu contraseña: **aceptá ahí**, en esa ventana, nunca en el chat.

> Cuando Claude termine, **cerrá la app de Claude y volvé a abrirla**, y abrí otra vez la carpeta **Editor LG**. Así encuentra lo que se instaló.

- [ ] Listo

## 4. Pedile a Claude que instale el editor · 15 a 25 minutos

En una sesión nueva sobre la carpeta **Editor LG**, pegá este segundo mensaje. Claude baja el proyecto e instala todo.

```text
Ahora instalá Editor LG en esta carpeta:

1. Descargá el proyecto de https://github.com/leongroupadmin/workshop-edicion-con-ia en esta misma carpeta (el CLAUDE.md del proyecto tiene que quedar acá, no en una subcarpeta).
2. Leé su CLAUDE.md para entender cómo funciona.
3. Instalá las dependencias del proyecto y del panel (npm install, y npm install --prefix app).
4. Instalá whisper.cpp con el modelo de transcripción (npm run setup:whisper). Baja 1,5 GB: avisame cuando termine.
5. Restaurá las skills del proyecto con: npx skills install -a claude-code
6. Creá el acceso directo "Editor LG" en el Escritorio. En Windows con scripts/crear-acceso-directo.ps1; en Mac con scripts/crear-app.command.
7. Abrí el panel y fijate que cargue bien.

Explicame cada paso en simple, sin código. Si algo falla, arreglalo antes de seguir.
```

> La descarga del modelo de transcripción es lo que más tarda. Dejá que Claude trabaje y no cierres la app mientras tanto.

- [ ] Listo

## 5. Probá que abre · 3 minutos

- Hacé **doble clic en "Editor LG"** en el Escritorio. Se abre una ventana negra (no la cierres) y después el panel en el navegador.
- Entrá a la pestaña **IA**: tiene que aparecer tu cuenta de Claude conectada. Si no, tocá **Conectar Claude** y seguí los pasos.
- Todavía no subas un video: lo hacemos todos juntos en el módulo 03.

- [ ] Listo

## 6. Tené a mano tu material

Lo usamos en la segunda parte del workshop para editar y personalizar tu editor.

- **Dos videos** tuyos, de 30 a 60 segundos, verticales, hablando a cámara (MP4 o MOV). Cortitos: así se procesan rápido y gastan poco de tu plan.
- **Tu logo** en PNG, ideal con fondo transparente.
- Opcional: **una música** libre de derechos en MP3 para el fondo.

- [ ] Listo

---

## Si algo falla

- **Contale a Claude en el mismo chat** qué pasó o pegale el error tal cual aparece, y pedile que lo arregle. Casi siempre lo resuelve solo.
- Si no se resuelve, **avisá en el chat del workshop** en qué paso quedaste y qué dice el error.
- Si te quedás atrás, seguí la clase mirando la pantalla del profe y terminá la instalación en el recreo. Esta guía queda disponible para hacerlo cuando quieras.

---

Workshop de León Group · Editor LG. Material de uso educativo.
