import type { DecisionVista } from "./coherencia";
import type { Medio } from "./media/tipos";

/**
 * Revisión de continuidad de las escenas producidas (RF07) tal como la comparten el servidor y el navegador.
 *
 * Aquí no hay ninguna lectura, ninguna llamada y ninguna regla de dinero: solo los estados, sus etiquetas y las
 * funciones puras que los combinan. Quién puede revisar y qué bloquea lo decide el servidor.
 *
 * La regla que gobierna este fichero es una: **la comprobación automática es técnica, no de identidad**. Mide lo
 * que se puede medir de un archivo (que exista, cuánto dura, cómo es de grande, si lleva audio, si hay tramos
 * negros o congelados) y nunca dice si el personaje sigue siendo el mismo. Eso lo valida una persona, y la
 * revisión multimodal de pago solo le aporta una opinión más.
 */

// ── Comprobaciones técnicas ───────────────────────────────────────────────────────────────────────────────

/**
 * Comprobaciones que se hacen **sin coste** sobre el clip descargado (decisión provisional del propietario,
 * 2026-09-27: se empieza por lo que no cuesta nada y la identidad la valida el humano):
 *
 * - `archivo`: ffprobe lo lee y tiene pista de vídeo. Un clip vacío o corrupto falla aquí y no se mide más;
 * - `duracion`: los segundos reales frente a los planificados en la escena;
 * - `resolucion`: el lado menor real frente al que se pidió;
 * - `proporcion`: la proporción real frente a la que se pidió;
 * - `audio`: si el clip lleva pista de audio;
 * - `planos`: segundos de metraje negro o congelado.
 */
export const COMPROBACIONES_CLIP = ["archivo", "duracion", "resolucion", "proporcion", "audio", "planos"] as const;
export type ComprobacionClip = (typeof COMPROBACIONES_CLIP)[number];

export const ETIQUETA_COMPROBACION: Record<ComprobacionClip, string> = {
  archivo: "El archivo se puede leer",
  duracion: "Duración",
  resolucion: "Resolución",
  proporcion: "Proporción",
  audio: "Audio",
  planos: "Tramos negros o congelados",
};

/**
 * Resultado de una comprobación. `no_medible` existe porque **no medir no es aprobar**: si ffprobe no informa de
 * los fotogramas por segundo, lo honesto es decir que no se sabe, no pintar un visto.
 */
export const RESULTADOS_COMPROBACION = ["pasa", "falla", "no_medible"] as const;
export type ResultadoComprobacion = (typeof RESULTADOS_COMPROBACION)[number];

/** Gravedad de un hallazgo. Solo `critica` impide exportar. */
export const SEVERIDADES_REVISION = ["informativa", "aviso", "critica"] as const;
export type SeveridadRevision = (typeof SEVERIDADES_REVISION)[number];

const GRAVEDAD: Record<SeveridadRevision, number> = { informativa: 0, aviso: 1, critica: 2 };

export const ETIQUETA_SEVERIDAD: Record<SeveridadRevision, string> = {
  informativa: "Sin hallazgos",
  aviso: "Con avisos",
  critica: "Fallo crítico",
};

export const DESCRIPCION_SEVERIDAD: Record<SeveridadRevision, string> = {
  informativa: "Todo lo que se puede medir está en orden. Que el personaje siga siendo el mismo lo decides tú.",
  aviso: "Hay algo que conviene mirar, pero no impide seguir.",
  critica: "Hay un fallo que impide exportar el proyecto hasta que se resuelva.",
};

/** El peor de una lista de severidades. Sin elementos, `informativa`. */
export const peorSeveridad = (severidades: readonly SeveridadRevision[]): SeveridadRevision =>
  severidades.reduce<SeveridadRevision>((peor, s) => (GRAVEDAD[s] > GRAVEDAD[peor] ? s : peor), "informativa");

/**
 * Una comprobación ya hecha, tal como se guarda y se muestra. Lleva **el valor medido y el pedido**: decir
 * «falla la duración» sin decir cuánto dura no permite decidir nada.
 */
export interface ComprobacionRevision {
  clave: ComprobacionClip;
  resultado: ResultadoComprobacion;
  /** Gravedad de esta comprobación **tal como ha quedado**: `informativa` cuando pasa. */
  severidad: SeveridadRevision;
  /** Valor medido, en lenguaje llano. Vacío cuando no se ha podido medir. */
  medido: string;
  /** Valor que se pedía, en lenguaje llano. */
  esperado: string;
  /** Por qué, en lenguaje llano. Nunca vacío. */
  motivo: string;
}

/**
 * Comprobaciones cuyo fallo es **objetivamente crítico** (decisión provisional del propietario, 2026-09-27):
 * formato o duración incorrectos y clip vacío o corrupto. No se salvan aceptándolas, porque no son una cuestión
 * de gusto: se salvan regenerando la escena. Las demás avisan.
 */
export const COMPROBACIONES_CRITICAS: readonly ComprobacionClip[] = ["archivo", "duracion", "resolucion", "proporcion"];

export const esComprobacionCritica = (clave: ComprobacionClip): boolean => COMPROBACIONES_CRITICAS.includes(clave);

/** Severidad de una comprobación según cómo haya quedado. `no_medible` avisa: no saber no es aprobar. */
export function severidadDeComprobacion(clave: ComprobacionClip, resultado: ResultadoComprobacion): SeveridadRevision {
  if (resultado === "pasa") return "informativa";
  if (resultado === "no_medible") return "aviso";
  return esComprobacionCritica(clave) ? "critica" : "aviso";
}

// ── Revisiones ────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Quién o qué hizo la revisión:
 *
 * - `automatica`: las comprobaciones técnicas con ffprobe, sin coste;
 * - `humana`: la decisión del dueño del proyecto, que es la única que valida la identidad;
 * - `multimodal`: una opinión de un modelo que mira el clip. **Cuesta dinero**, así que nunca se lanza sola.
 */
export const TIPOS_REVISION = ["automatica", "humana", "multimodal"] as const;
export type TipoRevision = (typeof TIPOS_REVISION)[number];

export const ETIQUETA_TIPO_REVISION: Record<TipoRevision, string> = {
  automatica: "Comprobación automática",
  humana: "Tu revisión",
  multimodal: "Opinión del modelo",
};

/** Veredicto de una revisión. `pendiente` es el de la multimodal: aporta información, no decide. */
export const VEREDICTOS_REVISION = ["acepta", "rechaza", "pendiente"] as const;
export type VeredictoRevision = (typeof VEREDICTOS_REVISION)[number];

export const ETIQUETA_VEREDICTO: Record<VeredictoRevision, string> = {
  acepta: "Aceptada",
  rechaza: "Rechazada",
  pendiente: "Sin decidir",
};

/** Acciones de revisión humana que ofrece la pantalla. Cada una deja su propia fila. */
export const ACCIONES_REVISION = ["aceptar", "rechazar", "marcar-critico"] as const;
export type AccionRevision = (typeof ACCIONES_REVISION)[number];

export const esAccionRevision = (v: unknown): v is AccionRevision => ACCIONES_REVISION.includes(v as AccionRevision);

/** Longitud mínima del motivo al rechazar o marcar como crítico: «no me gusta» no dice qué arreglar. */
export const MOTIVO_MINIMO = 10;
export const MOTIVO_MAXIMO = 1000;

/** Una revisión ya hecha, tal como viaja al navegador. Nunca lleva el prompt ni nada del servidor (ADR-0022). */
export interface RevisionVista {
  id: string;
  tipo: TipoRevision;
  severidad: SeveridadRevision;
  veredicto: VeredictoRevision;
  comprobaciones: ComprobacionRevision[];
  /** Notas del revisor o el resumen que devolvió el modelo. Vacío si no hay ninguna. */
  notas: string;
  /** Créditos que costó, si costó algo. `null` en las que no cuestan nada. */
  creditos: number | null;
  /** Versión del conjunto de reglas con el que se comprobó (RF13). */
  reglasVersion: string;
  /** Por qué dejó de valer, si dejó de valer. Vacío mientras siga vigente. */
  motivoInvalidacion: string;
  /** `true` cuando una regeneración o un cambio de versión del personaje la dejó sin valor. */
  invalidada: boolean;
  creadoEn: string;
}

/**
 * `true` cuando esa revisión mantiene un **crítico abierto**: es crítica, sigue vigente y nadie la ha aceptado.
 *
 * Un crítico de la comprobación automática no se acepta (`COMPROBACIONES_CRITICAS` son hechos técnicos: se
 * regenera la escena). Uno que marcó una persona se cierra con una revisión humana posterior que lo acepte.
 */
export const mantieneCritico = (revision: RevisionVista): boolean =>
  !revision.invalidada && revision.severidad === "critica" && revision.veredicto !== "acepta";

/** Estado de revisión de una escena: su clip, sus referencias y la última revisión de cada tipo. */
export interface EscenaRevisionVista {
  id: string;
  orden: number;
  resumen: string;
  segundos: number;
  /** Clip que se revisa; `null` cuando la escena todavía no tiene ninguno. */
  clip: Medio | null;
  /** Fotograma que el usuario aprobó, para comparar lado a lado. */
  fotogramaAprobado: Medio | null;
  /** Hoja de personaje de la versión con la que se generó, si la hay. Es la referencia de identidad. */
  hojaDePersonaje: Medio | null;
  /** Última revisión vigente de cada tipo; `null` la que no se haya hecho. */
  automatica: RevisionVista | null;
  humana: RevisionVista | null;
  multimodal: RevisionVista | null;
  /** Historial completo, de lo más reciente a lo más antiguo, incluidas las invalidadas. */
  historial: RevisionVista[];
  /** Severidad vigente de la escena: la peor de sus revisiones vigentes. */
  severidad: SeveridadRevision;
  /** `true` cuando esta escena mantiene un crítico abierto y por tanto bloquea la exportación. */
  bloquea: boolean;
  /** Por qué bloquea, en lenguaje llano y con su acción. Vacío cuando no bloquea. */
  motivoBloqueo: string;
  /**
   * Decisiones de coherencia vigentes de esta escena (0.24.0). Van **en sombra**: se enseñan con su evidencia y su
   * confianza, y no bloquean nada ni cuentan para la severidad. Lista vacía mientras no se haya comprobado.
   */
  coherencia: DecisionVista[];
}

/** Estado de revisión del proyecto entero: es lo que pinta `/proyectos/[id]/revision`. */
export interface RevisionProyectoVista {
  proyectoId: string;
  titulo: string;
  escenas: EscenaRevisionVista[];
  /** Escenas con clip, que son las únicas revisables. */
  revisables: number;
  /** Escenas con un crítico abierto. Mientras no sea 0, la exportación está bloqueada. */
  criticosAbiertos: number;
  /** La revisión multimodal está encendida en esta instalación y hay un modelo utilizable. */
  multimodalDisponible: boolean;
  /** Por qué no está disponible, en lenguaje llano. Vacío cuando sí lo está. */
  motivoSinMultimodal: string;
  /** Lo que costaría una revisión multimodal de una escena, en créditos, y el sello de ese precio. */
  creditosPorMultimodal: number;
  selloMultimodal: string;
  /** Umbral de aviso por gasto alto de la instalación, para pedir la casilla cuando el servidor la va a exigir. */
  umbralAvisoCreditos: number;
}

// ── Funciones puras de la pantalla ────────────────────────────────────────────────────────────────────────

/** Severidad vigente de una escena a partir de sus revisiones vigentes. */
export const severidadDeEscena = (revisiones: readonly (RevisionVista | null)[]): SeveridadRevision =>
  peorSeveridad(revisiones.filter((r): r is RevisionVista => r !== null && !r.invalidada).map((r) => r.severidad));

/** `true` cuando la escena ya tiene clip y por tanto se puede revisar. */
export const esRevisable = (escena: EscenaRevisionVista): boolean => escena.clip !== null;

/**
 * `true` cuando falta la revisión humana de una escena que ya se puede revisar. La comprobación automática no
 * sustituye a la persona: mide el archivo, no la identidad.
 */
export const faltaRevisionHumana = (escena: EscenaRevisionVista): boolean =>
  esRevisable(escena) && (escena.humana === null || escena.humana.invalidada);

/**
 * Lo que impide exportar, escena a escena y en lenguaje llano. Es lo que el aviso de exportación enumera, y sale
 * de los mismos datos que el motor de reglas usa para bloquearla: la pantalla no puede decir una cosa y la puerta
 * otra.
 */
export function bloqueosDeExportacion(escenas: readonly EscenaRevisionVista[]): string[] {
  return escenas.filter((e) => e.bloquea).map((e) => `Escena ${e.orden}: ${e.motivoBloqueo}`);
}

/** Texto del aviso de exportación. Nunca promete exportar lo que la regla va a bloquear. */
export function textoDeBloqueo(escenas: readonly EscenaRevisionVista[]): string {
  const bloqueos = bloqueosDeExportacion(escenas);
  if (bloqueos.length === 0) return "Ninguna escena tiene un fallo crítico abierto: nada bloquea la exportación.";
  return bloqueos.length === 1
    ? "Una escena tiene un fallo crítico abierto y no se puede exportar el proyecto hasta que se resuelva."
    : `${bloqueos.length} escenas tienen un fallo crítico abierto y no se puede exportar el proyecto hasta que se resuelvan.`;
}

/**
 * Qué se le dice al usuario de lo que la comprobación automática **no** garantiza. Se muestra siempre junto a sus
 * resultados: un panel con seis vistos verdes invita a pensar que el personaje está validado, y no lo está.
 */
export const LIMITE_DE_LO_AUTOMATICO =
  "La comprobación automática solo mide el archivo: que se pueda leer, cuánto dura, cómo es de grande, si lleva audio y si hay tramos negros o congelados. No comprueba que el personaje sea el mismo, ni que la escena cuente lo que querías: eso lo decides tú mirando el clip junto a la hoja de personaje.";
