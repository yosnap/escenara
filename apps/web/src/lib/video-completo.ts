import { primerObjetoJson } from "./asistente";
import { limpiarTextoDePrompt } from "./ficha-personaje";
import { ACCION_MAXIMA, CONCEPTO_MAXIMO } from "./proyectos";
import { TEXTO_TURNO_MAXIMO, TURNOS_MAXIMOS } from "./reparto";

/**
 * **Vídeo completo desde una idea**: duraciones, tipos de pieza, plan de clips, palabras por clip y la lectura del
 * guion que escribe el modelo de texto, tal como lo comparten el servidor y el navegador.
 *
 * Todo lo de aquí es puro: no hay base de datos ni credenciales. Vive en un solo sitio porque **tiene que decir lo
 * mismo en las dos orillas**: la pantalla enseña las opciones y el coste con estas funciones, y el servidor rechaza
 * con estas mismas lo que no se puede pedir.
 *
 * Reglas que manda este fichero:
 *
 * - **cada escena es un clip**, con su duración propia: el montaje toma una duración de clip por escena;
 * - el diálogo se escribe en español de España y se guarda **literal**: no se traduce nunca;
 * - lo que contesta el modelo es una **propuesta no confiable**: se limpia, se recorta y se comprueba antes de
 *   guardar nada. Un clip que no cabe en sus segundos no se arregla a medias: se pide otra vez.
 */

// ── Duraciones ───────────────────────────────────────────────────────────────────────────────────────────

/** Duraciones del vídeo completo, en segundos. Las largas solo se ofrecen con el ajuste del admin encendido. */
export const DURACIONES_VIDEO = [20, 60, 180] as const;
export type DuracionVideo = (typeof DURACIONES_VIDEO)[number];

export const esDuracionVideo = (v: unknown): v is DuracionVideo => DURACIONES_VIDEO.includes(v as DuracionVideo);

/** 1 min y 3 min: hechas, pero ocultas hasta que quien administra las abra (decisión del propietario). */
export const esDuracionLarga = (duracion: DuracionVideo): boolean => duracion !== 20;

export const ETIQUETA_DURACION_VIDEO: Record<DuracionVideo, string> = {
  20: "20 s",
  60: "≈ 1 min",
  180: "≈ 3 min",
};

/** Duración de cada clip en las duraciones largas, y cuántos clips lleva cada una. */
export const SEGUNDOS_CLIP_LARGO = 8;
const CLIPS_LARGOS: Record<60 | 180, number> = { 60: 8, 180: 23 };

// ── Tipos de pieza ───────────────────────────────────────────────────────────────────────────────────────

export const TIPOS_PIEZA = ["una_persona", "entrevista", "podcast"] as const;
export type TipoPieza = (typeof TIPOS_PIEZA)[number];

export const esTipoPieza = (v: unknown): v is TipoPieza => TIPOS_PIEZA.includes(v as TipoPieza);

export const ETIQUETA_TIPO_PIEZA: Record<TipoPieza, string> = {
  una_persona: "Una persona",
  entrevista: "Entrevista",
  podcast: "Podcast",
};

export const AYUDA_TIPO_PIEZA: Record<TipoPieza, string> = {
  una_persona: "Tu protagonista presenta o cuenta algo a cámara.",
  entrevista: "Dos personas en el mismo plano, conversando.",
  podcast: "Dos personas en plano y contraplano: cada clip enseña a quien habla.",
};

/** `true` en los tipos que necesitan un segundo personaje. */
export const tipoConDosPersonas = (tipo: TipoPieza): boolean => tipo !== "una_persona";

// ── Plan de clips ────────────────────────────────────────────────────────────────────────────────────────

/** Quién sale en un clip: «A» es el protagonista del proyecto y «B» el segundo personaje. */
export type Hablante = "A" | "B";

export interface ClipPlanificado {
  /** Posición en el vídeo, desde 1. */
  orden: number;
  segundos: number;
  /** Quién sale en el plano y puede hablar: uno en una persona y en podcast, los dos en entrevista. */
  presentes: Hablante[];
}

/**
 * **Plan de clips** de un vídeo: cuántos, de cuántos segundos y quién sale en cada uno.
 *
 * - 20 s: 10 + 10 s en una persona y en entrevista (el intercambio cabe dentro de cada clip); 8 + 6 + 6 s en
 *   podcast, para que haya ida, vuelta y cierre (A, B, A) con plano y contraplano;
 * - ≈ 1 min y ≈ 3 min: clips de 8 s (8 y 23). En podcast se alternan A y B.
 */
export function planDeClips(duracion: DuracionVideo, tipo: TipoPieza): ClipPlanificado[] {
  const segundos =
    duracion === 20
      ? tipo === "podcast"
        ? [8, 6, 6]
        : [10, 10]
      : Array.from({ length: CLIPS_LARGOS[duracion] }, () => SEGUNDOS_CLIP_LARGO);
  return segundos.map((s, indice) => ({
    orden: indice + 1,
    segundos: s,
    presentes: tipo === "entrevista" ? ["A", "B"] : tipo === "podcast" && indice % 2 === 1 ? ["B"] : ["A"],
  }));
}

/** Segundos que suma un plan: es lo que dura el montaje. */
export const segundosDelPlan = (plan: readonly ClipPlanificado[]): number => plan.reduce((s, c) => s + c.segundos, 0);

/** Ritmo del habla que se pide: 2,5 palabras por segundo (25 en 10 s, 20 en 8 s, 15 en 6 s). */
export const PALABRAS_POR_SEGUNDO = 2.5;

export const palabrasMaximas = (segundos: number): number => Math.floor(segundos * PALABRAS_POR_SEGUNDO);

export const contarPalabras = (texto: string): number =>
  texto.split(/\s+/).filter((p) => /[\p{L}\p{N}]/u.test(p)).length;

// ── Bloques y coste ──────────────────────────────────────────────────────────────────────────────────────

/** Clips por bloque en los guiones largos: una salida pequeña no se corta y repetirla es barato. */
export const CLIPS_POR_BLOQUE = 8;

/** `true` si el guion se escribe en biblia + bloques; 20 s se escribe en una sola llamada. */
export const porBloques = (duracion: DuracionVideo): boolean => duracion !== 20;

/** Trozos de ≤ 8 clips del plan, en orden. En 20 s es un solo trozo con todo. */
export function bloquesDe(plan: readonly ClipPlanificado[]): ClipPlanificado[][] {
  const bloques: ClipPlanificado[][] = [];
  for (let i = 0; i < plan.length; i += CLIPS_POR_BLOQUE) bloques.push(plan.slice(i, i + CLIPS_POR_BLOQUE));
  return bloques;
}

/** Llamadas al modelo de texto de un guion: 1 en 20 s; 1 de biblia + 1 por bloque en las largas. */
export function llamadasDelGuion(duracion: DuracionVideo, tipo: TipoPieza = "una_persona"): number {
  if (!porBloques(duracion)) return 1;
  return 1 + bloquesDe(planDeClips(duracion, tipo)).length;
}

/**
 * Llamadas de reserva que se confirman aparte: si un trozo llega cortado o no cabe en sus segundos, se repite una
 * vez **dentro de lo confirmado**; y si la entrada principal del mapa de texto falla (un servicio de cuota
 * saturado, por ejemplo), la reserva de pago puede escribir dentro de ese mismo margen. Si no hace falta, no se gasta.
 */
export const LLAMADAS_DE_RESERVA = 1;

export interface CosteDelGuion {
  llamadas: number;
  /** Créditos de las llamadas que se van a hacer seguro. */
  creditosLlamadas: number;
  /** Créditos de la llamada de reserva, enseñados aparte. */
  creditosReserva: number;
  /** Lo que se confirma: las llamadas más la reserva. El gasto real nunca lo supera. */
  total: number;
}

const creditosEnteros = (creditos: number) => Math.max(0, Math.ceil(creditos));

/**
 * Coste del guion completo con el precio de una llamada de la entrada principal y el de la reserva de pago más cara
 * del mapa (0 si no hay ninguna). Es la misma cuenta en la pantalla y en el servidor.
 *
 * La llamada de reserva se cobra, como mucho, a lo que cueste **la más cara de las que la pueden hacer**: repetir un
 * trozo lo hace la principal, y escribir cuando la principal falla, la reserva de pago. Sin `creditosReserva`, la
 * reserva cuesta lo que la principal, como hasta la 0.56.0.
 */
export function costeDelGuion(
  creditosPorLlamada: number,
  duracion: DuracionVideo,
  tipo?: TipoPieza,
  creditosReservaPorLlamada = 0,
): CosteDelGuion {
  const llamadas = llamadasDelGuion(duracion, tipo);
  const porLlamada = creditosEnteros(creditosPorLlamada);
  const creditosLlamadas = llamadas * porLlamada;
  const creditosReserva = LLAMADAS_DE_RESERVA * Math.max(porLlamada, creditosEnteros(creditosReservaPorLlamada));
  return { llamadas, creditosLlamadas, creditosReserva, total: creditosLlamadas + creditosReserva };
}

/**
 * Coste de un guion de escenas sueltas: una llamada a la principal más, si hay reserva de pago en el mapa, la
 * llamada de reserva a su precio. Aquí no hay trozos que repetir, así que sin reserva de pago no se suma nada.
 */
export function costeDeEscenasSueltas(creditosPorLlamada: number, creditosReservaPorLlamada = 0): CosteDelGuion {
  const creditosLlamadas = creditosEnteros(creditosPorLlamada);
  const creditosReserva = LLAMADAS_DE_RESERVA * creditosEnteros(creditosReservaPorLlamada);
  return { llamadas: 1, creditosLlamadas, creditosReserva, total: creditosLlamadas + creditosReserva };
}

// ── Opciones que se ofrecen ──────────────────────────────────────────────────────────────────────────────

/** Lo que decide qué opciones se ofrecen, leído por el servidor del proyecto y de Admin › Ajustes. */
export interface CondicionesVideoCompleto {
  /** Modo de voz del proyecto: el vídeo completo se produce con «Voz e identidad registradas». */
  modoVoz: string;
  tieneProtagonista: boolean;
  largasActivas: boolean;
  podcastActivo: boolean;
  dualcastActivo: boolean;
  escenasMaximas: number;
  segundosMaximos: number;
}

export interface OpcionDuracion {
  duracion: DuracionVideo;
  etiqueta: string;
  /** Por qué no se puede elegir; `null` si se puede. */
  motivo: string | null;
}

export interface OpcionTipo {
  tipo: TipoPieza;
  motivo: string | null;
}

export interface OpcionesVideoCompleto {
  /** Por qué no se puede escribir ningún vídeo completo en este proyecto; `null` si se puede. */
  motivo: string | null;
  /** Solo las visibles: 20 s siempre, y las largas con el ajuste encendido. */
  duraciones: OpcionDuracion[];
  tipos: OpcionTipo[];
}

export const MOTIVO_LARGAS_CERRADAS =
  "Las duraciones de 1 y 3 minutos no están abiertas en esta instalación: de momento el vídeo completo dura 20 s.";

/** Por qué no se puede escribir un vídeo completo en el proyecto; `null` si se puede. */
export function motivoDelProyecto(c: CondicionesVideoCompleto): string | null {
  if (c.modoVoz !== "omni") {
    return "El vídeo completo se produce con la voz e identidad registradas: cambia el modo de voz del proyecto a «Voz e identidad registradas» antes de escribirlo.";
  }
  if (!c.tieneProtagonista) return "Elige primero el protagonista del proyecto: es quien habla en el vídeo.";
  return null;
}

/** Por qué no se puede pedir esa duración con ese tipo; `null` si se puede. */
export function motivoDuracion(duracion: DuracionVideo, tipo: TipoPieza, c: CondicionesVideoCompleto): string | null {
  if (esDuracionLarga(duracion) && !c.largasActivas) return MOTIVO_LARGAS_CERRADAS;
  const plan = planDeClips(duracion, tipo);
  if (plan.length > c.escenasMaximas) {
    return `Este vídeo necesita ${plan.length} escenas y el máximo de esta instalación son ${c.escenasMaximas}. Pídele a quien la administra que lo suba en Admin › Ajustes.`;
  }
  const segundos = segundosDelPlan(plan);
  if (segundos > c.segundosMaximos) {
    return `Este vídeo dura ${segundos} s y el montaje de esta instalación admite como mucho ${c.segundosMaximos} s. Pídele a quien la administra que lo suba en Admin › Ajustes.`;
  }
  return null;
}

/** Por qué no se puede pedir ese tipo de pieza; `null` si se puede. */
export function motivoTipo(tipo: TipoPieza, c: CondicionesVideoCompleto): string | null {
  if (tipo === "entrevista" && !c.dualcastActivo) {
    return "La entrevista usa el formato dualcast, que está desactivado en esta instalación: pídeselo a quien la administra.";
  }
  if (tipo === "podcast" && !c.podcastActivo) {
    return "El podcast está desactivado en esta instalación: pídeselo a quien la administra.";
  }
  return null;
}

/** Opciones del vídeo completo para la pantalla. Las duraciones largas ni aparecen con el ajuste apagado. */
export function opcionesDeVideoCompleto(
  c: CondicionesVideoCompleto,
  tipo: TipoPieza = "una_persona",
): OpcionesVideoCompleto {
  return {
    motivo: motivoDelProyecto(c),
    duraciones: DURACIONES_VIDEO.filter((d) => !esDuracionLarga(d) || c.largasActivas).map((duracion) => ({
      duracion,
      etiqueta: ETIQUETA_DURACION_VIDEO[duracion],
      motivo: motivoDuracion(duracion, tipo, c),
    })),
    tipos: TIPOS_PIEZA.map((t) => ({ tipo: t, motivo: motivoTipo(t, c) })),
  };
}

// ── Lo que devuelve el modelo ────────────────────────────────────────────────────────────────────────────

/** Planos que se le ofrecen al modelo, con la clave de preset de plano a la que corresponden. */
export const PLANOS_DEL_MODELO = {
  wide: "general",
  medium_full: "americano",
  medium: "medio",
  close_up: "primer-plano",
  extreme_close_up: "primerisimo",
} as const;

export interface TurnoGuion {
  hablante: Hablante;
  /** Lo que se dice, literal y en castellano. */
  texto: string;
}

export interface ClipGuion {
  orden: number;
  segundos: number;
  presentes: Hablante[];
  /** Clave de preset de plano; vacía si el modelo no dijo una conocida. */
  plano: string;
  /** Lo que se ve, en castellano. */
  accion: string;
  turnos: TurnoGuion[];
}

export interface BibliaGuion {
  concepto: string;
  /** Papel (en castellano) y vestuario (en inglés, es una instrucción visual) de cada personaje. */
  personajes: { hablante: Hablante; papel: string; vestuario: string }[];
  lugar: string;
  /** Objetivo de cada bloque, en orden: es lo que mantiene el arco entre llamadas. */
  arco: string[];
}

export type CausaDeBloque = "truncado" | "formato" | "recuento" | "palabras" | "hablante";

/**
 * El modelo ha contestado algo que no se puede usar como este trozo del guion. Se repite **solo este trozo** una
 * vez, con la causa en inglés para el modelo (`causaParaElModelo`) y en castellano para quien lo lee (`message`).
 */
export class ErrorDeBloque extends Error {
  constructor(
    readonly causa: CausaDeBloque,
    mensaje: string,
    readonly causaParaElModelo: string,
  ) {
    super(mensaje);
    this.name = "ErrorDeBloque";
  }
}

const TEXTO_CORTO = 300;

/** Objeto JSON de la respuesta, distinguiendo una respuesta cortada de una que no trae JSON. */
function objetoDe(crudo: string): Record<string, unknown> {
  const objeto = primerObjetoJson(crudo);
  if (objeto) return objeto;
  if (typeof crudo === "string" && crudo.includes("{")) {
    throw new ErrorDeBloque(
      "truncado",
      "la respuesta llegó cortada a mitad",
      "your answer was cut off before the JSON object was closed; keep it shorter",
    );
  }
  throw new ErrorDeBloque(
    "formato",
    "la respuesta no traía un guion legible",
    "your answer did not contain the JSON object requested",
  );
}

/** Lee la biblia de un guion largo. Tiene que traer concepto y un objetivo por bloque, ni más ni menos. */
export function leerBiblia(crudo: string, bloques: number): BibliaGuion {
  const objeto = objetoDe(crudo);
  const concepto = limpiarTextoDePrompt(objeto.concept, CONCEPTO_MAXIMO);
  if (concepto === "") {
    throw new ErrorDeBloque("formato", "el plan del guion no traía concepto", 'the plan had no "concept"');
  }
  const arco = (Array.isArray(objeto.arc) ? objeto.arc : []).map((o) => limpiarTextoDePrompt(o, TEXTO_CORTO));
  if (arco.length !== bloques || arco.some((o) => o === "")) {
    throw new ErrorDeBloque(
      "recuento",
      `el plan del guion traía ${arco.length} partes y hacían falta ${bloques}`,
      `"arc" must have exactly ${bloques} non-empty goals`,
    );
  }
  const personajes = (Array.isArray(objeto.characters) ? objeto.characters : []).flatMap((p) => {
    const c = (p ?? {}) as Record<string, unknown>;
    if (c.speaker !== "A" && c.speaker !== "B") return [];
    return [
      {
        hablante: c.speaker as Hablante,
        papel: limpiarTextoDePrompt(c.role, TEXTO_CORTO),
        vestuario: limpiarTextoDePrompt(c.wardrobe, TEXTO_CORTO),
      },
    ];
  });
  return { concepto, personajes, lugar: limpiarTextoDePrompt(objeto.setting, TEXTO_CORTO), arco };
}

/**
 * Lee un trozo del guion y lo comprueba contra su plan: el mismo número de clips, cada turno de alguien que sale
 * en ese plano y ningún clip por encima de sus palabras. Cualquier fallo es un `ErrorDeBloque` con su causa.
 */
export function leerBloque(
  crudo: string,
  plan: readonly ClipPlanificado[],
): { concepto: string; clips: ClipGuion[]; continuidad: ContinuidadGuion } {
  const objeto = objetoDe(crudo);
  const crudos = Array.isArray(objeto.clips) ? objeto.clips : [];
  if (crudos.length !== plan.length) {
    throw new ErrorDeBloque(
      "recuento",
      `traía ${crudos.length} clips y hacían falta ${plan.length}`,
      `write exactly ${plan.length} clips, you wrote ${crudos.length}`,
    );
  }
  const clips = plan.map((planificado, indice) => leerClip(crudos[indice], planificado));
  return {
    concepto: limpiarTextoDePrompt(objeto.concept, CONCEPTO_MAXIMO),
    clips,
    continuidad: leerContinuidad(objeto),
  };
}

/** Vestuario fijo de cada personaje y lugar del vídeo, en inglés. Vacíos si el modelo no los dio. */
export interface ContinuidadGuion {
  lugar: string;
  vestuario: Partial<Record<Hablante, string>>;
}

/**
 * Lee el vestuario y el lugar que acompañan al guion. **No es motivo de repetir nada**: si faltan o vienen mal, el
 * vídeo se hace igual con la ficha de cada personaje y el lugar elegido; repetir el trozo costaría una llamada por
 * algo que solo refuerza la continuidad.
 */
export function leerContinuidad(objeto: Record<string, unknown>): ContinuidadGuion {
  const vestuario: Partial<Record<Hablante, string>> = {};
  for (const p of Array.isArray(objeto.characters) ? objeto.characters : []) {
    const c = (p ?? {}) as Record<string, unknown>;
    const ropa = limpiarTextoDePrompt(c.wardrobe, TEXTO_CORTO).trim();
    if ((c.speaker === "A" || c.speaker === "B") && ropa !== "") vestuario[c.speaker] = ropa;
  }
  return { lugar: limpiarTextoDePrompt(objeto.setting, TEXTO_CORTO).trim(), vestuario };
}

function leerClip(crudo: unknown, plan: ClipPlanificado): ClipGuion {
  const c = (crudo ?? {}) as Record<string, unknown>;
  const turnosCrudos = Array.isArray(c.turns) ? c.turns : [];
  const turnos: TurnoGuion[] = [];
  for (const entrada of turnosCrudos) {
    const t = (entrada ?? {}) as Record<string, unknown>;
    const texto = limpiarTextoDePrompt(t.text, TEXTO_TURNO_MAXIMO).trim();
    if (texto === "") continue;
    if (t.speaker !== "A" && t.speaker !== "B") {
      throw new ErrorDeBloque(
        "hablante",
        `el clip ${plan.orden} tenía una frase sin decir quién la dice`,
        `every turn of clip ${plan.orden} needs "speaker" set to one of: ${plan.presentes.join(", ")}`,
      );
    }
    if (!plan.presentes.includes(t.speaker)) {
      throw new ErrorDeBloque(
        "hablante",
        `en el clip ${plan.orden} habla quien no sale en ese plano`,
        `in clip ${plan.orden} only ${plan.presentes.join(" and ")} may speak`,
      );
    }
    turnos.push({ hablante: t.speaker, texto });
  }
  if (turnos.length === 0) {
    throw new ErrorDeBloque(
      "formato",
      `el clip ${plan.orden} no tenía diálogo`,
      `clip ${plan.orden} has no dialogue; every clip needs at least one spoken turn`,
    );
  }
  if (turnos.length > TURNOS_MAXIMOS) {
    throw new ErrorDeBloque(
      "formato",
      `el clip ${plan.orden} tenía ${turnos.length} turnos y caben ${TURNOS_MAXIMOS}`,
      `clip ${plan.orden} may have at most ${TURNOS_MAXIMOS} turns`,
    );
  }
  const palabras = contarPalabras(turnos.map((t) => t.texto).join(" "));
  const maximo = palabrasMaximas(plan.segundos);
  if (palabras > maximo) {
    throw new ErrorDeBloque(
      "palabras",
      `el clip ${plan.orden} tenía ${palabras} palabras y en ${plan.segundos} s caben ${maximo}`,
      `clip ${plan.orden} has ${palabras} words but only ${maximo} fit in ${plan.segundos} seconds; shorten it`,
    );
  }
  const plano = typeof c.shot === "string" ? (PLANOS_DEL_MODELO as Record<string, string>)[c.shot] : undefined;
  return {
    orden: plan.orden,
    segundos: plan.segundos,
    presentes: plan.presentes,
    plano: plano ?? "",
    accion: limpiarTextoDePrompt(c.action, ACCION_MAXIMA),
    turnos,
  };
}

// ── Repetir un trozo que no sirve ────────────────────────────────────────────────────────────────────────

/** Llamadas de reserva que le quedan a un guion: se comparten entre todos sus trozos. */
export interface ReservaDeLlamadas {
  quedan: number;
}

/** Un trozo que no ha servido y ya no se puede repetir: qué falló, qué contestó y si ya se había repetido. */
export class ErrorTrozoInservible<R> extends Error {
  constructor(
    readonly fallo: ErrorDeBloque,
    readonly respuesta: R,
    readonly repetido: boolean,
  ) {
    super(fallo.message);
    this.name = "ErrorTrozoInservible";
  }
}

/**
 * Pide un trozo y lo lee. Si lo que contesta no sirve (`ErrorDeBloque`) y al guion le queda reserva, lo pide **una
 * vez más**, solo ese trozo, con la causa para el modelo; la repetición gasta la reserva. Si vuelve a fallar, o no
 * queda reserva, lanza `ErrorTrozoInservible`. Cualquier otro error (el proveedor no contesta) sale tal cual.
 */
export async function trozoConReintento<T, R extends { texto: string }>(opciones: {
  reserva: ReservaDeLlamadas;
  /** Hace la llamada número `intento` (0 la primera), con la causa del fallo anterior si la hay. */
  pedir: (intento: number, causaParaElModelo: string | undefined) => Promise<R>;
  leer: (texto: string) => T;
  /** Se avisa de cada respuesta que no ha servido, antes de decidir si se repite. */
  alFallar?: (intento: number, respuesta: R, fallo: ErrorDeBloque) => Promise<void>;
}): Promise<{ valor: T; respuesta: R; intento: number }> {
  let causa: string | undefined;
  for (let intento = 0; ; intento++) {
    const respuesta = await opciones.pedir(intento, causa);
    try {
      return { valor: opciones.leer(respuesta.texto), respuesta, intento };
    } catch (error) {
      if (!(error instanceof ErrorDeBloque)) throw error;
      await opciones.alFallar?.(intento, respuesta, error);
      if (intento > 0 || opciones.reserva.quedan <= 0) throw new ErrorTrozoInservible(error, respuesta, intento > 0);
      opciones.reserva.quedan--;
      causa = error.causaParaElModelo;
    }
  }
}

/** Los últimos turnos de un trozo: el siguiente los recibe para seguir la conversación sin repetirla. */
export function ultimosTurnos(clips: readonly ClipGuion[], cuantos = 2): TurnoGuion[] {
  return clips.flatMap((c) => c.turnos).slice(-cuantos);
}

// ── Del guion a las escenas ──────────────────────────────────────────────────────────────────────────────

/** Una escena tal como se guarda: un clip, con su reparto y sus turnos ya con personajes de verdad. */
export interface EscenaDelGuion {
  texto: string;
  accion: string;
  segundos: number;
  plano: string;
  /** `dualcast` en entrevista; `solo` en una persona y en cada plano de un podcast. */
  formato: "solo" | "dualcast";
  /** En un podcast, el mismo valor en todos sus planos: es lo que los empareja en el montaje. */
  grupoPodcast: string | null;
  /** Quién sale, en orden (posición 1 y 2). */
  reparto: string[];
  /** Turnos repartidos; vacío en escenas `solo`, donde el texto de la escena es la fuente. */
  turnos: { personajeId: string; texto: string }[];
}

/**
 * Convierte los clips del guion en escenas. En entrevista son dualcast con sus dos personajes y los turnos; en
 * podcast cada plano es una escena `solo` con **su** personaje y el grupo común; en una persona, `solo` con el
 * protagonista. El texto de la escena es el diálogo plano, literal: es lo que se oye y lo que se revisa.
 */
export function escenasDeLosClips(
  clips: readonly ClipGuion[],
  tipo: TipoPieza,
  personajes: Readonly<Record<Hablante, string | null>>,
  grupoPodcast: string | null,
): EscenaDelGuion[] {
  const idDe = (h: Hablante): string => {
    const id = personajes[h];
    if (!id) throw new Error(`Falta el personaje ${h} del guion.`);
    return id;
  };
  return clips.map((clip) => {
    const texto = clip.turnos.map((t) => t.texto).join(" ");
    const reparto = clip.presentes.map(idDe);
    const dualcast = tipo === "entrevista";
    return {
      texto,
      accion: clip.accion,
      segundos: clip.segundos,
      plano: clip.plano,
      formato: dualcast ? "dualcast" : "solo",
      grupoPodcast: tipo === "podcast" ? grupoPodcast : null,
      reparto,
      turnos: dualcast ? clip.turnos.map((t) => ({ personajeId: idDe(t.hablante), texto: t.texto })) : [],
    };
  });
}
