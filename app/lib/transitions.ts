/**
 * Las transiciones del montaje, para la pestaña "Transiciones".
 * Mantener en sync con src/edit/transitions.tsx y la guía de CLAUDE.md.
 * Las muestras (public/transitions/<id>.mp4) las genera scripts/transition-demos.ts.
 */
export type TransitionInfo = {
  id: string;
  name: string;
  what: string;
  when: string;
  duration: string;
  sound?: string;
};

export const TRANSITIONS: TransitionInfo[] = [
  {
    id: "flash",
    name: "Destello",
    what: "Un destello blanco rápido tapa el corte.",
    when: "Cambio rápido de idea. Es la que usa si el plan no dice otra.",
    duration: "0,3–0,4 s",
    sound: "Golpe grave si remata una frase fuerte",
  },
  {
    id: "fade",
    name: "Fundido",
    what: "La imagen baja a negro y vuelve.",
    when: "Un cierre, una pausa o un cambio de bloque.",
    duration: "0,4–0,6 s",
  },
  {
    id: "wipe",
    name: "Barrido de color",
    what: "Una barra con el color de tu marca cruza la pantalla en diagonal.",
    when: "Pasar de un tema a otro.",
    duration: "0,35–0,5 s",
    sound: "Whoosh",
  },
  {
    id: "zoom",
    name: "Zoom",
    what: "La imagen se acerca de golpe y vuelve.",
    when: "Darle énfasis a lo que viene.",
    duration: "0,3–0,4 s",
    sound: "Golpe grave si remata una frase fuerte",
  },
  {
    id: "whip",
    name: "Barrido rápido",
    what: "La imagen se va de costado con desenfoque de movimiento y entra la siguiente.",
    when: "Dar ritmo, el típico “y ahora…”.",
    duration: "0,3–0,4 s",
    sound: "Whoosh corto",
  },
  {
    id: "blur",
    name: "Desenfoque",
    what: "La imagen se desenfoca y vuelve a enfocarse en la siguiente.",
    when: "Un salto de tiempo o de lugar; más suave que el barrido.",
    duration: "0,4–0,6 s",
    sound: "Whoosh corto",
  },
  {
    id: "glitch",
    name: "Glitch",
    what: "Tirones, franjas de colores y líneas de pantalla vieja.",
    when: "Solo con tono tech o cuando “algo sale mal”.",
    duration: "0,25–0,4 s",
    sound: "Glitch",
  },
  {
    id: "lightleak",
    name: "Destello de luz",
    what: "Una luz cálida con el color de tu marca cruza la pantalla.",
    when: "Un momento emotivo, inspirador o el llamado a la acción.",
    duration: "0,6–0,9 s",
    sound: "Brillo o whoosh cinematográfico",
  },
  {
    id: "shake",
    name: "Sacudón",
    what: "La cámara pega unos tirones bruscos justo en el corte.",
    when: "Un golpe, una sorpresa o una frase que pega fuerte.",
    duration: "0,3–0,45 s",
    sound: "Golpe grave",
  },
  {
    id: "zoomblur",
    name: "Zoom con estela",
    what: "La imagen se mete de golpe hacia el centro con rayas de velocidad.",
    when: "Entrar a algo importante: “mirá esto”, un dato clave.",
    duration: "0,35–0,5 s",
    sound: "Whoosh",
  },
  {
    id: "spin",
    name: "Giro",
    what: "La imagen da una vuelta entera, desenfocada, y aparece la siguiente.",
    when: "Un giro de la historia o un “pero…”. Usarla poco.",
    duration: "0,45–0,65 s",
    sound: "Whoosh cinematográfico",
  },
  {
    id: "iris",
    name: "Círculo",
    what: "Un círculo se cierra a negro, con borde de tu color, y se abre en la escena nueva.",
    when: "Cerrar un tema y abrir otro, con un toque retro o divertido.",
    duration: "0,5–0,7 s",
    sound: "Pop o click suave",
  },
  {
    id: "blinds",
    name: "Persianas",
    what: "Franjas del color de tu marca bajan una tras otra, tapan el corte y se abren.",
    when: "Pasar de una sección a otra (paso 1, paso 2…).",
    duration: "0,45–0,65 s",
    sound: "Whoosh corto",
  },
  {
    id: "filmburn",
    name: "Película quemada",
    what: "Manchas de luz naranja que titilan, como un rollo de película que se quema.",
    when: "Un recuerdo, una historia personal o un cierre emotivo.",
    duration: "0,6–0,9 s",
    sound: "Whoosh cinematográfico",
  },
];
