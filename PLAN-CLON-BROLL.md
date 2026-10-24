# Clon + B-roll (plan)

Un modo nuevo **dentro de la pestaña Clon**, al lado del clon normal. Subís un
video de B-roll y contás de qué trata; sale un video vertical partido en dos:
**arriba el B-roll, abajo el personaje hablando**. Después pasa a edición
**solo para los subtítulos**.

Reusa casi todo el clon actual: personajes, guion en bloques, clips de Grok,
la voz leída por Cartesia, el ajuste de labios y el botón "Mejorar la
sincronización". Lo nuevo es recibir el B-roll, el avatar en media pantalla,
el armado partido y la edición "solo subtítulos".

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Duración | **Manda el B-roll**: el guion se escribe para durar lo mismo que el B-roll |
| Audio del B-roll | **Sin audio** (se usa solo la voz del personaje) |
| Pantalla | **50 / 50**: B-roll arriba (1080×960), avatar abajo (1080×960) |
| Avatar | Plano más cerrado: **que se le vea bien la cara** |
| Formato | Siempre vertical 1080×1920, 30 fps |

## Los pasos

### 1. Nuevo clon con B-roll
En la pestaña Clon, un selector: **"Clon" / "Clon + B-roll"**. Con B-roll:
- Subís el video de B-roll (MP4, MOV, WEBM).
- Elegís el personaje, el modelo de video (Grok por defecto) y la resolución.
- Escribís **de qué trata el video** (y qué querés que diga o que haga quien lo
  mira), o pegás el guion.
- **No hay campo de duración**: la pone el B-roll.

Límites propuestos: B-roll de **8 s a 3 min** (más corto no da para hablar; más
largo encarece Grok y alarga la espera). Fuera de eso, el panel avisa antes de
subir.

### 2. Entender el B-roll (local y gratis)
- Se mide la duración.
- Si el B-roll tiene gente hablando, Whisper lo transcribe (solo como contexto
  para la IA; ese audio no va al video).
- **Opcional, a probar:** se sacan 6-8 cuadros sueltos para que Claude "vea" de
  qué trata. Falta confirmar cómo pasarle imágenes a Claude desde el worker; si
  no se puede, alcanza con tu texto + la transcripción.

### 3. Guion
- **Si lo escribe la IA:** para durar lo mismo que el B-roll (unas 2,2 palabras
  por segundo, con aire), partido en bloques según el modelo, con el acento y
  la energía del personaje. Si le pasamos los cuadros, el guion acompaña lo que
  se ve en cada momento.
- **Si lo pegás:** el panel calcula cuánto va a durar y avisa si queda muy
  largo o muy corto para el B-roll (por ejemplo "tu guion dura unos 40 s y el
  B-roll 30 s: recortalo").
- Lo revisás y lo aprobás. **Sigue siendo el único paso que gasta plata.**

### 4. El avatar (igual que el clon de hoy, en media pantalla)
- La foto se recorta a la forma de media pantalla (**9:8**, casi cuadrada),
  dejando la cara arriba y centrada, antes de mandarla a Grok (con una sola
  foto, Grok saca el formato de la foto).
- El encuadre del pedido cambia a **"plano de pecho para arriba, la cara bien
  visible y centrada"** para este modo (el encuadre del personaje se sigue
  usando en el clon normal). Postura, energía, acento y restricciones, igual.
- Grok hace los clips → se pegan → **Cartesia lee el guion** → Whisper marca
  las palabras → **el video del avatar se ajusta a la voz**. Todo lo de hoy.

### 5. Ajuste fino de duración
El guion apunta a la duración del B-roll, pero la voz real de Cartesia nunca
dura exactamente eso. Se resuelve así, sin tocar la voz:
- **La voz manda el largo final** (es lo que se escucha).
- **B-roll más largo que la voz:** se corta al final.
- **B-roll un poco más corto** (hasta ~10 %): se estira apenas (se ve un
  poco más lento, no se nota).
- **Mucho más corto:** se avisa antes de aprobar el guion para que lo acortes
  (no debería pasar si el guion lo escribió la IA).

### 6. Armar la pantalla partida (local y gratis, con FFmpeg)
- **Arriba:** el B-roll recortado para llenar 1080×960 sin deformarse (si es
  horizontal se pierden los costados; opción a futuro: fondo desenfocado en vez
  de recorte). **Sin audio.**
- **Abajo:** el avatar ajustado a la voz, recortado a 1080×960 cuidando la cara.
- **Audio:** solo la voz de Cartesia (a -16 LUFS, como ahora).
- Resultado: `final.mp4` vertical. Se ve en la pantalla del clon con el mismo
  reproductor y el selector de voz.
- **"Mejorar la sincronización"** sigue andando: rehace el ajuste del avatar y
  vuelve a armar la pantalla partida (gratis, unos segundos).

### 7. Pasar a edición: solo subtítulos
- El botón lleva a "Nuevo video" con el video ya cargado, como hoy, pero con un
  **preset fijo "Solo subtítulos"**: sin motion graphics, sin zooms, sin
  transiciones, sin efectos de sonido y sin música; subtítulos **en el medio**,
  justo sobre la línea entre las dos mitades (no tapan ninguna cara). Corte
  suave (no hay silencios que sacar). Podés elegir marca y estilo de
  subtítulos.
- **Cambio en la edición** (el único que toca ese pipeline): una opción
  "solo subtítulos" para que **no le pida el plan a Claude** (no gasta tokens
  ni agrega nada) y renderice directo después de transcribir. El render ya
  funciona sin plan; hay que hacer que el panel lo lance solo y que la pantalla
  del proyecto no se quede esperando un plan.
- **A decidir:** las palabras resaltadas de los subtítulos salen del plan. Sin
  plan no hay resaltado. Opciones: (a) sin resaltado, (b) pedirle a Claude
  solo las palabras clave (muy pocos tokens), (c) usar las palabras más
  importantes del guion sin IA.

## Archivos

```
clones/<id>/
  job.json          + modo: "broll", broll { archivo, duracionS, transcripcion? }
  broll/original.*  el B-roll que subiste (no se toca)
  broll/cuadros/    cuadros sueltos para la IA (si se usa)
  personaje/        + foto-9x8.jpg (foto recortada a media pantalla)
  clips/, pegado.mp4, voz-cartesia.wav, sincro/   igual que el clon de hoy
  sincro/avatar.mp4 el avatar ajustado a la voz (sin audio)
  final.mp4         B-roll arriba + avatar abajo + voz
```

Código (aprox.):
- `app/lib/clon/types.ts`: modo del clon, datos del B-roll, encuadre de media pantalla.
- `app/app/clon/page.tsx`: selector "Clon / Clon + B-roll", subida del B-roll, sin duración.
- `app/app/api/clon/route.ts` (+ una ruta de subida): guardar el B-roll y medirlo.
- `scripts/clon/worker.ts`: recorte 9:8 de la foto, guion por duración del B-roll, armado partido.
- `scripts/clon/partido.ts` (nuevo): ajuste de duración + armado con FFmpeg, con tests.
- Edición: opción "solo subtítulos" (sin plan, render directo, subtítulos al medio).
- `CLAUDE.md`: documentar el modo.

## Costos y tiempos

- **Plata:** igual que un clon de la misma duración: Grok (unos $0,40 por cada
  30 s en 480p) + centavos de Cartesia. El B-roll, el armado y los subtítulos
  no cuestan nada (si se elige (b) para las palabras clave, unos pocos tokens).
- **Tiempo:** el de Grok (unos minutos) + menos de un minuto de voz y ajuste +
  la edición de subtítulos (transcribir y renderizar).

## Pruebas antes de construir

1. **Grok con foto 9:8** — un solo clip de 10 s en 480p (unos $0,12) para ver
   si respeta el formato y cómo se ve la cara en media pantalla.
2. **Pantalla partida** — con tu clon "Hoy todos hablan…" y cualquier B-roll
   tuyo, armo el video partido local (gratis) para ver proporciones, recortes y
   dónde caen los subtítulos.

## Pendiente de decidir

- Palabras resaltadas en los subtítulos: (a), (b) o (c) del paso 7.
- ¿Que la IA mire cuadros del B-roll? (mejor guion, un poco más de trabajo).
- Límite de duración del B-roll (propuesto: 8 s a 3 min).
