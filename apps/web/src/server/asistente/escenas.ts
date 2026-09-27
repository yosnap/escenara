import { and, eq, inArray, max, sql } from "drizzle-orm";
import { detectarAfirmaciones } from "@/lib/asistente";
import { limpiarTextoDePrompt } from "@/lib/ficha-personaje";
import {
  ACCION_MAXIMA,
  ESCENAS_MAXIMAS,
  motivoDeInvalidacion,
  SEGUNDOS_MAXIMOS,
  SEGUNDOS_MINIMOS,
  TEXTO_ESCENA_MAXIMO,
} from "@/lib/proyectos";
import { db, type Ejecutor } from "../db/cliente";
import { claims, type FilaEscena, generationJobs, projects, scenes } from "../db/esquema";
import type { Actor } from "../media/servicio";
import { escenaPropia, escenasDe, proyectoPropio, proyectoPropioBloqueado } from "./consulta";
import { ErrorProyecto } from "./errores";

/**
 * Escenas de un proyecto: alta, edición a mano, reordenar y borrar.
 *
 * Dos reglas gobiernan este fichero:
 *
 * - **editar una escena aprobada la devuelve a borrador**, con el motivo escrito. Congelamos qué se iba a
 *   generar al aprobar, así que cambiar el guion después convierte lo aprobado en otra cosa, y eso se revisa
 *   otra vez antes de gastar. Reordenar o borrar **no** invalida a las demás: no cambia lo que costarían;
 * - **todo texto que llega del navegador pasa por la limpieza anti-inyección** de la ficha, igual que el
 *   prompt editado a mano de 0.16.0. Da lo mismo que lo haya escrito una persona o propuesto el modelo: en las
 *   dos direcciones es contenido, nunca instrucciones ni parámetros del proveedor.
 */

/**
 * Lo que se puede cambiar de una escena. **No incluye los prompts**: desde la 0.17.0 los compone el servidor y no
 * se le muestran al usuario (ADR-0022), así que tampoco los escribe él.
 */
export interface DatosEscena {
  texto?: unknown;
  accion?: unknown;
  segundos?: unknown;
}

const segundosValidos = (valor: unknown, porDefecto: number): number => {
  if (valor === undefined) return porDefecto;
  const numero = typeof valor === "number" ? valor : Number.parseInt(String(valor), 10);
  if (!Number.isFinite(numero)) {
    throw new ErrorProyecto(
      400,
      `Indica cuántos segundos dura la escena, de ${SEGUNDOS_MINIMOS} a ${SEGUNDOS_MAXIMOS}.`,
    );
  }
  return Math.min(SEGUNDOS_MAXIMOS, Math.max(SEGUNDOS_MINIMOS, Math.round(numero)));
};

/** Campos de una escena ya limpios. Lo que no llega, no se toca. */
function camposLimpios(datos: DatosEscena, anterior: FilaEscena | null) {
  const campos: Partial<typeof scenes.$inferInsert> = {};
  if (datos.texto !== undefined) campos.scriptText = limpiarTextoDePrompt(datos.texto, TEXTO_ESCENA_MAXIMO);
  if (datos.accion !== undefined) campos.action = limpiarTextoDePrompt(datos.accion, ACCION_MAXIMA);
  if (datos.segundos !== undefined)
    campos.plannedSeconds = segundosValidos(datos.segundos, anterior?.plannedSeconds ?? 4);
  return campos;
}

/** Devuelve una escena aprobada a borrador con el motivo escrito. No toca a las demás. */
function invalidacion(escena: FilaEscena, que: string): Partial<typeof scenes.$inferInsert> {
  if (escena.state !== "aprobada") return {};
  return { state: "borrador", invalidationReason: motivoDeInvalidacion(que), approvedAt: null };
}

/**
 * El proyecto deja de estar planificado cuando alguna de sus escenas deja de estar aprobada: el plan que se
 * aprobó ya no es el que hay. No se toca un proyecto que ya está en producción o listo: eso es historia.
 */
async function invalidarPlan(tx: Ejecutor, proyectoId: string): Promise<void> {
  await tx
    .update(projects)
    .set({ state: "borrador", planApprovedAt: null, planApprovedBy: null, updatedAt: new Date() })
    .where(and(eq(projects.id, proyectoId), eq(projects.state, "planificado")));
}

/** Marca de tiempo del proyecto: cualquier cambio en sus escenas lo mueve al principio de la lista. */
const tocarProyecto = (tx: Ejecutor, proyectoId: string) =>
  tx.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, proyectoId));

/**
 * Recalcula las afirmaciones por verificar de una escena a partir de su texto.
 *
 * Lo que ya resolvió una persona **no se borra ni se reabre**: solo se quitan las que siguen `por_verificar` y
 * ya no están en el texto, y se añaden las nuevas. Así corregir una frase no hace desaparecer la decisión que
 * alguien tomó sobre otra.
 */
export async function sincronizarAfirmaciones(tx: Ejecutor, escenaId: string, texto: string): Promise<void> {
  const detectadas = detectarAfirmaciones(texto);
  const existentes = await tx.select().from(claims).where(eq(claims.sceneId, escenaId));
  const textosDetectados = new Set(detectadas.map((d) => d.texto));
  const sobrantes = existentes.filter((e) => e.state === "por_verificar" && !textosDetectados.has(e.text));
  if (sobrantes.length > 0) {
    await tx.delete(claims).where(
      inArray(
        claims.id,
        sobrantes.map((s) => s.id),
      ),
    );
  }
  const yaGuardadas = new Set(existentes.map((e) => e.text));
  const nuevas = detectadas.filter((d) => !yaGuardadas.has(d.texto));
  if (nuevas.length === 0) return;
  await tx
    .insert(claims)
    .values(nuevas.map((n) => ({ sceneId: escenaId, text: n.texto, kind: n.tipo })))
    .onConflictDoNothing();
}

/** Añade una escena al final del proyecto. */
export async function crearEscena(actor: Actor, proyectoId: unknown, datos: DatosEscena): Promise<FilaEscena> {
  const proyecto = await proyectoPropio(actor, proyectoId);
  return db().transaction(async (tx) => {
    const [{ ultimo } = { ultimo: null }] = await tx
      .select({ ultimo: max(scenes.sortOrder) })
      .from(scenes)
      .where(eq(scenes.projectId, proyecto.id));
    const orden = (ultimo ?? 0) + 1;
    if (orden > ESCENAS_MAXIMAS) {
      // Los proyectos que creó la migración pueden traer más escenas que el tope (una por trabajo antiguo). El
      // mensaje dice cuántas hay, en lugar de afirmar un máximo que ese proyecto ya se ha pasado.
      const [{ total } = { total: 0 }] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(scenes)
        .where(eq(scenes.projectId, proyecto.id));
      throw new ErrorProyecto(
        409,
        `Este proyecto ya tiene ${total} ${total === 1 ? "escena" : "escenas"} y el máximo son ${ESCENAS_MAXIMAS}. Borra alguna antes de añadir otra.`,
      );
    }
    const campos = camposLimpios(datos, null);
    const [escena] = await tx
      .insert(scenes)
      .values({ projectId: proyecto.id, sortOrder: orden, ...campos })
      .returning();
    if (!escena) throw new ErrorProyecto(500, "No se ha podido añadir la escena.");
    await sincronizarAfirmaciones(tx, escena.id, escena.scriptText);
    await tocarProyecto(tx, proyecto.id);
    return escena;
  });
}

/** Edita una escena a mano. Si estaba aprobada, deja de estarlo y se dice por qué. */
export async function editarEscena(actor: Actor, escenaId: unknown, datos: DatosEscena): Promise<FilaEscena> {
  const { escena } = await escenaPropia(actor, escenaId);
  const campos = camposLimpios(datos, escena);
  if (Object.keys(campos).length === 0) return escena;
  // Editar una escena que ya se ha generado no borra nada (el gasto está hecho y el resultado sigue en la
  // biblioteca), pero deja de corresponder a lo que dice: la rejilla de producción lo avisa y el historial lo
  // registra como «qué cambió» antes de la siguiente regeneración (0.19.0, PRD §6).
  const yaGenerada = escena.approvedFrameMediaId !== null || escena.clipMediaId !== null;
  return db().transaction(async (tx) => {
    const [actualizada] = await tx
      .update(scenes)
      .set({
        ...campos,
        ...invalidacion(escena, "Has editado esta escena"),
        ...(yaGenerada ? { changedSinceGeneration: true } : {}),
        updatedAt: new Date(),
      })
      .where(eq(scenes.id, escena.id))
      .returning();
    if (!actualizada) throw new ErrorProyecto(404, "Esa escena no existe.");
    if (campos.scriptText !== undefined) await sincronizarAfirmaciones(tx, escena.id, actualizada.scriptText);
    if (escena.state === "aprobada") await invalidarPlan(tx, escena.projectId);
    await tocarProyecto(tx, escena.projectId);
    return actualizada;
  });
}

/**
 * Reordena las escenas del proyecto. Recibe **todos** sus identificadores en el orden nuevo: así el resultado
 * es el que se ve, sin huecos ni empates, y no hay forma de colar una escena de otro proyecto.
 *
 * El orden se escribe en negativo primero y luego en positivo: la restricción `(proyecto, orden)` es única y
 * sin ese paso intermedio un intercambio de dos escenas chocaría consigo mismo.
 */
export async function reordenarEscenas(actor: Actor, proyectoId: unknown, ordenIds: unknown): Promise<void> {
  if (!Array.isArray(ordenIds) || ordenIds.some((id) => typeof id !== "string")) {
    throw new ErrorProyecto(400, "Envía el orden nuevo de las escenas.");
  }
  await db().transaction(async (tx) => {
    const proyecto = await proyectoPropioBloqueado(actor, proyectoId, tx);
    const actuales = await escenasDe(proyecto.id, tx);
    const pedidos = ordenIds as string[];
    const mismas =
      pedidos.length === actuales.length &&
      new Set(pedidos).size === pedidos.length &&
      actuales.every((e) => pedidos.includes(e.id));
    if (!mismas) throw new ErrorProyecto(409, "El orden que envías no coincide con las escenas del proyecto.");
    for (const [indice, id] of pedidos.entries()) {
      await tx
        .update(scenes)
        .set({ sortOrder: -(indice + 1) })
        .where(and(eq(scenes.id, id), eq(scenes.projectId, proyecto.id)));
    }
    await tx
      .update(scenes)
      .set({ sortOrder: sql`-${scenes.sortOrder}` })
      .where(and(eq(scenes.projectId, proyecto.id), sql`${scenes.sortOrder} < 0`));
    await tocarProyecto(tx, proyecto.id);
  });
}

/**
 * Borra una escena y renumera las que quedan. Una escena ya producida **no se borra**: tiene un trabajo pagado
 * detrás y su resultado en la biblioteca.
 */
export async function borrarEscena(actor: Actor, escenaId: unknown): Promise<void> {
  const { escena } = await escenaPropia(actor, escenaId);
  if (escena.state === "producida") {
    throw new ErrorProyecto(409, "Esta escena ya se ha producido: no se puede borrar, solo dejarla fuera del plan.");
  }
  await db().transaction(async (tx) => {
    await tx.delete(scenes).where(eq(scenes.id, escena.id));
    const quedan = await escenasDe(escena.projectId, tx);
    for (const [indice, fila] of quedan.entries()) {
      if (fila.sortOrder !== indice + 1) {
        await tx
          .update(scenes)
          .set({ sortOrder: -(indice + 1) })
          .where(eq(scenes.id, fila.id));
      }
    }
    await tx
      .update(scenes)
      .set({ sortOrder: sql`-${scenes.sortOrder}` })
      .where(and(eq(scenes.projectId, escena.projectId), sql`${scenes.sortOrder} < 0`));
    await tocarProyecto(tx, escena.projectId);
  });
}

/**
 * Sustituye todas las escenas en borrador del proyecto por las que propone el asistente. Va en la transacción
 * de quien llama, que es la que cierra el gasto de la llamada.
 *
 * Una escena con un trabajo detrás no se toca: ese trabajo se ha pagado. Si hay alguna, el asistente no reescribe
 * nada y se dice, en lugar de dejar el proyecto a medias entre dos guiones.
 */
export async function sustituirEscenas(
  tx: Ejecutor,
  proyectoId: string,
  propuestas: readonly { texto: string; accion: string; segundos: number }[],
): Promise<number> {
  const actuales = await escenasDe(proyectoId, tx);
  const ids = actuales.map((e) => e.id);
  // Se mira el estado **y** si alguna escena tiene ya un trabajo detrás, aunque no haya terminado: ese trabajo
  // se ha pagado y borrar su escena dejaría el gasto sin nada que lo explique.
  const conTrabajo =
    ids.length === 0
      ? []
      : await tx.select({ id: generationJobs.id }).from(generationJobs).where(inArray(generationJobs.sceneId, ids));
  if (actuales.some((e) => e.state === "producida") || conTrabajo.length > 0) {
    throw new ErrorProyecto(
      409,
      "Este proyecto ya tiene escenas en producción: el asistente no las reescribe. Crea otro proyecto o edita las escenas a mano.",
    );
  }
  if (actuales.length > 0) {
    await tx.delete(scenes).where(eq(scenes.projectId, proyectoId));
  }
  let orden = 0;
  for (const propuesta of propuestas.slice(0, ESCENAS_MAXIMAS)) {
    orden++;
    const [escena] = await tx
      .insert(scenes)
      .values({
        projectId: proyectoId,
        sortOrder: orden,
        scriptText: propuesta.texto,
        action: propuesta.accion,
        plannedSeconds: propuesta.segundos,
      })
      .returning();
    if (escena) await sincronizarAfirmaciones(tx, escena.id, escena.scriptText);
  }
  await invalidarPlan(tx, proyectoId);
  return orden;
}
