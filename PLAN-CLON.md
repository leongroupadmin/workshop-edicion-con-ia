# Pipeline de clon (plan)

Pipeline nuevo, al lado del de edición. **No edita nada**: produce el video de
un personaje hablando y después ese video entra al pipeline de edición que ya
existe, como si lo hubieras subido vos. La marca NO se elige acá: se elige en
el pipeline de edición.

Datos en `clones/<id>/`. No toca `projects/`, `clips/` ni `assets/brand`.

## Pestañas nuevas en el panel

- **Personajes** — biblioteca, igual a "Marca": guardás varios y elegís uno.
  Acá también se configuran las **claves de API de Kie y de Cartesia** (una sola
  vez, quedan guardadas en tu compu). Con la de Cartesia cargada, la pestaña
  trae la lista de voces disponibles para elegir la de cada personaje.
- **Clon** — crear un video nuevo (y la pantalla de seguimiento de cada uno).

Cada personaje guardado (`assets/personajes/<slug>/`):

| Qué | Para qué |
|---|---|
| `foto.jpg` (una o varias) | la cara del personaje; es la imagen que recibe el modelo |
| nombre y descripción | cómo es y cómo habla (se le pasa al modelo en cada bloque) |
| encuadre | "plano medio, cámara quieta, misma luz": lo que mantiene los clips parecidos |
| voz de Cartesia | id de la voz con la que va a hablar |
| id de personaje (Gemini Omni) | opcional; es lo que mantiene la misma cara entre clips |

## Los 5 pasos

### 1. Setear
Elegís el personaje de la biblioteca, el formato (vertical/horizontal), la
resolución y la duración objetivo del video. Nada de marca.
→ `clones/<id>/settings.json`

### 2. Guion
Pegás el guion, o escribís un brief y lo escribe Claude. En los dos casos queda
partido en **bloques de 8 a 10 segundos**: cada bloque tiene el texto exacto que
se dice y una indicación de encuadre o acción. Lo revisás y lo aprobás.
→ `clones/<id>/guion.json`

Los bloques son obligatorios, no una elección de diseño: ningún modelo genera
más de 10-15 segundos por vez (Gemini Omni Video: 4, 6, 8 o 10 s; Grok Imagine:
1 a 15 s).

### 3. Crear el video
Un pedido a Kie por bloque: texto del bloque + foto del personaje. Se bajan los
clips, se verifica que estén completos y se pegan en orden.
→ `clones/<id>/clips/c1.mp4…` + `video-voz-original.mp4`

### 4. Cambiar la voz
Se saca el audio del video pegado y se manda a Cartesia (voice changer) con la
voz del personaje. Cartesia devuelve el mismo audio con otra voz y la misma
entonación, así que los tiempos no se mueven y el labial sigue calzando. Se
vuelve a pegar el audio al video.
→ `clones/<id>/voz.mp3` + `clon-final.mp4`

### 5. Listo
El video queda terminado. Con un botón pasa al pipeline de edición: crea un
proyecto normal con ese video en `raw/`, ahí elegís marca y parámetros de
edición, y sigue todo igual que hoy (transcribir → cortar → plan → aprobás
"Renderizar" → gráficos → versiones).

En el corte conviene el preset suave: el video del clon no tiene silencios ni
muletillas que sacar. La transcripción sí se hace igual, porque de ahí salen
los tiempos palabra por palabra de los subtítulos.

## Qué hay que probar ANTES de construir

Con un solo clip de 8 segundos, barato:

1. **Que Cartesia mantenga los tiempos.** La documentación dice que conserva la
   entonación, pero no dice explícitamente que la duración sea idéntica. Si se
   corre, el labial se desincroniza y hay que re-ajustar el audio.
2. **Que la cara no salte entre clips.** Dos clips seguidos con la misma foto y
   el mismo encuadre, pegados, para ver cuánto se nota la unión.
3. **El costo real.** Se paga por segundo generado, reintentos incluidos, más
   15 caracteres por segundo de audio en Cartesia.

Ventaja: las uniones entre clips caen justo donde la edición ya mete una
transición o un gráfico a pantalla completa, así que se tapan solas. Los
bloques del guion dicen exactamente dónde están.

## Decisiones pendientes

- **Modelo:** Gemini Omni Video (tiene id de personaje para mantener la cara) o
  Grok Imagine (clips de hasta 15 s). Recomendación: Gemini Omni, con Grok
  configurable.
- **La voz:** fija por personaje (recomendado) o elegible en cada video.
- **Claves de API:** van en la pestaña Personajes. Falta cargarlas (Kie y
  Cartesia) para poder hacer la prueba del clip de 8 segundos.

## Referencias

- Gemini Omni Video: https://docs.kie.ai/market/gemini-omni-video
- Catálogo de Kie: https://kie.ai/market
- Cartesia voice changer: https://docs.cartesia.ai/api-reference/voice-changer/bytes
