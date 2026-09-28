import type { Proveedor } from "@/lib/boveda";
import { creditosDeVoz } from "@/lib/voz";
import { usarCredencialValida } from "../boveda/credenciales";
import { type EleccionDeTrabajo, elegirParaTipo } from "../generacion/precios";
import { modelosElegibles } from "../proveedores/catalogo";
import { ErrorCatalogo } from "../proveedores/contrato";
import { adaptadorDe } from "../proveedores/registro";

/**
 * Con quién se genera la voz y **cuánto cuesta este diálogo** (0.21.0).
 *
 * Esta instalación puede tener más de un proveedor de voz utilizable a la vez. El propietario decidió (firme,
 * 2026-09-28) que el cambio al de reserva sea **automático**: si el primero rechaza la petición de forma que
 * prueba que no ha cobrado, se envía al otro sin preguntar.
 *
 * Eso abrió una pregunta de dinero que se resolvió mal en el primer intento: se confirmaba **el mayor de los dos
 * precios**. Y no se puede, porque **no son la misma unidad**: los créditos de KIE y los del plan de ElevenLabs no
 * se comparan, no se suman y no significan lo mismo frente a los topes de gasto de la instalación. Un `max` entre
 * los dos es una cifra que no quiere decir nada.
 *
 * Tampoco hay una equivalencia honesta que registrar: lo que cuesta un crédito de ElevenLabs depende del plan que
 * tenga contratado cada usuario, así que cualquier tabla de conversión sería un número inventado con fecha.
 *
 * **Lo que se hace, y es lo más simple que es correcto:** se confirma y se aparta **el precio del proveedor por el
 * que se va a gastar de verdad**, en su moneda. Y el relevo automático solo procede si el otro **cabe en lo ya
 * reservado** (`despacho.ts › relevoDeVoz`); si no cabe, no se cambia y se le dice al usuario que vuelva a
 * pedirlo, porque confirmar de más en una unidad ajena no es protegerle, es engañarle con otra cifra.
 */

/** Con quién se va a generar la voz y cuánto cuesta el texto concreto que se va a leer. */
export interface EleccionDeVoz {
  /** Con quién se va a intentar primero. */
  elegida: EleccionDeTrabajo;
  /** A quién se cambiaría si el primero rechaza la petición sin cobrar; `null` si no hay reserva. */
  reserva: EleccionDeTrabajo | null;
  /**
   * Créditos **del proveedor elegido** para este diálogo. Escala con la longitud del texto en los modelos que
   * cobran por carácter, que es como cobra el proveedor.
   */
  creditos: number;
}

/**
 * Modelos de voz utilizables **para este usuario**: los que el catálogo da por elegibles (estado y precio
 * registrado) y cuyo proveedor tiene además una credencial suya que sirve. Un modelo cuyo proveedor el usuario no
 * ha configurado no es una opción: no hay con qué pagarlo.
 *
 * El orden lo pone el catálogo (el predeterminado primero), así que el preferido de la instalación va delante y
 * el otro queda de reserva.
 */
async function vocesUtilizables(usuarioId: string): Promise<EleccionDeTrabajo[]> {
  const elegibles = await modelosElegibles("tts");
  const salida: EleccionDeTrabajo[] = [];
  for (const modelo of elegibles) {
    const credencial = await usarCredencialValida(usuarioId, modelo.proveedor as Proveedor);
    if (!credencial.ok) continue;
    const adaptador = adaptadorDe(modelo.proveedor);
    if (!adaptador.admite("tts") || !adaptador.generarVoz) continue;
    salida.push({ modelo, adaptador, precio: await adaptador.estimar(modelo.modelo) });
  }
  return salida;
}

/** Créditos de una opción para un texto concreto, con su tarifa por carácter si la tiene. */
export const creditosDeLaOpcion = (opcion: EleccionDeTrabajo, dialogo: string): number =>
  creditosDeVoz(opcion.modelo.modelo, opcion.precio.creditos, dialogo);

/**
 * Con quién se genera la voz de este usuario y cuánto cuesta `dialogo`. Lanza con el motivo cuando no hay ninguna
 * opción: sin modelo con precio o sin credencial de su proveedor, no se estima y no se gasta.
 *
 * `dialogo` vacío devuelve la tarifa registrada, que es lo que vale para enseñar un precio de referencia en la
 * pantalla antes de saber qué escena se va a generar.
 */
export async function eleccionDeVozDe(
  usuarioId: string,
  dialogo = "",
  modeloPedido?: string | null,
): Promise<EleccionDeVoz> {
  // Un modelo pedido a mano manda: es una decisión del usuario o del admin, y entonces no hay reserva que valga.
  if (modeloPedido) {
    const elegida = await elegirParaTipo("voz", modeloPedido);
    return { elegida, reserva: null, creditos: creditosDeLaOpcion(elegida, dialogo) };
  }
  const [elegida, reserva = null] = await vocesUtilizables(usuarioId);
  if (!elegida) {
    // Se distingue «esta instalación no tiene ninguno» de «tú no tienes la clave del que hay»: no se arreglan igual.
    const hayModelos = (await modelosElegibles("tts")).length > 0;
    throw new ErrorCatalogo(
      503,
      hayModelos
        ? "Los modelos de voz de esta instalación son de proveedores para los que no tienes clave. Añade la suya en «Tu cuenta» y podrás generar la voz."
        : "Esta instalación no tiene ningún modelo de voz con precio registrado, así que no puede estimar lo que costaría ni generarlo. Quien la administra tiene que medirlo y registrar su precio en Admin › Modelos.",
    );
  }
  return { elegida, reserva, creditos: creditosDeLaOpcion(elegida, dialogo) };
}

/**
 * A quién se cambiaría si `proveedorFallido` rechaza la petición sin cobrar. Es lo que consulta el despacho, y
 * por eso mira otra vez las credenciales: entre encolar y enviar, una clave puede haberse borrado.
 */
export async function alternativaDeVoz(usuarioId: string, proveedorFallido: string): Promise<EleccionDeTrabajo | null> {
  const utilizables = await vocesUtilizables(usuarioId);
  return utilizables.find((opcion) => opcion.modelo.proveedor !== proveedorFallido) ?? null;
}
