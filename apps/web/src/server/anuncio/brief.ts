import { and, eq } from "drizzle-orm";
import { type BriefVista, NOTAS_BRIEF_MAXIMAS, PUBLICO_MAXIMO, VERSION_MEJOR_MAXIMA } from "@/lib/anuncio";
import { limpiarTextoDePrompt } from "@/lib/ficha-personaje";
import { proyectoPropio } from "../asistente/consulta";
import { db } from "../db/cliente";
import { adBriefs, type FilaBrief, type FilaOferta, offers } from "../db/esquema-anuncio";
import { products } from "../db/esquema-productos";
import { projects } from "../db/esquema-proyectos";
import type { Actor } from "../media/servicio";
import { filaPropia as productoPropio } from "../productos/consulta";
import { buscarAngulo, exigirAnguloValido } from "./catalogo";
import { hayDeclaracion } from "./declaracion";
import { ErrorAnuncio } from "./errores";
import { ofertaPropia, vistaDeOferta } from "./ofertas";

/**
 * El **brief del anuncio** de un proyecto: producto, público, la versión mejor de sí mismo, **un** ángulo y la
 * oferta. Va antes del guion, y es **opcional**: un proyecto sin brief funciona exactamente como antes de la
 * 0.27.0.
 *
 * Reglas duras que aplica este servicio:
 *
 * - **un proyecto es un anuncio**, así que hay como mucho un brief (`ad_briefs.project_id` es único) y **un solo
 *   ángulo**, que además tiene que estar en el catálogo y seguir ofreciéndose;
 * - **todo se comprueba contra el dueño**: el proyecto, el producto y la oferta. Un identificador ajeno responde
 *   404, y la oferta tiene que ser **de ese producto**: una oferta de otro producto en este brief describiría lo
 *   que se le da por algo que no es lo que se anuncia;
 * - `projects.angle_preset_key` se mantiene **sincronizado** en la misma escritura. Es una copia para poder
 *   filtrar y comparar campañas sin unir tablas, y quien manda es el brief.
 */

interface DatosBrief {
  productoId?: unknown;
  publico?: unknown;
  versionMejor?: unknown;
  angulo?: unknown;
  ofertaId?: unknown;
  notas?: unknown;
}

/** Lo que llega como «nada»: sin producto y sin oferta se guardan nulos, no cadenas vacías. */
const esVacio = (valor: unknown): boolean => valor === null || valor === "";

async function vistaDeBrief(fila: FilaBrief): Promise<BriefVista> {
  const [producto] = fila.productId
    ? await db().select().from(products).where(eq(products.id, fila.productId)).limit(1)
    : [];
  const [filaOferta] = fila.offerId ? await db().select().from(offers).where(eq(offers.id, fila.offerId)).limit(1) : [];
  const oferta: FilaOferta | undefined = filaOferta;
  const angulo = await buscarAngulo(fila.anglePresetKey);
  return {
    proyectoId: fila.projectId,
    productoId: fila.productId,
    productoNombre: producto?.name ?? "",
    publico: fila.audience,
    versionMejor: fila.betterSelf,
    angulo: fila.anglePresetKey,
    anguloVista: angulo,
    ofertaId: fila.offerId,
    // Una oferta borrada en lógico ya no se ofrece: el brief la deja de citar y la pantalla lo dice.
    oferta: oferta && oferta.deletedAt === null ? await vistaDeOferta(oferta) : null,
    notas: fila.notes,
    declaracionRegistrada:
      angulo?.exigeDeclaracion === true ? await hayDeclaracion(fila.projectId, fila.anglePresetKey) : false,
    actualizado: fila.updatedAt.toISOString(),
  };
}

/** La fila del brief de un proyecto propio, o `null` si no tiene. Comprueba el dueño del proyecto. */
export async function filaDeBrief(actor: Actor, proyectoId: unknown): Promise<FilaBrief | null> {
  const proyecto = await proyectoPropio(actor, proyectoId);
  const [fila] = await db().select().from(adBriefs).where(eq(adBriefs.projectId, proyecto.id)).limit(1);
  return fila ?? null;
}

/**
 * El brief de un proyecto propio, o `null` cuando no tiene ninguno. `null` **no es un error**: es el camino de
 * quien escribe su guion a mano.
 */
export async function obtenerBrief(actor: Actor, proyectoId: unknown): Promise<BriefVista | null> {
  const fila = await filaDeBrief(actor, proyectoId);
  return fila ? vistaDeBrief(fila) : null;
}

/**
 * Guarda el brief de un proyecto: lo crea si no existe y cambia lo que llegue si ya existe. Lo que no se envía se
 * queda como estaba, así que la pantalla puede guardar campo a campo.
 *
 * La oferta y el producto se validan **juntos**: la oferta tiene que ser del producto del brief, y se comprueba
 * con el producto que va a quedar guardado, no con el que había antes. Cambiar el producto y dejar la oferta
 * vieja es justo el descuadre que esto impide.
 */
export async function guardarBrief(actor: Actor, proyectoId: unknown, datos: DatosBrief): Promise<BriefVista> {
  const proyecto = await proyectoPropio(actor, proyectoId);
  const [existente] = await db().select().from(adBriefs).where(eq(adBriefs.projectId, proyecto.id)).limit(1);

  const productoId =
    datos.productoId === undefined
      ? (existente?.productId ?? null)
      : esVacio(datos.productoId)
        ? null
        : (await productoPropio(actor, datos.productoId)).id;

  /**
   * La oferta se relee por su fila y no solo por su identificador, también cuando el brief ya la tenía: hay que
   * comprobar de qué producto es **ahora**, porque el producto del brief puede haber cambiado en esta llamada o la
   * oferta puede haberse movido a otro producto desde entonces.
   */
  const ofertaPedida = datos.ofertaId === undefined ? (existente?.offerId ?? null) : datos.ofertaId;
  const oferta = esVacio(ofertaPedida) ? null : await ofertaPropia(actor, ofertaPedida);
  const ofertaId = oferta?.id ?? null;

  if (oferta) {
    if (productoId === null) {
      throw new ErrorAnuncio(409, "La oferta va atada a un producto, así que antes di de qué producto es el anuncio.");
    }
    if (oferta.productId !== productoId) {
      throw new ErrorAnuncio(
        409,
        "Esa oferta es de otro producto, así que no describe lo que se anuncia aquí. Elige una oferta de este producto, duplícala a este desde la pantalla de ofertas, o quita la oferta del brief.",
      );
    }
  }

  const angulo =
    datos.angulo === undefined ? (existente?.anglePresetKey ?? "") : await exigirAnguloValido(datos.angulo);

  const campos = {
    productId: productoId,
    offerId: ofertaId,
    anglePresetKey: angulo,
    ...(datos.publico !== undefined ? { audience: limpiarTextoDePrompt(datos.publico, PUBLICO_MAXIMO) } : {}),
    ...(datos.versionMejor !== undefined
      ? { betterSelf: limpiarTextoDePrompt(datos.versionMejor, VERSION_MEJOR_MAXIMA) }
      : {}),
    ...(datos.notas !== undefined ? { notes: limpiarTextoDePrompt(datos.notas, NOTAS_BRIEF_MAXIMAS) } : {}),
  };

  /**
   * El brief y la copia denormalizada del ángulo se escriben **en la misma transacción**: si una de las dos
   * fallara, el proyecto quedaría con un ángulo que su brief no tiene y los listados por ángulo mentirían.
   */
  const fila = await db().transaction(async (tx) => {
    const [guardada] = existente
      ? await tx
          .update(adBriefs)
          .set({ ...campos, updatedAt: new Date() })
          .where(eq(adBriefs.id, existente.id))
          .returning()
      : await tx
          .insert(adBriefs)
          .values({ projectId: proyecto.id, ...campos })
          .returning();
    if (!guardada) throw new ErrorAnuncio(500, "El brief no se ha guardado. Vuelve a intentarlo.");
    await tx
      .update(projects)
      .set({ anglePresetKey: guardada.anglePresetKey, updatedAt: new Date() })
      .where(and(eq(projects.id, proyecto.id), eq(projects.userId, actor.id)));
    return guardada;
  });
  return vistaDeBrief(fila);
}

/**
 * Borra el brief de un proyecto y limpia la copia del ángulo. El proyecto **no se toca**: su guion, sus escenas y
 * lo generado siguen donde estaban, y vuelve a ser un proyecto sin brief, como antes de esta versión.
 */
export async function borrarBrief(actor: Actor, proyectoId: unknown): Promise<void> {
  const proyecto = await proyectoPropio(actor, proyectoId);
  await db().transaction(async (tx) => {
    await tx.delete(adBriefs).where(eq(adBriefs.projectId, proyecto.id));
    await tx
      .update(projects)
      .set({ anglePresetKey: "", updatedAt: new Date() })
      .where(and(eq(projects.id, proyecto.id), eq(projects.userId, actor.id)));
  });
}
