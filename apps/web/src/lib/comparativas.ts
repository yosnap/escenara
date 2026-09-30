import type { Capacidad, EstadoModelo } from "./catalogo";
import type { DemoPlantilla } from "./demo-plantilla";
import type { EstadoTrabajo, MotivoFallo } from "./generacion";
import type { Medio } from "./media/tipos";
import { falloConCoste } from "./produccion";

/**
 * Comparativas de modelos (RF13). Dos cosas distintas que **no se mezclan nunca**:
 *
 * - **sin generar** (`/comparar`): precios del catálogo y sus datos públicos (duraciones, proporciones, voz y referencias),
 *   tus resultados de antes y ejemplos de la instalación. Coste
 *   cero por diseño: no se genera nada, no se consulta ningún saldo y no se llama a ningún proveedor;
 * - **A/B generando** (una escena): dos modelos animan el mismo fotograma por el camino normal de la cola. Cuesta lo que
 *   cuestan dos clips, y solo sale si confirmas **el número de ejecuciones y el coste** exactos.
 *
 * Aquí solo hay vocabulario y validación pura: nada de claves, ni prompts, ni texto libre de un proveedor.
 */

/** Alternativas como mucho en una A/B: comparar tres o más es otra cosa y cuesta otra cosa. */
export const MAXIMO_ALTERNATIVAS = 2;

/** Modelos como mucho en la tabla de «Comparar sin generar». */
export const MAXIMO_EN_TABLA = 3;

/** Capacidades que se comparan sin generar: las que producen imagen, vídeo o voz. */
export const CAPACIDADES_COMPARABLES: readonly Capacidad[] = [
  "image_edit",
  "text_to_image",
  "image_to_video",
  "text_to_video",
  "tts",
];

/** Aviso permanente de `/comparar`. Se dice siempre igual. */
export const AVISO_SIN_GENERAR =
  "Comparar aquí no genera nada ni gasta nada: los precios son los del catálogo, los resultados son los que ya tenías y los ejemplos son de la instalación.";

// ── Sin generar ───────────────────────────────────────────────────────────────────────────────────────────

/** Lo que ya has generado con un modelo, contado. Solo lo tuyo. */
export interface HistorialDeModelo {
  terminados: number;
  fallidos: number;
  /** Media de lo que informó el proveedor en los terminados; `null` si ninguno lo informó. */
  creditosMedios: number | null;
  /** Tus últimos resultados con este modelo (como mucho tres), con la URL temporal de siempre. */
  recientes: Medio[];
}

/** Un ejemplo de la instalación hecho con este modelo: el de una plantilla o un trend visible para ti. */
export interface EjemploDeModelo {
  plantilla: string;
  demo: DemoPlantilla;
}

/** Un modelo en «Comparar sin generar». */
export interface ModeloComparable {
  id: string;
  nombre: string;
  nombreProveedor: string;
  capacidades: Capacidad[];
  estado: EstadoModelo;
  conVoz: boolean;
  /** Precio del catálogo en créditos por unidad; `null` si no tiene. */
  creditos: number | null;
  /** Equivalencia en euros con la tarifa de esta instalación; `null` sin precio. */
  euros: number | null;
  unidad: string;
  /** AAAA-MM-DD en que se comprobó el precio. */
  comprobado: string | null;
  /** Precio publicado por el proveedor y no medido aquí. */
  publicado: boolean;
  caducado: boolean;
  /** Duraciones que sabe cobrar, en segundos, con su precio. */
  duraciones: { segundos: number; creditos: number }[];
  /** Proporciones y resoluciones que admite, tal como las publica el catálogo. */
  proporciones: string[];
  resoluciones: string[];
  /** Imágenes de referencia que acepta como máximo; 0 si no acepta ninguna. */
  maximoReferencias: number;
  /*
   * Las notas del catálogo **no** se enseñan: son internas de quien administra (`lib/catalogo.ts`). No hay nota pública.
   */
  historial: HistorialDeModelo;
  ejemplos: EjemploDeModelo[];
}

export interface ComparativaSinGenerar {
  capacidad: Capacidad;
  modelos: ModeloComparable[];
}

// ── A/B generando ─────────────────────────────────────────────────────────────────────────────────────────

/** Lo que se guarda de cada alternativa confirmada. La clave es la del trabajo que se encola con ella. */
export interface AlternativaGuardada {
  modelo: string;
  nombre: string;
  proveedor: string;
  segundos: number | null;
  /** Créditos confirmados por esta ejecución, traducción incluida. */
  creditos: number;
  sello: string;
  clave: string;
  /** Consumió un reintento autorizado de la escena (el último clip falló con posible cobro): se devuelve si no sale. */
  reintento?: boolean;
}

/** Estimación de una alternativa antes de confirmar. */
export interface EstimacionAlternativa {
  modelo: string;
  nombre: string;
  nombreProveedor: string;
  conVoz: boolean;
  segundos: number | null;
  /** Créditos que hay que confirmar por esta ejecución: el modelo más su traducción, si se traduce. */
  creditos: number;
  euros: number;
  sello: string;
  comprobado: string;
  precioAntiguo: boolean;
  /** Por qué este modelo no se puede usar ahora mismo en esta escena; `null` si sí. */
  impedimento: string | null;
}

/** Lo que el navegador tiene delante antes de confirmar una A/B. */
export interface PreparacionAB {
  escenaId: string;
  proyectoId: string;
  orden: number;
  /** Modelos de vídeo a partir de imagen entre los que elegir. */
  disponibles: { modelo: string; nombre: string; nombreProveedor: string; creditos: number | null }[];
  /** Por qué no se puede hacer una A/B en esta escena ahora mismo, en frases llanas. */
  impedimentos: string[];
  umbralAvisoCreditos: number;
  conProducto: boolean;
  conPersonaje: boolean;
  /** Avisos «Necesita ajustes» de la escena que se pueden confirmar, como en la producción. */
  avisos: { regla: string; motivo: string }[];
  fotograma: Medio | null;
}

/** Una alternativa de una A/B ya lanzada, con su trabajo si llegó a encolarse. */
export interface AlternativaVista {
  modelo: string;
  nombre: string;
  creditosConfirmados: number;
  trabajoId: string | null;
  estado: EstadoTrabajo | null;
  creditosConsumidos: number | null;
  /** Motivo apto para el usuario si falló; vacío si no. */
  error: string;
  /** `true` si pudo cobrarse: el proveedor informó coste o el fallo llegó después de hablar con él. */
  pudoCobrarse: boolean;
  medio: Medio | null;
  elegida: boolean;
}

export interface ComparativaVista {
  id: string;
  escenaId: string;
  proyectoId: string;
  ejecucionesPrevistas: number;
  /** Trabajos que llegaron a encolarse. */
  ejecucionesReales: number;
  creditosEstimados: number;
  /** Suma de lo que informó el proveedor; nunca una estimación disfrazada de gasto. */
  creditosConsumidos: number;
  alternativas: AlternativaVista[];
  ganadorId: string | null;
  creadaEn: string;
  /** `true` cuando ninguna alternativa sigue en marcha. */
  terminada: boolean;
}

/** Lo que manda el navegador para lanzar una A/B. */
export interface PeticionAB {
  alternativas: { modelo: string; creditos: number; sello: string }[];
  ejecucionesConfirmadas: number;
  creditosTotalesConfirmados: number;
  derechos: boolean;
  derechoMarca: boolean;
  sinTerceros: boolean;
  avisoUmbralAceptado: boolean;
  avisosConfirmados: string[];
  claveIdempotencia: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esEntero = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const esTexto = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

/**
 * Valida lo que llega del navegador. Devuelve la petición o el motivo, en castellano, de por qué no vale. Pura: la
 * comprobación de dinero de verdad (precio, sello, saldo, topes) la hace después el servidor contra el catálogo.
 */
export function leerPeticionAB(cuerpo: unknown): PeticionAB | string {
  if (cuerpo === null || typeof cuerpo !== "object") return "Falta la confirmación de la comparativa.";
  const c = cuerpo as Record<string, unknown>;
  if (!Array.isArray(c.alternativas) || c.alternativas.length === 0) return "Elige los modelos que quieres comparar.";
  if (c.alternativas.length > MAXIMO_ALTERNATIVAS) {
    return `Una comparativa generando admite como mucho ${MAXIMO_ALTERNATIVAS} alternativas.`;
  }
  if (c.alternativas.length < MAXIMO_ALTERNATIVAS) return "Elige dos modelos distintos para comparar.";
  const alternativas: PeticionAB["alternativas"] = [];
  for (const a of c.alternativas as unknown[]) {
    const alt = (a ?? {}) as Record<string, unknown>;
    if (!esTexto(alt.modelo, 200) || !esEntero(alt.creditos) || !esTexto(alt.sello, 200)) {
      return "Una de las alternativas no trae su modelo, su coste o su sello. Vuelve a cargar la estimación.";
    }
    alternativas.push({ modelo: alt.modelo, creditos: alt.creditos, sello: alt.sello });
  }
  if (new Set(alternativas.map((a) => a.modelo)).size !== alternativas.length) {
    return "Las dos alternativas son el mismo modelo: elige dos distintos.";
  }
  if (!esEntero(c.ejecucionesConfirmadas) || !esEntero(c.creditosTotalesConfirmados)) {
    return "Falta confirmar el número de ejecuciones y el coste total.";
  }
  if (typeof c.claveIdempotencia !== "string" || !UUID.test(c.claveIdempotencia)) {
    return "Falta la clave de la confirmación.";
  }
  const avisos = Array.isArray(c.avisosConfirmados)
    ? c.avisosConfirmados.filter((v): v is string => esTexto(v, 100)).slice(0, 20)
    : [];
  return {
    alternativas,
    ejecucionesConfirmadas: c.ejecucionesConfirmadas,
    creditosTotalesConfirmados: c.creditosTotalesConfirmados,
    derechos: c.derechos === true,
    derechoMarca: c.derechoMarca === true,
    sinTerceros: c.sinTerceros === true,
    avisoUmbralAceptado: c.avisoUmbralAceptado === true,
    avisosConfirmados: avisos,
    claveIdempotencia: c.claveIdempotencia,
  };
}

/**
 * Comprueba que lo confirmado es **exactamente** lo que se va a lanzar: tantas ejecuciones como alternativas y un
 * total que es la suma de cada una. Devuelve el motivo si no cuadra; `null` si cuadra.
 */
export function motivoDeConfirmacion(peticion: PeticionAB): string | null {
  const total = peticion.alternativas.reduce((s, a) => s + a.creditos, 0);
  if (peticion.ejecucionesConfirmadas !== peticion.alternativas.length) {
    return `Has confirmado ${peticion.ejecucionesConfirmadas} ejecuciones, pero la comparativa hará ${peticion.alternativas.length}. Vuelve a confirmar. No se ha encolado nada.`;
  }
  if (peticion.creditosTotalesConfirmados !== total) {
    return `Has confirmado ${peticion.creditosTotalesConfirmados} créditos en total, pero las dos ejecuciones suman ${total}. Vuelve a confirmar. No se ha encolado nada.`;
  }
  return null;
}

/** Si una alternativa pudo cobrarse, con lo que se sabe del trabajo. */
export const alternativaPudoCobrarse = (
  estado: EstadoTrabajo | null,
  motivo: MotivoFallo | null,
  consumidos: number | null,
): boolean =>
  (consumidos ?? 0) > 0 ||
  estado === "listo" ||
  estado === "desconocido" ||
  (estado === "fallido" && falloConCoste(motivo));

/** Texto del desglose antes de confirmar: cuántas ejecuciones y cuánto, sin redondeos que engañen. */
export function desgloseAB(alternativas: readonly { nombre: string; creditos: number }[]): string {
  const total = alternativas.reduce((s, a) => s + a.creditos, 0);
  const partes = alternativas.map((a) => `${a.nombre}: ${a.creditos} créditos`).join(" · ");
  return `${alternativas.length} ejecuciones (una por modelo). ${partes}. Total: ${total} créditos.`;
}

/**
 * Clave de idempotencia de una confirmación en el navegador. Se conserva mientras no cambie lo que se confirma (`firma`)
 * y se estrena si cambia. `intento` entra en la firma: tras un **error del servidor** se sube y la siguiente pulsación
 * lleva clave nueva (si no, el servidor respondería siempre «esa confirmación ya se intentó»); tras un **fallo de red**
 * no se sube, porque la misma clave es lo que evita cobrar dos veces si la petición sí llegó.
 */
export function claveDeConfirmacion(
  actual: { firma: string; valor: string } | null,
  firma: string,
  intento: number,
  nueva: () => string,
): { firma: string; valor: string } {
  const completa = `${intento}|${firma}`;
  return actual?.firma === completa ? actual : { firma: completa, valor: nueva() };
}

/** Si, tras un envío fallido, la siguiente confirmación debe llevar clave nueva. */
export const renovarClaveTrasFallo = (fallo: { red?: boolean }): boolean => fallo.red !== true;
