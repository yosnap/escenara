import { and, desc, eq } from "drizzle-orm";
import { DIRECCION_CON_ACENTO_VACIA, type DireccionGuardada, NOMBRE_DIRECCION_MAXIMO } from "@/lib/direccion";
import { limpiarTextoDePrompt } from "@/lib/ficha-personaje";
import { db } from "../db/cliente";
import { type FilaDireccionGuardada, savedDirections } from "../db/esquema-direcciones";
import { ErrorGeneracion } from "../generacion/errores";
import { leerDireccionElegida } from "./eleccion";

/**
 * **Mis direcciones**: guardar una forma de dirigir el clip con nombre y volver a usarla.
 *
 * Reglas duras:
 *
 * - **solo su dueño la ve y la usa**. Todas las consultas filtran por `user_id` en el mismo `where` que el
 *   identificador, así que una dirección de otra persona responde 404 y ni se dice que existe;
 * - lo que se guarda son **claves del catálogo y texto limpio**: entra por `leerDireccionElegida`, el mismo
 *   borde que valida lo que llega al confirmar un clip. Por aquí no puede colarse un prompt en inglés
 *   (ADR-0022) ni un parámetro del proveedor;
 * - el **nombre** pasa por la misma limpieza anti-inyección que el resto del texto del usuario: se lee en la
 *   lista y no viaja a ningún proveedor, pero vale más no tener dos reglas para lo mismo;
 * - guardar, renombrar, borrar y listar **no generan nada y no cuestan nada**.
 */

/** Tope de direcciones por persona. Es un guarda contra un bucle del navegador, no un límite de diseño. */
export const MAXIMO_DIRECCIONES = 50;

const vista = (fila: FilaDireccionGuardada): DireccionGuardada => ({
  id: fila.id,
  nombre: fila.name,
  // Lo guardado vuelve a pasar por el borde al leerlo: una fila vieja con un campo que ya no existe no rompe
  // la lista, se normaliza como lo hace una confirmación.
  direccion: leerDireccionElegida(fila.direction) ?? DIRECCION_CON_ACENTO_VACIA,
  actualizada: fila.updatedAt.toISOString(),
});

/** Nombre limpio y no vacío. Sin nombre no hay lista: es lo único que distingue una dirección de otra. */
function nombreLimpio(valor: unknown): string {
  const nombre = limpiarTextoDePrompt(valor, NOMBRE_DIRECCION_MAXIMO).trim();
  if (nombre === "") throw new ErrorGeneracion(400, "Ponle un nombre a la dirección para poder encontrarla luego.");
  return nombre;
}

/** Las direcciones de esta persona, de la más reciente a la más antigua. */
export async function listarDirecciones(usuarioId: string): Promise<DireccionGuardada[]> {
  const filas = await db()
    .select()
    .from(savedDirections)
    .where(eq(savedDirections.userId, usuarioId))
    .orderBy(desc(savedDirections.updatedAt));
  return filas.map(vista);
}

/** Guarda lo que hay elegido ahora mismo con el nombre que le ponga su dueño. */
export async function guardarDireccion(usuarioId: string, cuerpo: Record<string, unknown>): Promise<DireccionGuardada> {
  const nombre = nombreLimpio(cuerpo.nombre);
  const direccion = leerDireccionElegida(cuerpo.direccion);
  if (!direccion) throw new ErrorGeneracion(400, "No has enviado ninguna dirección que guardar.");
  const suyas = await db()
    .select({ id: savedDirections.id })
    .from(savedDirections)
    .where(eq(savedDirections.userId, usuarioId));
  if (suyas.length >= MAXIMO_DIRECCIONES) {
    throw new ErrorGeneracion(
      409,
      `Ya tienes ${MAXIMO_DIRECCIONES} direcciones guardadas: borra alguna antes de guardar otra.`,
    );
  }
  const [fila] = await db()
    .insert(savedDirections)
    .values({ userId: usuarioId, name: nombre, direction: direccion })
    .onConflictDoNothing({ target: [savedDirections.userId, savedDirections.name] })
    .returning();
  if (!fila) {
    throw new ErrorGeneracion(409, `Ya tienes una dirección que se llama «${nombre}»: ponle otro nombre.`);
  }
  return vista(fila);
}

/** Le cambia el nombre. Lo elegido no se toca: renombrar no es volver a guardar. */
export async function renombrarDireccion(
  usuarioId: string,
  id: string,
  cuerpo: Record<string, unknown>,
): Promise<DireccionGuardada> {
  const nombre = nombreLimpio(cuerpo.nombre);
  // El nombre repetido se dice **antes** de intentarlo: el usuario recibe su motivo en lugar de un 500 con el
  // nombre de una restricción de la base de datos.
  const [repetida] = await db()
    .select({ id: savedDirections.id })
    .from(savedDirections)
    .where(and(eq(savedDirections.userId, usuarioId), eq(savedDirections.name, nombre)))
    .limit(1);
  if (repetida && repetida.id !== id) {
    throw new ErrorGeneracion(409, `Ya tienes una dirección que se llama «${nombre}»: ponle otro nombre.`);
  }
  const [fila] = await db()
    .update(savedDirections)
    .set({ name: nombre, updatedAt: new Date() })
    // El dueño va en el mismo `where` que el identificador: sin esto, conocer un identificador bastaría.
    .where(and(eq(savedDirections.id, id), eq(savedDirections.userId, usuarioId)))
    .returning();
  if (!fila) throw new ErrorGeneracion(404, "Esa dirección guardada no existe.");
  return vista(fila);
}

/** La borra. Devuelve la lista que queda, que es lo que la pantalla necesita para repintarse. */
export async function borrarDireccion(usuarioId: string, id: string): Promise<DireccionGuardada[]> {
  const [fila] = await db()
    .delete(savedDirections)
    .where(and(eq(savedDirections.id, id), eq(savedDirections.userId, usuarioId)))
    .returning();
  if (!fila) throw new ErrorGeneracion(404, "Esa dirección guardada no existe.");
  return listarDirecciones(usuarioId);
}
