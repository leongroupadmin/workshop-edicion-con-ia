# Sistema de edición automática de video

Este repo edita videos hablados (talking head) de forma automática: transcribe,
corta, propone un plan de edición, genera motion graphics con **HyperFrames**,
monta todo con **Remotion** y renderiza versiones. Se usa desde la terminal
(Claude Code) y desde el panel web local (`/app`, Claude Agent SDK con cwd en
esta raíz). Las dos vías siguen este mismo archivo.

Respondé siempre en **español**, corto y claro. El usuario no es programador:
explicá qué hiciste en lenguaje simple, no muestres código salvo que lo pida.

## Estructura

```
assets/brand/         brand.json (colores, tipografías, logo) + fonts/ + logo  (compartido)
assets/music/         música de fondo (.mp3/.wav/.m4a) + sfx/ efectos           (compartido)
projects/<id>/        un proyecto de edición por video
  raw/                video original (no tocar)
  transcript.json     transcripción del original (tiempos del original)
  cuts.json           tramos conservados/quitados (editable)
  cut.mp4             video sin silencios, muletillas ni tomas repetidas
  cut.transcript.json transcripción re-sincronizada a cut.mp4  ← usar ESTA para el plan
  plan.json           plan de edición (borrador → aprobado)
  scenes-src/<item>/  proyecto HyperFrames de cada escena (index.html)
  scenes/             escenas renderizadas (.mp4 pantalla completa, .webm con alfa para overlays)
  versions/           v1.mp4, v2.mp4… + vN.json (qué cambió)
  settings.json       formato, subtítulos y música del proyecto
  chat.json           historial de pedidos (lo maneja el panel)
  status.json, logs/  estado del pipeline (lo leen el panel y vos)
scripts/              scripts del pipeline (correr con `npx tsx`)
src/                  composiciones de Remotion (src/edit/Edit.tsx = montaje final)
src/pipeline/types.ts tipos de todos los JSON (Transcript, CutsFile, Plan, Settings, Brand)
app/                  panel web (Next.js) en http://localhost:3000
```

## Pipeline de edición

Cada paso deja su resultado en `projects/<id>/`. Antes de arrancar un paso,
mirá qué archivos ya existen para retomar donde quedó.

1. **Transcribir** — `npx tsx scripts/transcribe.ts <id>`
   Extrae WAV 16 kHz mono con FFmpeg y transcribe en español con whisper.cpp
   (modelo medium, timestamps por palabra) → `transcript.json`.

2. **Cortar** — `npx tsx scripts/cut.ts <id>`
   Quita silencios de más de 0.5 s, muletillas sueltas ("eh", "este", "o sea")
   y tomas repetidas (si dice algo dos veces, queda la ÚLTIMA). Guarda
   `cuts.json`, `cut.mp4` y `cut.transcript.json` (timestamps re-sincronizados).
   Si el usuario pide corregir un corte, editá `cuts.json` (`keep` = tramos en
   ms del ORIGINAL) y corré `npx tsx scripts/cut.ts <id> --from-cuts`.
   Opciones: `--min-silence 0.5 --keep-gap 0.15 --no-fillers --no-retakes`.

3. **Proponer el plan** — escribir `plan.json` (ver formato abajo) con qué
   títulos, motion graphics, overlays, transiciones, zooms y efectos de sonido
   van en qué momento y **por qué**. Tiempos en ms sobre **cut.mp4** (usar
   `cut.transcript.json`). `status: "draft"` y cada ítem `status: "pending"`.
   **ESPERAR la aprobación del usuario antes de generar nada.** Resumí el plan
   en el chat en 3-6 líneas y terminá ahí. En el panel, tocar **"Renderizar"**
   es la aprobación: el panel marca el plan aprobado, te pide SOLO las escenas
   que faltan o cambiaron (formato, tamaño o estilo: `sceneSpec` de cada ítem)
   y después arma el video él mismo. Cuando el pedido diga que NO renderices,
   no corras `render.ts`.

4. **Generar escenas con HyperFrames** (solo con `plan.status === "approved"`).
   Para cada ítem de tipo `title`, `motion_graphic`, `overlay`, `lower_third`
   o `broll` que no esté `removed`:
   - `npx tsx scripts/scene.ts init <id> <itemId>` crea
     `scenes-src/<itemId>/index.html` con la marca aplicada (variables CSS
     `--brand-*`, `--font-heading`, `--font-body`, logo en `assets/`) y un
     `BRIEF.md` con lo que tiene que mostrar.
   - Diseñá la escena editando ese `index.html` con las skills de HyperFrames
     (`/hyperframes-core` para el contrato, `/hyperframes-animation` para GSAP,
     `/motion-graphics` y `/hyperframes-registry` para ideas y bloques). No
     corras el intake/entrevista de `/hyperframes`: el brief es el plan
     aprobado. No cambies `data-duration` ni el tamaño del root.
   - En `split` la escena mide media pantalla (1080x960 en vertical): lo dice
     el `BRIEF.md`. Si cambia el layout de una escena ya creada, regenerar la
     plantilla con `scene.ts init <id> <itemId> --force`.
   - `npx hyperframes lint <carpeta>` y arreglar errores.
   - `npx tsx scripts/scene.ts render <id> <itemId>` → `scenes/<itemId>.mp4`
     (pantalla completa o dividida) o `.webm` con transparencia (overlay). Actualiza
     `file` y `status: "rendered"` en `plan.json`.
   - Atajo si no hace falta diseño a medida: `npx tsx scripts/scene.ts all <id>`.

5. **Montar en Remotion** — lo hace `src/edit/Edit.tsx` con las props que arma
   `scripts/render.ts`: cut.mp4 + escenas + transiciones/zoom + subtítulos +
   efectos de sonido + música de fondo con ducking (baja cuando hay voz).

6. **Renderizar** — `npx tsx scripts/render.ts <id> --note "qué cambió"`
   → `versions/vN.mp4` con el siguiente N libre. **Nunca sobreescribir ni
   borrar versiones anteriores.** `--draft` para una prueba rápida.

### Formato de plan.json

```json
{
  "version": 1,
  "status": "draft",
  "createdAt": "ISO",
  "summary": "Idea general de la edición en una línea",
  "keywords": ["palabras", "a", "resaltar", "en", "subtítulos"],
  "items": [
    {
      "id": "s1",
      "type": "title | motion_graphic | overlay | lower_third | broll | transition | sfx | zoom",
      "startMs": 0, "endMs": 2500,
      "layout": "overlay | fullscreen | split",
      "text": "Texto en pantalla (si aplica)",
      "description": "Qué se ve / qué hace",
      "reason": "Por qué va acá",
      "sound": "music/sfx/whoosh.mp3",
      "transition": "flash | fade | wipe | zoom",
      "scale": 1.15,
      "hideCaptions": false,
      "status": "pending"
    }
  ]
}
```

- `id` corto y único (`s1`, `t1`, `z1`, `fx1`…). Ordenar por `startMs`.
- `layout`: `overlay` = encima del video con fondo transparente (títulos,
  lower thirds, datos chicos); `fullscreen` = inserto que tapa el video
  (motion graphics grandes; la voz sigue); `split` = pantalla dividida:
  escena arriba y video abajo (en horizontal: escena a la izquierda y video a
  la derecha), ideal para explicar algo sin perder la cara. Si una escena
  fullscreen ya tiene texto propio, poner `hideCaptions: true`. En `split` los
  subtítulos van solos sobre la unión de las dos mitades. El usuario puede
  cambiar el layout de cada escena desde el panel (antes o después de
  aprobar): respetá lo que eligió. Si una escena ya generada cambia de layout,
  el panel le saca `file` y te pide regenerar solo esas (`init --force` +
  `render`) y armar una versión nueva. Respetá `settings.style.splitUse`; con
  `auto`, variá los layouts según el contenido (no todo overlay).
- `transition` va en ítems `type: "transition"` (300-500 ms, centrados en el
  cambio). **Con pantalla dividida no hay transiciones:** la división entra y
  sale con corte directo y no pongas ítems `transition` dentro de un tramo
  `split` ni pegados a sus bordes (el montaje igual los ignora, con su sonido). `zoom` usa `scale` (1.1-1.3), mínimo 1 s.
- `sound`: ruta relativa a `/assets` (p.ej. `music/sfx/whoosh.mp3`). Solo
  archivos que existan en `assets/music/sfx/`; listalos antes de proponer.
  `assets/music/sfx/manifest.json` tiene la duración y para qué sirve cada
  uno (19 efectos de Pixabay, uso comercial libre): elegí según lo que pasa en
  pantalla, no siempre el mismo. Guía rápida: `whoosh-short`/`whoosh` = algo
  entra o sale moviéndose; `whoosh-cinematic` = cambio grande; `pop` /
  `click-soft` = aparece un dato, ícono o palabra chica; `impact-bass-1/2` =
  título o frase fuerte que "golpea"; `sparkle`/`chime` = algo positivo
  (logro, beneficio, CTA); `ping`/`notification` = dato o aviso; `riser` =
  sube la tensión hasta un clímax (dura 10 s: arrancalo 10 s antes del
  golpe); `typing`/`key-press` = texto que se escribe; `glitch-*` / `error` =
  solo si el tono es tech o algo sale mal. Máximo un sonido por aparición, y
  no en cada palabra. El volumen lo maneja `settings.sfx` (no lo pongas en
  el plan); si `settings.sfx.enabled` es false, no propongas sonidos.
- Criterio: menos es más. Si `settings.style.graphicsCount` es mayor a 0, esa
  es la cantidad exacta de gráficos (ver Estilo de edición); si no, 1 elemento
  visual cada 4-8 s como máximo (según el ritmo). El primero en los primeros
  2 s (gancho). No tapar la cara: overlays arriba o al centro,
  fuera de la zona de subtítulos.

## Reglas

- **Roles:** HyperFrames = escenas de motion graphics (`scenes/`). Remotion =
  montaje final, transiciones, zooms, subtítulos y audio. No mezclar: no
  armar subtítulos en HyperFrames ni motion graphics a mano en Remotion.
- **Formato por defecto:** vertical 1080x1920, 30 fps.
- **Subtítulos:** español, palabra por palabra estilo karaoke, palabras clave
  (`plan.keywords`) resaltadas, máximo 3-4 palabras en pantalla, siempre dentro
  de la zona segura (no tapar la interfaz de Instagram/TikTok). Ver
  `src/edit/Captions.tsx` y `src/edit/layout.ts`.
- **Marca:** usar siempre `/assets/brand` si existe (`brand.json`, `fonts/`,
  logo). No inventar colores ni tipografías.
- **Ajustes:** ante un pedido de ajuste, cambiar SOLO lo pedido y re-renderizar
  como nueva versión (`--note` con el pedido). Si el cambio es de una escena,
  re-renderizar solo esa escena y después el montaje.
- **settings.json:** formato (`vertical|horizontal|square`), subtítulos
  (`style: karaoke|simple|none`, `size`, `position: bottom|middle|top`,
  `maxWords`, `uppercase`), música (`enabled`, `volume`, `duckTo`, `track`) y
  estilo de edición (`style`, ver abajo). Los ajustes se leen de ahí: para
  cambiarlos, editar `settings.json` y re-renderizar. Si cambia el formato,
  las escenas viejas se ven con bandas: ofrecer regenerarlas.
- **Estilo de edición (`settings.style`)** — el usuario lo elige al subir el video
  (pantalla "Nuevo video"), así que cuando armás el plan ya está en
  `settings.json`; lo puede ajustar después en el proyecto. Respetalo:
  - `graphicsCount` (cantidad de gráficos): si es mayor a 0, el plan lleva
    **EXACTAMENTE** esa cantidad de ítems con escena (`title`,
    `motion_graphic`, `overlay`, `lower_third`, `broll`) repartidos parejos:
    con duración D y cantidad N, el gráfico i (desde 0) arranca cerca de
    i × D/N (el primero dentro de los primeros 2 s), corrido como mucho ±1 s
    para caer en la frase que corresponde, y dura como máximo D/N − 0.3 s
    para que no se pisen. Transiciones, zooms y sonidos no cuentan. Si es 0,
    la cantidad la decide el ritmo.
  - `pace` (ritmo del plan): `calm` = 1 elemento visual cada 6-10 s, pocas
    transiciones y sonidos; `normal` = cada 4-8 s; `dynamic` = cada 2-4 s, más
    zooms, transiciones y un sfx en cada aparición.
  - `graphics` (cómo diseñar las escenas, también va en cada `BRIEF.md`):
    `minimal` = aire, semibold, un acento fino, animaciones suaves;
    `bold` = tipografía enorme 800, kinetic typography, alto contraste,
    animaciones con energía; `corporate` = tarjetas prolijas, íconos, grilla,
    deslizamientos suaves.
  - `splitUse` (cuándo usar pantalla dividida): `never` = ningún ítem con
    `layout: "split"`; `always` = todos los ítems con escena en `split`;
    `auto` = elegís vos según el contenido (ver `layout` arriba). Cuando el
    usuario lo cambia, el panel ya actualiza el plan actual.
  - `split` = pantalla dividida: `position` `top|bottom` (en horizontal:
    izquierda|derecha) y `share` (0.4/0.5/0.6 de la pantalla para el gráfico).
    El tamaño de cada escena split sale de acá (lo dice el `BRIEF.md`).
  - `cut` = `soft|normal|aggressive` (presets de `scripts/cut.ts`). Al
    cambiarlo el panel re-corta y `plan.json` se re-sincroniza solo.
  - `autoZoom`: zoom alternado en cada corte (lo hace Remotion). Si está
    activo, poné menos ítems `zoom` en el plan.
- **Música:** `assets/music/` (la que diga `settings.music.track`, o si está
  vacío la primera pista suelta en esa carpeta). Para conseguir música buena
  está la biblioteca de HeyGen (más de 10.000 temas; ya hay sesión iniciada):
  `npx tsx scripts/music.ts search "<estilo>"` para ver opciones y
  `npx tsx scripts/music.ts pick <id> "<estilo>"` para bajar el mejor tema y
  dejarlo elegido en `settings.json`. El estilo, concreto y en inglés según el
  tono del video y la marca (p.ej. "uplifting corporate piano", "elegant
  luxury minimal", "lofi chill", "epic motivational"). Al armar el plan, si
  `music.enabled` y `music.track` está vacío, elegí una así y contalo. Después de cada
  render revisá el campo `music` de `versions/vN.json`: si es `null` el video
  salió SIN música; decíselo al usuario (no afirmes que tiene música sin verificarlo)
  y ofrecé elegir una pista o subirla desde "Marca y música".
- **Todo local:** no subir videos ni audios a servicios externos.
- Al terminar un paso, el estado se ve en `status.json`; los scripts ya lo
  actualizan. Si algo falla, leé `logs/pipeline.log`, arreglalo y reintentá
  antes de pedir ayuda.
- No toques `raw/` ni `versions/` existentes. No borres proyectos.
- **Borrar:** si el usuario pide borrar una versión o un proyecto, no lo hagas
  vos: decile que use el botón "Eliminar" del panel (manda todo a la Papelera de
  la Mac, recuperable). Los números de versión borrados no se reutilizan
  (`versions/.last-version`), así que puede haber saltos (v1, v2, v4).

## Comandos útiles

```bash
npx tsx scripts/transcribe.ts <id>            # paso 1
npx tsx scripts/cut.ts <id>                   # paso 2
npx tsx scripts/scene.ts list <id>            # escenas del plan y su estado
npx tsx scripts/scene.ts init|render <id> <itemId>
npx tsx scripts/render.ts <id> --note "..."   # pasos 5-6
npx tsx scripts/pipeline.ts prepare <id>      # pasos 1+2 seguidos (lo usa el panel)
npx tsx scripts/setup-whisper.ts              # reinstalar whisper.cpp + modelo
npm run cuenta                                # ver/cambiar la cuenta de Claude (o panel → "Cuenta")
npm run dev                                   # Remotion Studio (puerto 3001)
cd app && npm run dev                         # panel en http://localhost:3000
```
