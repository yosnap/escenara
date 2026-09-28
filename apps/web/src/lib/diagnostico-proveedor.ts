import type { CodigoPrueba } from "./boveda";

/**
 * Cómo se le cuenta a una persona que algo ha fallado en un proveedor (**norma del propietario, 2026-09-28**).
 * Vale para todo: traducción, asistente de guion, fotogramas, clips, vistas de personaje, revisión y voz.
 *
 * Un mensaje de fallo tiene que decir **cuatro cosas**, y las cuatro juntas:
 *
 * 1. **qué falló de verdad**: qué proveedor, qué modelo y con qué causa concreta (tiempo agotado tras N s, error
 *    interno del proveedor, cuota agotada hasta tal fecha, límite de peticiones simultáneas, credencial
 *    rechazada…);
 * 2. **si se ha cobrado o no**, y cuando no se sabe, que no se sabe. Es lo primero que quiere saber quien paga;
 * 3. **qué se intentó**: los demás proveedores y modelos que se probaron y qué pasó con cada uno;
 * 4. **qué puede hacer** quien lo lee.
 *
 * «No se ha podido, vuelve a intentarlo» no dice ninguna de las cuatro y **está prohibido**.
 *
 * Lo que **nunca** entra aquí: el texto literal del proveedor (algunos devuelven dentro del error la clave que
 * recibieron), rutas del servidor, nombres de binarios ni configuración de la máquina. Se compone a partir del
 * código propio y de un `detalle` **extraído con una lista blanca** (`detalleDeErrorAjeno`), que es lo único que
 * se conserva de un fallo ajeno.
 *
 * Vive en `lib/` porque lo usan el servidor al componer el mensaje y los tests al comprobarlo.
 */

/** La causa, en llano y sin tecnicismos del proveedor. Es la mitad «qué ha fallado» del mensaje. */
export const CAUSA_DE_CODIGO: Record<CodigoPrueba, string> = {
  ok: "ha respondido correctamente",
  formato: "ha rechazado la petición por su formato",
  rechazada: "ha rechazado la credencial",
  "sin-credito": "no tiene saldo ni cuota en esa cuenta",
  limite: "ha pedido esperar por exceso de peticiones",
  "error-proveedor": "ha devuelto un error interno suyo",
  "sin-red": "no ha contestado: no se ha podido contactar con él",
  "tiempo-agotado": "ha tardado demasiado en responder",
  "respuesta-inesperada": "ha contestado algo que no se entiende",
};

/** Qué puede hacer quien lo lee, según la causa. Es la mitad «y ahora qué» del mensaje. */
export const ACCION_DE_CODIGO: Record<CodigoPrueba, string> = {
  ok: "",
  formato: "Es un fallo de esta instalación con ese modelo: díselo a quien la administra.",
  rechazada:
    "Revisa tu clave en «Tu cuenta»: puede haber caducado, haberse revocado o no tener el permiso que hace falta.",
  "sin-credito": "Recarga créditos o espera a que se reponga tu cuota en el proveedor, y vuelve a pedirlo.",
  limite: "Espera un minuto y vuelve a pedirlo.",
  "error-proveedor": "Es una avería del proveedor, no de tu cuenta ni de tu clave: vuelve a pedirlo en un rato.",
  "sin-red": "Puede ser la conexión del servidor: díselo a quien administra esta instalación.",
  "tiempo-agotado": "Vuelve a pedirlo en un rato; si se repite, díselo a quien administra esta instalación.",
  "respuesta-inesperada": "Vuelve a pedirlo en un rato; si se repite, díselo a quien administra esta instalación.",
};

/** Qué ha pasado con el dinero. Nunca se dice «no se ha cobrado» sin que el proveedor lo haya probado. */
export type Cobro = "sin-cobro" | "se-desconoce" | "cobrado";

export const FRASE_DE_COBRO: Record<Cobro, string> = {
  "sin-cobro": "No se te ha cobrado nada",
  "se-desconoce": "No se sabe si te ha cobrado, así que no se ha vuelto a enviar nada",
  cobrado: "Esa llamada sí se ha cobrado",
};

/** Un intento contra un proveedor, con lo único que se conserva de él. */
export interface IntentoProveedor {
  /** Nombre visible del proveedor («KIE.ai», «NaN builders»). Nunca su identificador interno. */
  proveedor: string;
  modelo: string;
  codigo: CodigoPrueba;
  cobro: Cobro;
  /**
   * Precisión de la causa, ya saneada y siempre en minúsculas y sin punto final: «máximo 5 peticiones
   * simultáneas», «la cuota se repone el 2026-10-01», «tras 90 s». Nunca texto crudo del proveedor.
   */
  detalle?: string;
}

/** «KIE.ai (gpt-5-6-sol) ha tardado demasiado en responder (tras 90 s)». */
export function fraseDeIntento(intento: IntentoProveedor): string {
  const causa = CAUSA_DE_CODIGO[intento.codigo];
  const detalle = intento.detalle && intento.detalle !== "" ? ` (${intento.detalle})` : "";
  return `${intento.proveedor} (${intento.modelo}) ${causa}${detalle}`;
}

/**
 * Mensaje completo de un fallo, con **todos** los intentos en orden.
 *
 * Con un solo intento: qué falló, si se cobró y qué hacer. Con varios: además **qué se probó después**, que es lo
 * que convierte «no ha funcionado» en «KIE.ai no respondió en 90 s; se probó NaN builders con gemma4 (máximo 5
 * peticiones simultáneas) y con glm5.3-flash (…)».
 *
 * `encabezado` dice qué se ha quedado sin hacer («No se ha podido traducir tu texto al inglés, así que no se ha
 * enviado nada a generar»). Es obligatorio: sin él el mensaje explica la avería pero no sus consecuencias.
 */
export function mensajeDeFalloDeProveedor(
  encabezado: string,
  intentos: readonly IntentoProveedor[],
  sugerencia = "",
): string {
  const [primero, ...siguientes] = intentos;
  if (!primero) return `${encabezado}. No ha quedado constancia de ningún intento.`;
  const partes: string[] = [`${encabezado}: ${fraseDeIntento(primero)}. ${FRASE_DE_COBRO[primero.cobro]}.`];
  for (const intento of siguientes) {
    partes.push(`Se probó entonces con ${fraseDeIntento(intento)}. ${FRASE_DE_COBRO[intento.cobro]}.`);
  }
  const ultimo = intentos.at(-1);
  if (ultimo) partes.push(ACCION_DE_CODIGO[ultimo.codigo]);
  if (sugerencia !== "") partes.push(sugerencia);
  return partes.filter((p) => p !== "").join(" ");
}

/**
 * Precisiones que sí se pueden sacar del error de un proveedor, **una a una y con expresión regular propia**.
 * Es una lista blanca a propósito: lo que no está aquí no se conserva, porque el cuerpo de error de un servicio
 * ajeno puede llevar dentro la clave que recibió, una ruta suya o texto de otra persona.
 *
 * Comprobadas contra respuestas reales de NaN builders el 2026-09-28 (`fixtures/`).
 */
const EXTRACTORES: readonly { patron: RegExp; frase: (c: RegExpMatchArray) => string }[] = [
  // «gemma4 concurrency limit: max 5 simultaneous requests.»
  { patron: /max\s+(\d{1,4})\s+simultaneous/i, frase: (c) => `máximo ${c[1]} peticiones simultáneas` },
  // «… rolls over, on 2026-10-01 00:00 UTC, …»
  { patron: /on\s+(\d{4}-\d{2}-\d{2})/i, frase: (c) => `la cuota se repone el ${c[1]}` },
  // «… allowance exhausted: … 0 left.»
  { patron: /allowance exhausted/i, frase: () => "la cuota del plan está agotada" },
  { patron: /rate limit/i, frase: () => "límite de peticiones del plan" },
];

/**
 * Saca del mensaje de error ajeno la precisión que sí se puede enseñar, o cadena vacía. Nunca devuelve el texto
 * del proveedor: solo frases propias compuestas con los números y las fechas que se hayan reconocido.
 */
export function detalleDeErrorAjeno(texto: unknown): string {
  if (typeof texto !== "string" || texto === "") return "";
  const frases: string[] = [];
  for (const { patron, frase } of EXTRACTORES) {
    const coincidencia = texto.match(patron);
    if (coincidencia) frases.push(frase(coincidencia));
  }
  return frases.join("; ");
}

/** «tras 90 s»: la precisión de un tiempo agotado, que el proveedor nunca informa porque lo pone quien llama. */
export function detalleDeTiempo(ms: number): string {
  return `tras ${Math.round(ms / 1000)} s`;
}
