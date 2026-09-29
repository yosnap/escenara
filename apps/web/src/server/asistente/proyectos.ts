import { eq, sql } from "drizzle-orm";
import { type Acento, esAcento } from "@/lib/direccion";
import { limpiarTextoDePrompt } from "@/lib/ficha-personaje";
import { DURACION_PREDETERMINADA, duracionesEnTexto, esDuracionDisponible } from "@/lib/produccion";
import {
  CONCEPTO_MAXIMO,
  esFormatoProyecto,
  IDEA_MAXIMA,
  PRESUPUESTO_MAXIMO,
  type ProyectoDetalle,
  TITULO_MAXIMO,
} from "@/lib/proyectos";
import { leerAjustes } from "../ajustes";
import { olvidarPercibidoDeProyecto } from "../coherencia/registro";
import { db } from "../db/cliente";
import { type FilaProyecto, projects, scenes } from "../db/esquema";
import { aplicarCambioDeAcento } from "../direccion/acento";
import type { Actor } from "../media/servicio";
import { filaPropia } from "../personajes/consulta";
import { exigirPersonajeUsable } from "../personajes/puede-generar";
import { esUuidProyecto, proyectoPropio } from "./consulta";
import { ErrorProyecto } from "./errores";
import { detalleProyecto } from "./plan";

/**
 * Alta y edición de proyectos. Un proyecto es de una persona y solo de ella (`consulta.ts`), y no gasta nada:
 * crear, renombrar o cambiar el presupuesto autorizado no llama a ningún proveedor.
 *
 * El título y la idea pasan por la misma limpieza anti-inyección que el resto de los textos que acaban cerca de
 * un prompt: la idea es literalmente lo que se le manda al modelo de texto.
 */

/** Tope de proyectos por usuario: evita que una cuenta llene la tabla con proyectos vacíos. */
export const PROYECTOS_MAXIMOS = 100;

export interface DatosProyecto {
  titulo?: unknown;
  formato?: unknown;
  idea?: unknown;
  concepto?: unknown;
  personajeId?: unknown;
  presupuestoCreditos?: unknown;
  segundosClip?: unknown;
  /**
   * Acento con el que hablan todas las escenas (0.25.1). Cambiarlo invalida lo generado con el anterior, así que
   * necesita `confirmarInvalidacion` cuando hay algo que perder: es el mismo trato que la voz del proyecto.
   */
  acento?: unknown;
  confirmarInvalidacion?: unknown;
}

function tituloLimpio(valor: unknown): string {
  const titulo = limpiarTextoDePrompt(valor, TITULO_MAXIMO);
  if (titulo === "") throw new ErrorProyecto(400, "Ponle un título al proyecto.");
  return titulo;
}

function formatoValido(valor: unknown): FilaProyecto["format"] {
  if (!esFormatoProyecto(valor)) throw new ErrorProyecto(400, "Elige uno de los formatos disponibles.");
  return valor;
}

function creditosValidos(valor: unknown): number {
  const numero = typeof valor === "number" ? valor : Number.parseInt(String(valor), 10);
  if (!Number.isInteger(numero) || numero < 0 || numero > PRESUPUESTO_MAXIMO) {
    throw new ErrorProyecto(400, "El presupuesto del proyecto tiene que ser un número entero de créditos.");
  }
  return numero;
}

/**
 * Duración de clip del proyecto. Solo se aceptan las que esta versión ofrece con coste medido: una duración sin
 * precio medido se cobraría a ciegas, y el navegador no decide qué se le pide al proveedor.
 */
function duracionValida(valor: unknown): number {
  const numero = typeof valor === "number" ? valor : Number.parseInt(String(valor), 10);
  if (!Number.isInteger(numero) || !esDuracionDisponible(numero)) {
    throw new ErrorProyecto(400, `Los clips solo pueden durar ${duracionesEnTexto()}.`);
  }
  return numero;
}

/** Acento del habla. Uno que no esté en el catálogo se rechaza con su motivo, no se cambia en silencio. */
function acentoValido(valor: unknown): Acento {
  if (!esAcento(valor)) throw new ErrorProyecto(400, "Ese acento no está entre los que ofrece Escenara.");
  return valor;
}

/**
 * Personaje principal ya comprobado: tiene que ser del usuario **y** poder generar (consentimiento vigente y
 * referencias suficientes). Se comprueba al asignarlo, no al producir: así el aviso llega cuando se puede
 * arreglar. `null` quita el protagonista.
 */
async function personajeValido(
  actor: Actor,
  valor: unknown,
): Promise<{ id: string; renderStyle: "realista" | "animado" } | null> {
  if (valor === null || valor === "" || valor === undefined) return null;
  if (!esUuidProyecto(valor)) throw new ErrorProyecto(400, "Ese personaje no existe.");
  // Reutiliza las puertas de 0.13.0–0.15.0: dueño (404 si es de otro) y personaje usable (consentimiento
  // vigente y mínimo de referencias), cada una con su motivo escrito. Es una lectura: no crea versiones.
  const personaje = await filaPropia(actor, valor);
  await exigirPersonajeUsable(personaje.id, personaje.name);
  return { id: personaje.id, renderStyle: personaje.renderStyle };
}

export async function crearProyecto(actor: Actor, datos: DatosProyecto): Promise<ProyectoDetalle> {
  const ajustes = await leerAjustes();
  const [{ total } = { total: 0 }] = await db()
    .select({ total: sql<number>`count(*)::int` })
    .from(projects)
    .where(eq(projects.userId, actor.id));
  if (total >= PROYECTOS_MAXIMOS) {
    throw new ErrorProyecto(409, `No puedes tener más de ${PROYECTOS_MAXIMOS} proyectos. Borra alguno antes.`);
  }
  const protagonista = await personajeValido(actor, datos.personajeId);
  const [fila] = await db()
    .insert(projects)
    .values({
      userId: actor.id,
      title: tituloLimpio(datos.titulo),
      format: formatoValido(datos.formato),
      idea: limpiarTextoDePrompt(datos.idea, IDEA_MAXIMA),
      mainCharacterId: protagonista?.id ?? null,
      renderStyle: protagonista?.renderStyle ?? "realista",
      authorizedCredits:
        datos.presupuestoCreditos === undefined
          ? ajustes.presupuestoProyecto
          : creditosValidos(datos.presupuestoCreditos),
      clipSeconds: datos.segundosClip === undefined ? DURACION_PREDETERMINADA : duracionValida(datos.segundosClip),
    })
    .returning();
  if (!fila) throw new ErrorProyecto(500, "No se ha podido crear el proyecto.");
  return detalleProyecto(actor, fila.id);
}

/**
 * Edita el proyecto. Cambiar el presupuesto autorizado **no** invalida nada: subirlo es justo lo que se pide
 * cuando un plan no cabe, y bajarlo lo vuelve a impedir en la siguiente comprobación.
 */
export async function editarProyecto(actor: Actor, id: unknown, datos: DatosProyecto): Promise<ProyectoDetalle> {
  const proyecto = await proyectoPropio(actor, id);
  const cambios: Partial<typeof projects.$inferInsert> = { updatedAt: new Date() };
  if (datos.titulo !== undefined) cambios.title = tituloLimpio(datos.titulo);
  if (datos.formato !== undefined) cambios.format = formatoValido(datos.formato);
  if (datos.idea !== undefined) cambios.idea = limpiarTextoDePrompt(datos.idea, IDEA_MAXIMA);
  if (datos.concepto !== undefined) cambios.concept = limpiarTextoDePrompt(datos.concepto, CONCEPTO_MAXIMO);
  if (datos.personajeId !== undefined) {
    const protagonista = await personajeValido(actor, datos.personajeId);
    cambios.mainCharacterId = protagonista?.id ?? null;
    cambios.renderStyle = protagonista?.renderStyle ?? "realista";
  }
  if (datos.presupuestoCreditos !== undefined) cambios.authorizedCredits = creditosValidos(datos.presupuestoCreditos);
  if (datos.segundosClip !== undefined) cambios.clipSeconds = duracionValida(datos.segundosClip);
  if (datos.acento !== undefined) cambios.speechAccent = acentoValido(datos.acento);
  await db().transaction(async (tx) => {
    await tx.update(projects).set(cambios).where(eq(projects.id, proyecto.id));
    /**
     * El acento es del proyecto entero y entra en la voz y en el prompt del clip, así que cambiarlo deja sin
     * valer lo que salió con el anterior. Se trata como la voz: se dice cuántas escenas pierde, se confirma y no
     * se regenera nada por su cuenta. Va dentro de la misma transacción para que no haya un instante en el que
     * el proyecto pida un acento y sus escenas se den por buenas con otro.
     */
    if (cambios.speechAccent !== undefined && cambios.speechAccent !== proyecto.speechAccent) {
      await aplicarCambioDeAcento(tx, proyecto.id, cambios.speechAccent, datos.confirmarInvalidacion === true);
    }
    /**
     * La duración es del proyecto entero, así que sus escenas la copian, en la misma transacción: lo que se
     * muestra de cada escena y lo que se le pide al modelo tienen que ser lo mismo. No invalida nada aprobado,
     * porque **no cambia el coste** (KIE cobra igual 4 s que 8 s, medido el 2026-09-27), pero una escena que ya
     * tiene clip deja de corresponder a lo que dice, y la rejilla de producción lo avisa como cualquier edición.
     */
    if (cambios.clipSeconds !== undefined && cambios.clipSeconds !== proyecto.clipSeconds) {
      await tx
        .update(scenes)
        .set({
          plannedSeconds: cambios.clipSeconds,
          changedSinceGeneration: sql`${scenes.changedSinceGeneration} or ${scenes.clipMediaId} is not null`,
          updatedAt: new Date(),
        })
        .where(eq(scenes.projectId, proyecto.id));
    }
  });
  return detalleProyecto(actor, proyecto.id);
}

/**
 * Borra el proyecto con sus escenas y sus afirmaciones (cascada). Los trabajos de generación **no** se borran:
 * son gasto que ya ocurrió y sus resultados están en la biblioteca; su `scene_id` queda a nulo.
 */
export async function borrarProyecto(actor: Actor, id: unknown): Promise<void> {
  const proyecto = await proyectoPropio(actor, id);
  await db().transaction(async (tx) => {
    await olvidarPercibidoDeProyecto(tx, proyecto.id);
    await tx.delete(projects).where(eq(projects.id, proyecto.id));
  });
}
