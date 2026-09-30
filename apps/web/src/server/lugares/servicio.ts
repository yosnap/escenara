import { and, eq, inArray, isNull } from "drizzle-orm";
import { GUIA_ESTILO_VACIA } from "@/lib/animados";
import { limpiarTextoDePrompt } from "@/lib/ficha-personaje";
import {
  DESCRIPCION_LUGAR_MAXIMA,
  esPapelLugar,
  type LugarVista,
  MAXIMO_LUGARES,
  MAXIMO_REFERENCIAS_LUGAR,
  NOMBRE_LUGAR_MAXIMO,
  type PapelLugar,
} from "@/lib/lugares";
import { guiaDeEstiloPedida } from "../animados/estilos";
import { db, type Ejecutor } from "../db/cliente";
import { media } from "../db/esquema";
import { placeReferences, places } from "../db/esquema-lugares";
import type { Actor } from "../media/servicio";
import { ErrorPersonaje } from "../personajes/errores";
import { filaPropia, obtenerLugar, siguienteOrden } from "./consulta";
import { revocarPorCambioDeFotos } from "./declaracion";
import { ErrorLugar } from "./errores";
import { nuevaVersionDeLugar } from "./versiones";

/**
 * Alta y edición de lugares y de sus fotos de referencia.
 *
 * Reglas duras, las mismas que en productos y personajes:
 *
 * - **una foto ajena no se puede referenciar**, aunque se conozca su identificador: se comprueba que sea del
 *   usuario, que sea una imagen y que no esté en la papelera;
 * - un **documento de consentimiento no es una foto de un lugar**;
 * - el nombre y la descripción pasan por la **misma limpieza anti-inyección** que la ficha del personaje: la
 *   descripción acaba en el prompt traducida, así que no puede llevar banderas ni parámetros del proveedor;
 * - cambiar las fotos **retira la declaración vigente**: la declaración hablaba de otras fotos, y una foto nueva
 *   puede traer gente o un sitio distinto.
 */

interface DatosLugar {
  nombre?: unknown;
  descripcion?: unknown;
  /** Clave del estilo animado del catálogo; sin ella, o con `realista`, el lugar es realista. Solo al crear. */
  estilo?: unknown;
}

function nombreLimpio(valor: unknown): string {
  const nombre = limpiarTextoDePrompt(valor, NOMBRE_LUGAR_MAXIMO).trim();
  if (nombre === "") throw new ErrorLugar(400, "Ponle un nombre al lugar para poder encontrarlo luego.");
  return nombre;
}

/** La guía de estilo del catálogo, con los mensajes del lugar y no los del personaje. */
async function guiaDelLugar(estilo: unknown) {
  try {
    return await guiaDeEstiloPedida({ estilo });
  } catch (error) {
    if (error instanceof ErrorPersonaje) throw new ErrorLugar(error.estado, error.message);
    throw error;
  }
}

/** Crea un lugar. Nace sin fotos y con su primera versión: se le añaden fotos después, desde la biblioteca. */
export async function crearLugar(actor: Actor, datos: DatosLugar): Promise<LugarVista> {
  const nombre = nombreLimpio(datos.nombre);
  const suyos = await db().select({ id: places.id }).from(places).where(eq(places.ownerId, actor.id));
  if (suyos.length >= MAXIMO_LUGARES) {
    throw new ErrorLugar(409, `Ya tienes ${MAXIMO_LUGARES} lugares: borra alguno antes de crear otro.`);
  }
  const { renderStyle, styleGuide } = await guiaDelLugar(datos.estilo);
  const creado = await db().transaction(async (tx) => {
    const [fila] = await tx
      .insert(places)
      .values({
        ownerId: actor.id,
        name: nombre,
        description: limpiarTextoDePrompt(datos.descripcion, DESCRIPCION_LUGAR_MAXIMA),
        renderStyle,
        styleGuide: renderStyle === "animado" ? styleGuide : GUIA_ESTILO_VACIA,
        origin: renderStyle === "animado" ? "generado" : "fotos",
      })
      .onConflictDoNothing({ target: [places.ownerId, places.name] })
      .returning();
    if (!fila) return null;
    await nuevaVersionDeLugar(tx, fila.id, actor.id, ["alta"]);
    return fila;
  });
  // El nombre repetido se dice con su motivo en lugar de devolver el nombre de una restricción de la base.
  if (!creado) throw new ErrorLugar(409, `Ya tienes un lugar que se llama «${nombre}»: ponle otro nombre.`);
  return obtenerLugar(actor, creado.id);
}

/** Cambia el nombre o la descripción. Solo la descripción versiona: el nombre no llega nunca al modelo. */
export async function actualizarLugar(actor: Actor, id: unknown, datos: DatosLugar): Promise<LugarVista> {
  const lugar = await filaPropia(actor, id);
  const nombre = datos.nombre === undefined ? lugar.name : nombreLimpio(datos.nombre);
  const descripcion =
    datos.descripcion === undefined
      ? lugar.description
      : limpiarTextoDePrompt(datos.descripcion, DESCRIPCION_LUGAR_MAXIMA);
  if (nombre !== lugar.name) {
    const [repetido] = await db()
      .select({ id: places.id })
      .from(places)
      .where(and(eq(places.ownerId, actor.id), eq(places.name, nombre)))
      .limit(1);
    if (repetido) throw new ErrorLugar(409, `Ya tienes un lugar que se llama «${nombre}»: ponle otro.`);
  }
  await db().transaction(async (tx) => {
    await tx
      .update(places)
      .set({ name: nombre, description: descripcion, updatedAt: new Date() })
      .where(and(eq(places.id, lugar.id), eq(places.ownerId, actor.id)));
    if (descripcion !== lugar.description) await nuevaVersionDeLugar(tx, lugar.id, actor.id, ["descripción"]);
  });
  return obtenerLugar(actor, lugar.id);
}

/** Una foto que se quiere añadir, con el papel que hace. */
export interface FotoDeLugarPedida {
  medioId: string;
  papel: PapelLugar;
}

/** Lee la lista de fotos del cuerpo de la petición. Una entrada mal formada se rechaza con su motivo. */
export function leerFotosDeLugar(valor: unknown): FotoDeLugarPedida[] {
  if (!Array.isArray(valor)) throw new ErrorLugar(400, "Envía las fotos como una lista.");
  if (valor.length === 0) throw new ErrorLugar(400, "No has elegido ninguna foto.");
  if (valor.length > MAXIMO_REFERENCIAS_LUGAR) {
    throw new ErrorLugar(400, `Como mucho ${MAXIMO_REFERENCIAS_LUGAR} fotos de una vez.`);
  }
  return valor.map((entrada) => {
    const foto = (entrada ?? {}) as Record<string, unknown>;
    if (typeof foto.medioId !== "string" || foto.medioId === "") {
      throw new ErrorLugar(400, "Alguna de las fotos no trae su identificador.");
    }
    if (!esPapelLugar(foto.papel)) {
      throw new ErrorLugar(400, "Dile para qué sirve cada foto: la maestra, un plano general, un detalle…");
    }
    return { medioId: foto.medioId, papel: foto.papel };
  });
}

/** La maestra que había pasa a plano general: solo puede haber una, y la nueva manda. */
async function soltarMaestra(tx: Ejecutor, lugarId: string): Promise<void> {
  await tx
    .update(placeReferences)
    .set({ kind: "general" })
    .where(and(eq(placeReferences.placeId, lugarId), eq(placeReferences.kind, "maestra")));
}

/**
 * Añade fotos de la biblioteca como referencias del lugar, cada una con su papel. Lo que ya es referencia se
 * ignora en silencio: repetir la petición (un doble clic, un reintento) no es un error. `generadas` lo pone el
 * servidor en las que salen de una edición o de un candidato aprobado, nunca el navegador.
 */
export async function anadirFotosAlLugar(
  actor: Actor,
  id: unknown,
  pedidas: FotoDeLugarPedida[],
  generadas = false,
): Promise<LugarVista> {
  const lugar = await filaPropia(actor, id);
  const yaTiene = await db()
    .select({ mediaId: placeReferences.mediaId })
    .from(placeReferences)
    .where(eq(placeReferences.placeId, lugar.id));
  const existentes = new Set(yaTiene.map((f) => f.mediaId));
  const nuevas = [...new Map(pedidas.filter((f) => !existentes.has(f.medioId)).map((f) => [f.medioId, f])).values()];
  if (nuevas.length === 0) return obtenerLugar(actor, lugar.id);
  if (existentes.size + nuevas.length > MAXIMO_REFERENCIAS_LUGAR) {
    throw new ErrorLugar(
      409,
      `Un lugar admite ${MAXIMO_REFERENCIAS_LUGAR} fotos como mucho y ya tiene ${existentes.size}. Quita alguna antes de añadir más.`,
    );
  }
  if (nuevas.filter((f) => f.papel === "maestra").length > 1) {
    throw new ErrorLugar(400, "Solo una foto puede ser la maestra del lugar.");
  }
  const propias = await db()
    .select()
    .from(media)
    .where(
      and(
        inArray(
          media.id,
          nuevas.map((f) => f.medioId),
        ),
        eq(media.ownerId, actor.id),
        isNull(media.deletedAt),
      ),
    );
  if (propias.length !== nuevas.length) throw new ErrorLugar(404, "Alguna de las fotos no existe.");
  if (propias.some((m) => m.kind !== "imagen")) {
    throw new ErrorLugar(400, "Las fotos de un lugar tienen que ser imágenes.");
  }
  if (propias.some((m) => m.isDocument)) {
    throw new ErrorLugar(400, "Un documento de consentimiento no se puede usar como foto de un lugar.");
  }
  let orden = await siguienteOrden(lugar.id);
  await db().transaction(async (tx) => {
    if (nuevas.some((f) => f.papel === "maestra")) await soltarMaestra(tx, lugar.id);
    await tx
      .insert(placeReferences)
      .values(
        nuevas.map((foto) => ({
          placeId: lugar.id,
          mediaId: foto.medioId,
          kind: foto.papel,
          origin: generadas ? ("vista_generada" as const) : ("foto_original" as const),
          sortOrder: orden++,
        })),
      )
      .onConflictDoNothing({ target: [placeReferences.placeId, placeReferences.mediaId] });
    await revocarPorCambioDeFotos(tx, lugar.id);
    await nuevaVersionDeLugar(
      tx,
      lugar.id,
      actor.id,
      nuevas.some((f) => f.papel === "maestra") ? ["fotos", "maestra"] : ["fotos"],
    );
  });
  return obtenerLugar(actor, lugar.id);
}

/** Cambia el papel de una foto ya añadida. Hacerla maestra deja la anterior como plano general. */
export async function cambiarPapelDeFoto(
  actor: Actor,
  id: unknown,
  referenciaId: unknown,
  papel: unknown,
): Promise<LugarVista> {
  const lugar = await filaPropia(actor, id);
  if (!esPapelLugar(papel)) throw new ErrorLugar(400, "Ese papel de la foto no existe.");
  if (typeof referenciaId !== "string" || referenciaId === "")
    throw new ErrorLugar(400, "No has dicho qué foto cambiar.");
  await db().transaction(async (tx) => {
    const [actual] = await tx
      .select()
      .from(placeReferences)
      // El lugar va en el mismo `where` que la referencia: sin esto, conocer un identificador bastaría.
      .where(and(eq(placeReferences.id, referenciaId), eq(placeReferences.placeId, lugar.id)))
      .limit(1);
    if (!actual) throw new ErrorLugar(404, `Esa foto no es una referencia de «${lugar.name}».`);
    if (actual.kind === papel) return;
    if (papel === "maestra") await soltarMaestra(tx, lugar.id);
    await tx.update(placeReferences).set({ kind: papel }).where(eq(placeReferences.id, actual.id));
    const tocaMaestra = papel === "maestra" || actual.kind === "maestra";
    // Cambiar cuál es la maestra cambia la foto que se envía: la declaración hablaba de la anterior.
    if (tocaMaestra) await revocarPorCambioDeFotos(tx, lugar.id);
    await nuevaVersionDeLugar(tx, lugar.id, actor.id, tocaMaestra ? ["maestra"] : ["papel de una foto"]);
  });
  return obtenerLugar(actor, lugar.id);
}

/** Quita una foto del lugar. **No la borra de la biblioteca**: lo que desaparece es la relación. */
export async function quitarFotoDelLugar(actor: Actor, id: unknown, referenciaId: unknown): Promise<LugarVista> {
  const lugar = await filaPropia(actor, id);
  if (typeof referenciaId !== "string" || referenciaId === "")
    throw new ErrorLugar(400, "No has dicho qué foto quitar.");
  await db().transaction(async (tx) => {
    const [fila] = await tx
      .delete(placeReferences)
      .where(and(eq(placeReferences.id, referenciaId), eq(placeReferences.placeId, lugar.id)))
      .returning();
    if (!fila) throw new ErrorLugar(404, `Esa foto no es una referencia de «${lugar.name}».`);
    await nuevaVersionDeLugar(tx, lugar.id, actor.id, fila.kind === "maestra" ? ["fotos", "maestra"] : ["fotos"]);
  });
  return obtenerLugar(actor, lugar.id);
}
