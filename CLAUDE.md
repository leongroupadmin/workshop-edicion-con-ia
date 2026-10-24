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
assets/personajes/    personajes del clon (<slug>/foto.<ext> + personaje.json) + claves.json
clones/<id>/          un video del pipeline de clon (ver "Pipeline de clon")
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
      "transition": "flash | fade | wipe | zoom | whip | blur | glitch | lightleak | shake | zoomblur | spin | iris | blinds | filmburn",
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
  (un corte de cut.mp4). Hay 14 (están en `src/edit/transitions.tsx`):
  `flash` destello blanco (300-400 ms, cambio rápido de idea); `fade`
  fundido a negro (400-600 ms, cierre o pausa); `wipe` barra del color de
  la marca cruzando (350-500 ms, pasar de tema); `zoom` acercamiento de
  golpe (300-400 ms, énfasis); `whip` barrido rápido con desenfoque
  (300-400 ms, ritmo, "y ahora…"); `blur` desenfoque que entra y sale
  (400-600 ms, salto de tiempo o de lugar, más suave); `glitch` tirones y
  colores corridos (250-400 ms, solo tono tech o "algo sale mal");
  `lightleak` destello de luz cálida (600-900 ms, momento emotivo,
  inspirador o CTA); `shake` sacudón de cámara (300-450 ms, golpe,
  sorpresa, frase fuerte); `zoomblur` zoom hacia el centro con rayas de
  velocidad (350-500 ms, "mirá esto", dato clave); `spin` una vuelta entera
  desenfocada (450-650 ms, giro de la historia, "pero…"; usarla poco);
  `iris` círculo que se cierra a negro y se abre (500-700 ms, cerrar un tema
  y abrir otro, tono retro o divertido); `blinds` persianas del color de la
  marca (450-650 ms, pasar de sección, "paso 1, paso 2"); `filmburn`
  película quemada, manchas naranjas que titilan (600-900 ms, recuerdo,
  historia personal, cierre emotivo). Variá según lo que pasa, no repitas siempre la misma;
  en un video corto 2-3 tipos alcanzan. Si existe `assets/transitions.json`,
  `off` lista las que el usuario apagó en la pestaña "Transiciones" del panel:
  no las uses (solo si te pide una con su nombre en el chat). Sonido sugerido: `whip`/`wipe` →
  `whoosh-short` o `whoosh`; `glitch` → `glitch-*`; `lightleak` →
  `sparkle` o `whoosh-cinematic`; `flash`/`zoom` → `impact-bass-*` si
  remata una frase fuerte; `shake` → `impact-bass-*`; `zoomblur` →
  `whoosh`; `spin`/`filmburn` → `whoosh-cinematic`; `iris` → `pop` o
  `click-soft`; `blinds` → `whoosh-short`. **Con pantalla dividida no hay transiciones:** la división entra y
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

## Pipeline de clon

Pipeline aparte, al lado del de edición: crea un video de un **personaje
hablando** (Kie genera los clips, Cartesia le pone la voz) y después lo
entrega al pipeline de edición como si el usuario lo hubiera subido. **No
edita nada**: subtítulos, motion graphics, música y marca se hacen en edición.
No toca `projects/` (salvo al crear el proyecto en el paso 5), `clips/`,
`src/edit/` ni `assets/brand/`. En el panel son las pestañas **Clon**
(`/clon`, `/clon/<id>`) y **Personajes** (`/personajes`). Es la única
excepción a "Todo local": la foto del personaje va a Kie y el audio del clon a
Cartesia, y nada más (nunca videos de `projects/` ni `clips/`).

**Personajes** (`assets/personajes/<slug>/`): `personaje.json` (nombre,
descripción = cómo es y cómo habla, encuadre = frase de cámara que se repite
en todos los bloques para que no salte, `vozId` de Cartesia, `acento` —
rioplatense, cordobés, norteño, cuyano, uruguayo, chileno, mexicano,
colombiano, neutro, España u `otro` con `acentoOtro` libre— y
`restricciones`: lo que el video NO tiene que traer, tildable: música,
efectos de sonido, subtítulos, textos/carteles, motion graphics, cortes,
cambiar la postura de la foto (`postura`: el cuerpo queda como en la foto,
solo se mueven cara y manos), otras personas; sin el campo = todas) y
`energia` (`tranquilo | natural | entusiasta | energico`; sin el campo =
entusiasta) y `registro` (`profesional | cercano | informal`; sin el campo =
cercano: natural pero sin jerga como "posta", "loco" o "re"; solo informal la
permite). El registro lo usa solo la IA al escribir el guion. + `foto.<ext>`. Encuadre, descripción, acento, energía y
restricciones van en el pedido de cada clip (`promptBloque`). La energía se
usa en dos lugares: es la emoción con la que Cartesia lee el guion (la
voz final) y va en el pedido de cada clip a Kie para que la cara acompañe
(con el cuerpo sereno, sin gestos exagerados). El acento, la energía y el registro también le dicen a la IA cómo escribir
el guion (voseo o tuteo, exclamaciones, qué tan formal).
Se crean, editan y eliminan (Papelera) desde la pestaña Personajes.
**Claves:** las de Kie y Cartesia se cargan en esa pestaña ("Probar conexión"
la prueba y, si funciona, la guarda) en `assets/personajes/claves.json`
(fuera de git, permisos 600). `KIE_API_KEY` / `CARTESIA_API_KEY` del entorno
tienen prioridad. Nunca leas, muestres ni copies las claves: ni al chat, ni al
job, ni al navegador.

1. **Setear personaje** — se elige un personaje (con foto y voz), el
   **modelo de video** de Kie, formato (`vertical` 9:16 | `horizontal` 16:9),
   resolución y duración objetivo (solo se pide si el guion lo escribe la IA;
   con un guion pegado la duración sale del texto). Modelos (`MODELOS` en
   `app/lib/clon/types.ts`, verificados en docs.kie.ai/market; todos usan
   `POST /api/v1/jobs/createTask` + `GET /api/v1/jobs/recordInfo`):
   - `grok-imagine/image-to-video` (**por defecto**): `duration` en texto de
     "6" a "30" (el guion se parte en clips de 6 a 15 s, que mantienen mejor
     el labial), `resolution` 480p/720p/1080p, `mode: "normal"` (el "spicy" no
     anda con fotos propias). Con una sola foto el formato del video sale de la
     foto: por eso el worker la recorta a 9:16 o 16:9 (`foto-9x16.jpg`) antes
     de subirla. Prompt en inglés (la frase que dice, en español).
   - `grok-imagine-video-1-5-preview`: `duration` como **número** de 1 a 15,
     480p/720p/1080p, `aspect_ratio` sí cuenta, una sola foto,
     `enable_audio: true`. Prompt en inglés.
   - `gemini-omni-video`: `duration` "4", "6", "8" o "10" (el guion usa 8 o
     10), 720p/1080p/4k, prompt en español.
   El modelo queda fijo en el clon; para cambiarlo, crear otro. El personaje se **congela** en `clones/<id>/personaje/`
   (datos + foto): editarlo después no cambia los clones ya creados.

2. **Guion** — el usuario lo pega, o escribe un brief y lo redacta Claude
   (`worker.ts <id> guion`); con IA se elige quién lo escribe:
   `settings.aiProvider` `anthropic` (Claude, por defecto) u `openai` (Codex,
   igual que en Clips). Con IA puede sumar un **gancho** y un **CTA**
   opcionales (`guion.hook`, `guion.cta`, hasta 300 caracteres): van palabra
   por palabra al principio y al final y la IA escribe el medio (con alguno de
   los dos, el brief puede quedar vacío). `faltanGanchoOCta` lo verifica; si la
   IA los cambió, se le pide una vez más y si sigue mal el mensaje lo avisa. En los dos casos queda partido en **bloques que
   el modelo acepta** (uno por clip): Gemini 8 o 10 s (hasta 25 palabras);
   Grok de 6 a 15 s con 1 s de aire (hasta 35 palabras). Ritmo de 2.5
   palabras/s, cortando en oraciones y repartiendo parejo
   (`app/lib/clon/guion.ts`). Nunca pidas duraciones fuera de las del modelo:
   `crearTarea` las rechaza. Se edita en el panel hasta aprobarlo; un
   bloque que queda largo se parte solo. **Aprobar es el único gate antes de
   gastar plata**: nunca generes clips sin `guion.aprobadoAt`.

3. **Crear el video** — `worker.ts <id> generar`: sube la foto a Kie
   (`https://kieai.redpandaai.co/api/file-stream-upload`: la subida NO está en
   api.kie.ai; la URL vive 24 h, se sube en cada corrida), pide un clip por bloque (con el
   modelo del clon, de a 3 en paralelo; el prompt lleva el encuadre, la
   descripción, el acento, el texto exacto entre comillas y las restricciones), guarda `job.json` después de cada bloque, baja
   cada clip a `clips/cN.mp4` (los de Kie viven 14 días), lo verifica con
   ffprobe (imagen, sonido y duración) y los pega con el demuxer `concat`
   (`-c copy`; si sale mal, re-encodea) → `pegado.mp4`.
   **Si un bloque falla**, el job queda en `error` con el bloque señalado y
   "Reintentar" pide **solo ese**: los listos no se tocan, un `taskId` pagado
   se vuelve a consultar y una bajada fallida se vuelve a bajar de la URL.
   Solo el bloque que falló se puede corregir antes de reintentar.

4. **Voz** — sigue sola después del paso 3 (o `worker.ts <id> voz` para
   reintentar solo esto, sin volver a pagar los clips). Ya NO se usa el cambio
   de voz de Cartesia (copiaba la entonación floja de Kie):
   1. **Cartesia lee el guion** entero con la voz del personaje
      (`leerTexto` en `app/lib/clon/cartesia.ts`: `POST /tts/bytes`,
      `Cartesia-Version: 2026-08-14`, `model_id: "sonic-3.6"`, `voice: <id>`,
      `locale: "es"`, `generation_config` speed 1, volume 1 y `emotion` según
      la energía del personaje: tranquilo→calm, natural→content,
      entusiasta→enthusiastic, energico→excited; Cartesia acepta cualquier
      nombre sin dar error) → `voz-cartesia.wav`. Si el texto, la voz y la
      emoción no cambiaron, se reusa (`sincro/lectura.json`).
   2. **Whisper** marca cada palabra en la voz de Kie (`pegado.mp4`, la que
      mueve los labios) y en la de Cartesia (`sincro/kie.json`,
      `sincro/cartesia.json`).
   3. **Se ajusta el video a la voz** (`scripts/clon/sincro.ts`, sin otra IA):
      se emparejan las palabras (subsecuencia común, tolera alguna cambiada),
      las pausas de Kie que sobran (sobre todo en las uniones entre clips) se
      cortan y cada tramo con voz se acelera o frena entre 0,6x y 1,6x para que
      cada palabra caiga donde suena en Cartesia.
   4. Volumen: Cartesia devuelve la voz baja (unos -22 LUFS) y se lleva a
      **-16 LUFS** (voz en redes), NO al volumen del audio de Kie (viene muy
      fuerte, ~-10 LUFS): subirla tanto obligaba al limitador a aplastar los
      picos y se oían bajones de calidad. La subida se limita para que el
      limitador (-1 dB) nunca baje un pico más de 3 dB. Después se arma
      `final.mp4`. `job.voz` guarda `metodo: "lectura"`, la emoción, cuántas
      palabras se emparejaron y la sincronización (desfase mediano, del 90 %
      y cuántas palabras pasan de 150 ms).
   Los clones viejos (sin `metodo`) se hicieron con el cambio de voz.
   **"Mejorar la sincronización"** (clon listo, método lectura): rehace solo
   el ajuste con otro nivel (`job.nivelSincro`, `NIVELES` en sincro.ts):
   1 Suave (tramos de 0,6 s, 0,6x-1,6x; es el de cada clon nuevo), 2 Precisa
   (0,35 s, 0,5x-2x) y 3 Máxima (0,25 s, 0,5x-2x); 2 y 3 además corrigen los
   bordes de palabra con el silencio real del audio (`detectSilences`). Es
   gratis: reusa la lectura de Cartesia y las palabras de Whisper (`sincro/`).
   Se puede volver al nivel anterior. Lo que queda corrido en Máxima son
   vocales que Cartesia estira donde la boca de Kie ya cerró. Si el clon ya
   pasó a edición, ese proyecto no cambia: hay que crear otro.

5. **Pasar a edición** — con `paso: "listo"`, el botón del clon lleva a
   **"Nuevo video"** (`/nuevo?clon=<id>`): la misma pantalla de siempre para
   elegir marca, preset, formato, subtítulos, estilo e indicaciones, pero en
   vez de subir un archivo usa el video del clon. Propone el formato del clon
   y **`style.cut: "soft"`** (no tiene silencios ni muletillas), y no ofrece
   "Recordar estas opciones". Recién al confirmar crea un proyecto normal
   (`final.mp4` en `raw/`, snapshot de la marca, esos ajustes) y arranca el
   pipeline de edición (`startPrepare`). Se puede repetir para probar otra
   marca o estilo: cada vez es un proyecto nuevo y `proyectoId` guarda el
   último. Desde ahí todo sigue igual que con un video subido.

### Clon + B-roll (`job.modo: "broll"`)

Modo del mismo pipeline (selector "Clon / Clon + B-roll" en la pestaña Clon):
el usuario sube un B-roll y cuenta de qué trata; sale un video vertical
**partido 50/50: B-roll arriba (sin su audio) y el personaje abajo**, que pasa
a edición **solo para los subtítulos**. Reusa todo lo anterior; cambia:
- **Entrada:** `POST /api/clon/broll` (cuerpo = el video, `x-datos` = los
  datos del clon). Se guarda en `broll/original.<ext>`, se mide y debe durar
  **de 8 s a 3 min** (`BROLL_MIN_S`/`BROLL_MAX_S`). `job.broll` = archivo,
  duración, ancho y alto. El formato queda vertical y **la duración la pone el
  B-roll** (`duracionObjetivoS`). **El guion lo escribe siempre la IA** (no
  hay "Lo pego yo"; `crearClon` lo rechaza): el usuario cuenta de qué trata
  el B-roll y la IA escribe para durar lo mismo (2.5 palabras/s, sin el margen
  de aire del clon normal), sabiendo que arriba se ve el B-roll. Si el guion
  queda muy largo o corto, el mensaje lo avisa (`avisoDuracion`); se puede
  corregir antes de aprobar.
- **Personaje en media pantalla:** los bloques usan `ENCUADRE_MEDIA_PANTALLA`
  (pecho para arriba, la cara bien visible; `encuadreDe(job)`), la foto se
  recorta **cuadrada** dejando la cara (`foto-1x1.jpg`) y se pide `1:1`
  (Gemini no tiene cuadrado: `16:9`).
- **Voz:** igual (Cartesia lee, Whisper, ajuste, niveles de sincronización).
  Al final, en vez de mux simple, `armarPartido` (`scripts/clon/partido.ts`):
  B-roll a 1080×960 (recorte que llena, sin deformar) arriba, el personaje
  ajustado (`sincro/video.mp4`) a 1080×960 abajo (recorte que cuida la cara),
  la voz de Cartesia. **La voz manda el largo:** B-roll más largo → se corta;
  un poco más corto → se estira hasta 15 %; si aún falta, el último cuadro
  queda quieto.
- **Pasar a edición:** "Nuevo video" muestra solo marca y subtítulos. El
  servidor (`soloSubtitulos` en `app/lib/clon/server.ts`) apaga todo lo demás
  (sin motion graphics, zooms, transiciones, efectos ni música, sin
  indicaciones, corte suave) y pone los subtítulos **al medio**. Se transcribe
  y corta como siempre y se **renderiza directo, sin plan** (no se le pide nada
  a Claude): son los mismos scripts del pipeline de edición, sin cambios. Sin
  plan no hay palabras resaltadas.

### Archivos de `clones/<id>/`

```
job.json            estado (schema "clon-v1"): personaje congelado, settings,
                    guion.bloques {id, texto, encuadre, segundos, taskId, url,
                    file, creditos, estado}, paso (guion | esperando_aprobacion
                    | generando | voz | listo | error), mensaje, error, fallo
                    (qué acción reintentar), voz (método, emoción, sincro,
                    volumen), proyectoId
personaje/          copia de personaje.json + foto
clips/cN.mp4        un clip por bloque, en orden
lista.txt           lista para el concat de ffmpeg
pegado.mp4          clips pegados (voz original del modelo; sus labios mandan)
voz-cartesia.wav    el guion leído por Cartesia con la voz del personaje
sincro/             kie.json y cartesia.json (palabras de Whisper),
                    lectura.json (qué se le pidió a Cartesia), video.mp4
                    (video ajustado, sin audio), voz.wav (voz con volumen)
final.mp4           video ajustado + voz de Cartesia (con B-roll: partido, B-roll arriba)
broll/original.*    (modo B-roll) el video de B-roll que subió el usuario
(clones viejos: voz-original.wav, voz-nueva.mp3, voz-ajustada.wav del cambio de voz)
worker.log, .lock   salida del worker y candado por PID (no tocar)
```

El panel lanza el worker afuera de Next (`app/lib/clon/server.ts`, detached);
la lógica de Kie y Cartesia está en `app/lib/clon/kie.ts` y `cartesia.ts`
(re-exportadas en `scripts/clon/`). Si algo falla, leé `worker.log` y el
`error` del job; no borres clips ya bajados (están pagos).

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
  - `graphicsDimension` (independiente del estilo): `2d` = gráficos planos
    como hasta ahora (predeterminado y compatible con proyectos viejos);
    `2.5d` = capas CSS con perspectiva y rotaciones X/Y moderadas;
    `3d` = geometría real con Three.js, cámara y luces. La plantilla copia
    Three.js 0.181.2 local a `assets/three/` y define el contrato en `BRIEF.md`.
    En 3D usar tiempo absoluto (`hf-seek` y la timeline pausada), alfa en
    overlays y geometría liviana pertinente al contenido. Mantener el texto
    legible y respetar las zonas reservadas del layout. No reemplazar el 3D
    elegido por 2D; verificar WebGL y exportación. Cambiar esta opción invalida
    las escenas anteriores para el siguiente render.
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
npx tsx scripts/clon/worker.ts <id> guion|generar|voz   # pipeline de clon (lo lanza el panel)
npx tsx scripts/clon/prueba.ts voces|clip --voz <id>    # prueba suelta de Kie + Cartesia
node --import tsx --test scripts/clon/guion.test.ts scripts/clon/sincro.test.ts scripts/clon/partido.test.ts   # tests del clon
```
