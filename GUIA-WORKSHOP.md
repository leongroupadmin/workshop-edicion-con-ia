# Editor LG desde cero

**Workshop · Edición de video con IA**

El recorrido completo para construir, con Claude Code y una carpeta vacía, un editor que toma un video de una persona hablando a cámara y lo devuelve transcripto, cortado, con subtítulos, motion graphics y música. Cada paso trae el prompt listo para copiar y cómo saber si salió bien.

**14 pasos · 4 bloques · Mac y Windows · Todo local, sin API keys**

---

## Cómo trabajar cada paso

- **Un paso por vez.** Pegá un prompt, esperá a que termine y probá lo que hizo. Recién ahí pasás al siguiente.
- **Modo plan en los pasos grandes.** En los pasos 4, 6, 7, 9 y 10 apretá `Shift`+`Tab` hasta ver "plan mode": Claude te muestra qué va a hacer y vos aprobás.
- **Si algo falla, pegá el error.** Tal cual aparece, sin resumirlo. Claude lo lee, encuentra la causa y lo arregla.
- **Guardá cada paso.** Al final pedile "hacé un commit de este paso". Si algo se rompe después, se puede volver atrás.
- **Conversación limpia.** Entre paso y paso usá `/clear`. Lo importante queda en el CLAUDE.md, que Claude lee siempre.
- **Completá lo marcado.** Lo que está entre `[corchetes]` dentro de un prompt lo reemplazás con tus datos.

## Los cuatro bloques

Primero se arma el motor en la terminal (cada paso del pipeline es un script que se puede probar solo) y después el panel web que lo maneja con botones.

| Bloque | Pasos | Qué se arma |
|---|---|---|
| **A · Cimientos** | 0–1 | La compu lista, el proyecto creado y el CLAUDE.md que guía todo |
| **B · El motor** | 2–8 | Transcribir, cortar, montar, marca, plan, gráficos y música, todo desde la terminal |
| **C · El panel** | 9–12 | La web local para subir videos, chatear con Claude y renderizar |
| **D · Cierre** | 13 | Acceso directo en el Escritorio, prueba final y repositorio en GitHub |

---

# Bloque A · Cimientos

## Paso 0 · Preparar la compu

Instalar las herramientas y conseguir un video de prueba. Este paso no construye nada todavía: deja todo listo para que los demás no se traben.

**Instalar a mano:**

1. **Node.js** 20 o más nuevo (versión LTS, desde nodejs.org).
2. **Git**. En Windows trae Git Bash, que Claude Code necesita.
3. **FFmpeg** (con ffprobe). En Mac con Homebrew; en Windows, el build "full" de gyan.dev agregado al PATH.
4. **Claude Code** (app de escritorio o terminal) con una cuenta de Claude **Pro o Max**.
5. Una **carpeta vacía** para el proyecto y un **video de prueba**: 30 a 90 segundos, vertical, una persona hablando a cámara.

**Prompt · verificar el entorno**

```text
Vamos a construir desde cero un editor automático de videos hablados. Antes de arrancar, revisá que esta compu tenga todo lo necesario: Node.js 20 o más nuevo, npm, Git y FFmpeg con ffprobe.

Decime qué versión tiene cada uno y en qué sistema operativo estoy. Si falta algo, explicame cómo instalarlo en mi sistema, paso a paso y en simple. No instales nada sin preguntarme.
```

**Salió bien si:**
- [ ] Claude muestra la versión de Node, npm, Git y FFmpeg.
- [ ] No queda nada marcado como faltante.

> **Ojo:** si instalás algo nuevo, cerrá y volvé a abrir Claude Code para que lo encuentre.

## Paso 1 · Proyecto base y CLAUDE.md

Crear el proyecto de Remotion, las carpetas, los "formularios" que se van a pasar entre pasos y el CLAUDE.md: el documento que Claude lee siempre y que guía todo lo que viene.

Archivos: `CLAUDE.md` · `src/pipeline/types.ts` · `assets/` · `projects/` · `scripts/` · `.gitignore`

**Prompt · paso 1**

```text
Esta carpeta está vacía. Vamos a crear "Editor LG": un sistema que edita solo videos de una persona hablando a cámara. El flujo completo va a ser: transcribir → cortar silencios y muletillas → proponer un plan de edición → generar motion graphics → montar todo con subtítulos y música → renderizar versiones.

En este paso armá solo la base:
1. Un proyecto de Remotion con TypeScript en esta carpeta. Formato por defecto vertical 1080x1920, 30 fps.
2. Las carpetas: assets/brand (marca), assets/music (música, con sfx/ para efectos), projects/<id>/ (un proyecto por video, con raw/ para el original), scripts/ (cada paso del pipeline, se corren con npx tsx) y src/ (composiciones de Remotion).
3. src/pipeline/types.ts con los tipos de los JSON que se pasan entre pasos: Transcript (palabras con tiempos en ms), CutsFile (tramos que se conservan), Plan (ítems con tipo, inicio, fin, texto, layout, motivo y estado), Settings (formato, subtítulos, música) y Brand (colores, tipografías, logo).
4. Un CLAUDE.md que explique qué hace el sistema, la estructura de carpetas, el pipeline paso a paso y estas reglas: respondé siempre en español, corto y claro, porque no soy programador; nunca toques raw/ ni borres versiones; todo corre local, no se suben videos ni audios a ningún servicio.
5. git init, con un .gitignore que deje afuera node_modules, projects/* (menos un .gitkeep) y los renders.

Tiene que funcionar en Mac y en Windows. Cuando termines, abrí Remotion Studio para que vea que anda y hacé el primer commit.
```

**Salió bien si:**
- [ ] Remotion Studio abre en el navegador (`npm run dev`).
- [ ] Existe el CLAUDE.md y lo entendés al leerlo.
- [ ] Hay un primer commit.

> **Para explicar en clase:** el CLAUDE.md es la memoria del proyecto. Cada regla nueva que descubramos se agrega ahí, y Claude la respeta en todas las conversaciones.

---

# Bloque B · El motor

Cada paso es un script que deja su resultado en la carpeta del proyecto. Así se puede probar por separado y retomar donde quedó.

## Paso 2 · Transcribir

Instalar whisper.cpp dentro del proyecto y pasar el audio del video a texto, con el momento exacto de cada palabra.

Archivos: `scripts/setup-whisper.ts` · `scripts/transcribe.ts` · `transcript.json` · `status.json`

**Prompt · paso 2**

```text
Paso 1 del pipeline: transcribir.

- scripts/setup-whisper.ts: instala whisper.cpp dentro del proyecto (carpeta whisper.cpp/, fuera de git) con @remotion/install-whisper-cpp y baja el modelo "medium". Dejá una marca cuando el modelo terminó de bajar, para nunca usar un archivo a medio descargar.
- scripts/transcribe.ts <id>: busca el video en projects/<id>/raw/, extrae el audio a WAV 16 kHz mono con FFmpeg, lo transcribe en español con tiempos por palabra y guarda projects/<id>/transcript.json con el tipo Transcript.
- Cada proyecto tiene un status.json (paso, mensaje, progreso) y logs/pipeline.log. Los vamos a usar después en el panel.

Tené en cuenta Windows: ahí whisper.cpp viene precompilado, el ejecutable se llama whisper-cli.exe y el zip lo deja en Release/, pero Remotion lo busca en build/bin/. Que funcione en los dos sistemas.

Para probar: creá projects/prueba/raw/. Yo pongo ahí mi video y vos lo transcribís. Mostrame las primeras 3 frases con sus tiempos.
```

**Salió bien si:**
- [ ] transcript.json tiene el texto y cada palabra con sus tiempos.
- [ ] El texto coincide con lo que se dice en el video.

> **Ojo:** el modelo pesa cerca de 1,5 GB: la primera instalación tarda. Conviene correrla antes de la clase.

## Paso 3 · Cortar silencios, muletillas y tomas repetidas

Decidir qué partes del video quedan, generar el video cortado y volver a sincronizar la transcripción con él.

Archivos: `scripts/cut.ts` · `scripts/pipeline.ts` · `cuts.json` · `cut.mp4` · `cut.transcript.json`

**Prompt · paso 3**

```text
Paso 2 del pipeline: cortar. Creá scripts/cut.ts <id>, que lee transcript.json y decide qué tramos del video se conservan:
- quita los silencios de más de 0.5 s, dejando 0.15 s de aire a cada lado;
- quita las muletillas sueltas ("eh", "em", "este", "o sea");
- si la persona repite una frase (toma repetida), queda la ÚLTIMA.

Guardá la decisión en cuts.json (tramos "keep" en ms del video ORIGINAL, fácil de editar a mano), generá cut.mp4 con FFmpeg y cut.transcript.json con los tiempos re-sincronizados al video cortado.
Opciones: --min-silence, --keep-gap, --no-fillers, --no-retakes, y --from-cuts para volver a cortar desde un cuts.json que edité.

Después creá scripts/pipeline.ts prepare <id>, que corre transcribir + cortar seguidos.
Probalo con mi video y decime cuánto duraba antes y después y qué cortó.
```

**Salió bien si:**
- [ ] cut.mp4 se ve sin saltos raros y con el audio sincronizado.
- [ ] Claude te explica qué cortó y por qué.

> **Probá también:** pedile "devolvé el tramo que cortaste en el segundo X" y mirá cómo edita cuts.json y re-corta con --from-cuts.

## Paso 4 · Montaje con subtítulos y versiones

La composición de Remotion que monta el video final, con subtítulos tipo karaoke, y el script que renderiza cada versión sin pisar las anteriores.

Archivos: `src/edit/Edit.tsx` · `src/edit/Captions.tsx` · `src/edit/layout.ts` · `scripts/render.ts` · `versions/v1.mp4`

**Prompt · paso 4 · usar modo plan**

```text
Ahora el montaje con Remotion.

- src/edit/Edit.tsx: composición que recibe el proyecto por props y muestra cut.mp4 con subtítulos estilo karaoke: palabra por palabra, máximo 3-4 palabras en pantalla, la palabra que se está diciendo resaltada.
- Los subtítulos van en src/edit/Captions.tsx. Las zonas seguras de Instagram y TikTok van en src/edit/layout.ts: los subtítulos nunca quedan debajo de la interfaz de la app.
- scripts/render.ts <id> --note "qué cambió": arma las props, sirve los archivos del proyecto con un servidor local y renderiza projects/<id>/versions/vN.mp4 con el siguiente N libre, más un vN.json con la nota. Nunca sobreescribe ni borra versiones. Con --draft hace una prueba rápida.

Agregá al CLAUDE.md cómo se renderiza y la regla de las versiones.
Renderizá la v1 de mi video y mostrame un cuadro con los subtítulos.
```

**Salió bien si:**
- [ ] Existe versions/v1.mp4 y se reproduce.
- [ ] Los subtítulos van al ritmo de la voz y no tapan la zona de la interfaz.

> **Para explicar en clase:** Remotion arma el video con código React: cada cuadro es una "foto" de la composición en ese instante.

## Paso 5 · Marca y ajustes del video

Los colores, tipografías y logo que usa todo el sistema, y un archivo de ajustes por video para el formato, los subtítulos y la música.

Archivos: `assets/brand/brand.json` · `assets/brand/fonts/` · `settings.json`

**Prompt · paso 5**

```text
Sumemos la marca y los ajustes.

- assets/brand/brand.json con colores (primary, secondary, background, text, highlight), tipografías (títulos y texto, con sus archivos en assets/brand/fonts/) y logo. Mi marca es [nombre], mis colores son [colores, o "sacalos del logo que te adjunto"] y mi logo está en [ruta del logo]. Si no tengo tipografías, elegí dos de Google Fonts con licencia libre que vayan con la marca y guardá su licencia.
- projects/<id>/settings.json con: formato (vertical, horizontal o cuadrado); subtítulos (estilo karaoke, simple, pop, minimal o ninguno; tamaño; posición arriba, medio o abajo; máximo de palabras; mayúsculas) y música (activada, volumen). Con valores por defecto.
- Edit.tsx y los subtítulos usan la marca (fuente y color de resaltado) y respetan settings.json.

Agregá al CLAUDE.md: usar siempre la marca de assets/brand, no inventar colores ni tipografías. Renderizá una v2 con la marca.
```

**Salió bien si:**
- [ ] La v2 usa tus tipografías y tu color en los subtítulos.
- [ ] Si cambiás algo en settings.json y renderizás, el video cambia.

> **Probá también:** "Pasá los subtítulos arriba y en mayúsculas" y renderizá: Claude tiene que tocar solo settings.json.

## Paso 6 · Plan de edición: zooms, transiciones y sonidos

Claude lee la transcripción y propone qué va en cada momento y por qué. Lo que no necesita diseño (zooms, transiciones, efectos de sonido, palabras clave) lo resuelve Remotion.

Archivos: `plan.json` · `src/edit/transitions.tsx` · `assets/music/sfx/manifest.json`

**Prompt · paso 6 · usar modo plan**

```text
Paso 3 del pipeline: el plan de edición. No es un script: lo escribís vos leyendo cut.transcript.json.

Documentá en el CLAUDE.md el formato de plan.json: status (draft o approved), summary, keywords (palabras a resaltar en los subtítulos) e items con id, type (title, motion_graphic, overlay, lower_third, broll, transition, sfx, zoom), startMs y endMs sobre cut.mp4, layout, text, description, reason (por qué va ahí) y status.
Reglas del plan: menos es más (un elemento visual cada 4 a 8 s); el primero en los primeros 2 s, como gancho; cada gráfico con al menos 2 s de lectura con todo visible; y SIEMPRE esperar mi aprobación antes de generar nada.

En Remotion implementá lo que no necesita diseño:
- zoom "in" (acerca y vuelve) y "out" (arranca cerca y se aleja), con escala entre 1.1 y 1.3;
- transiciones centradas en los cortes, en src/edit/transitions.tsx: flash, fade, wipe con el color de la marca, whip, zoom y glitch;
- efectos de sonido y las keywords resaltadas en los subtítulos.

Para los efectos: armá assets/music/sfx/ con un manifest.json que diga cuánto dura cada uno y para qué sirve. Si no podés bajarlos vos, decime de dónde bajo efectos libres para uso comercial y cuáles.

Después proponé un plan para mi video, resumilo en 5 líneas y esperá mi OK.
```

**Prompt · aprobar (cuando el plan te convence)**

```text
Aprobado. Renderizá la v3 con los zooms, las transiciones, los sonidos y las keywords del plan. Los gráficos todavía no.
```

**Salió bien si:**
- [ ] Cada ítem del plan tiene un motivo que tiene sentido.
- [ ] La v3 tiene zooms y transiciones en los cortes, con su sonido.

> **Para explicar en clase:** el plan se aprueba antes de generar: es mucho más barato corregir un JSON que volver a renderizar.

## Paso 7 · Motion graphics con HyperFrames

Cada título o gráfico del plan es una escena en HTML con animaciones, que HyperFrames convierte en video. Remotion la pone encima, en pantalla completa o en pantalla dividida.

Archivos: `scripts/scene.ts` · `scenes-src/<item>/index.html` · `BRIEF.md` · `scenes/`

**Prompt · paso 7 · usar modo plan**

```text
Sumemos motion graphics con HyperFrames (HTML + GSAP renderizado a video). Primero instalá sus skills en este proyecto con:
npx skills add heygen-com/hyperframes

Después creá scripts/scene.ts con estos comandos:
- init <id> <itemId>: crea projects/<id>/scenes-src/<itemId>/ con "npx hyperframes init", le aplica la marca (variables CSS --brand-*, fuentes y logo copiados a assets/) y escribe un BRIEF.md con lo que tiene que mostrar según el plan, la duración exacta y el tamaño.
- render <id> <itemId>: renderiza con "npx hyperframes render": scenes/<itemId>.mp4 si tapa la pantalla, o .webm con transparencia si va encima del video. Marca el ítem como rendered en plan.json.
- list <id> y all <id>.

En Windows npx es un archivo .cmd que Node no puede lanzar directo: resolvelo, por ejemplo corriendo npx-cli.js con el mismo Node.

En Edit.tsx, según el layout del ítem: overlay va encima del video, fullscreen lo tapa (la voz sigue sonando) y split divide la pantalla (escena arriba, cara abajo).

Agregá al CLAUDE.md cómo diseñar cada escena con las skills de HyperFrames y este control de calidad: nada de movimiento lineal; los cambios importantes con posición o escala, no solo con opacidad; tres capas (principal, secundaria y ambiente); y la escena nunca corta en pleno movimiento.

Generá las escenas del plan aprobado de mi video, diseñalas una por una y renderizá la v4.
```

**Salió bien si:**
- [ ] Cada escena usa los colores, fuentes y logo de tu marca.
- [ ] La v4 tiene los gráficos en el momento justo y se pueden leer.

> **Ojo:** es el paso que más uso consume de tu plan de Claude. Con 2 o 3 gráficos alcanza para aprender.

## Paso 8 · Música de fondo

Una pista que baja sola cuando la persona habla y sube en las pausas, con su fundido al final.

Archivos: `assets/music/` · `settings.json → music` · `versions/vN.json`

**Prompt · paso 8**

```text
Música de fondo. En Edit.tsx sumá la música de assets/music/: la que diga settings.music.track o, si está vacío, la primera pista que haya. Que tenga ducking (baja sola cuando hay voz y sube en las pausas) y un fundido al final. El volumen y cuánto baja van en settings.json.

En vN.json anotá qué pista se usó, o null si salió sin música. Después de cada render revisalo y avisame si el video salió sin música; nunca digas que tiene música sin verificarlo.

Yo pongo un tema libre de derechos en assets/music/. Renderizá la v5.
```

**Salió bien si:**
- [ ] La música se escucha, pero la voz siempre se entiende.
- [ ] v5.json dice qué pista se usó.

> **Cierre del bloque:** con esto el motor está completo: de video crudo a video editado, todo desde la terminal.

---

# Bloque C · El panel

El panel no reemplaza al motor: lo maneja con botones. Corre los mismos scripts y le habla a Claude con el mismo CLAUDE.md.

## Paso 9 · Panel web: subir y procesar

Una web en tu compu para subir videos, ver cómo avanza cada paso y mirar o bajar las versiones.

Archivos: `app/` · `app/lib/server/jobs.ts` · `http://localhost:3000`

**Prompt · paso 9 · usar modo plan**

```text
Ahora quiero usar todo esto sin terminal. Creá un panel web con Next.js en la carpeta app/, que corra en http://localhost:3000, todo local, y se llame Editor LG:

- Inicio: la lista de proyectos con miniatura y estado, y un botón "+ Nuevo video" para subir un video (se guarda en projects/<id>/raw/).
- Al subir, el panel corre solo transcribir + cortar (los mismos scripts del pipeline) y muestra el progreso en vivo leyendo status.json.
- Los scripts se lanzan con el mismo Node del panel. En Windows node_modules/.bin/tsx no se puede lanzar directo: usá tsx/dist/cli.mjs.
- La página de cada proyecto: el video cortado, el estado, el log si algo falla y la lista de versiones para ver y descargar.
- Eliminar un proyecto o una versión los manda a la Papelera del sistema (en Mac y en Windows); nunca borra definitivo.

Diseño limpio y claro para alguien que no es técnico, con los colores de mi marca. Agregá el script "panel" al package.json de la raíz.
Probalo subiendo mi video desde el navegador.
```

**Salió bien si:**
- [ ] Subís un video desde el navegador y ves avanzar "Transcribiendo… Cortando…".
- [ ] Al terminar, aparece el video cortado.

> **Para explicar en clase:** el panel no duplica lógica: corre los scripts del bloque B. Si algo anda en la terminal, anda en el panel.

## Paso 10 · Claude dentro del panel

El plan como línea de tiempo, un chat para pedir cambios y un botón Renderizar que aprueba y genera todo. Usa tu suscripción de Claude, sin claves de API.

Archivos: `app/lib/server/agent.ts` · `app/lib/server/cuenta.ts` · pestaña IA

**Prompt · paso 10 · usar modo plan**

```text
Sumá Claude al panel con el Claude Agent SDK, corriendo con esta carpeta como directorio de trabajo, para que lea el mismo CLAUDE.md que usás vos. Que use mi suscripción de Claude (Pro o Max), sin API key.

- Cuando termina el corte, el panel le pide el plan de edición a Claude automáticamente.
- En la página del proyecto: el plan como línea de tiempo visual sincronizada con el video (cada ítem con su tipo, texto y motivo) y un chat para pedir cambios, por ejemplo "sacá el zoom del segundo 12" o "acortá el título".
- Un botón "Renderizar" que funciona como aprobación: marca el plan como aprobado, le pide a Claude SOLO las escenas que faltan o cambiaron y después arma la versión nueva.
- Una pestaña "IA" que muestra con qué cuenta de Claude está conectado y un botón para cambiarla. Ese botón abre el login en una consola: Terminal en Mac, cmd en Windows. Ojo: en Windows el ejecutable del SDK se llama claude.exe.

Probalo de punta a punta con mi video: subir → plan → un cambio por chat → Renderizar.
```

**Salió bien si:**
- [ ] El plan aparece solo después del corte.
- [ ] Un pedido por chat cambia el plan.
- [ ] Renderizar genera las escenas y una versión nueva.

> **Para explicar en clase:** es el mismo Claude Code, pero manejado desde una web: lee el CLAUDE.md y usa las mismas skills.

## Paso 11 · Pestañas Marca y Música

Editar la marca con vista previa, guardar varias marcas y cambiar entre ellas, y administrar la música y los efectos.

Archivos: `app/app/marca/` · `app/app/musica/` · `assets/brands/<slug>/`

**Prompt · paso 11**

```text
Agregá dos pestañas al panel.

Marca:
- Editar nombre, logo, colores y tipografías de assets/brand, con una vista previa de cómo se ven los subtítulos.
- "Sacar los colores de una imagen": subo el logo o una captura y propone la paleta.
- Una biblioteca de tipografías libres para elegir.
- Marcas guardadas en assets/brands/<slug>/: guardar la marca actual, cambiar a otra con "Usar" y eliminar.

Música:
- Subir pistas propias, escucharlas, elegir cuál usan los videos nuevos y eliminarlas (a la Papelera).
- Ver los efectos de sonido disponibles.

Actualizá el CLAUDE.md con esto. Probalo guardando dos marcas y cambiando entre ellas.
```

**Salió bien si:**
- [ ] Cambiás de marca con un clic y la vista previa cambia.
- [ ] Un video nuevo sale con la marca elegida.

> **Probá también:** cargá la marca de un alumno a partir de su logo: es el momento en que cada uno ve su propia marca en el sistema.

## Paso 12 · Estilos de edición

Antes de subir un video, elegir cómo se edita: ritmo, cantidad y estilo de gráficos, cómo se combinan con la cara, nivel de corte e indicaciones libres para Claude.

Archivos: `app/app/nuevo/` · `settings.json → style` · `images/`

**Prompt · paso 12**

```text
Antes de subir un video quiero elegir cómo se edita. Hacé una pantalla "Nuevo video" con:
- la marca a usar;
- estilos predefinidos, por ejemplo "Monólogo" (sin gráficos, solo zooms, transiciones y sonidos), "Dinámico" y "Corporativo";
- ritmo (tranquilo, normal o dinámico), cantidad de gráficos (un número o automático) y estilo de los gráficos (minimal, bold o corporativo);
- cómo se ven los gráficos: encima del video, pantalla completa, pantalla dividida, el video chiquito en un recuadro, el video enmarcado, automático, o combinado (rotando en ese orden);
- nivel de corte (suave, normal o agresivo) y zoom automático en los cortes;
- un cuadro "Indicaciones para Claude" con texto libre;
- imágenes propias para usar en los gráficos, cada una con una descripción.

Todo se guarda en el settings.json del proyecto, con la opción de recordarlo para los próximos videos. Claude lo respeta al armar el plan y en el BRIEF.md de cada escena. Documentá cada opción en el CLAUDE.md.
```

**Salió bien si:**
- [ ] Con "Monólogo" el plan no trae gráficos.
- [ ] Con "Combinado" los gráficos rotan de layout.
- [ ] Las indicaciones libres se notan en el plan.

> **Para explicar en clase:** las opciones del panel son reglas en el CLAUDE.md: Claude las lee del settings.json y las aplica.

---

# Bloque D · Cierre

## Paso 13 · Acceso directo, prueba final y GitHub

Abrir el editor con doble clic, revisar que funcione igual en Mac y en Windows, y guardar todo en un repositorio.

Archivos: `scripts/abrir-panel.*` · `scripts/icono/` · `README.md`

**Prompt · paso 13**

```text
Últimos detalles:

1. Un acceso directo en el Escritorio, con ícono propio, que abra el panel con doble clic. Si el panel ya está prendido, abre el navegador. Si no, la primera vez instala las dependencias, lo arranca y abre el navegador cuando está listo. En Mac, un .command (y si se puede, una app con ícono). En Windows, un script .ps1 y un acceso directo .lnk con ícono .ico.
2. Revisá todo el proyecto buscando cosas que solo funcionen en Mac o solo en Windows (rutas, nombres de ejecutables con .exe o .cmd, comandos del sistema) y arreglalas.
3. Hacé una prueba completa con un video nuevo, de punta a punta, desde el panel.
4. Actualizá el README con cómo instalarlo y usarlo. Creá un repositorio privado en GitHub y subí todo, sin videos, sin música con licencia y sin el modelo de whisper.
```

**Salió bien si:**
- [ ] Doble clic en el Escritorio y el panel se abre.
- [ ] La prueba completa termina con una versión nueva.
- [ ] El repositorio está en GitHub sin archivos pesados.

> **Ojo:** para subir a GitHub, el inicio de sesión lo hacés vos en la ventana que abre Git. Claude no escribe contraseñas.

---

# Prompts de rescate

Para cuando algo no sale, en cualquier paso.

**Algo falló**

```text
Esto falló: [pegá el error tal cual]
Leé logs/pipeline.log del proyecto, encontrá la causa, arreglala y reintentá. Después explicame en 3 líneas qué pasaba.
```

**Entender lo que se hizo**

```text
Explicame qué hiciste en este paso en 5 líneas, sin código, como si se lo contaras a alguien que no programa. ¿Qué archivo hace qué?
```

**Funciona en tu compu, ¿y en la otra?**

```text
Revisá lo que hicimos en este paso y decime si hay algo que funcione solo en Mac o solo en Windows (rutas, nombres de programas, comandos del sistema). Si hay, arreglalo para que ande en los dos.
```

**Volver atrás**

```text
Lo último que hicimos rompió algo. Mostrame los últimos commits y volvé el proyecto al último que funcionaba, sin borrar nada de projects/.
```

---

Material del workshop de León Group · Editor LG. Uso educativo.
