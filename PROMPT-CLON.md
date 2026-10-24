Construí el pipeline de CLON en este repo (Clipo). Leé CLAUDE.md antes de
empezar y seguí sus reglas y su estilo. Todo en español. El usuario no es
programador: no le muestres código, contale qué hiciste en lenguaje simple.

# Qué es

Un pipeline nuevo, al lado del de edición, que crea un video de un personaje
hablando y después lo entrega al pipeline de edición que YA existe. No edita
nada ni duplica nada de la edición. La marca NO se elige acá: se elige en el
pipeline de edición. Datos en `clones/<id>/`. No toques `projects/`, `clips/`,
`src/edit/` ni `assets/brand/`.

Los 5 pasos, en orden:

1. **Setear personaje** — se elige un personaje guardado, el formato
   (vertical/horizontal), la resolución y la duración objetivo.
2. **Guion** — el usuario lo pega, o escribe un brief y lo redacta la IA. En
   los dos casos queda partido en bloques de 8 o 10 segundos (uno por clip).
   El usuario lo aprueba: ese es el único gate antes de gastar plata.
3. **Crear el video** — un pedido a Kie por bloque (texto del bloque + foto del
   personaje). Se bajan los clips y se pegan en orden.
4. **Cambiar la voz** — el audio del video pegado pasa por Cartesia (voice
   changer) con la voz del personaje y se vuelve a pegar al video.
5. **Pasar a edición** — un botón crea un proyecto normal con ese video en
   `raw/` y arranca el pipeline de edición de siempre.

# Pestañas nuevas en el panel

Agregalas a `LINKS` en `app/components/Nav.tsx`.

**`/personajes`** — biblioteca de personajes + las claves de API.
- Cada personaje: nombre, foto (subida desde el panel), descripción, encuadre
  (frase que se repite en todos los bloques para que la cámara no salte) y voz
  de Cartesia. Guardado en `assets/personajes/<slug>/` con `foto.<ext>` +
  `personaje.json`. Crear, editar, eliminar (con `moveToTrash`, nunca `rm`).
- Las claves de **Kie** y **Cartesia** se cargan ACÁ, en dos campos tipo
  password con un botón "Probar conexión" que dice si cada clave funciona
  (Kie: cualquier GET autenticado; Cartesia: `GET /voices/`). Se guardan en
  `assets/personajes/claves.json` (agregalo a `.gitignore`, permisos 600) y
  nunca se devuelven al navegador: la API solo contesta si cada una está
  cargada o no. Si existe `KIE_API_KEY` / `CARTESIA_API_KEY` en el entorno,
  tienen prioridad.
- La voz del personaje se elige de una lista que trae `GET /voices/` de
  Cartesia (mostrar primero las de español). Si no hay clave de Cartesia,
  el campo explica que falta cargarla.

**`/clon`** — lista de clones + "Nuevo clon", y `/clon/[id]` para el
seguimiento. Un solo botón que avanza (como el "Renderizar" del proyecto): no
sumes botones de más. En `/clon/[id]` se ve el guion en bloques (editable
hasta aprobar), el progreso clip por clip, el video final con reproductor y el
botón "Pasar a edición".

# Datos

`clones/<id>/job.json` con `schema: "clon-v1"`:
id, createdAt, titulo, personaje (slug + copia de sus datos y la foto
congeladas en `clones/<id>/personaje/`), settings (formato, resolución,
duracionObjetivoS, modelo), guion: bloques `{ id, texto, encuadre, segundos,
taskId?, file?, creditos?, estado }`, paso:
`"guion" | "esperando_aprobacion" | "generando" | "voz" | "listo" | "error"`,
mensaje, error?, proyectoId? (cuando ya pasó a edición).

Copiá el patrón de `app/lib/clips/storage.ts`: `clonDir(id)` con validación del
id, `readJob`/`saveJob` con escritura atómica, y `busy`/`claim` con `.lock` por
PID. El worker corre afuera del panel: `app/lib/clon/server.ts` lo lanza
detached con `node_modules/.bin/tsx scripts/clon/worker.ts <id> <accion>`,
igual que `launch()` en `app/lib/clips/server.ts`.

# APIs (ya verificadas, no hace falta buscar nada)

**Kie — subir la foto** (hace falta porque Kie necesita URL pública):
`POST https://api.kie.ai/api/file-stream-upload`, header
`Authorization: Bearer <clave>`, multipart con `file`, `uploadPath`
(p.ej. `images/clon`) y `fileName` opcional. La URL vuelve en
`data.downloadUrl` y **el archivo se borra a las 24 h** (volver a subir en
cada corrida).

**Kie — generar el clip:** `POST https://api.kie.ai/api/v1/jobs/createTask`
con `{ model: "gemini-omni-video", input: { prompt, image_urls: [url],
duration: "8", aspect_ratio: "9:16", resolution: "1080p" } }`.
`duration` es string y solo acepta `"4"`, `"6"`, `"8"` o `"10"`.
`aspect_ratio`: `"16:9"` o `"9:16"`. `resolution`: `"720p"`, `"1080p"` o
`"4k"`. Límite: imágenes + videos×2 + character_ids ≤ 7.
El `prompt` tiene que llevar el encuadre del personaje y el texto exacto entre
comillas, para que lo diga tal cual.

**Kie — estado:** `GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=<id>`.
`data.state` es `waiting | queuing | generating | success | fail`. Con éxito,
el video está en `JSON.parse(data.resultJson).resultUrls[0]`; el costo en
`data.creditsConsumed`; si falla, `data.failMsg`. Los archivos generados viven
14 días: bajalos en el momento. **Ojo: Kie responde HTTP 200 incluso cuando
falla, hay que mirar el campo `code` (200 = ok) y `msg`.**

**Cartesia:** base `https://api.cartesia.ai`, headers `X-API-Key: <clave>` y
`Cartesia-Version: 2024-11-13`.
- Voces: `GET /voices/?limit=100`.
- Cambiar la voz: `POST /voice-changer/bytes`, multipart con `clip` (el audio),
  `voice[id]`, `output_format[container]=mp3`,
  `output_format[sample_rate]=44100`, `output_format[bit_rate]=128000`.
  Devuelve el mp3 en el cuerpo. Conserva la entonación; cuesta 15 caracteres
  por segundo de audio de entrada.
- Las docs de Cartesia están detrás de un filtro anti-bots: si algún campo no
  anda, probalo en vivo con la clave y ajustá, no busques en la web.

Ya existe `scripts/clon/prueba.ts` con las dos APIs funcionando de punta a
punta (subir foto, dos clips, pegar, cambiar voz, medir el desfase). **Usalo
como referencia y reutilizá su lógica**: sacá las partes de Kie y de Cartesia a
`scripts/clon/kie.ts` y `scripts/clon/cartesia.ts`, y que la prueba y el worker
usen esos dos módulos.

# El worker (`scripts/clon/worker.ts`)

Acciones `generar` y `voz`. En `generar`: subir la foto, pedir todos los
bloques (de a 3 en paralelo como máximo), ir guardando `job.json` después de
cada bloque para que el panel muestre el avance, bajar cada clip a
`clones/<id>/clips/cN.mp4`, verificar con ffprobe que exista y dure lo
esperado, pegar con el demuxer `concat` de ffmpeg (si falla con `-c copy`,
re-encodear) y dejar `pegado.mp4`. Después `voz`: extraer el audio, pasarlo por
Cartesia, volver a pegarlo (`-map 0:v -map 1:a -c:v copy -c:a aac -shortest`) y
dejar `final.mp4`. Medí con ffprobe la duración del audio antes y después: si
la diferencia supera 0.08 s, ajustá el audio con `atempo` para que calce y
anotalo en el job (si no, el labial se desincroniza). Si un bloque falla, el
job queda en error con el bloque señalado y se puede reintentar SOLO ese bloque
sin volver a pagar los demás.

# Pasar a edición

Botón en `/clon/[id]` cuando el paso es `listo`. Crea un proyecto normal
(reusá lo que ya hace `POST /api/projects`: id, carpeta, `raw/`, snapshot de la
marca que elija ahí, settings, `startPrepare`), copiando `final.mp4` a `raw/`.
En los settings de ese proyecto poné `style.cut: "soft"`: el video del clon no
tiene silencios ni muletillas que sacar. Guardá `proyectoId` en el job y
mostrá el link. El pipeline de edición queda igual, sin cambios.

# Convenciones del repo (respetalas)

- Rutas API: `export const dynamic = "force-dynamic"` y `runtime = "nodejs"`,
  errores como `Response.json({ error }, { status })` con mensajes en español
  entendibles para alguien que no programa.
- Servir archivos solo con `fileResponse` y con lista blanca de nombres (mirá
  `app/app/api/clips/[id]/file/[name]/route.ts`): nunca servir claves ni logs.
- Subidas con `saveBody`; JSON con `readJson`/`writeJson`; borrar con
  `moveToTrash`; `ROOT` desde `@/lib/server/fsutil`.
- UI con `Button`, `Panel`, `Row`, `Seg`, `Spinner`, `ConfirmDialog` de
  `@/components/ui` y `api`/`uploadFile` de `@/lib/client`. Mismo estilo visual
  que el resto del panel.
- Tipos compartidos en `app/lib/clon/types.ts`.

# Para terminar

1. `node_modules/.bin/tsc --noEmit` y `app/node_modules/.bin/tsc --noEmit -p app`.
2. `npm --prefix app run lint`.
3. Un test de los bloques del guion (que ninguno pase de 10 s y que el texto
   entre en los segundos que dice): `node --import tsx --test`.
4. Agregá a CLAUDE.md una sección "Pipeline de clon" con los 5 pasos, los
   archivos de `clones/<id>/` y los comandos, al mismo nivel de detalle que
   la del pipeline de edición.
5. Contale al usuario, en pocas líneas: que cargue las dos claves en la
   pestaña Personajes, cree un personaje con foto y voz, y pruebe con un guion
   corto de 16 segundos (dos bloques) antes de hacer uno largo.

# Qué NO hacer

- No armar subtítulos, motion graphics ni música acá: eso es del pipeline de
  edición.
- No pedirle a Kie clips de más de 10 segundos: no existen.
- No guardar las claves en el repo, en el job ni mandarlas al navegador.
- No tocar `projects/`, `clips/`, `versions/` ni `assets/brand/`.
