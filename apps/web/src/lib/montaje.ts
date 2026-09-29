import type { Medio } from "@/lib/media/tipos";
import { componerSubtitulos, type EscenaConSubtitulos, type FormatoSubtitulos, type Subtitulo } from "@/lib/voz";
import type { EvaluacionVista } from "./controles";

/**
 * Montaje y exportación (RF08, 0.32.0) tal como los comparten el servidor y el navegador.
 *
 * Aquí no hay ninguna lectura ni ninguna orden de FFmpeg: solo la forma de la línea de tiempo, sus límites y
 * las funciones **puras** que la validan y que corren los tiempos de los subtítulos. El render vive en
 * `server/montaje/`, porque montar un vídeo es siempre trabajo del servidor.
 *
 * La línea de tiempo es **simple a propósito** (decisión del propietario, 2026-09-29): orden, recorte de
 * entrada y de salida, volúmenes y subtítulos. Transiciones, efectos, curvas de audio y multipista quedan
 * fuera, y 16:9 y 1:1 llegan en la 0.36.0.
 */

// ── Formato de salida ────────────────────────────────────────────────────────────────────────────────────────

/**
 * Formatos de salida de esta versión. **Solo uno**: vertical 9:16, que es lo que se publica en TikTok, Reels y
 * Shorts. Es un enumerado de un solo valor y no una constante porque 0.36.0 añade los otros dos, y entonces lo
 * que cambia es esta lista y no la forma de los datos.
 */
export const FORMATOS_MONTAJE = ["vertical_9_16"] as const;
export type FormatoMontaje = (typeof FORMATOS_MONTAJE)[number];

export const esFormatoMontaje = (v: unknown): v is FormatoMontaje => FORMATOS_MONTAJE.includes(v as FormatoMontaje);

export const FORMATO_MONTAJE_POR_DEFECTO: FormatoMontaje = "vertical_9_16";

export const RESOLUCION_MONTAJE: Record<FormatoMontaje, { ancho: number; alto: number }> = {
  vertical_9_16: { ancho: 1080, alto: 1920 },
};

export const ETIQUETA_FORMATO_MONTAJE: Record<FormatoMontaje, string> = {
  vertical_9_16: "Vertical 1080 × 1920 (9:16)",
};

/**
 * Fotogramas por segundo de la salida. Fijo: los clips llegan con cadencias distintas según el modelo y
 * concatenar cadencias distintas es exactamente lo que hace que el audio se desincronice (riesgo de la fase).
 */
export const FPS_MONTAJE = 30;

// ── Etiqueta de contenido sintético ──────────────────────────────────────────────────────────────────────────

export const POSICIONES_ETIQUETA = ["arriba", "abajo"] as const;
export type PosicionEtiqueta = (typeof POSICIONES_ETIQUETA)[number];

export const esPosicionEtiqueta = (v: unknown): v is PosicionEtiqueta =>
  POSICIONES_ETIQUETA.includes(v as PosicionEtiqueta);

export const ETIQUETA_POSICION: Record<PosicionEtiqueta, string> = {
  arriba: "Arriba, bajo la zona segura",
  abajo: "Abajo, sobre la zona segura",
};

/**
 * Texto de la etiqueta. **Constante y no editable**: es una declaración sobre el vídeo, no un rótulo de
 * diseño, y además es lo único que se dibuja con `drawtext`, así que no hay texto de nadie en la línea de
 * órdenes de FFmpeg.
 */
export const TEXTO_ETIQUETA_SINTETICA = "Contenido generado con IA";

/**
 * Por qué la etiqueta no se puede quitar. Se aplica a todo vídeo exportado por Escenara, también a personajes
 * completamente animados. Es una decisión de transparencia del producto hasta la revisión legal de la 0.41.0.
 */
export const MOTIVO_ETIQUETA_OBLIGATORIA =
  "Toda exportación de Escenara lleva la etiqueta de contenido generado con IA, también si el personaje es animado. Puedes elegir dónde va, no quitarla.";

// ── Línea de tiempo ─────────────────────────────────────────────────────────────────────────────────────────

/** Un trozo de clip en la línea de tiempo: de qué escena, desde qué segundo y hasta qué segundo. */
export interface Fragmento {
  escenaId: string;
  /** Segundo del clip en el que empieza el trozo. */
  entrada: number;
  /** Segundo del clip en el que acaba. Siempre mayor que `entrada`. */
  salida: number;
}

/** Fragmentos que caben en un montaje. Un reel son unas pocas escenas: sesenta es diez veces eso. */
export const FRAGMENTOS_MAXIMOS = 60;

/** Duración máxima del montaje. Un reel son 15–60 s; cinco minutos es el techo del render de esta versión. */
export const SEGUNDOS_MAXIMOS_MONTAJE = 300;

/** Trozo mínimo utilizable: por debajo no se ve nada y solo complica la concatenación. */
export const RECORTE_MINIMO_SEGUNDOS = 0.2;

/** Volumen de una pista en la mezcla: de 0 % a 200 %, en tanto por uno. */
export const VOLUMEN_MINIMO = 0;
export const VOLUMEN_MAXIMO = 2;
export const VOLUMEN_VOZ_POR_DEFECTO = 1;
export const VOLUMEN_MUSICA_MONTAJE_POR_DEFECTO = 1;

/** Redondea a dos decimales: los volúmenes son un mando, no una medida. */
const dosDecimales = (v: number) => Math.round(v * 100) / 100;

/** `true` si el valor es un volumen utilizable (0–2, finito). */
export const esVolumen = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= VOLUMEN_MINIMO && v <= VOLUMEN_MAXIMO;

/** Volumen dentro de la horquilla, redondeado. Fuera de ella se recorta. */
export const volumenNormalizado = (v: number): number =>
  dosDecimales(Math.min(VOLUMEN_MAXIMO, Math.max(VOLUMEN_MINIMO, v)));

export const duracionDeFragmento = (f: Fragmento): number => dosDecimales(f.salida - f.entrada);

export const duracionTotalDeFragmentos = (fragmentos: readonly Fragmento[]): number =>
  dosDecimales(fragmentos.reduce((total, f) => total + duracionDeFragmento(f), 0));

/** Lo que se sabe de la escena de un fragmento en el momento de validarlo. */
export interface EscenaDelMontaje {
  escenaId: string;
  orden: number;
  /** Duración real del clip guardado, medida o declarada; `null` cuando no hay clip. */
  duracionClip: number | null;
}

/**
 * Errores de una línea de tiempo, en lenguaje llano y diciendo **cuál** falla. Puros: la duración real de cada
 * clip la trae quien llama, así que la misma función vale para el servidor y para la pantalla.
 *
 * Es una lista y no un booleano porque el usuario tiene que poder arreglar las tres cosas a la vez: una escena
 * que ya no tiene clip, un recorte imposible y un montaje demasiado largo.
 */
export function erroresDeMontaje(fragmentos: readonly Fragmento[], escenas: readonly EscenaDelMontaje[]): string[] {
  const errores: string[] = [];
  if (fragmentos.length === 0) {
    return ["El montaje no tiene ningún fragmento. Añade al menos una escena a la línea de tiempo."];
  }
  if (fragmentos.length > FRAGMENTOS_MAXIMOS) {
    errores.push(`El montaje no puede tener más de ${FRAGMENTOS_MAXIMOS} fragmentos.`);
  }
  const porEscena = new Map(escenas.map((e) => [e.escenaId, e]));
  for (const [indice, fragmento] of fragmentos.entries()) {
    const posicion = indice + 1;
    const escena = porEscena.get(fragmento.escenaId);
    if (!escena) {
      errores.push(`El fragmento ${posicion} apunta a una escena que no es de este proyecto.`);
      continue;
    }
    if (escena.duracionClip === null) {
      errores.push(`La escena ${escena.orden} todavía no tiene clip, así que no se puede montar.`);
      continue;
    }
    if (!Number.isFinite(fragmento.entrada) || !Number.isFinite(fragmento.salida) || fragmento.entrada < 0) {
      errores.push(`El recorte del fragmento ${posicion} (escena ${escena.orden}) no es válido.`);
      continue;
    }
    if (duracionDeFragmento(fragmento) < RECORTE_MINIMO_SEGUNDOS) {
      errores.push(
        `El fragmento ${posicion} (escena ${escena.orden}) dura menos de ${RECORTE_MINIMO_SEGUNDOS} s: recórtalo menos.`,
      );
      continue;
    }
    // Medio segundo de margen: un MP4 de 8 s mide 8,0–8,1 s según el contenedor, así que exigir la duración
    // exacta rechazaría un recorte hasta el final del clip.
    if (fragmento.salida > escena.duracionClip + 0.5) {
      errores.push(
        `El fragmento ${posicion} acaba en el segundo ${dosDecimales(fragmento.salida)} y el clip de la escena ${escena.orden} dura ${dosDecimales(escena.duracionClip)} s.`,
      );
    }
  }
  const total = duracionTotalDeFragmentos(fragmentos);
  if (total > SEGUNDOS_MAXIMOS_MONTAJE) {
    errores.push(
      `El montaje dura ${Math.round(total)} s y el máximo de esta versión son ${SEGUNDOS_MAXIMOS_MONTAJE} s.`,
    );
  }
  return errores;
}

// ── Subtítulos del montaje ──────────────────────────────────────────────────────────────────────────────────

/** Subtítulos editados de la escena de un fragmento, para correr sus tiempos. */
export interface SubtitulosDeEscena {
  escenaId: string;
  subtitulos: readonly Subtitulo[];
}

/**
 * Subtítulos de un fragmento con sus tiempos **relativos al trozo**: los de la escena están medidos desde el
 * principio de su clip, y el trozo puede empezar más tarde.
 *
 * Lo que cae fuera del recorte se descarta, y lo que lo cruza se acorta: un subtítulo que empieza antes del
 * corte se muestra desde el segundo 0 del trozo. No se inventa texto y no se alarga nada.
 */
export function subtitulosDeFragmento(fragmento: Fragmento, subtitulos: readonly Subtitulo[]): Subtitulo[] {
  const duracion = duracionDeFragmento(fragmento);
  const dentro: Subtitulo[] = [];
  for (const s of subtitulos) {
    const desde = dosDecimales(Math.max(0, s.desde - fragmento.entrada));
    const hasta = dosDecimales(Math.min(duracion, s.hasta - fragmento.entrada));
    if (hasta <= 0 || desde >= duracion || hasta <= desde) continue;
    dentro.push({ ...s, desde, hasta });
  }
  return dentro;
}

/**
 * Fichero de subtítulos del **montaje**, no del proyecto: los tiempos se corren fragmento a fragmento con la
 * duración recortada de cada uno, que es lo que de verdad va a durar en el vídeo exportado.
 *
 * Se compone con la misma función que exporta los del proyecto (`lib/voz.ts › componerSubtitulos`), así que el
 * formato de los dos ficheros no puede divergir.
 */
export function subtitulosDelMontaje(
  fragmentos: readonly Fragmento[],
  subtitulosPorEscena: readonly SubtitulosDeEscena[],
  formato: FormatoSubtitulos,
): string {
  const porEscena = new Map(subtitulosPorEscena.map((s) => [s.escenaId, s.subtitulos]));
  const escenas: EscenaConSubtitulos[] = fragmentos.map((fragmento, indice) => ({
    orden: indice + 1,
    segundos: duracionDeFragmento(fragmento),
    subtitulos: subtitulosDeFragmento(fragmento, porEscena.get(fragmento.escenaId) ?? []),
  }));
  return componerSubtitulos(escenas, formato);
}

/** `true` si el montaje tiene al menos un subtítulo que exportar. Un fichero vacío no se ofrece. */
export function tieneSubtitulos(
  fragmentos: readonly Fragmento[],
  subtitulosPorEscena: readonly SubtitulosDeEscena[],
): boolean {
  const porEscena = new Map(subtitulosPorEscena.map((s) => [s.escenaId, s.subtitulos]));
  return fragmentos.some((f) =>
    subtitulosDeFragmento(f, porEscena.get(f.escenaId) ?? []).some((s) => s.texto.trim() !== ""),
  );
}

// ── Estado de una exportación ───────────────────────────────────────────────────────────────────────────────

export const ESTADOS_EXPORTACION = ["en_cola", "en_curso", "listo", "fallido"] as const;
export type EstadoExportacion = (typeof ESTADOS_EXPORTACION)[number];

export const ETIQUETA_ESTADO_EXPORTACION: Record<EstadoExportacion, string> = {
  en_cola: "En cola",
  en_curso: "Montando",
  listo: "Listo",
  fallido: "Ha fallado",
};

/**
 * Etapas **reales** del render, en orden. No es un porcentaje calculado por tiempo: cada una se apunta cuando
 * FFmpeg entra de verdad en ella, y el progreso dentro de la etapa sale de su `-progress`.
 */
export const ETAPAS_EXPORTACION = ["preparando", "normalizando", "montando", "guardando", "listo"] as const;
export type EtapaExportacion = (typeof ETAPAS_EXPORTACION)[number];

export const ETIQUETA_ETAPA_EXPORTACION: Record<EtapaExportacion, string> = {
  preparando: "Preparando los clips",
  normalizando: "Igualando los clips",
  montando: "Montando y mezclando",
  guardando: "Guardando en tu biblioteca",
  listo: "Terminado",
};

/** Una exportación tal como viaja al navegador. */
export interface ExportacionVista {
  id: string;
  estado: EstadoExportacion;
  etapa: EtapaExportacion;
  /** 0–100 dentro de la etapa en curso. Sale del `-progress` de FFmpeg, no de un reloj. */
  progreso: number;
  formato: FormatoMontaje;
  ancho: number;
  alto: number;
  /** Segundos del MP4 resultante; `null` mientras no exista. */
  duracion: number | null;
  tamano: number | null;
  /** El MP4 en la biblioteca del usuario, con su URL temporal de descarga. */
  medio: Medio | null;
  etiquetaAplicada: boolean;
  etiquetaPosicion: PosicionEtiqueta;
  subtitulosQuemados: boolean;
  /** `true` si tiene subtítulos adjuntos que descargar. */
  tieneSubtitulos: boolean;
  /** Causa concreta del fallo, escrita para el usuario. Vacío si no ha fallado. */
  error: string;
  /** Versión del montaje con la que se exportó. */
  montajeVersion: number;
  /** `false` cuando el montaje ha cambiado desde que se exportó: lo descargado ya no es lo que se ve. */
  vigente: boolean;
  creadoEn: string;
  terminadoEn: string | null;
}

/** El montaje de un proyecto y todo lo que la pantalla necesita para pintarlo. */
export interface MontajeVista {
  proyectoId: string;
  /** Versión del montaje: sube con cada guardado y es lo que hace idempotente la exportación. */
  version: number;
  formato: FormatoMontaje;
  fragmentos: Fragmento[];
  volumenVoz: number;
  volumenMusica: number;
  subtitulosQuemados: boolean;
  formatoSubtitulos: FormatoSubtitulos;
  etiquetaVisible: boolean;
  etiquetaPosicion: PosicionEtiqueta;
  /** `true` cuando la etiqueta no se puede quitar; entonces `etiquetaVisible` es siempre `true`. */
  etiquetaObligatoria: boolean;
  /** Por qué es obligatoria, en llano. Vacío cuando no lo es. */
  motivoEtiqueta: string;
  duracionTotal: number;
  /** Escenas del proyecto en orden, con lo que hace falta para montarlas. */
  escenas: EscenaMontableVista[];
  /** Comprobación previa del render, con el motivo de cada freno. Nunca es «listo» por no haber mirado. */
  controles: EvaluacionVista;
  /** `false` cuando quien administra ha apagado el montaje en esta instalación. */
  activo: boolean;
  /** Exportaciones del proyecto, de la más reciente a la más antigua. */
  exportaciones: ExportacionVista[];
  actualizadoEn: string;
}

/** Una escena del proyecto tal como se ofrece en la línea de tiempo. */
export interface EscenaMontableVista {
  escenaId: string;
  orden: number;
  /** Primeras palabras del guion: es con lo que se reconoce la escena en la línea de tiempo. */
  resumen: string;
  /** Duración real del clip guardado; `null` cuando la escena todavía no tiene clip. */
  duracionClip: number | null;
  /** El clip, para previsualizarlo. `null` si no hay. */
  medioClip: Medio | null;
  /** `true` cuando la escena tiene pista de voz aparte (modo `pista`). */
  tieneVoz: boolean;
  subtitulos: Subtitulo[];
}

/**
 * Línea de tiempo que se propone cuando el proyecto no tiene montaje todavía: **todas** las escenas con clip,
 * en su orden, sin recortar. Es lo que el usuario esperaría ver al abrir la pantalla por primera vez.
 */
export function montajeInicial(escenas: readonly EscenaDelMontaje[]): Fragmento[] {
  return escenas
    .filter((e) => e.duracionClip !== null && e.duracionClip > 0)
    .map((e) => ({ escenaId: e.escenaId, entrada: 0, salida: dosDecimales(e.duracionClip as number) }));
}
