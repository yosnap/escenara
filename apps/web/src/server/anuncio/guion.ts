import { eq } from "drizzle-orm";
import {
  ErrorPropuestaDeAnuncio,
  type HookPropuesto,
  INSTRUCCIONES_HOOKS_Y_GUION,
  leerPropuestaDeAnuncio,
  type OpcionDeDireccion,
  peticionDeHooksYGuion,
} from "@/lib/anuncio-guion";
import { limpiarTextoDePrompt } from "@/lib/ficha-personaje";
import { CONCEPTO_MAXIMO, ESCENAS_SUGERIDAS } from "@/lib/proyectos";
import { proyectoPropio } from "../asistente/consulta";
import { ErrorProyecto } from "../asistente/errores";
import { sustituirEscenas } from "../asistente/escenas";
import { db } from "../db/cliente";
import { adBriefs, type FilaBrief, type FilaOferta, offers } from "../db/esquema-anuncio";
import { type FilaProyecto, projects } from "../db/esquema-proyectos";
import { leerCatalogoDeDireccion } from "../direccion/catalogo";
import { exigirClaveIdempotencia, exigirConfirmacion } from "../generacion/comprobaciones";
import { exigirSelloVigente } from "../generacion/precios";
import { dentroDelLimite, type Limite } from "../limite";
import { limitesDeProyecto } from "../limites-proyecto";
import {
  ErrorDeTexto,
  ErrorPeticionRepetida,
  type EstimacionDeTexto,
  estimarTextoPorMapa,
  pedirTextoPorMapa,
} from "../mapa/texto";
import type { Actor } from "../media/servicio";
import { productoParaGenerar } from "../productos/prompt";
import type { Buscador } from "../proveedores/codigos";
import { ErrorCatalogo } from "../proveedores/contrato";
import { buscarAngulo } from "./catalogo";
import { ErrorAnuncio } from "./errores";
import { exigirPuedePedirGuion } from "./puerta-guion";

/**
 * **Hooks y guion desde el brief** (0.27.0): la entrada del asistente de 0.17.0 que, en vez de partir de una
 * idea escrita a mano, parte del **ángulo y la oferta** que el brief ya decidió.
 *
 * El orden es el mismo que el del resto del texto que cuesta dinero, y no cambia:
 *
 * 1. **la puerta del brief primero**: `exigirPuedePedirGuion` antes de gastar un solo token. Un brief a medias
 *    no llega a ser una petición de pago, y un ángulo que afirma algo comprobable sin declaración de veracidad
 *    tampoco;
 * 2. **estimar y confirmar**: los créditos que el usuario tenía delante y el sello del precio con el que se
 *    calcularon. Una entrada del mapa que se paga por cuota del plan no tiene precio que confirmar, así que no
 *    se le pide una confirmación de cero créditos;
 * 3. **recorrer el mapa** del usuario (0.21.1), que reserva y cierra el gasto de cada entrada en su moneda;
 * 4. lo que conteste se trata como **propuesta no confiable**: se limpia, se recorta y el guion se guarda como
 *    borrador. Los hooks se devuelven para que la persona elija, y elegir es gratis.
 *
 * **Aquí no se genera ni un fotograma ni un clip**: esta versión solo gasta texto.
 */

/** Ritmo por usuario. Pedir hooks es más barato que un guion entero, pero sigue costando dinero de alguien. */
export const RITMO_HOOKS: Limite = { ventanaSegundos: 60 * 60, maximo: 30 };

export interface PeticionDeHooks {
  claveIdempotencia: unknown;
  /** Créditos que el usuario tenía delante. Solo se exige cuando la entrada principal cuesta créditos. */
  creditosConfirmados?: unknown;
  selloEstimacion?: unknown;
  /** Cuántas escenas pedir; sin valor, las sugeridas para el formato del proyecto. */
  escenas?: unknown;
}

export interface PropuestaDeHooks {
  /** Los cinco arranques para elegir. Elegir uno es gratis: `aplicarHook`. */
  hooks: HookPropuesto[];
  /** Cuántas escenas se han escrito en el proyecto con esta llamada. */
  escenasEscritas: number;
  /**
   * Por qué el guion propuesto **no** se ha escrito, cuando no se ha podido. Vacío si se escribió. La llamada ya
   * está pagada, así que los hooks se devuelven igual y se dice qué ha pasado con el guion.
   */
  motivoGuionNoEscrito: string;
  nombreProveedor: string;
  modelo: string;
  deReserva: boolean;
}

/** Lo que el brief tiene resuelto para poder pedir. Todo comprobado contra el dueño por quien lo lee. */
interface BriefResuelto {
  brief: FilaBrief;
  oferta: FilaOferta;
}

/**
 * Estimación de lo que costaría una petición de hooks y guion: la de la **entrada principal** del mapa de este
 * usuario. Es una lectura: no llama a ningún proveedor y no reserva nada.
 */
export function estimacionDeHooksYGuion(usuarioId: string): Promise<EstimacionDeTexto> {
  return estimarTextoPorMapa(usuarioId);
}

/**
 * El brief del proyecto con su oferta, listo para componer la petición.
 *
 * La puerta ya ha comprobado que están el producto, el ángulo y el «qué se da»; esto vuelve a leerlos porque son
 * los datos que viajan, y leerlos de la puerta sería fiarse de una comprobación en lugar de del dato.
 */
async function briefResuelto(proyectoId: string): Promise<BriefResuelto> {
  const [brief] = await db().select().from(adBriefs).where(eq(adBriefs.projectId, proyectoId)).limit(1);
  if (!brief) {
    throw new ErrorAnuncio(
      409,
      "Este proyecto no tiene brief del anuncio, así que no hay ángulo ni oferta de los que sacar los hooks. Rellena el brief, o pide el guion por el asistente de siempre con la idea del proyecto.",
    );
  }
  const [oferta] = brief.offerId ? await db().select().from(offers).where(eq(offers.id, brief.offerId)).limit(1) : [];
  if (!oferta || oferta.deletedAt !== null) {
    throw new ErrorAnuncio(
      409,
      "El brief de este anuncio no tiene una oferta vigente: la que tenía se ha borrado. Elige otra en el brief y vuelve a pedir los hooks.",
    );
  }
  return { brief, oferta };
}

/** Los movimientos de cámara y los gestos del catálogo entre los que el hook puede elegir, con su nombre. */
async function opcionesDeArranque(
  usuarioId: string,
): Promise<{ movimientos: OpcionDeDireccion[]; gestos: OpcionDeDireccion[] }> {
  const catalogo = await leerCatalogoDeDireccion(usuarioId);
  const opciones = (categoria: "camara" | "microaccion"): OpcionDeDireccion[] =>
    [...(catalogo.get(categoria)?.values() ?? [])].map((p) => ({ clave: p.clave, nombre: p.nombre }));
  return { movimientos: opciones("camara"), gestos: opciones("microaccion") };
}

/** Escenas que se piden: nunca más de 12 ni del máximo de esta instalación (Admin › Ajustes), que no se pagan. */
function numeroDeEscenas(pedidas: unknown, proyecto: FilaProyecto, maximo: number): number {
  const tope = Math.min(12, maximo);
  if (pedidas === undefined || pedidas === null || pedidas === "") {
    return Math.min(tope, ESCENAS_SUGERIDAS[proyecto.format]);
  }
  const numero = typeof pedidas === "number" ? pedidas : Number.parseInt(String(pedidas), 10);
  if (!Number.isFinite(numero)) throw new ErrorAnuncio(400, "Indica cuántas escenas quieres.");
  return Math.min(tope, Math.max(1, Math.round(numero)));
}

/**
 * Compone la petición del proyecto: es la parte que **no cuesta nada** y la que puede fallar por un dato que ya
 * no está (un producto borrado), así que va antes de reservar. La comparten pedir un guion y crear variantes.
 */
export async function peticionDelProyecto(
  usuarioId: string,
  proyecto: FilaProyecto,
  escenas: number,
): Promise<{ entrada: string; clavesOfrecidas: { movimientos: string[]; gestos: string[] } }> {
  const { brief, oferta } = await briefResuelto(proyecto.id);
  const angulo = await buscarAngulo(brief.anglePresetKey);
  if (!angulo) {
    throw new ErrorAnuncio(
      409,
      "El ángulo que tenía este brief ya no está en el catálogo de esta instalación. Elige otro ángulo en el brief y vuelve a pedir los hooks.",
    );
  }
  const producto = brief.productId ? await productoParaGenerar(usuarioId, brief.productId, "") : null;
  if (!producto) {
    throw new ErrorAnuncio(
      409,
      "El producto de este brief ya no existe, así que no hay de qué hacer el anuncio. Elige otro producto en el brief.",
    );
  }
  const { movimientos, gestos } = await opcionesDeArranque(usuarioId);
  return {
    entrada: peticionDeHooksYGuion({
      producto: { nombre: producto.nombre, descripcion: producto.descripcionOriginal, tipo: producto.tipo },
      publico: brief.audience,
      versionMejor: brief.betterSelf,
      angulo: {
        nombre: angulo.nombre,
        definicion: angulo.definicion,
        porDondeEntra: angulo.porDondeEntra,
        ejemplo: angulo.ejemplo,
      },
      // Los cuatro opcionales llegan vacíos cuando son nulos en la base: vacío = no aparece en la petición.
      oferta: {
        queSeDa: oferta.whatTheyGet,
        precio: oferta.price ?? "",
        garantia: oferta.guarantee ?? "",
        urgencia: oferta.urgency ?? "",
        bonus: oferta.bonus ?? "",
      },
      notas: brief.notes,
      escenas,
      segundos: proyecto.clipSeconds,
      movimientos,
      gestos,
    }),
    clavesOfrecidas: { movimientos: movimientos.map((m) => m.clave), gestos: gestos.map((g) => g.clave) },
  };
}

/**
 * Escribe en el proyecto el guion propuesto y devuelve cuántas escenas quedaron, o el motivo por el que no se
 * pudo escribir. **No lanza** cuando el proyecto ya tiene escenas en producción: la llamada está pagada y los
 * hooks siguen valiendo, así que se dice qué pasó en lugar de tirarlo todo.
 */
async function escribirEscenas(
  proyecto: FilaProyecto,
  propuesta: { concepto: string; escenas: readonly { texto: string; accion: string; segundos: number }[] },
): Promise<{ escritas: number; motivo: string }> {
  if (propuesta.escenas.length === 0) {
    return {
      escritas: 0,
      motivo:
        "El modelo ha propuesto los hooks pero ningún guion utilizable. Elige un hook y escribe las escenas a mano, o vuelve a pedirlo.",
    };
  }
  try {
    const escritas = await db().transaction(async (tx) => {
      const total = await sustituirEscenas(tx, proyecto.id, propuesta.escenas);
      if (propuesta.concepto !== "") {
        await tx
          .update(projects)
          .set({ concept: limpiarTextoDePrompt(propuesta.concepto, CONCEPTO_MAXIMO), updatedAt: new Date() })
          .where(eq(projects.id, proyecto.id));
      }
      return total;
    });
    return { escritas, motivo: "" };
  } catch (error) {
    // `sustituirEscenas` se niega a pisar escenas con un trabajo pagado detrás, y tiene razón: su motivo es el
    // que hay que leer. Se devuelve tal cual, con los hooks, en vez de convertirlo en un error de la llamada.
    if (error instanceof ErrorProyecto) return { escritas: 0, motivo: error.message };
    throw error;
  }
}

/**
 * Pide **cinco hooks y un guion** para el ángulo del brief de este proyecto.
 *
 * Quien llama tiene que haber comprobado ya que el proyecto es suyo: esta función recibe la fila. Es lo que
 * permite que las variantes (proyectos hermanos recién creados) reutilicen exactamente este camino.
 */
export async function pedirHooksYGuion(
  actor: Actor,
  proyecto: FilaProyecto,
  peticion: {
    claveIdempotencia: string;
    escenas: number;
    buscar: Buscador;
    /** `true` cuando la entrada principal del mapa se paga por cuota y no hubo nada que confirmar. */
    porCuota: boolean;
  },
): Promise<PropuestaDeHooks> {
  // Antes de gastar un solo token: el brief tiene que estar listo y con su declaración cuando el ángulo la pide.
  await exigirPuedePedirGuion(proyecto.id);
  const { entrada, clavesOfrecidas } = await peticionDelProyecto(actor.id, proyecto, peticion.escenas);

  let resultado: Awaited<ReturnType<typeof pedirTextoPorMapa>>;
  try {
    resultado = await pedirTextoPorMapa({
      usuarioId: actor.id,
      proyectoId: proyecto.id,
      kind: "guion",
      instrucciones: INSTRUCCIONES_HOOKS_Y_GUION,
      entrada,
      claveIdempotencia: peticion.claveIdempotencia,
      buscar: peticion.buscar,
      // Solo se gasta lo que el usuario vio: la entrada principal si es de pago, y las de cuota del plan.
      limitarAConfirmado: true,
    });
  } catch (error) {
    if (error instanceof ErrorDeTexto) {
      throw new ErrorAnuncio(
        502,
        error.mensaje("No se han podido escribir los hooks, así que el proyecto se ha quedado como estaba"),
      );
    }
    if (error instanceof ErrorPeticionRepetida) {
      throw new ErrorAnuncio(
        409,
        "Esa misma petición ya está en marcha, así que no se ha llamado otra vez ni se ha cobrado de nuevo. Espera unos segundos y vuelve a mirar el proyecto.",
      );
    }
    if (error instanceof ErrorCatalogo) throw new ErrorAnuncio(error.estado, error.message);
    throw error;
  }

  let propuesta: ReturnType<typeof leerPropuestaDeAnuncio>;
  try {
    propuesta = leerPropuestaDeAnuncio(
      resultado.texto,
      proyecto.clipSeconds,
      clavesOfrecidas,
      (await limitesDeProyecto()).escenasMaximas,
    );
  } catch (error) {
    if (error instanceof ErrorPropuestaDeAnuncio) {
      // Ha contestado, así que si cobraba por petición ya ha cobrado: se dice **quién** y qué pasó.
      throw new ErrorAnuncio(
        502,
        `${resultado.nombreProveedor} (${resultado.modelo}) ha contestado, pero ${error.message}. ${
          peticion.porCuota
            ? "Ese servicio se paga por cuota del plan, así que no se te han cobrado créditos."
            : "La llamada ya estaba hecha, así que su coste se ha apuntado en tu registro de gasto."
        } El proyecto se ha quedado como estaba: vuelve a pedirlo o escribe el guion a mano.`,
      );
    }
    throw error;
  }

  const { escritas, motivo } = await escribirEscenas(proyecto, propuesta);
  const pagada: PropuestaDeHooks = {
    hooks: propuesta.hooks,
    escenasEscritas: escritas,
    motivoGuionNoEscrito: motivo,
    nombreProveedor: resultado.nombreProveedor,
    modelo: resultado.modelo,
    deReserva: resultado.deReserva,
  };
  // Antes de responder: si la respuesta no llega, los hooks pagados siguen estando en el proyecto.
  await db()
    .update(adBriefs)
    .set({ proposedHooks: pagada as unknown as Record<string, unknown> })
    .where(eq(adBriefs.projectId, proyecto.id));
  return pagada;
}

/** La última propuesta de hooks pagada de un proyecto, o `null` si nunca se pidió (o se pidió sin brief). */
export async function hooksGuardadosDe(proyectoId: string): Promise<PropuestaDeHooks | null> {
  const [fila] = await db()
    .select({ hooks: adBriefs.proposedHooks })
    .from(adBriefs)
    .where(eq(adBriefs.projectId, proyectoId))
    .limit(1);
  return (fila?.hooks as PropuestaDeHooks | null | undefined) ?? null;
}

/**
 * Punto de entrada de la pantalla: comprueba el dueño, la confirmación del coste y el ritmo, y pide los hooks.
 *
 * Se separa de `pedirHooksYGuion` porque las variantes confirman **una sola vez** el coste de todas: si la
 * confirmación viviera dentro, cada hermano pediría la suya y la confirmación agregada sería una mentira.
 */
export async function proponerHooksYGuion(
  actor: Actor,
  proyectoId: unknown,
  peticion: PeticionDeHooks,
  buscar: Buscador = fetch,
): Promise<PropuestaDeHooks> {
  const proyecto = await proyectoPropio(actor, proyectoId);
  const clave = exigirClaveIdempotencia(peticion.claveIdempotencia);
  const estimacion = await estimacionDeHooksYGuion(actor.id);
  if (!estimacion.hayEntradas) throw new ErrorAnuncio(409, estimacion.motivo);
  // Solo se confirma lo que cuesta: una entrada de cuota del plan no tiene precio que sellar, y pedir una
  // confirmación de cero créditos sería un trámite que no protege de nada.
  if (!estimacion.porCuota) {
    exigirConfirmacion(peticion.creditosConfirmados, estimacion.creditos);
    exigirSelloVigente(peticion.selloEstimacion, estimacion.sello, true);
  }
  if (!(await dentroDelLimite(`anuncio:hooks:${actor.id}`, RITMO_HOOKS))) {
    throw new ErrorAnuncio(429, "Has pedido demasiados hooks seguidos. Espera un rato y vuelve a intentarlo.");
  }
  return pedirHooksYGuion(actor, proyecto, {
    claveIdempotencia: `hooks:${proyecto.id}:${clave}`,
    escenas: numeroDeEscenas(peticion.escenas, proyecto, (await limitesDeProyecto()).escenasMaximas),
    buscar,
    porCuota: estimacion.porCuota,
  });
}
