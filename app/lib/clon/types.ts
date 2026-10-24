/**
 * Pipeline de clon: crea un video de un personaje hablando (Kie + Cartesia) y
 * lo entrega al pipeline de edición. Tipos compartidos por el panel y el
 * worker (scripts/clon/). Sin imports de Next ni de "server-only".
 */

/** Personaje guardado en assets/personajes/<slug>/personaje.json. */
export type Personaje = {
  slug: string;
  nombre: string;
  /** Cómo es y cómo habla (va en el pedido de cada bloque). */
  descripcion: string;
  /** Frase de cámara que se repite en todos los bloques para que no salte. */
  encuadre: string;
  /** Voz de Cartesia. */
  vozId: string;
  vozNombre?: string;
  /** Acento con el que habla (va en el pedido de cada bloque y al escribir el guion). */
  acento?: Acento;
  /** Con acento "otro": cómo es, en palabras del usuario. */
  acentoOtro?: string;
  /** Lo que el video NO tiene que traer (música, subtítulos…). Sin el campo: todas. */
  restricciones?: Restriccion[];
  /** Cuánta energía y emoción pone al hablar. Sin el campo: entusiasta. */
  energia?: Energia;
  /** Qué tan formal habla (solo cambia cómo escribe la IA el guion). Sin el campo: cercano. */
  registro?: Registro;
  /** Nombre del archivo de la foto dentro de la carpeta (foto.jpg, foto.png…). */
  foto?: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * Acentos para elegir. `prompt` va en el pedido a Kie; `guion` le dice a la IA
 * cómo escribir (voseo o tuteo, palabras de la zona).
 */
export const ACENTOS = {
  rioplatense: {
    label: "Argentino rioplatense (Buenos Aires)",
    prompt: "con acento argentino rioplatense de Buenos Aires",
    en: "with an Argentine Rioplatense accent from Buenos Aires",
    guion: "español rioplatense de Argentina, con voseo (vos tenés, vos querés)",
  },
  cordobes: {
    label: "Argentino cordobés",
    prompt: "con tonada cordobesa de Argentina, alargando la sílaba anterior a la acentuada",
    en: "with a Cordoba, Argentina accent (the cordobés sing-song tone)",
    guion: "español de Córdoba, Argentina, con voseo",
  },
  norteno: {
    label: "Argentino del norte (Tucumán, Salta)",
    prompt: "con acento del norte argentino, de Tucumán o Salta",
    en: "with a northern Argentine accent from Tucumán or Salta",
    guion: "español del norte argentino, con voseo",
  },
  cuyano: {
    label: "Argentino cuyano (Mendoza, San Juan)",
    prompt: "con acento cuyano de Mendoza, Argentina",
    en: "with a Cuyo accent from Mendoza, Argentina",
    guion: "español cuyano de Argentina, con voseo",
  },
  uruguayo: {
    label: "Uruguayo",
    prompt: "con acento uruguayo de Montevideo",
    en: "with a Uruguayan accent from Montevideo",
    guion: "español uruguayo, con voseo",
  },
  chileno: { label: "Chileno", prompt: "con acento chileno", en: "with a Chilean accent", guion: "español de Chile, con tuteo" },
  mexicano: { label: "Mexicano", prompt: "con acento mexicano", en: "with a Mexican accent", guion: "español de México, con tuteo" },
  colombiano: { label: "Colombiano", prompt: "con acento colombiano de Bogotá", en: "with a Colombian accent from Bogotá", guion: "español de Colombia, con tuteo" },
  neutro: { label: "Latino neutro", prompt: "con acento latinoamericano neutro", en: "with a neutral Latin American accent", guion: "español latinoamericano neutro, con tuteo" },
  espana: { label: "De España", prompt: "con acento de España (castellano peninsular)", en: "with a Spain (Castilian) accent", guion: "español de España, con tuteo" },
  otro: { label: "Otro (lo escribo yo)", prompt: "", en: "", guion: "" },
} as const;

export type Acento = keyof typeof ACENTOS;
export const ACENTO_BASE: Acento = "rioplatense";

/** Texto de acento para el pedido a Kie y para el guion (con "otro", lo que escribió el usuario). */
export const textoAcento = (p: Pick<Personaje, "acento" | "acentoOtro">) => {
  const acento = p.acento && p.acento in ACENTOS ? p.acento : ACENTO_BASE;
  if (acento === "otro") {
    const libre = p.acentoOtro?.trim();
    return libre
      ? { prompt: `con acento ${libre}`, en: `with this accent: ${libre}`, guion: `español con acento ${libre}` }
      : { prompt: "", en: "", guion: "español natural" };
  }
  const a = ACENTOS[acento];
  return { prompt: a.prompt, en: a.en, guion: a.guion };
};

/**
 * Energía al hablar. `cartesia` es la emoción con la que Cartesia lee el guion
 * (la voz final); `prompt`/`en` van en el pedido de cada clip a Kie para que la
 * cara acompañe con la misma energía.
 */
export const ENERGIAS = {
  tranquilo: {
    label: "Tranquilo",
    nota: "Voz calma y cálida, a ritmo pausado.",
    cartesia: "calm",
    prompt: "con calma: voz serena y cálida, a ritmo pausado; la cara acompaña con naturalidad y el cuerpo queda quieto",
    en: "calmly: a serene and warm voice at a relaxed pace; the face follows naturally and the body stays still",
  },
  natural: {
    label: "Natural",
    nota: "Voz de charla real, con entonación variada.",
    cartesia: "content",
    prompt: "con naturalidad: voz de conversación real, con entonación variada; la cara acompaña con naturalidad y el cuerpo queda quieto",
    en: "naturally: a real conversational voice with varied intonation; the face follows naturally and the body stays still",
  },
  entusiasta: {
    label: "Entusiasta",
    nota: "Voz con ganas: entonación que sube y baja, énfasis y ritmo vivo.",
    cartesia: "enthusiastic",
    prompt:
      "con entusiasmo y energía en la voz: entonación expresiva que sube y baja, énfasis en las palabras clave, ritmo vivo y volumen firme; la cara acompaña con naturalidad y el cuerpo queda sereno, sin gestos exagerados",
    en: "with enthusiasm and energy in the voice: expressive intonation that rises and falls, emphasis on the key words, a lively pace and a firm volume; the face follows naturally and the body stays calm, no exaggerated gestures",
  },
  energico: {
    label: "Muy enérgico",
    nota: "Voz de locutor entusiasmado: potente, con mucho énfasis y cambios de ritmo.",
    cartesia: "excited",
    prompt:
      "con muchísima energía y pasión en la voz, como un locutor entusiasmado: voz potente, mucho énfasis en las palabras clave, cambios de ritmo y entonación muy marcada; la cara acompaña con naturalidad y el cuerpo queda sereno, sin gestos exagerados",
    en: "with a lot of energy and passion in the voice, like an excited radio host: a strong voice, heavy emphasis on the key words, changes of pace and very marked intonation; the face follows naturally and the body stays calm, no exaggerated gestures",
  },
} as const;

export type Energia = keyof typeof ENERGIAS;
export const ENERGIA_BASE: Energia = "entusiasta";
export const energiaDe = (e: string | undefined) => ENERGIAS[e && e in ENERGIAS ? (e as Energia) : ENERGIA_BASE];

/**
 * Registro: qué tan formal habla. Lo usa solo la IA al escribir el guion
 * (el acento sigue mandando el voseo o el tuteo).
 */
export const REGISTROS = {
  profesional: {
    label: "Profesional",
    nota: "Claro y respetuoso, como en una presentación. Nada de jerga.",
    guion:
      "registro profesional: claro, respetuoso y seguro, como un experto en una presentación; sin jerga, modismos ni palabras coloquiales (nada de \"posta\", \"loco\", \"re\", \"che\", \"boludo\", \"tipo\", \"onda\", \"bancar\")",
  },
  cercano: {
    label: "Cercano",
    nota: "Natural y cálido, como un experto que le habla a un cliente. Sin jerga callejera.",
    guion:
      "registro cercano pero prolijo: natural y cálido, como un experto que le explica a un cliente; sin jerga callejera ni modismos muy informales (nada de \"posta\", \"loco\", \"re\", \"che\", \"boludo\", \"tipo\", \"onda\")",
  },
  informal: {
    label: "Informal",
    nota: "Canchero, con expresiones de la zona (\"posta\", \"re\"…), sin groserías.",
    guion: "registro informal y canchero: puede usar expresiones coloquiales de la zona, como entre amigos, sin groserías",
  },
} as const;

export type Registro = keyof typeof REGISTROS;
export const REGISTRO_BASE: Registro = "cercano";
export const registroDe = (r: string | undefined) => REGISTROS[r && r in REGISTROS ? (r as Registro) : REGISTRO_BASE];

/** Restricciones opcionales: cosas que el modelo de video no tiene que agregar. */
export const RESTRICCIONES = {
  musica: { label: "Sin música de fondo", prompt: "sin música de fondo", en: "no background music" },
  sonidos: { label: "Sin efectos de sonido", prompt: "sin efectos de sonido ni ruidos agregados", en: "no sound effects or added noises" },
  subtitulos: { label: "Sin subtítulos", prompt: "sin subtítulos", en: "no subtitles or captions" },
  textos: { label: "Sin textos ni carteles en pantalla", prompt: "sin textos, carteles, logos ni marcas de agua en pantalla", en: "no on-screen text, signs, logos or watermarks" },
  graficos: { label: "Sin motion graphics ni efectos visuales", prompt: "sin motion graphics, animaciones, stickers ni efectos visuales", en: "no motion graphics, animations, stickers or visual effects" },
  cortes: { label: "Una sola toma, sin cortes", prompt: "en una sola toma continua, sin cortes ni cambios de plano", en: "one continuous take, no cuts or shot changes" },
  postura: {
    label: "Respetar la postura de la foto",
    prompt:
      "manteniendo exactamente la misma postura corporal, posición y distancia a cámara que en la foto (no cambia de pose, no gira el cuerpo, no se para ni se mueve del lugar; solo se mueven la cara y las manos con naturalidad)",
    en: "keeping exactly the same body posture, position and distance to the camera as in the photo (no change of pose, no turning the body, no standing up or moving from the spot; only the face and hands move naturally)",
  },
  personas: { label: "Sin otras personas en cuadro", prompt: "sin otras personas en cuadro", en: "no other people in frame" },
} as const;

export type Restriccion = keyof typeof RESTRICCIONES;
/** Personaje nuevo (o guardado antes de que existieran): todas tildadas, la edición pone el resto. */
export const RESTRICCIONES_BASE = Object.keys(RESTRICCIONES) as Restriccion[];

export type ClonFormato = "vertical" | "horizontal";
export type ClonResolucion = "480p" | "720p" | "1080p" | "4k";

/**
 * Modelos de video de Kie (docs.kie.ai/market). Todos usan
 * POST /api/v1/jobs/createTask y GET /api/v1/jobs/recordInfo, pero cada uno
 * acepta otras duraciones y resoluciones:
 * - grok-imagine/image-to-video: duración "6" a "30" (texto), 480p/720p/1080p;
 *   con UNA foto el formato del video sale de la foto (aspect_ratio no cuenta),
 *   por eso la foto se recorta a 9:16 o 16:9 antes de subirla. Prompt en inglés.
 * - grok-imagine-video-1-5-preview: duración 1 a 15 (número), 480p/720p/1080p,
 *   aspect_ratio sí cuenta, una sola foto. Prompt en inglés.
 * - gemini-omni-video: duración "4", "6", "8" o "10", 720p/1080p/4k.
 *
 * `bloque` = cómo se parte el guion: con `fijas`, solo esas duraciones; si
 * no, cualquier segundo entero entre `min` y `max`. `max` puede ser menor que
 * el máximo del modelo: clips más cortos mantienen mejor el labial.
 */
export const MODELOS = {
  "grok-imagine/image-to-video": {
    label: "Grok Imagine",
    nota: "Clips de 6 a 30 s (se usan de hasta 15 s) · hasta 1080p",
    resoluciones: ["480p", "720p", "1080p"],
    duracionKie: { min: 6, max: 30, tipo: "texto" },
    bloque: { min: 6, max: 15, objetivo: 12 },
    promptEn: true,
  },
  "grok-imagine-video-1-5-preview": {
    label: "Grok Imagine 1.5 (preview)",
    nota: "Clips de 1 a 15 s · hasta 1080p · versión de prueba",
    resoluciones: ["480p", "720p", "1080p"],
    duracionKie: { min: 1, max: 15, tipo: "numero" },
    bloque: { min: 4, max: 15, objetivo: 12 },
    promptEn: true,
  },
  "gemini-omni-video": {
    label: "Gemini Omni",
    nota: "Clips de 8 o 10 s · hasta 4K",
    resoluciones: ["720p", "1080p", "4k"],
    duracionKie: { min: 4, max: 10, tipo: "texto", fijas: [4, 6, 8, 10] },
    bloque: { min: 8, max: 10, objetivo: 9, fijas: [8, 10] },
    promptEn: false,
  },
} as const satisfies Record<
  string,
  {
    label: string;
    nota: string;
    resoluciones: readonly ClonResolucion[];
    duracionKie: { min: number; max: number; tipo: "texto" | "numero"; fijas?: readonly number[] };
    bloque: ReglasBloque;
    promptEn: boolean;
  }
>;

export type ClonModelo = keyof typeof MODELOS;
export const MODELO_BASE: ClonModelo = "grok-imagine/image-to-video";

/** Cómo se parte el guion en bloques para un modelo. */
export type ReglasBloque = { min: number; max: number; objetivo: number; fijas?: readonly number[] };

export const modeloDe = (m: string | undefined): ClonModelo => (m && m in MODELOS ? (m as ClonModelo) : "gemini-omni-video");
export const reglasDe = (m: string | undefined): ReglasBloque => MODELOS[modeloDe(m)].bloque;

export type ClonSettings = {
  formato: ClonFormato;
  resolucion: ClonResolucion;
  /** Duración que debería tener el video terminado. */
  duracionObjetivoS: number;
  modelo: ClonModelo;
  /** IA que escribe el guion (si lo escribe la IA). Sin el campo: Claude. */
  aiProvider?: "anthropic" | "openai";
};

export type BloqueEstado = "pendiente" | "generando" | "bajando" | "listo" | "error";

/** Un bloque del guion = un clip de Kie (8 o 10 s). */
export type Bloque = {
  id: string;
  /** Texto exacto que dice el personaje. */
  texto: string;
  encuadre: string;
  segundos: number;
  taskId?: string;
  /** Video generado en Kie (vive 14 días): permite volver a bajarlo sin pagar. */
  url?: string;
  /** Nombre del clip bajado dentro de clones/<id>/clips/. */
  file?: string;
  creditos?: number;
  estado: BloqueEstado;
  error?: string;
  /** Veces que falló la bajada o la verificación del mismo video. */
  intentosBajada?: number;
};

/** Niveles del botón "Mejorar la sincronización" (los parámetros viven en scripts/clon/sincro.ts). */
export const NIVELES_SINCRO = { 1: "Suave", 2: "Precisa", 3: "Máxima" } as const;

export type ClonPaso = "guion" | "esperando_aprobacion" | "generando" | "voz" | "listo" | "error";

/** Qué acción del worker falló (para reintentar solo eso). */
export type ClonAccion = "guion" | "generar" | "voz";

export type ClonJob = {
  schema: "clon-v1";
  id: string;
  createdAt: string;
  titulo: string;
  /** "broll" = Clon + B-roll: pantalla partida, B-roll arriba y el personaje abajo. Sin el campo: clon normal. */
  modo?: "broll";
  /** El B-roll del modo "broll" (en broll/ dentro del clon; se usa sin audio). */
  broll?: { archivo: string; duracionS: number; ancho: number; alto: number };
  /** Datos del personaje congelados al crear el clon (la foto está en personaje/). */
  personaje: Omit<Personaje, "createdAt" | "updatedAt"> & { foto: string };
  settings: ClonSettings;
  guion: {
    origen: "pegado" | "ia";
    /** Lo que escribió el usuario para que la IA redacte el guion. */
    brief?: string;
    /** Con IA: la primera frase (gancho), tal cual; la IA escribe lo que sigue. */
    hook?: string;
    /** Con IA: el cierre (llamado a la acción), tal cual; la IA escribe lo anterior. */
    cta?: string;
    bloques: Bloque[];
    aprobadoAt?: string;
  };
  paso: ClonPaso;
  mensaje: string;
  error?: string;
  /** Acción que falló (con paso "error"). */
  fallo?: ClonAccion;
  /** Resultado de la voz: método, sincronización, duraciones y volumen. */
  voz?: {
    /** "lectura" = Cartesia lee el guion y el video se ajusta a esa voz; sin el campo, cambio de voz (clones viejos). */
    metodo?: "lectura";
    /** Cuándo se armó final.mp4 (el panel lo usa para no mezclar el video viejo con el nuevo). */
    generadoAt?: string;
    /** Nivel de sincronización con el que se armó (1 Suave, 2 Precisa, 3 Máxima). */
    nivel?: 1 | 2 | 3;
    /** Emoción que se le pidió a Cartesia (sale de la energía del personaje). */
    emocion?: string;
    /** Palabras de las dos voces que se pudieron emparejar. */
    palabras?: { emparejadas: number; kie: number; cartesia: number };
    /** Cuánto quedó corrida cada palabra (ms): la del medio, la del 90 % y cuántas pasan de 150 ms. */
    sincro?: { medianaMs: number; p90Ms: number; corridas: number };
    duracionOriginalS: number;
    duracionNuevaS: number;
    desfaseS: number;
    /** Factor de atempo aplicado si el desfase pasó 0.08 s. */
    atempo?: number;
    /** Volumen (LUFS) de la voz original y de la de Cartesia, y cuánto se subió la nueva para igualarla. */
    volumenOriginalLufs?: number;
    volumenNuevaLufs?: number;
    gananciaDb?: number;
  };
  /** Nivel de sincronización pedido con "Mejorar la sincronización" (sin el campo: 1, Suave). */
  nivelSincro?: 1 | 2 | 3;
  /** Proyecto de edición creado con "Pasar a edición". */
  proyectoId?: string;
};

export const CLON_ID = /^cl-[a-f0-9-]{36}$/;
export const PERSONAJE_SLUG = /^[a-z0-9][a-z0-9-]{0,60}$/;

export const CLON_DEFAULTS: ClonSettings = {
  formato: "vertical",
  resolucion: "720p",
  duracionObjetivoS: 30,
  modelo: MODELO_BASE,
  aiProvider: "anthropic",
};

/** Encuadre sugerido para un personaje nuevo (y si quedó vacío). */
export const ENCUADRE_BASE =
  "Plano medio de la persona de la foto, mirando a cámara, cámara fija, misma luz y mismo fondo";

/** Encuadre del personaje en el modo Clon + B-roll: va en media pantalla, la cara tiene que verse bien. */
export const ENCUADRE_MEDIA_PANTALLA =
  "Plano de pecho para arriba de la persona de la foto, con la cara bien visible y centrada, mirando a cámara, cámara fija, misma luz y mismo fondo";

/** Encuadre de los bloques de un clon: en el modo B-roll, el de media pantalla. */
export const encuadreDe = (job: Pick<ClonJob, "modo" | "personaje">) =>
  job.modo === "broll" ? ENCUADRE_MEDIA_PANTALLA : job.personaje.encuadre;

/** Límites del B-roll: más corto no da para hablar; más largo encarece Kie y alarga la espera. */
export const BROLL_MIN_S = 8;
export const BROLL_MAX_S = 180;

export const DURACIONES_OBJETIVO = [16, 30, 45, 60, 90] as const;

export const PASO_LABELS: Record<ClonPaso, string> = {
  guion: "Escribiendo el guion",
  esperando_aprobacion: "Revisá el guion",
  generando: "Creando el video",
  voz: "Poniendo la voz",
  listo: "Listo",
  error: "Revisar",
};

export const validarSettings = (s: Partial<ClonSettings> | undefined): ClonSettings => {
  const v = { ...CLON_DEFAULTS, ...(s ?? {}) };
  if (v.formato !== "vertical" && v.formato !== "horizontal") throw new Error("Elegí vertical u horizontal.");
  if (!(v.modelo in MODELOS)) throw new Error("Elegí un modelo de video válido.");
  const modelo = MODELOS[v.modelo];
  if (!(modelo.resoluciones as readonly string[]).includes(v.resolucion))
    throw new Error(`${modelo.label} no genera en ${v.resolucion}: elegí ${modelo.resoluciones.join(", ")}.`);
  const d = Math.round(Number(v.duracionObjetivoS));
  if (!Number.isFinite(d) || d < 8 || d > 300) throw new Error("La duración tiene que estar entre 8 segundos y 5 minutos.");
  const aiProvider = v.aiProvider === "openai" ? "openai" : "anthropic";
  return { formato: v.formato, resolucion: v.resolucion, duracionObjetivoS: d, modelo: v.modelo, aiProvider };
};
