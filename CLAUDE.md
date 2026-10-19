# Clipo — sistema de edición automática de video

Este repo edita videos hablados (talking head) de forma automática: transcribe,
corta, propone un plan de edición, genera motion graphics con **HyperFrames**,
monta todo con **Remotion** y renderiza versiones. Se usa desde la terminal
(Claude Code) y desde el panel web local (**Clipo**: `/app`, Claude Agent SDK con cwd
en esta raíz). Las dos vías siguen este mismo archivo.

Respondé siempre en **español**, corto y claro. El usuario no es programador:
explicá qué hiciste en lenguaje simple, no muestres código salvo que lo pida.

## Estructura

```
assets/brand/         brand.json (colores, tipografías, logo) + fonts/ + logo  (compartido)
assets/brand/clipo/   logos de Clipo (horizontal, ícono, completo) — los usa el panel
assets/brands/<slug>/ marcas guardadas (copia de brand.json + fonts/ + logo)
assets/music/         música de fondo (.mp3/.wav/.m4a) + sfx/ efectos           (compartido)
projects/<id>/        un proyecto de edición por video
  raw/                video original (no tocar)
  transcript.json     transcripción del original (tiempos del original)
  cuts.json           tramos conservados/quitados (editable)
  cut.mp4             video sin silencios, muletillas ni tomas repetidas
  cut.transcript.json transcripción re-sincronizada a cut.mp4  ← usar ESTA para el plan
  plan.json           plan de edición (borrador → aprobado)
  images/             imágenes que subió el usuario para ESTE video
  images.json         descripción de cada imagen (la escribe el usuario)
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
   - **Respetar la sección "Movimiento" del `BRIEF.md`**: trae la personalidad
     de movimiento del video (duración de entrada, curva, rebote, salida,
     escalonado) y es la MISMA para todas las escenas. No inventes otros
     tiempos por escena: así el video entero se mueve como una sola pieza.
     Cada escena tiene cuatro actos (anticipación → acción → reacción →
     resolución) y tres capas (principal + secundaria + ambiente). Si falta
     la capa secundaria o la de ambiente, la escena se ve plana.
   - Antes de renderizar, pasá el control de calidad: (1) nada de `linear`
     para movimiento, solo para rotación continua o barras de progreso;
     (2) ningún cambio importante solo con opacidad, sumarle posición o
     escala; (3) las tres capas presentes; (4) como máximo un tercio de los
     elementos moviéndose a la vez y escalonado total menor a 0.5 s; (5) la
     salida termina con su respiro, la escena nunca corta en movimiento.
   - En overlay (fondo transparente) **no uses degradados grandes y suaves**:
     el WebM con alfa los comprime mal y dejan franjas de color. Ahí el
     ambiente es movimiento (una respiración lenta del conjunto), no un halo.
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
      "images": ["foto.jpg"],
      "description": "Qué se ve / qué hace",
      "reason": "Por qué va acá",
      "sound": "music/sfx/whoosh.mp3",
      "transition": "flash | fade | wipe | zoom | whip | blur | glitch | lightleak",
      "scale": 1.15,
      "zoom": "in | out",
      "hideCaptions": false,
      "status": "pending"
    }
  ]
}
```

- `id` corto y único (`s1`, `t1`, `z1`, `fx1`…). Ordenar por `startMs`.
- **Regla inviolable de duración:** cada `title`, `motion_graphic`, `overlay`,
  `lower_third` o `broll` tiene **al menos 2000 ms de lectura continua** con
  todo el contenido principal visible, entre el final de su entrada y el inicio
  de su salida. Entrada, escalonado, salida y respiro NO cuentan como lectura.
  Reservar **al menos 3800 ms totales** por escena (2000 de lectura + 1800
  de margen de animación). Es un piso, no una duración fija ni un máximo:
  extender según cantidad de texto, imágenes o pasos; cada nuevo dato que
  reemplace al anterior también necesita 2 s de lectura. Si no entra, ajustar
  el plan sin superponer escenas que se tapen ni exceder cut.mp4; no acelerar
  la lectura para cumplir la cantidad de gráficos. No aplica a subtítulos,
  transiciones, zooms ni efectos de sonido.
- `layout`: `overlay` = encima del video con fondo transparente (títulos,
  lower thirds, datos chicos); `fullscreen` = inserto que tapa el video
  (motion graphics grandes; la voz sigue); `split` = pantalla dividida:
  escena arriba y video abajo (en horizontal: escena a la izquierda y video a
  la derecha), ideal para explicar algo sin perder la cara; `pip` = la escena
  ocupa toda la pantalla y el video de la persona va chiquito en un recuadro
  (arriba a la izquierda en vertical, para no chocar con los subtítulos ni con
  la interfaz de Instagram/TikTok); `frame` = la escena ocupa toda la pantalla
  y el video va enmarcado en una tarjeta centrada, con el título arriba y la
  marca abajo. En `pip` y `frame` la escena se genera a pantalla completa y
  **tiene que dejar libre el rectángulo del video**: el `BRIEF.md` dice las
  coordenadas exactas. La voz sigue sonando en los dos. Si una escena
  fullscreen ya tiene texto propio, poner `hideCaptions: true`. En `split` los
  subtítulos van solos sobre la unión de las dos mitades. El usuario puede
  cambiar el layout de cada escena desde el panel (antes o después de
  aprobar): respetá lo que eligió. Si una escena ya generada cambia de layout,
  el panel le saca `file` y te pide regenerar solo esas (`init --force` +
  `render`) y armar una versión nueva. Respetá `settings.style.layoutUse`; con
  `auto`, variá los layouts según el contenido (no todo overlay): alterná
  tramos de cara con `fullscreen` (el gráfico tapa la pantalla unos segundos,
  como un b-roll) y `split`.
- `transition` va en ítems `type: "transition"`, centrados en el cambio
  (un corte de cut.mp4). Hay 8 (están en `src/edit/transitions.tsx`):
  `flash` destello blanco (300-400 ms, cambio rápido de idea); `fade`
  fundido a negro (400-600 ms, cierre o pausa); `wipe` barra del color de
  la marca cruzando (350-500 ms, pasar de tema); `zoom` acercamiento de
  golpe (300-400 ms, énfasis); `whip` barrido rápido con desenfoque
  (300-400 ms, ritmo, "y ahora…"); `blur` desenfoque que entra y sale
  (400-600 ms, salto de tiempo o de lugar, más suave); `glitch` tirones y
  colores corridos (250-400 ms, solo tono tech o "algo sale mal");
  `lightleak` destello de luz cálida (600-900 ms, momento emotivo,
  inspirador o CTA). Variá según lo que pasa, no repitas siempre la misma;
  en un video corto 2-3 tipos alcanzan. Sonido sugerido: `whip`/`wipe` →
  `whoosh-short` o `whoosh`; `glitch` → `glitch-*`; `lightleak` →
  `sparkle` o `whoosh-cinematic`; `flash`/`zoom` → `impact-bass-*` si
  remata una frase fuerte. **Con pantalla dividida no hay transiciones:** la división entra y
  sale con corte directo y no pongas ítems `transition` dentro de un tramo
  `split` ni pegados a sus bordes (el montaje igual los ignora, con su sonido).
  Excepción: con `settings.style.fixedLayout` (ver abajo) sí van. `zoom` usa `scale` (1.1-1.3), mínimo 1 s; `zoom: "out"` arranca
  cerca y se aleja despacio (buen gancho de arranque), `"in"` (por defecto)
  acerca y vuelve.
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
- `images`: nombres de archivo de `projects/<id>/images` (las subió el usuario
  desde el panel). Si hay imágenes, **usalas todas**: repartilas entre los
  gráficos que mejor peguen con lo que se dice en ese momento, una imagen en un
  solo ítem. `images.json` dice qué es cada una. `scene.ts init` las copia a
  `assets/img/` de la escena y lo anota en el `BRIEF.md`: mostralas con `<img>`
  o como fondo, con `object-fit: cover` para que no se deformen. Las fotos
  piden `fullscreen` o `split` (en `overlay` quedan chicas).
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
  Combinación opcional: `subtitles.mixFonts` (false por defecto), `primaryFont`
  (heading/body) y `accentFont` (brand/lora/heading/body; brand por defecto). La segunda
  fuente se aplica solo a `plan.keywords`. `brand.fonts.subtitleAccent` define
  la fuente de énfasis de la marca (Lora cursiva si falta); activar la combinación
  selecciona automáticamente esa fuente. Se puede elegir antes de crear el video. Lora cursiva está incluida con su
  licencia en `public/fonts/` y `app/public/fonts/`.
- **Marca:** usar siempre `/assets/brand` si existe (`brand.json`, `fonts/`,
  logo). No inventar colores ni tipografías. En `/assets/brands/` hay marcas
  guardadas: el usuario cambia de una a otra desde el panel y eso reemplaza
  `/assets/brand`; vos leé siempre la que está en uso.
- **Ajustes:** ante un pedido de ajuste, cambiar SOLO lo pedido y re-renderizar
  como nueva versión (`--note` con el pedido). Si el cambio es de una escena,
  re-renderizar solo esa escena y después el montaje.
- **Indicaciones del usuario (`settings.instructions`):** texto libre que
  escribe desde el panel ("Indicaciones para Claude", opcional). Si hay algo,
  respetalo al armar el plan y al diseñar cada escena: viene en el pedido del
  plan y en el `BRIEF.md` de cada escena. Manda sobre tus criterios por
  defecto, salvo que choque con las reglas de formato o zona segura.
- **settings.json:** formato (`vertical|horizontal|square`), subtítulos
  (`style: karaoke|simple|pop|minimal|none`, `size`, `position: bottom|middle|top`,
  `maxWords`, `uppercase`), música (`enabled`, `volume`, `duckTo`, `track`) y
  estilo de edición (`style`, ver abajo). Los ajustes se leen de ahí: para
  cambiarlos, editar `settings.json` y re-renderizar. Si cambia el formato,
  las escenas viejas se ven con bandas: ofrecer regenerarlas.
- **Estilo de edición (`settings.style`)** — el usuario lo elige al subir el video
  (pantalla "Nuevo video"), así que cuando armás el plan ya está en
  `settings.json`; lo puede ajustar después en el proyecto. Respetalo:
  - `noGraphics` ("Motion graphics: No", preset **Monólogo**): el video va
    **sin motion graphics**. El plan NO lleva ítems `title`,
    `motion_graphic`, `overlay`, `lower_third` ni `broll` (se ignoran
    `graphicsCount`, `graphics`, `layoutUse` y las imágenes subidas). Solo
    `zoom`, `transition` y `sfx`, más `keywords` para los subtítulos. El
    ritmo (`pace`) dice cuántos: zooms en frases fuertes (menos si
    `autoZoom` está activo), transiciones en cambios de tema o de idea
    (centradas en un corte de cut.mp4) y sonidos que acompañen esas
    transiciones o remates. Si igual queda alguna escena en el plan, el
    panel no la genera y el montaje no la usa.
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
  - `layoutUse` (cómo se ven los gráficos): `overlay` = todos encima del
    video; `split` = todos en pantalla dividida; `fullscreen` = todos tapan la
    pantalla unos segundos, como un b-roll, y después vuelve la cara (la voz
    sigue); `auto` = elegís vos según el contenido y mezclás los tres (ver
    `layout` arriba); `mixed` ("Combinado") = los cinco **rotando en
    orden**, sin dos iguales seguidos: el gráfico 1 `fullscreen` (es el
    gancho), el 2 `overlay`, el 3 `split`, el 4 `pip`, el 5 `frame`, el 6
    `fullscreen`… Es obligatorio, no una
    sugerencia como `auto`. Única excepción: un gráfico con fotos nunca va en
    `overlay` (ahí la foto queda chica); si le tocaba `overlay`, va al layout
    grande que no repita con el anterior. La rotación se cuenta por orden de
    `startMs`, solo entre ítems con escena. Cuando el usuario lo cambia, el panel ya actualiza el
    plan actual. Antes esto se llamaba `splitUse`: los settings viejos se
    convierten solos (`never`→`overlay`, `always`→`split`).
  - `fixedLayout` ("Fijo", solo con `layoutUse` `split`, `pip` o `frame`):
    ese armado queda **todo el video**, la cara nunca vuelve a pantalla
    completa. El montaje lo garantiza solo: donde no hay escena se ve un fondo
    de marca animado. Al armar el plan: todos los gráficos en ese layout y
    **encadenados uno detrás de otro** cubriendo cut.mp4 de punta a punta
    (el primero arranca en 0, cada uno termina donde empieza el siguiente,
    huecos de menos de 0.5 s; con `graphicsCount`, cada uno dura D/N sin el
    −0.3 s). Las transiciones SÍ se usan, centradas en el cambio de una
    escena a otra: el montaje las deja dentro de la mitad del gráfico (o
    detrás del recuadro en `pip`/`frame`), nunca tapan la cara. Los zooms van
    sobre el video como siempre.
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
  y ofrecé elegir una pista o subirla desde la pestaña "Música" del panel.
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
