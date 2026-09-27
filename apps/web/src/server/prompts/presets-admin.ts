import { and, count, eq, isNull, sql } from "drizzle-orm";
import {
  type CategoriaPreset,
  esCategoriaPreset,
  esProporcion,
  PRESET_DESCRIPCION_MAXIMA,
  PRESET_NOMBRE_MAXIMO,
  PRESET_PROMPT_MAXIMO,
  type PresetVista,
  type ValoresPreset,
} from "@/lib/presets";
import { db, type Ejecutor } from "../db/cliente";
import { presets } from "../db/esquema";
import { presetDeLaInstalacion, presetUsable, textoDeValores, valoresDeTexto, vistaDePreset } from "./consulta";
import { ErrorPreset } from "./errores";

/**
 * Alta, edición, orden y activación de presets. Dos permisos distintos y bien separados:
 *
 * - **quien administra** edita los de la **instalación** (`owner_id` nulo). Cualquier función de este fichero
 *   que los toque exige que la fila sea de la instalación: una fila con dueño responde 404 aunque quien pida
 *   el cambio sea administrador, porque un preset de un usuario es suyo y de nadie más;
 * - **cada usuario** puede **duplicar** un preset para hacerlo suyo y editar su copia. No puede tocar el
 *   original ni el de otro usuario (IDOR comprobado en `presetUsable`).
 *
 * Compartir presets entre cuentas sigue siendo de 0.28.0.
 */

/** Tope de copias por usuario: duplicar es barato y sin tope una cuenta podría llenar la tabla. */
export const MAXIMO_PRESETS_PROPIOS = 60;

const CLAVE = /^[a-z0-9][a-z0-9-]{1,48}$/;

export interface DatosPreset {
  categoria: CategoriaPreset;
  clave: string;
  nombre: string;
  descripcion: string;
  prompt: string;
  /** Proporción que exige, solo en `formato`. Cadena vacía = ninguna. */
  proporcion?: string;
  /** Segundos que exige, solo en `duracion`. 0 = ninguno. */
  segundos?: number;
  orden: number;
  activo: boolean;
}

function exigirTexto(valor: unknown, campo: string, maximo: number, minimo = 1): string {
  const texto = typeof valor === "string" ? valor.trim().replace(/\s+/g, " ") : "";
  if (texto.length < minimo) throw new ErrorPreset(400, `${campo} no puede quedar vacío.`);
  if (texto.length > maximo) throw new ErrorPreset(400, `${campo} no puede pasar de ${maximo} caracteres.`);
  return texto;
}

function exigirClave(valor: unknown): string {
  const clave = typeof valor === "string" ? valor.trim().toLowerCase() : "";
  if (!CLAVE.test(clave)) {
    throw new ErrorPreset(400, "La clave solo admite minúsculas, números y guiones, y tiene que tener 2 o más.");
  }
  return clave;
}

function exigirOrden(valor: unknown): number {
  if (typeof valor !== "number" || !Number.isInteger(valor) || valor < 0 || valor > 10_000) {
    throw new ErrorPreset(400, "El orden tiene que ser un número entero entre 0 y 10.000.");
  }
  return valor;
}

/**
 * Valores del preset, validados por categoría. Una proporción solo tiene sentido en `formato` y unos segundos
 * solo en `duracion`: fuera de ahí se descartan en lugar de guardarse como restricción que nadie comprueba.
 */
function exigirValores(datos: DatosPreset): ValoresPreset {
  const prompt = exigirTexto(datos.prompt, "El texto del prompt", PRESET_PROMPT_MAXIMO);
  const valores: ValoresPreset = { prompt };
  if (datos.categoria === "formato") {
    const proporcion = typeof datos.proporcion === "string" ? datos.proporcion.trim() : "";
    if (proporcion === "") throw new ErrorPreset(400, "Un formato tiene que declarar su proporción («9:16»).");
    if (!esProporcion(proporcion)) throw new ErrorPreset(400, "La proporción se escribe como «9:16».");
    valores.proporcion = proporcion;
  }
  if (datos.categoria === "duracion") {
    const segundos = datos.segundos;
    if (typeof segundos !== "number" || !Number.isInteger(segundos) || segundos < 1 || segundos > 600) {
      throw new ErrorPreset(400, "Una duración tiene que declarar sus segundos (de 1 a 600).");
    }
    valores.segundos = segundos;
  }
  return valores;
}

function exigirCategoria(valor: unknown): CategoriaPreset {
  if (!esCategoriaPreset(valor)) throw new ErrorPreset(400, "Esa categoría de preset no existe.");
  return valor;
}

/** Datos ya validados, listos para insertar o actualizar. */
function normalizar(datos: DatosPreset) {
  const categoria = exigirCategoria(datos.categoria);
  return {
    category: categoria,
    slug: exigirClave(datos.clave),
    name: exigirTexto(datos.nombre, "El nombre", PRESET_NOMBRE_MAXIMO),
    description: exigirTexto(datos.descripcion, "La descripción", PRESET_DESCRIPCION_MAXIMA),
    values: textoDeValores(exigirValores({ ...datos, categoria })),
    sortOrder: exigirOrden(datos.orden),
    active: datos.activo === true,
  };
}

/** Crea un preset **de la instalación**. Solo quien administra llega aquí. */
export async function crearPresetDeLaInstalacion(datos: DatosPreset): Promise<PresetVista> {
  const valores = normalizar(datos);
  const filas = await db().insert(presets).values(valores).onConflictDoNothing().returning();
  const [fila] = filas;
  if (!fila) {
    throw new ErrorPreset(409, `Ya hay un preset de ${valores.category} con la clave «${valores.slug}».`);
  }
  return vistaDePreset(fila);
}

/** Edita un preset de la instalación. La clave no se toca: es la que ancla la semilla. */
export async function editarPresetDeLaInstalacion(id: string, datos: DatosPreset): Promise<PresetVista> {
  const anterior = await presetDeLaInstalacion(id);
  const valores = normalizar({ ...datos, clave: anterior.slug, categoria: anterior.category });
  const [fila] = await db()
    .update(presets)
    .set({ ...valores, category: anterior.category, slug: anterior.slug, updatedAt: new Date() })
    .where(and(eq(presets.id, anterior.id), isNull(presets.ownerId)))
    .returning();
  if (!fila) throw new ErrorPreset(404, "Ese preset no es de la instalación.");
  return vistaDePreset(fila);
}

/** Activa o desactiva un preset de la instalación. Uno desactivado no se puede elegir ni enviar. */
export async function activarPresetDeLaInstalacion(id: string, activo: boolean): Promise<PresetVista> {
  const anterior = await presetDeLaInstalacion(id);
  const [fila] = await db()
    .update(presets)
    .set({ active: activo === true, updatedAt: new Date() })
    .where(and(eq(presets.id, anterior.id), isNull(presets.ownerId)))
    .returning();
  if (!fila) throw new ErrorPreset(404, "Ese preset no es de la instalación.");
  return vistaDePreset(fila);
}

/** Cambia el orden de un preset de la instalación: es lo que decide en qué posición sale su botón. */
export async function ordenarPresetDeLaInstalacion(id: string, orden: number): Promise<PresetVista> {
  const anterior = await presetDeLaInstalacion(id);
  const [fila] = await db()
    .update(presets)
    .set({ sortOrder: exigirOrden(orden), updatedAt: new Date() })
    .where(and(eq(presets.id, anterior.id), isNull(presets.ownerId)))
    .returning();
  if (!fila) throw new ErrorPreset(404, "Ese preset no es de la instalación.");
  return vistaDePreset(fila);
}

/**
 * Duplica un preset para hacerlo del usuario. La copia nace activa, con el mismo orden y con la clave del
 * original más un sufijo libre: es **suya**, así que puede editarla y desactivarla sin tocar la de la
 * instalación. Repetir la operación no crea una segunda copia idéntica: devuelve la que ya tenía.
 */
export async function duplicarPreset(usuarioId: string, id: string): Promise<PresetVista> {
  const original = await presetUsable(usuarioId, id);
  if (original.ownerId === usuarioId) {
    throw new ErrorPreset(409, "Ese preset ya es tuyo: edítalo en lugar de duplicarlo.");
  }
  /**
   * El tope, la clave libre y el alta van en **una sola transacción con la fila del usuario bloqueada**, igual que
   * el alta de un trabajo en la cola: dos duplicados a la vez contarían los dos contra el mismo estado anterior y
   * se pasarían del tope, o elegirían la misma clave y una de las dos inserciones fallaría.
   */
  const fila = await db().transaction(async (tx) => {
    await tx.execute(sql`select 1 from users where id = ${usuarioId} for update`);
    const [{ total } = { total: 0 }] = await tx
      .select({ total: count() })
      .from(presets)
      .where(eq(presets.ownerId, usuarioId));
    if (total >= MAXIMO_PRESETS_PROPIOS) {
      throw new ErrorPreset(409, `Ya tienes ${total} presets propios, que es el máximo. Borra alguno antes.`);
    }
    const clave = await claveLibre(tx, usuarioId, original.category, original.slug);
    const [creada] = await tx
      .insert(presets)
      .values({
        ownerId: usuarioId,
        category: original.category,
        slug: clave,
        name: `${original.name} (mío)`.slice(0, PRESET_NOMBRE_MAXIMO),
        description: original.description,
        values: textoDeValores(valoresDeTexto(original.values)),
        sortOrder: original.sortOrder,
        active: true,
        duplicatedFrom: original.id,
      })
      .returning();
    return creada;
  });
  if (!fila) throw new ErrorPreset(500, "No se ha podido duplicar el preset.");
  return vistaDePreset(fila);
}

/** Primera clave libre del usuario en esa categoría: `moda-mio`, `moda-mio-2`… */
async function claveLibre(
  ejecutor: Ejecutor,
  usuarioId: string,
  categoria: CategoriaPreset,
  base: string,
): Promise<string> {
  const suyas = await ejecutor
    .select({ slug: presets.slug })
    .from(presets)
    .where(and(eq(presets.ownerId, usuarioId), eq(presets.category, categoria)));
  const usadas = new Set(suyas.map((f) => f.slug));
  const raiz = `${base}-mio`.slice(0, 40);
  if (!usadas.has(raiz)) return raiz;
  for (let n = 2; n <= MAXIMO_PRESETS_PROPIOS + 1; n++) {
    const candidata = `${raiz}-${n}`;
    if (!usadas.has(candidata)) return candidata;
  }
  throw new ErrorPreset(409, "No queda ninguna clave libre para esa copia: renombra las que ya tienes.");
}

/** Edita una copia **propia**. Una del otro (o la de la instalación) responde 404 o 403. */
export async function editarPresetPropio(usuarioId: string, id: string, datos: DatosPreset): Promise<PresetVista> {
  const anterior = await presetUsable(usuarioId, id);
  if (anterior.ownerId !== usuarioId) {
    throw new ErrorPreset(403, "Ese preset es de la instalación: duplícalo para poder cambiarlo.");
  }
  // El orden y el estado no se tocan aquí: los lleva la fila, y el formulario de «Crear» no los ofrece. Si se
  // cogieran de `datos`, editar el nombre de una copia la reordenaría y la reactivaría sin que nadie lo pidiera.
  const valores = normalizar({
    ...datos,
    clave: anterior.slug,
    categoria: anterior.category,
    orden: anterior.sortOrder,
    activo: anterior.active,
  });
  const [fila] = await db()
    .update(presets)
    .set({ ...valores, category: anterior.category, slug: anterior.slug, updatedAt: new Date() })
    .where(and(eq(presets.id, anterior.id), eq(presets.ownerId, usuarioId)))
    .returning();
  if (!fila) throw new ErrorPreset(404, "Ese preset no existe.");
  return vistaDePreset(fila);
}

/** Borra una copia propia. Los de la instalación no se borran: se desactivan. */
export async function borrarPresetPropio(usuarioId: string, id: string): Promise<void> {
  const fila = await presetUsable(usuarioId, id);
  if (fila.ownerId !== usuarioId) throw new ErrorPreset(403, "Ese preset es de la instalación: no se puede borrar.");
  await db()
    .delete(presets)
    .where(and(eq(presets.id, fila.id), eq(presets.ownerId, usuarioId)));
}
