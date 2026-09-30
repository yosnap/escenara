import type { EstadoControl, EvaluacionVista } from "./controles";
import { type Acento, DIRECCION_ELEGIDA_VACIA, type DireccionElegida, type ReferenciaIdentidad } from "./direccion";
import type { FormatoMontaje } from "./formatos";
import type { FotoDeProductoDelClip } from "./foto-de-producto";
import { formatearCreditos, formatearEuros } from "./generacion";
import type { LugarDeEscena } from "./lugares";
import type { Medio } from "./media/tipos";
import type { ProductoElegido } from "./productos";

/**
 * Proyectos, escenas y afirmaciones (RF05, 0.17.0) tal como los comparten el servidor y el navegador. Aquí
 * no hay nada que dependa de una credencial ni de la base de datos: solo los tipos, sus etiquetas, sus
 * límites y las funciones puras que componen los textos del plan.
 *
 * Reglas que viven en este fichero porque tienen que decir lo mismo en las dos orillas:
 *
 * - una estimación **siempre** se muestra con la palabra «estimación» y con la fecha del precio usado;
 * - un plan que se pasa del presupuesto autorizado del proyecto **no se puede aprobar**;
 * - una escena aprobada deja de estarlo en cuanto se edita, y se dice por qué.
 */

// ── Proyecto ─────────────────────────────────────────────────────────────────────────────────────────────

export const ESTADOS_PROYECTO = ["borrador", "planificado", "en_produccion", "listo"] as const;
export type EstadoProyecto = (typeof ESTADOS_PROYECTO)[number];

export const esEstadoProyecto = (v: unknown): v is EstadoProyecto => ESTADOS_PROYECTO.includes(v as EstadoProyecto);

export const ETIQUETA_ESTADO_PROYECTO: Record<EstadoProyecto, string> = {
  borrador: "Borrador",
  planificado: "Plan aprobado",
  en_produccion: "En producción",
  listo: "Listo",
};

export const DESCRIPCION_ESTADO_PROYECTO: Record<EstadoProyecto, string> = {
  borrador: "Todavía se está escribiendo: nada se ha aprobado y nada se puede generar.",
  planificado: "El plan está aprobado con su coste estimado. Las escenas aprobadas ya se pueden producir.",
  en_produccion: "Hay escenas generándose o ya generadas.",
  listo: "Todas las escenas están producidas.",
};

/** Formato del proyecto: decide qué se le pide al asistente y qué duración se espera por escena. */
export const FORMATOS_PROYECTO = ["reel_vertical", "corto", "anuncio", "explicativo"] as const;
export type FormatoProyecto = (typeof FORMATOS_PROYECTO)[number];

export const esFormatoProyecto = (v: unknown): v is FormatoProyecto => FORMATOS_PROYECTO.includes(v as FormatoProyecto);

export const ETIQUETA_FORMATO: Record<FormatoProyecto, string> = {
  reel_vertical: "Reel vertical",
  corto: "Corto",
  anuncio: "Anuncio",
  explicativo: "Explicativo",
};

export const AYUDA_FORMATO: Record<FormatoProyecto, string> = {
  reel_vertical: "Vertical 9:16, de 3 a 6 escenas cortas. Lo habitual para redes.",
  corto: "Una historia con principio y final, de 6 a 12 escenas.",
  anuncio: "Mensaje único y llamada a la acción, de 3 a 5 escenas.",
  explicativo: "Explica algo paso a paso, de 4 a 8 escenas.",
};

/** Escenas que el asistente propone por formato. Es una sugerencia: el usuario añade y quita las que quiera. */
export const ESCENAS_SUGERIDAS: Record<FormatoProyecto, number> = {
  reel_vertical: 4,
  corto: 8,
  anuncio: 3,
  explicativo: 5,
};

export const TITULO_MAXIMO = 80;
export const IDEA_MAXIMA = 1200;
export const CONCEPTO_MAXIMO = 900;
/**
 * **Techo** de escenas por proyecto (decisión del propietario, 0.41.0: 30). Quien administra puede bajarlo en
 * Admin › Ajustes (`proyectoEscenasMaximas`), no subirlo: un plan más largo no se revisa de verdad y cuesta un
 * dinero serio.
 */
export const ESCENAS_MAXIMAS = 30;

/** Tope del presupuesto autorizado de un proyecto, en créditos. Un presupuesto sin techo no es un presupuesto. */
export const PRESUPUESTO_MAXIMO = 100_000_000;

export const TEXTO_ESCENA_MAXIMO = 600;
export const ACCION_MAXIMA = 300;

/** Título del proyecto que se usa cuando no hay ninguno (y el que crea la migración de los trabajos sueltos). */
export const TITULO_SIN_TITULO = "Sin título";

// ── Escena ───────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Estado de una escena:
 *
 * - `borrador`: se puede editar libremente y no se puede producir;
 * - `aprobada`: el usuario ha aprobado el plan con ella dentro; su modelo, su precio, su plantilla y la
 *   versión de la ficha quedan congelados;
 * - `producida`: ya tiene un trabajo de generación asociado que terminó.
 */
export const ESTADOS_ESCENA = ["borrador", "aprobada", "producida"] as const;
export type EstadoEscena = (typeof ESTADOS_ESCENA)[number];

export const esEstadoEscena = (v: unknown): v is EstadoEscena => ESTADOS_ESCENA.includes(v as EstadoEscena);

export const ETIQUETA_ESTADO_ESCENA: Record<EstadoEscena, string> = {
  borrador: "Borrador",
  aprobada: "Aprobada",
  producida: "Producida",
};

// ── Afirmaciones por verificar ────────────────────────────────────────────────────────────────────────────

/**
 * Tipo de afirmación que conviene verificar antes de publicar. No hay ninguna verificación automática (eso
 * queda fuera de esta versión): aquí solo se **señalan** y decide una persona.
 */
export const TIPOS_AFIRMACION = ["cifra", "dato", "salud", "resultado"] as const;
export type TipoAfirmacion = (typeof TIPOS_AFIRMACION)[number];

export const esTipoAfirmacion = (v: unknown): v is TipoAfirmacion => TIPOS_AFIRMACION.includes(v as TipoAfirmacion);

export const ETIQUETA_TIPO_AFIRMACION: Record<TipoAfirmacion, string> = {
  cifra: "Cifra",
  dato: "Dato",
  salud: "Salud",
  resultado: "Resultado prometido",
};

export const AYUDA_TIPO_AFIRMACION: Record<TipoAfirmacion, string> = {
  cifra: "Un número, un porcentaje o una fecha. Comprueba de dónde sale antes de publicarlo.",
  dato: "Una afirmación presentada como hecho («está demostrado», «según un estudio»).",
  salud: "Habla de salud, síntomas o tratamientos. Escenara no hace promesas de diagnóstico: revísalo.",
  resultado: "Promete un resultado concreto a quien mire el vídeo. Suele necesitar matiz.",
};

export const ESTADOS_AFIRMACION = ["por_verificar", "verificada", "corregida", "descartada"] as const;
export type EstadoAfirmacion = (typeof ESTADOS_AFIRMACION)[number];

export const esEstadoAfirmacion = (v: unknown): v is EstadoAfirmacion =>
  ESTADOS_AFIRMACION.includes(v as EstadoAfirmacion);

export const ETIQUETA_ESTADO_AFIRMACION: Record<EstadoAfirmacion, string> = {
  por_verificar: "Por verificar",
  verificada: "Verificada",
  corregida: "Corregida",
  descartada: "Descartada",
};

export const FUENTE_AFIRMACION_MAXIMA = 300;
export const AFIRMACION_MAXIMA = 300;

/** Una afirmación `salud` sin verificar bloquea la aprobación: el PRD §8 no permite prometer diagnóstico. */
export const BLOQUEAN_APROBACION: readonly TipoAfirmacion[] = ["salud"];

// ── Vistas que viajan al navegador ───────────────────────────────────────────────────────────────────────

export interface AfirmacionVista {
  id: string;
  escenaId: string;
  texto: string;
  tipo: TipoAfirmacion;
  estado: EstadoAfirmacion;
  /** Fuente que ha aportado el usuario al verificarla o corregirla; vacía mientras no aporte ninguna. */
  fuente: string;
  creadoEn: string;
}

/** Estimación de una escena, con todo lo que hace falta para poder creerla o no. */
export interface EstimacionEscena {
  /** Créditos del fotograma y del clip por separado, y el total de la escena ya con margen. */
  creditosFotograma: number;
  creditosAnimacion: number;
  creditos: number;
  euros: number;
  modeloFotograma: string;
  modeloAnimacion: string;
  /** Segundos que durará el clip según el modelo elegido. */
  segundos: number;
  /** Fecha (AAAA-MM-DD) del precio más antiguo de los dos modelos: es la que se muestra. */
  comprobado: string;
  /** Alguno de los dos precios se comprobó hace más de 90 días. */
  precioAntiguo: boolean;
  /** Margen prudente aplicado, en % (0 si ninguno de los dos modelos lo necesita). */
  margen: number;
  /** Sellos de los precios usados: es lo que se congela al aprobar. */
  selloFotograma: string;
  selloAnimacion: string;
  /**
   * Si el modelo del clip admite la foto del producto, con las alternativas que sí la admiten: es lo que permite
   * avisar junto al selector de producto. Ausente en las estimaciones donde no aplica (canto).
   */
  fotoDeProducto?: FotoDeProductoDelClip;
}

/** Dirección vocal libre: «en tono cercano», «con energía». Corta a propósito: es un matiz, no un guion. */
export const DIRECCION_VOCAL_MAXIMA = 120;

/**
 * Lo que la escena tiene elegido de la dirección. Es **la misma forma** que manda «Crear» con la confirmación
 * del clip (`DireccionElegida`), y a propósito: dirigir un clip significa lo mismo en los dos sitios, así que
 * una sola definición evita que se separen. El acento no está aquí porque es del proyecto entero.
 */
export type DireccionDeEscenaVista = DireccionElegida;

/** Una escena sin dirigir: es con lo que nacen las escenas y lo que producían las versiones anteriores. */
export const DIRECCION_SIN_ELEGIR: DireccionDeEscenaVista = DIRECCION_ELEGIDA_VACIA;

export interface EscenaVista {
  trendId?: string | null;
  trendVersion?: number | null;
  id: string;
  proyectoId: string;
  orden: number;
  /** Lo que se dice o se cuenta en la escena, en palabras del usuario. */
  texto: string;
  /** Lo que se ve: encuadre y acción. Es la base del prompt del fotograma. */
  accion: string;
  /**
   * Cómo está dirigida esta escena (0.25.0). Son **claves de catálogo y enumerados**, nunca el texto que se le
   * envía al modelo: el prompt lo compone el servidor y no sale de ahí (ADR-0022).
   */
  direccion: DireccionDeEscenaVista;
  /**
   * El producto de la escena y qué se hace con él (0.26.0). Va **aparte de la dirección** porque no es lo
   * mismo: la dirección son claves de catálogo que valen en cualquier proyecto, y un producto es una fila del
   * usuario. Vacío = esta escena no lleva producto, que es lo normal.
   */
  producto: ProductoElegido;
  /** El lugar de la escena: el del proyecto, uno propio o ninguno. Ausente en vistas anteriores a los lugares. */
  lugar?: LugarDeEscena;
  segundos: number;
  estado: EstadoEscena;
  /** Quién aprobó la escena y cuándo; `null` mientras sea borrador. */
  aprobadaEn: string | null;
  /** Por qué dejó de estar aprobada, en lenguaje llano y con lo que hay que hacer. Vacío si nunca lo estuvo. */
  motivoInvalidacion: string;
  /** Trabajo de generación asociado, si ya se ha producido. */
  trabajoId: string | null;
  /**
   * Con qué referencia del personaje se generó (0.25.0): sus fotos sueltas o su hoja 3×3. `null` mientras no
   * haya nada generado. Se enseña para que el usuario sepa con qué se hizo lo que ha pagado.
   */
  referenciaIdentidad: ReferenciaIdentidad | null;
  /**
   * Fotograma real de la escena (0.19.0): el aprobado si hay uno y, si no, el último que se generó. `null`
   * mientras no se haya producido nada.
   *
   * El storyboard de la 0.17.0 no tenía miniaturas y era una lista de texto; con esto se ve de verdad lo que hay.
   */
  fotograma: Medio | null;
  estimacion: EstimacionEscena | null;
  afirmaciones: AfirmacionVista[];
  /**
   * Controles previos **de esta escena** (RF12, 0.18.0): si su plan está aprobado, si su aprobación sigue en
   * pie y si le quedan afirmaciones por verificar.
   *
   * Solo cubre lo que es propio de la escena. Lo que depende del envío concreto (credencial, saldo, cuota,
   * presupuesto) se evalúa al generar, con el modelo elegido: aquí todavía no hay ninguno.
   */
  controles: EvaluacionVista;
}

export interface ProyectoVista {
  id: string;
  titulo: string;
  formato: FormatoProyecto;
  estado: EstadoProyecto;
  idea: string;
  concepto: string;
  personajeId: string | null;
  personajeNombre: string | null;
  /** Acabado heredado del protagonista y aplicado también a los planos de apoyo. */
  estiloVisual: "realista" | "animado";
  /** Presupuesto autorizado del proyecto en créditos; 0 = sin fijar todavía. */
  presupuestoCreditos: number;
  /** Duración de los clips de este proyecto, en segundos. Es la que se le pide al modelo de vídeo. */
  segundosClip: number;
  /** Formatos de salida (0.41.0). El primero es el principal: la proporción en la que se generan los clips. */
  formatos: FormatoMontaje[];
  /**
   * Acento con el que hablan **todas** las escenas (0.25.0). Es del proyecto y no de la escena: si cada escena
   * pudiera elegirlo, el acento cambiaría de plano a plano.
   */
  acento: Acento;
  /** Lugar por defecto que heredan las escenas; `null` = ninguno. */
  lugarId?: string | null;
  totalEscenas: number;
  /** Total estimado de todas las escenas, en créditos. */
  totalEstimado: number;
  creadoEn: string;
  actualizadoEn: string;
}

/**
 * Estimación de una llamada al asistente. El texto también cuesta, así que se muestra y se confirma igual que
 * la de un fotograma: con su sello, para que el servidor pueda rechazarla si el precio ha cambiado.
 */
export interface EstimacionTexto {
  modelo: string;
  nombreModelo: string;
  creditos: number;
  euros: number;
  /** Fecha (AAAA-MM-DD) en la que se comprobó el precio. */
  comprobado: string;
  sello: string;
}

/** Proyecto con todo lo que necesita su página: escenas, afirmaciones y el plan con su coste. */
export interface ProyectoDetalle {
  proyecto: ProyectoVista;
  escenas: EscenaVista[];
  plan: PlanVista;
  /** `true` si esta instalación tiene el asistente encendido y un modelo de texto utilizable. */
  asistenteDisponible: boolean;
  /** Por qué no está disponible, si no lo está. Vacío cuando sí lo está. */
  motivoAsistente: string;
  /** Lo que costaría pedirle el guion al asistente; `null` si no está disponible. */
  estimacionAsistente: EstimacionTexto | null;
  /** Límites de esta instalación (Admin › Ajustes): escenas por proyecto y segundos de montaje. */
  limites: { escenasMaximas: number; segundosMaximos: number };
  /** Por formato, por qué no se puede generar en él con los modelos elegidos; `null` si se puede. */
  formatosGenerables: Record<FormatoMontaje, string | null>;
}

/** Plan del proyecto: el desglose por escena, el total y si se puede aprobar. */
export interface PlanVista {
  /**
   * Créditos que ya se ha gastado el asistente en este proyecto (llamadas al modelo de texto). Cuentan contra el
   * presupuesto del proyecto: es dinero del mismo bote.
   */
  creditosAsistente: number;
  /** Créditos estimados sumando todas las escenas, ya con el margen aplicado. */
  totalCreditos: number;
  totalEuros: number;
  /** Presupuesto autorizado del proyecto; 0 = sin fijar. */
  presupuestoCreditos: number;
  /** Escenas sin estimación (les falta modelo o precio): sin ellas el plan no se puede aprobar. */
  escenasSinEstimacion: number;
  /** Afirmaciones que siguen por verificar, y cuántas de ellas bloquean la aprobación. */
  afirmacionesPorVerificar: number;
  afirmacionesBloqueantes: number;
  /** Fecha (AAAA-MM-DD) del precio más antiguo de todo el plan; vacía si no hay ninguna escena estimable. */
  comprobado: string;
  /** Margen prudente máximo aplicado en alguna escena, en %. */
  margen: number;
  /** Lo que impide aprobar, en lenguaje llano. Vacío = se puede aprobar. */
  impedimentos: string[];
  /**
   * Estado global de los controles previos del plan: el **peor** de sus escenas (0.18.0). Es lo que decide si el
   * botón de producir está disponible, y se distingue por color **y** por icono y texto.
   */
  estadoControl: EstadoControl;
}

// ── Funciones puras del plan ───────────────────────────────────────────────────────────────────────────────

/**
 * Texto de una estimación. **Siempre** lleva la palabra «estimación» y la fecha del precio con el que se
 * calculó: una cifra de coste sin fecha no vale nada, porque los proveedores cambian de tarifa.
 */
export function textoEstimacion(creditos: number, euros: number, comprobado: string): string {
  const fecha = comprobado === "" ? "sin precio registrado" : `precio del ${formatearFecha(comprobado)}`;
  return `${formatearCreditos(creditos)} (estimación, ${fecha}) ≈ ${formatearEuros(euros)}`;
}

/** Fecha AAAA-MM-DD en el formato de España; devuelve la cadena tal cual si no se entiende. */
export function formatearFecha(iso: string): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!partes) return iso;
  return `${partes[3]}/${partes[2]}/${partes[1]}`;
}

/** Fila del desglose por escena tal como se pinta en la tabla de aprobación. */
export interface FilaPlan {
  escenaId: string;
  orden: number;
  /** Resumen corto de la escena, para reconocerla en la tabla. */
  resumen: string;
  modelos: string;
  segundos: number;
  /** Texto completo de la estimación, con la palabra «estimación» y la fecha del precio. */
  estimacion: string;
  creditos: number;
  estado: EstadoEscena;
  /** Por qué esta escena no se puede estimar, si no se puede. Vacío cuando sí. */
  motivo: string;
}

/** Desglose del plan por escena. Función pura: la misma que se prueba y la misma que se pinta. */
export function filasDelPlan(escenas: readonly EscenaVista[]): FilaPlan[] {
  return escenas.map((escena) => {
    const e = escena.estimacion;
    return {
      escenaId: escena.id,
      orden: escena.orden,
      resumen: resumenDeEscena(escena),
      modelos: e ? `${e.modeloFotograma} + ${e.modeloAnimacion}` : "—",
      segundos: e?.segundos ?? escena.segundos,
      estimacion: e ? textoEstimacion(e.creditos, e.euros, e.comprobado) : textoEstimacion(0, 0, ""),
      creditos: e?.creditos ?? 0,
      estado: escena.estado,
      motivo: e ? "" : "Sin precio registrado para su modelo: esta escena no se puede estimar ni producir.",
    };
  });
}

/** Resumen corto de una escena para listas y tablas. Solo necesita lo que se lee, no la escena entera. */
export function resumenDeEscena(escena: Pick<EscenaVista, "accion" | "texto" | "orden">): string {
  const base = escena.accion.trim() !== "" ? escena.accion : escena.texto;
  const limpio = base.trim().replace(/\s+/g, " ");
  if (limpio === "") return `Escena ${escena.orden}`;
  return limpio.length > 70 ? `${limpio.slice(0, 69)}…` : limpio;
}

/**
 * Qué impide aprobar el plan, en lenguaje llano. Lista vacía = se puede aprobar.
 *
 * El orden importa: primero lo que es imposible (no hay escenas, falta precio), luego el dinero y al final
 * la revisión humana de las afirmaciones.
 */
export function impedimentosDelPlan(datos: {
  totalEscenas: number;
  escenasSinEstimacion: number;
  totalCreditos: number;
  presupuestoCreditos: number;
  afirmacionesBloqueantes: number;
}): string[] {
  const impedimentos: string[] = [];
  if (datos.totalEscenas === 0) impedimentos.push("El proyecto no tiene ninguna escena todavía.");
  if (datos.escenasSinEstimacion > 0) {
    impedimentos.push(
      datos.escenasSinEstimacion === 1
        ? "Una escena no se puede estimar porque su modelo no tiene precio registrado."
        : `${datos.escenasSinEstimacion} escenas no se pueden estimar porque su modelo no tiene precio registrado.`,
    );
  }
  if (datos.presupuestoCreditos <= 0) {
    impedimentos.push("Fija el presupuesto autorizado del proyecto antes de aprobar el plan.");
  } else if (datos.totalCreditos > datos.presupuestoCreditos) {
    impedimentos.push(
      `El total estimado (${formatearCreditos(datos.totalCreditos)}) se pasa del presupuesto autorizado del proyecto (${formatearCreditos(datos.presupuestoCreditos)}). Súbelo o quita escenas.`,
    );
  }
  if (datos.afirmacionesBloqueantes > 0) {
    impedimentos.push(
      datos.afirmacionesBloqueantes === 1
        ? "Hay una afirmación sobre salud sin revisar: verifícala, corrígela o descártala."
        : `Hay ${datos.afirmacionesBloqueantes} afirmaciones sobre salud sin revisar: verifícalas, corrígelas o descártalas.`,
    );
  }
  return impedimentos;
}

export const puedeAprobarse = (plan: PlanVista): boolean => plan.impedimentos.length === 0;

/**
 * Motivo con el que se invalida la aprobación de una escena. Se guarda tal cual en la escena, así que dice
 * **qué** cambió y **qué** hay que hacer.
 */
export function motivoDeInvalidacion(que: string): string {
  return `${que} después de aprobar el plan, así que la aprobación de esta escena ya no vale. Revisa el coste y vuelve a aprobar.`;
}
