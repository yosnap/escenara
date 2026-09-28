import { familiaDeVoz } from "@/lib/voz";
import type { EleccionDeTrabajo } from "../generacion/precios";
import { elegirParaTipo } from "../generacion/precios";
import { creditosDeLaOpcion, eleccionDeVozDelMapa, type OpcionDeVoz } from "../mapa/voz";

/**
 * Con quién se genera la voz y **cuánto cuesta este diálogo**.
 *
 * Desde la 0.21.1 el orden **lo pone el mapa de modelos del usuario** (`server/mapa/voz.ts`), no una pareja fija
 * escrita en el código. Lo que no ha cambiado es la regla de dinero, que es la que importa:
 *
 * Los créditos de dos proveedores **no son la misma unidad**: los de KIE, los del plan de ElevenLabs y la cuota
 * de un servicio compatible con la API de OpenAI no se comparan, no se suman y no significan lo mismo frente a
 * los topes de gasto. Tampoco hay una equivalencia honesta que registrar: lo que cuesta un crédito de ElevenLabs
 * depende del plan contratado, así que cualquier tabla de conversión sería un número inventado con fecha.
 *
 * **Lo que se hace, y es lo más simple que es correcto:** se confirma y se aparta **el precio del proveedor por
 * el que se va a gastar de verdad**, en su moneda, y **cada reserva guarda su propio tope** en la suya. El
 * cambio automático solo procede si lo que cuesta allí cabe en el tope que el usuario vio para esa reserva
 * (`despacho.ts › relevoDeVoz`); si no cabe, no se cambia y se le dice por qué.
 */

export type { OpcionDeVoz } from "../mapa/voz";
export { creditosDeLaOpcion } from "../mapa/voz";

/** Con quién se va a generar la voz, con qué reservas y cuánto cuesta el texto concreto que se va a leer. */
export interface EleccionDeVoz {
  /** Con quién se va a intentar primero. */
  elegida: EleccionDeTrabajo;
  /** A quién se cambiaría, en orden, si el anterior rechaza la petición sin cobrar. Vacío si no hay ninguna. */
  reservas: OpcionDeVoz[];
  /**
   * Créditos **del proveedor elegido** para este diálogo. Escala con la longitud del texto en los modelos que
   * cobran por carácter, que es como cobra el proveedor.
   */
  creditos: number;
  /** Dirección del servicio cuando la opción elegida es un compatible con la API de OpenAI; vacía en los demás. */
  urlBase: string;
  /** Cuál de los servicios compatibles del usuario es; `null` en los demás proveedores. */
  compatibleId: string | null;
}

/**
 * Elección de voz de este usuario para `dialogo`.
 *
 * `vozFijada` es la voz que tiene puesta el proyecto: acota las opciones a las que **pueden leerla**, porque los
 * identificadores de voz de ElevenLabs y los de kokoro no son los mismos. Cambiar de familia por su cuenta
 * cambiaría el timbre del personaje a mitad de proyecto, y eso no lo decide una avería.
 */
export async function eleccionDeVozDe(
  usuarioId: string,
  dialogo = "",
  modeloPedido?: string | null,
  vozFijada?: string | null,
): Promise<EleccionDeVoz> {
  // Un modelo pedido a mano manda: es una decisión del usuario o del admin, y entonces no hay reserva que valga.
  if (modeloPedido) {
    const elegida = await elegirParaTipo("voz", modeloPedido);
    return { elegida, reservas: [], creditos: creditosDeLaOpcion(elegida, dialogo), urlBase: "", compatibleId: null };
  }
  const familia = vozFijada ? familiaDeVoz(vozFijada) : null;
  const { elegida, reservas } = await eleccionDeVozDelMapa(usuarioId, dialogo, familia);
  return {
    elegida: elegida.eleccion,
    reservas,
    creditos: elegida.creditos,
    urlBase: elegida.urlBase,
    compatibleId: elegida.entrada.compatibleId,
  };
}
