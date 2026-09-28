import { type CodigoPrueba, PROVEEDORES_PUBLICOS, type Proveedor } from "./boveda";

/**
 * Cómo se le cuenta a una persona que algo de la voz ha fallado (norma del propietario, 2026-09-28).
 *
 * Un mensaje de fallo de voz tiene que decir **cuatro cosas**, y las cuatro juntas:
 *
 * 1. **qué falló de verdad**: qué proveedor, qué modelo y con qué causa concreta (tiempo agotado, error interno
 *    del proveedor, cuota o límite, credencial rechazada…);
 * 2. **si se ha cobrado o no**, y cuando no se sabe, que no se sabe. Es lo primero que quiere saber quien paga;
 * 3. **qué se intentó**: si hubo un segundo proveedor y qué pasó con él;
 * 4. **qué puede hacer** quien lo lee.
 *
 * «No se ha podido, vuelve a intentarlo» no dice ninguna de las cuatro y está prohibido.
 *
 * Lo que **nunca** entra aquí: el texto literal del proveedor (algunos devuelven dentro del error la clave que
 * recibieron), rutas del servidor, nombres de binarios ni configuración de la máquina. Se compone a partir del
 * código propio, que es lo único que se conserva de un fallo ajeno.
 *
 * Vive en `lib/` porque lo usan el servidor al componer el mensaje y los tests al comprobarlo.
 */

/** La causa, en llano y sin tecnicismos del proveedor. Es la mitad «qué ha fallado» del mensaje. */
export const CAUSA_DE_CODIGO: Record<CodigoPrueba, string> = {
  ok: "ha respondido correctamente",
  formato: "ha rechazado la petición por su formato",
  rechazada: "ha rechazado la credencial",
  "sin-credito": "no tiene saldo en esa cuenta",
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
  rechazada: "Revisa tu clave en «Tu cuenta»: puede haber caducado, haberse revocado o no tener el permiso de voz.",
  "sin-credito": "Recarga créditos en tu cuenta del proveedor y vuelve a pedirlo.",
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
export interface IntentoDeVoz {
  proveedor: Proveedor;
  modelo: string;
  codigo: CodigoPrueba;
  cobro: Cobro;
}

const nombreDe = (proveedor: Proveedor) => PROVEEDORES_PUBLICOS[proveedor]?.nombre ?? proveedor;

/** «KIE.ai (elevenlabs/text-to-speech-multilingual-v2) ha devuelto un error interno suyo». */
export function fraseDeIntento(intento: IntentoDeVoz): string {
  return `${nombreDe(intento.proveedor)} (${intento.modelo}) ${CAUSA_DE_CODIGO[intento.codigo]}`;
}

/**
 * Mensaje completo de un fallo de voz, con todos los intentos en orden.
 *
 * Con un solo intento: qué falló, si se cobró y qué hacer. Con dos: además **qué se probó después**, que es lo
 * que convierte «no ha funcionado» en «KIE falló con un error interno suyo; se probó con ElevenLabs y también
 * falló porque…».
 */
export function mensajeDeFalloDeVoz(intentos: readonly IntentoDeVoz[], sugerencia = ""): string {
  const partes: string[] = [];
  const [primero, ...siguientes] = intentos;
  if (!primero) return "No se ha generado la voz y no ha quedado constancia de ningún intento.";
  partes.push(`${fraseDeIntento(primero)}. ${FRASE_DE_COBRO[primero.cobro]}.`);
  for (const intento of siguientes) {
    partes.push(`Se probó entonces con ${fraseDeIntento(intento)}. ${FRASE_DE_COBRO[intento.cobro]}.`);
  }
  const ultimo = intentos.at(-1);
  if (ultimo) partes.push(ACCION_DE_CODIGO[ultimo.codigo]);
  if (sugerencia !== "") partes.push(sugerencia);
  return partes.filter((p) => p !== "").join(" ");
}

/**
 * Mensaje de que **sí ha funcionado, pero con el otro proveedor**. No es un error, es un aviso: quien paga tiene
 * derecho a saber en qué cuenta se ha gastado y por qué, sobre todo si nunca eligió ese proveedor.
 */
export function mensajeDeCambioDeProveedor(fallido: IntentoDeVoz, usado: { proveedor: Proveedor; modelo: string }) {
  return `${fraseDeIntento(fallido)}, y ${FRASE_DE_COBRO[fallido.cobro].toLowerCase()}. La voz se ha generado con ${nombreDe(usado.proveedor)} (${usado.modelo}), que es el proveedor de reserva de esta instalación, y se ha cobrado en esa cuenta.`;
}

/** Aviso de que el proveedor de reserva existe pero este usuario no lo tiene configurado. */
export function sugerenciaDeReserva(disponible: boolean): string {
  return disponible
    ? ""
    : `Esta instalación puede usar ${nombreDe("elevenlabs")} como proveedor de voz de reserva: añade su clave en «Tu cuenta» y el siguiente intento lo probará solo.`;
}
