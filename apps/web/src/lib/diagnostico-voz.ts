import { PROVEEDORES_PUBLICOS, type Proveedor } from "./boveda";
import {
  type Cobro,
  FRASE_DE_COBRO,
  fraseDeIntento,
  type IntentoProveedor,
  mensajeDeFalloDeProveedor,
} from "./diagnostico-proveedor";

/**
 * Lo propio de la voz dentro de la norma de errores visibles (`lib/diagnostico-proveedor.ts`): traducir el
 * identificador de proveedor de la bóveda a su nombre y contar lo que solo pasa aquí, que es el **relevo de
 * proveedor** de la 0.21.0.
 *
 * Todo lo demás (las causas, las acciones, las frases de cobro y el montaje del mensaje) vive en el módulo
 * genérico: un mensaje de voz y uno de fotograma tienen que decir las mismas cuatro cosas.
 */

export type { Cobro } from "./diagnostico-proveedor";
export { ACCION_DE_CODIGO, CAUSA_DE_CODIGO, FRASE_DE_COBRO, fraseDeIntento } from "./diagnostico-proveedor";

/** Un intento de voz: como el genérico, pero el proveedor es uno de los de la bóveda. */
export interface IntentoDeVoz extends Omit<IntentoProveedor, "proveedor"> {
  proveedor: Proveedor;
}

export const nombreDeProveedor = (proveedor: Proveedor): string => PROVEEDORES_PUBLICOS[proveedor]?.nombre ?? proveedor;

const aGenerico = (intento: IntentoDeVoz): IntentoProveedor => ({
  ...intento,
  proveedor: nombreDeProveedor(intento.proveedor),
});

const ENCABEZADO = "No se ha podido generar la voz";

/** Mensaje completo de un fallo de voz, con todos los intentos en orden. */
export function mensajeDeFalloDeVoz(intentos: readonly IntentoDeVoz[], sugerencia = ""): string {
  return mensajeDeFalloDeProveedor(ENCABEZADO, intentos.map(aGenerico), sugerencia);
}

/**
 * Mensaje de que **sí ha funcionado, pero con el otro proveedor**. No es un error, es un aviso: quien paga tiene
 * derecho a saber en qué cuenta se ha gastado y por qué, sobre todo si nunca eligió ese proveedor.
 */
export function mensajeDeCambioDeProveedor(
  fallido: IntentoDeVoz,
  usado: { proveedor: Proveedor; modelo: string },
): string {
  const cobro: Cobro = fallido.cobro;
  return `${fraseDeIntento(aGenerico(fallido))}, y ${FRASE_DE_COBRO[cobro].toLowerCase()}. La voz se ha generado con ${nombreDeProveedor(usado.proveedor)} (${usado.modelo}), que es el proveedor de reserva de esta instalación, y se ha cobrado en esa cuenta.`;
}

/** Aviso de que el proveedor de reserva existe pero este usuario no lo tiene configurado. */
export function sugerenciaDeReserva(disponible: boolean): string {
  return disponible
    ? ""
    : `Esta instalación puede usar ${nombreDeProveedor("elevenlabs")} como proveedor de voz de reserva: añade su clave en «Tu cuenta» y el siguiente intento lo probará solo.`;
}
