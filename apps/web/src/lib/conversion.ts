import type { DireccionElegida } from "./direccion";
import type { EstadoTrabajo, TipoTrabajoCola } from "./generacion";
import { DURACION_PREDETERMINADA, esDuracionDisponible } from "./produccion";
import { TITULO_MAXIMO } from "./proyectos";

/**
 * **De un clip de «Crear» a un proyecto** (lógica pura, sin base de datos ni navegador).
 *
 * Un clip de «Crear» no es la escena de ningún proyecto, así que no se puede montar ni ponerle voz en off.
 * Convertirlo crea un proyecto de **una** escena cuyo clip producido **es ese mismo clip**: no se regenera ni se
 * vuelve a cobrar. Aquí se decide si un clip se puede convertir y qué se copia de él; quién lo lee y quién escribe
 * vive en `server/conversion/`.
 */

/** Lo que hace falta saber de un clip para decidir si se puede convertir. Lo reúne el servidor. */
export interface HechosDelClip {
  tipo: TipoTrabajoCola;
  estado: EstadoTrabajo;
  /** El archivo del clip sigue en la biblioteca (ni borrado ni en la papelera). */
  tieneMedio: boolean;
  /** La imagen de partida sigue en la biblioteca: es el fotograma de la escena y de ella se vuelve a animar. */
  tieneImagenDePartida: boolean;
  /** Proyecto al que ya pertenece el clip, si pertenece a alguno. */
  proyecto: { id: string; titulo: string } | null;
  /** Clip de un intercambio de dos personajes (tiene turno en la conversación). */
  turnoDeConversacion: boolean;
  /** Clip cantado con un audio del usuario. */
  canto: boolean;
  /** Nombre del personaje del clip, si salió con uno. */
  personaje: string | null;
  /** Por qué ese personaje no puede usarse ahora mismo (consentimiento, referencias). Vacío = puede. */
  motivosPersonaje: string[];
  /** Declaraciones que quedaron guardadas con el clip al generarlo. */
  declaraciones: {
    derechosImagen: boolean;
    /** `null` cuando el clip no lleva personaje y por tanto no había fotos que revisar. */
    revisionDeFotos: boolean | null;
    /** `null` cuando el clip no lleva producto. */
    derechoMarca: boolean | null;
  };
}

/** Lo que la pantalla sabe de un clip de «Crear» antes de pulsar el botón. */
export type EstadoConversion =
  | { estado: "convertible"; avisos: string[] }
  | { estado: "convertido"; proyectoId: string; titulo: string; url: string }
  | { estado: "no_convertible"; motivo: string };

/** Resultado de convertir. `nuevo` es `false` cuando el clip ya estaba convertido y se devuelve su proyecto. */
export interface ProyectoConvertido {
  proyectoId: string;
  titulo: string;
  url: string;
  nuevo: boolean;
}

/** Lo que el botón explica antes de pulsarlo: qué pasa y que no se paga otra vez. */
export const EXPLICACION_CONVERTIR =
  "Crea un proyecto con una escena que ya tiene este clip como producido: la misma imagen de partida, el trend, el modelo, la dirección, el producto y el personaje. No se vuelve a generar ni se cobra otra vez. Desde el proyecto puedes quitarle la voz propia, ponerle voz en off y montarlo.";

/** Dónde se abre el proyecto recién convertido: en sus escenas, donde se ve el clip y sus acciones de audio. */
export const urlDelProyectoConvertido = (proyectoId: string): string => `/proyectos/${proyectoId}?paso=escenas`;

const ESTADOS_EN_CURSO: readonly EstadoTrabajo[] = ["preparando", "enviado", "en_curso", "en_cola", "enviando"];

/**
 * Por qué este clip **no** se puede convertir, o `null` si se puede. El orden importa: primero lo que no es un clip
 * terminado, después lo que ya es de un proyecto y al final lo que impediría usarlo en uno nuevo.
 *
 * Un clip que ya es de un proyecto no llega aquí como motivo: la pantalla lleva a ese proyecto (`estadoDeConversion`).
 */
export function motivoParaNoConvertir(h: HechosDelClip): string | null {
  if (h.tipo !== "animacion") return "Solo se convierte en proyecto un clip. Anima antes este fotograma.";
  if (ESTADOS_EN_CURSO.includes(h.estado) || h.estado === "esperando_limite") {
    return "El clip todavía se está generando. Cuando esté listo podrás convertirlo en proyecto.";
  }
  if (h.estado === "desconocido") {
    return "No se sabe cómo ha terminado este clip (el proveedor no respondió). Hasta que se resuelva en el historial no hay clip que llevar a un proyecto.";
  }
  if (h.estado !== "listo") {
    return "Este clip no salió, así que no hay nada que llevar a un proyecto. Mira en el historial qué pasó y si se cobró, y genera otro.";
  }
  if (!h.tieneMedio) {
    return "El archivo de este clip ya no está en tu biblioteca (se borró o está en la papelera). Recupéralo de la papelera para convertirlo.";
  }
  if (!h.tieneImagenDePartida) {
    return "La imagen de partida de este clip ya no está en tu biblioteca (se borró o está en la papelera), y la escena la necesita como fotograma. Recupérala de la papelera para convertir el clip.";
  }
  if (h.turnoDeConversacion) {
    return "Este clip es un turno de una conversación de dos personajes y solo tiene sentido junto al otro: se monta desde su proyecto.";
  }
  if (h.canto) {
    return "Este clip está cantado con tu audio y su audio va unido a la escena de canto: se monta desde su proyecto.";
  }
  if (h.motivosPersonaje.length > 0) {
    return `${h.personaje ? `El personaje «${h.personaje}»` : "El personaje de este clip"} ya no se puede usar en un proyecto: ${h.motivosPersonaje.join(" ")} El clip sigue en tu biblioteca; no se ha creado nada.`;
  }
  const faltan = declaracionesQueFaltan(h.declaraciones);
  if (faltan.length > 0) {
    return `Este clip se generó sin ${faltan.join(" ni ")}, y un proyecto no puede usarlo sin ella. Genera el clip otra vez confirmándola.`;
  }
  return null;
}

/** Las declaraciones que el clip debería llevar y no lleva, dichas como se leen en la casilla. */
export function declaracionesQueFaltan(d: HechosDelClip["declaraciones"]): string[] {
  const faltan: string[] = [];
  if (!d.derechosImagen) faltan.push("la declaración de derechos sobre la imagen");
  if (d.revisionDeFotos === false) faltan.push("la revisión de las fotos del personaje");
  if (d.derechoMarca === false) faltan.push("la declaración de derecho a usar la marca");
  return faltan;
}

/** Estado del botón a partir de los hechos. Un clip ya convertido lleva a su proyecto, sin crear otro. */
export function estadoDeConversion(h: HechosDelClip, avisos: string[] = []): EstadoConversion {
  if (h.proyecto) {
    return {
      estado: "convertido",
      proyectoId: h.proyecto.id,
      titulo: h.proyecto.titulo,
      url: urlDelProyectoConvertido(h.proyecto.id),
    };
  }
  const motivo = motivoParaNoConvertir(h);
  return motivo ? { estado: "no_convertible", motivo } : { estado: "convertible", avisos };
}

/**
 * Columnas de la escena que salen de la dirección elegida en «Crear». Son las mismas claves que guarda la escena
 * (`direccion/escena.ts › eleccionDeLaEscena` hace el camino inverso), así que no se pierde ninguna.
 */
export function columnasDeDireccion(d: DireccionElegida) {
  return {
    clipFormat: d.formatoClip,
    shotType: d.plano,
    cameraAngle: d.angulo,
    cameraMove: d.camara,
    microAction: d.microaccion,
    microActionTiming: d.momentoMicroaccion,
    dialogueDirection: d.direccionVocal,
    opticsPreset: d.optica,
    lightPreset: d.luz,
    locationPreset: d.localizacion,
    aestheticRegister: d.registroEstetico,
    extraInstructions: d.instruccionesExtra,
    expertMode: d.modoExperto,
    expertDescription: d.descripcionExperta,
  } as const;
}

/**
 * Segundos que se le pidieron al modelo para este clip, tal como los guarda el motor: dentro de
 * `input.parametros.segundos` (`generacion/servicio.ts › entradaGuardada`). El campo raíz `input.segundos` solo se
 * mira como respaldo, por si algún trabajo antiguo lo guardó ahí.
 */
export function segundosDelClip(entrada: unknown): unknown {
  if (typeof entrada !== "object" || entrada === null) return undefined;
  const { parametros, segundos } = entrada as { parametros?: unknown; segundos?: unknown };
  const pedidos =
    typeof parametros === "object" && parametros !== null ? (parametros as { segundos?: unknown }).segundos : undefined;
  return pedidos ?? segundos;
}

/**
 * Duración de los clips del proyecto: la del clip de origen si es una de las que ofrece un proyecto y, si no, la
 * de fábrica. El clip reutilizado dura lo que dura; esta cifra es la que se pediría **al regenerarlo**.
 */
export const duracionDelProyecto = (segundos: unknown): number =>
  typeof segundos === "number" && Number.isInteger(segundos) && esDuracionDisponible(segundos)
    ? segundos
    : DURACION_PREDETERMINADA;

/**
 * Techo del proyecto nuevo: el de fábrica de Admin › Ajustes, **nunca por debajo de lo que ya costó el clip**. Si el
 * de fábrica fuera menor, el proyecto nacería por encima de su techo y la primera voz en off se bloquearía sin
 * haber gastado nada; subirlo justo hasta lo gastado no autoriza ningún gasto nuevo. Con 0 (sin fijar) se queda en 0,
 * como cualquier proyecto nuevo.
 */
export const techoInicial = (deFabrica: number, gastado: number): number =>
  deFabrica > 0 ? Math.max(deFabrica, Math.ceil(gastado)) : 0;

/** Título del proyecto nuevo: el trend si lo hay y, si no, el día en que se generó el clip. */
export function tituloDelProyecto(trend: string | null, creadoEn: Date): string {
  const fecha = creadoEn.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" });
  const titulo = trend ? `«${trend}» desde Crear` : `Clip de Crear del ${fecha}`;
  return titulo.slice(0, TITULO_MAXIMO);
}
