import type { EstiloRender } from "./animados";
import type { Medio } from "./media/tipos";

/**
 * Vocabulario de los **lugares**: el sitio poco conocido que el usuario reutiliza como escenario (una calle, un
 * bar de barrio, un patio). Se usa en el servidor y en el navegador, así que aquí **no hay ni una palabra de
 * inglés de prompt** (ADR-0022): solo identificadores y los textos en castellano que se leen en pantalla.
 *
 * Los lugares famosos no necesitan la entidad: el modelo ya los conoce y basta con escribir su nombre.
 */

// ── Papel de cada foto ──────────────────────────────────────────────────────────────────────────────────

export const PAPELES_LUGAR = ["maestra", "general", "contraplano", "detalle", "zona"] as const;
export type PapelLugar = (typeof PAPELES_LUGAR)[number];

export const esPapelLugar = (v: unknown): v is PapelLugar => PAPELES_LUGAR.includes(v as PapelLugar);

export const NOMBRE_PAPEL_LUGAR: Record<PapelLugar, string> = {
  maestra: "Maestra",
  general: "Plano general",
  contraplano: "Contraplano",
  detalle: "Detalle",
  zona: "Una zona concreta",
};

export const AYUDA_PAPEL_LUGAR: Record<PapelLugar, string> = {
  maestra: "El plano general con la luz de referencia. Es la única que se envía al generar y la que se compara.",
  general: "Otro plano amplio del sitio, para que se entienda cómo es.",
  contraplano: "El mismo sitio mirado desde el otro lado.",
  detalle: "Un detalle que lo hace reconocible: un azulejo, un rótulo, una barandilla.",
  zona: "Una parte concreta: la barra, la ventana, la puerta.",
};

// ── Declaración de derechos ─────────────────────────────────────────────────────────────────────────────

export const ORIGENES_FOTOS_LUGAR = ["propias", "con_permiso", "generadas"] as const;
export type OrigenFotosLugar = (typeof ORIGENES_FOTOS_LUGAR)[number];
export const esOrigenFotosLugar = (v: unknown): v is OrigenFotosLugar =>
  ORIGENES_FOTOS_LUGAR.includes(v as OrigenFotosLugar);

export const NOMBRE_ORIGEN_FOTOS: Record<OrigenFotosLugar, string> = {
  propias: "Las he hecho yo",
  con_permiso: "Son de otra persona y tengo su permiso",
  generadas: "Las he generado aquí",
};

export const PERSONAS_VISIBLES = ["ninguna", "no_reconocibles", "retiradas"] as const;
export type PersonasVisibles = (typeof PERSONAS_VISIBLES)[number];
export const esPersonasVisibles = (v: unknown): v is PersonasVisibles =>
  PERSONAS_VISIBLES.includes(v as PersonasVisibles);

/**
 * Lo que se le pregunta al usuario sobre la gente de las fotos. «Reconocibles» existe como respuesta, pero **no se
 * puede declarar**: es la que lleva a retirarlas o a subir otra foto.
 */
export const RESPUESTAS_PERSONAS = ["ninguna", "no_reconocibles", "reconocibles", "retiradas"] as const;
export type RespuestaPersonas = (typeof RESPUESTAS_PERSONAS)[number];

export const NOMBRE_PERSONAS_VISIBLES: Record<RespuestaPersonas, string> = {
  ninguna: "No sale nadie",
  no_reconocibles: "Solo gente pequeña al fondo, sin rasgos reconocibles",
  reconocibles: "Sale gente reconocible (cara o cuerpo en primer plano)",
  retiradas: "Salía gente y la he retirado con la edición",
};

export const ESPACIOS_LUGAR = ["exterior", "interior"] as const;
export type EspacioLugar = (typeof ESPACIOS_LUGAR)[number];
export const esEspacioLugar = (v: unknown): v is EspacioLugar => ESPACIOS_LUGAR.includes(v as EspacioLugar);

export const NOMBRE_ESPACIO: Record<EspacioLugar, string> = {
  exterior: "Exterior o espacio público (una calle, una plaza, una fachada)",
  interior: "Interior privado o con restricciones (una tienda, un bar, un museo)",
};

export const ALCANCES_LUGAR = ["personal", "comercial"] as const;
export type AlcanceLugar = (typeof ALCANCES_LUGAR)[number];
export const esAlcanceLugar = (v: unknown): v is AlcanceLugar => ALCANCES_LUGAR.includes(v as AlcanceLugar);

/** Versión del texto de la declaración que se guarda con ella. Cambiar el texto obliga a subir la versión. */
export const VERSION_TEXTO_DECLARACION_LUGAR = "2026-09-30";

/** Mensajes con causa y acción, compartidos por el servidor (que rechaza) y la interfaz (que avisa antes). */
export const RECHAZO_MENORES =
  "No se puede usar un lugar si en sus fotos sale algún menor, ni aunque sea al fondo. Sube otra foto sin menores.";
export const RECHAZO_RECONOCIBLES =
  "Con gente reconocible en la foto no se puede generar: retírala con «Retirar personas» (edición de imagen, con su coste confirmado antes) o sube otra foto. No se pixelan caras: el generador copiaría el pixelado.";
export const AVISO_INTERIOR =
  "Un interior privado o con restricciones (una tienda, un bar, un museo) exige que declares que tienes permiso de quien lo gestiona.";
export const SUGERENCIA_FAMOSO =
  "¿Es un sitio famoso? Escribe su nombre en el texto de la escena o en la localización y no hace falta crear un lugar: el modelo ya lo conoce.";

// ── Topes ───────────────────────────────────────────────────────────────────────────────────────────────

export const NOMBRE_LUGAR_MAXIMO = 80;
export const DESCRIPCION_LUGAR_MAXIMA = 400;
export const SITIO_EN_LUGAR_MAXIMO = 120;
export const MAXIMO_LUGARES = 100;
export const MAXIMO_REFERENCIAS_LUGAR = 8;

// ── Plano ───────────────────────────────────────────────────────────────────────────────────────────────

export const PLANOS_DEL_LUGAR = ["con_reparto", "solo_lugar"] as const;
export type PlanoDelLugar = (typeof PLANOS_DEL_LUGAR)[number];
export const esPlanoDelLugar = (v: unknown): v is PlanoDelLugar => PLANOS_DEL_LUGAR.includes(v as PlanoDelLugar);

export const NOMBRE_PLANO_DEL_LUGAR: Record<PlanoDelLugar, string> = {
  con_reparto: "Con quien sale en la escena",
  solo_lugar: "El lugar solo, sin nadie (mudo)",
};

// ── Vistas ──────────────────────────────────────────────────────────────────────────────────────────────

export interface ReferenciaLugar {
  id: string;
  papel: PapelLugar;
  /** `true` en las que salen de una edición (retirar personas) o de un candidato aprobado. */
  generada: boolean;
  orden: number;
  medio: Medio;
}

export interface DeclaracionLugarVista {
  id: string;
  origenFotos: OrigenFotosLugar;
  alcance: AlcanceLugar;
  espacio: EspacioLugar;
  permisoDelLugar: boolean;
  personasVisibles: PersonasVisibles;
  marcasVisibles: boolean;
  declaradaEn: string;
}

export interface VersionLugarVista {
  numero: number;
  cambios: string[];
  creadaEn: string;
}

export interface LugarResumen {
  id: string;
  nombre: string;
  descripcion: string;
  acabado: EstiloRender;
  /** Clave del estilo animado; vacía en un lugar realista. */
  estilo: string;
  fotos: number;
  portada: Medio | null;
  tieneMaestra: boolean;
  declarado: boolean;
  version: number;
  actualizado: string;
}

export interface LugarVista extends LugarResumen {
  referencias: ReferenciaLugar[];
  declaracion: DeclaracionLugarVista | null;
  versiones: VersionLugarVista[];
}

/** Lo que falta para poder generar con un lugar, en castellano. Vacío = se puede. */
export function queFaltaAlLugar(lugar: Pick<LugarResumen, "tieneMaestra" | "declarado">): string[] {
  const faltas: string[] = [];
  if (!lugar.tieneMaestra) faltas.push("Marca una foto como maestra.");
  if (!lugar.declarado) faltas.push("Declara los derechos de las fotos.");
  return faltas;
}

/** Lugar elegido en «Crear» o en una escena: el identificador de un lugar suyo y dónde, dentro de él. */
export interface LugarElegido {
  lugarId: string;
  sitio: string;
}
