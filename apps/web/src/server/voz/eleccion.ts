import type { Proveedor } from "@/lib/boveda";
import { usarCredencialValida } from "../boveda/credenciales";
import { type EleccionDeTrabajo, elegirParaTipo } from "../generacion/precios";
import { modelosElegibles } from "../proveedores/catalogo";
import { ErrorCatalogo } from "../proveedores/contrato";
import { adaptadorDe } from "../proveedores/registro";

/**
 * Con quién se genera la voz y **cuánto hay que confirmar** (0.21.0).
 *
 * Esta instalación puede tener más de un proveedor de voz utilizable a la vez. El propietario decidió (firme,
 * 2026-09-28) que el cambio al de reserva sea **automático**: si el primero rechaza la petición de forma que
 * prueba que no ha cobrado, se envía al otro sin preguntar.
 *
 * Eso obliga a resolver aquí una pregunta de dinero: **qué cifra se le enseña al usuario**. La respuesta elegida
 * es la más simple que no puede cobrar de más: **el mayor de los dos precios**. Así:
 *
 * - el usuario confirma, y la reserva aparta, una cantidad que cubre cualquiera de los dos caminos;
 * - un cambio automático **nunca** gasta más de lo que tenía delante, así que no hace falta volver a preguntarle
 *   en mitad de un envío que ya autorizó;
 * - y lo que se apunta como consumido es siempre lo que informe el proveedor que de verdad haya cobrado, que es
 *   lo que cierra el gasto (`presupuesto/reserva.ts`), no la estimación.
 *
 * La alternativa —reconfirmar cuando el precio del segundo es mayor— dejaba al usuario con un trabajo a medias
 * esperando un clic que quizá nunca llega, y con el primero ya fallado. Peor para él y más difícil de sostener.
 */

/** Los dos caminos posibles de un envío de voz, con lo que hay que confirmar para cubrirlos. */
export interface EleccionDeVoz {
  /** Con quién se va a intentar primero. */
  elegida: EleccionDeTrabajo;
  /** A quién se cambiaría si el primero rechaza la petición sin cobrar; `null` si no hay reserva. */
  reserva: EleccionDeTrabajo | null;
  /**
   * Créditos que hay que confirmar: el mayor de los dos. Es la cifra que se muestra, la que se reserva y la que
   * se compara con la confirmación que llega del navegador.
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

/**
 * Con quién se genera la voz de este usuario. Lanza con el motivo cuando no hay ninguna opción: sin modelo con
 * precio o sin credencial del proveedor que lo ofrece, no se estima y no se gasta.
 */
export async function eleccionDeVozDe(usuarioId: string, modeloPedido?: string | null): Promise<EleccionDeVoz> {
  // Un modelo pedido a mano manda: es una decisión del usuario o del admin, y entonces no hay reserva que valga.
  if (modeloPedido) {
    const elegida = await elegirParaTipo("voz", modeloPedido);
    return { elegida, reserva: null, creditos: Math.ceil(elegida.precio.creditos) };
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
  return {
    elegida,
    reserva,
    // El mayor de los dos: es lo único que cubre los dos caminos sin volver a preguntar a mitad de envío.
    creditos: Math.max(Math.ceil(elegida.precio.creditos), reserva ? Math.ceil(reserva.precio.creditos) : 0),
  };
}

/**
 * A quién se cambiaría si `proveedorFallido` rechaza la petición sin cobrar. Es lo que consulta el despacho, y
 * por eso mira otra vez las credenciales: entre encolar y enviar, una clave puede haberse borrado.
 */
export async function alternativaDeVoz(usuarioId: string, proveedorFallido: string): Promise<EleccionDeTrabajo | null> {
  const utilizables = await vocesUtilizables(usuarioId);
  return utilizables.find((opcion) => opcion.modelo.proveedor !== proveedorFallido) ?? null;
}
