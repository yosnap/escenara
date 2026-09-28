import { and, eq, inArray, max, sql } from "drizzle-orm";
import { detectarAfirmaciones } from "@/lib/asistente";
import {
  DESCRIPCION_EXPERTA_MAXIMA,
  esFormatoClip,
  esMomentoMicroaccion,
  esRegistroEstetico,
  INSTRUCCIONES_EXTRA_MAXIMAS,
} from "@/lib/direccion";
import { limpiarTextoDePrompt } from "@/lib/ficha-personaje";
import {
  ACCION_MAXIMA,
  DIRECCION_VOCAL_MAXIMA,
  ESCENAS_MAXIMAS,
  motivoDeInvalidacion,
  TEXTO_ESCENA_MAXIMO,
} from "@/lib/proyectos";
import { db, type Ejecutor } from "../db/cliente";
import { claims, type FilaEscena, generationJobs, projects, scenes } from "../db/esquema";
import type { Actor } from "../media/servicio";
import { leerProductoElegido, productoPropio } from "../productos/eleccion";
import { sembrarRepartoInicial } from "../reparto/siembra";
import { invalidarVozDeEscena } from "../voz/proyecto";
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
  /**
   * Dirección del clip y 6C del fotograma (0.25.0). Son **claves de preset y enumerados**, nunca texto que
   * viaje al proveedor: lo que el navegador manda es qué ha elegido, y el fragmento en inglés lo pone el
   * servidor desde el catálogo (ADR-0022).
   */
  formatoClip?: unknown;
  plano?: unknown;
  angulo?: unknown;
  camara?: unknown;
  microaccion?: unknown;
  momentoMicroaccion?: unknown;
  direccionVocal?: unknown;
  optica?: unknown;
  luz?: unknown;
  localizacion?: unknown;
  registroEstetico?: unknown;
  /**
   * Texto libre de la dirección (0.25.1): lo que el usuario añade a lo elegido con botones y, en modo experto,
   * la descripción entera. Se escribe en castellano y pasa por la misma limpieza que el resto del texto libre.
   */
  instruccionesExtra?: unknown;
  modoExperto?: unknown;
  descripcionExperta?: unknown;
  /**
   * **Producto de la escena** (0.26.0): `{ productoId, accion }`. Va aparte de la dirección porque es una fila
   * del usuario y no una clave de catálogo, y su dueño se comprueba contra la base de datos antes de guardarlo.
   */
  producto?: unknown;
}

/**
 * Campos de una escena ya limpios. Lo que no llega, no se toca.
 *
 * La duración no está aquí: la elige el proyecto entero y la escena la copia (`projects.clip_seconds`), porque es
 * lo que se le pide al modelo de vídeo y lo que se ha medido con dinero real.
 */
function camposLimpios(datos: DatosEscena) {
  const campos: Partial<typeof scenes.$inferInsert> = {};
  if (datos.texto !== undefined) campos.scriptText = limpiarTextoDePrompt(datos.texto, TEXTO_ESCENA_MAXIMO);
  if (datos.accion !== undefined) campos.action = limpiarTextoDePrompt(datos.accion, ACCION_MAXIMA);

  // Dirección del clip (0.25.0). Los enumerados pasan por su guarda y lo que no lo sea **no se guarda**: un
  // valor desconocido no puede llegar a la fila. Las claves de preset son texto corto y se limpian igual que
  // el resto; que existan en el catálogo lo comprueba quien compone, y una que no exista es «no elegido».
  if (esFormatoClip(datos.formatoClip)) campos.clipFormat = datos.formatoClip;
  if (esMomentoMicroaccion(datos.momentoMicroaccion)) campos.microActionTiming = datos.momentoMicroaccion;
  if (esRegistroEstetico(datos.registroEstetico)) campos.aestheticRegister = datos.registroEstetico;
  const claves = [
    ["plano", "shotType"],
    ["angulo", "cameraAngle"],
    ["camara", "cameraMove"],
    ["microaccion", "microAction"],
    ["optica", "opticsPreset"],
    ["luz", "lightPreset"],
    ["localizacion", "locationPreset"],
  ] as const;
  for (const [entrada, columna] of claves) {
    const valor = datos[entrada];
    if (valor === undefined) continue;
    if (typeof valor !== "string") throw new ErrorProyecto(400, `La opción de ${entrada} tiene que ser texto.`);
    campos[columna] = limpiarClaveDePreset(valor);
  }
  if (datos.direccionVocal !== undefined) {
    campos.dialogueDirection = limpiarTextoDePrompt(datos.direccionVocal, DIRECCION_VOCAL_MAXIMA);
  }
  if (datos.instruccionesExtra !== undefined) {
    campos.extraInstructions = limpiarTextoDePrompt(datos.instruccionesExtra, INSTRUCCIONES_EXTRA_MAXIMAS);
  }
  if (datos.modoExperto !== undefined) campos.expertMode = datos.modoExperto === true;
  if (datos.descripcionExperta !== undefined) {
    campos.expertDescription = limpiarTextoDePrompt(datos.descripcionExperta, DESCRIPCION_EXPERTA_MAXIMA);
  }
  return campos;
}

/**
 * El producto de la escena, ya comprobado. Vacío `{}` si no llega ninguno: lo que no se manda, no se toca.
 *
 * Es async y por eso vive fuera de `camposLimpios`: elegir un producto exige comprobar en la base de datos que
 * es de quien lo elige, y conocer un identificador ajeno no puede bastar para meterlo en una escena propia.
 * Quitar el producto (`productoId` vacío) vacía también la acción: una acción sin producto no describe nada.
 */
async function camposDeProducto(actor: Actor, datos: DatosEscena): Promise<Partial<typeof scenes.$inferInsert>> {
  if (datos.producto === undefined) return {};
  const elegido = await productoPropio(actor.id, leerProductoElegido(datos.producto));
  if (elegido.productoId === "") return { productId: null, productAction: "" };
  return { productId: elegido.productoId, productAction: elegido.accion };
}

/**
 * Clave de preset: minúsculas, números y guiones, y poco más. No es texto libre y no viaja al prompt —lo que
 * viaja es el fragmento que el catálogo tiene guardado para ella—, así que aquí lo único que hace falta es que
 * no pueda ser otra cosa.
 */
const limpiarClaveDePreset = (valor: string): string => {
  const limpia = valor.trim().toLowerCase().slice(0, 64);
  return /^[a-z0-9-]*$/.test(limpia) ? limpia : "";
};

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
  // El producto se comprueba **antes** de abrir la transacción: es una lectura de otra tabla y no tiene por
  // qué correr dentro, y así un producto ajeno responde 404 sin haber empezado a escribir nada.
  const producto = await camposDeProducto(actor, datos);
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
    const campos = { ...camposLimpios(datos), ...producto };
    const [escena] = await tx
      .insert(scenes)
      .values({ projectId: proyecto.id, sortOrder: orden, plannedSeconds: proyecto.clipSeconds, ...campos })
      .returning();
    if (!escena) throw new ErrorProyecto(500, "No se ha podido añadir la escena.");
    // El reparto nace con el protagonista del proyecto (0.28.0), igual que lo dejó la migración en las escenas
    // ya escritas: sin esto, la puerta de consentimiento por personaje no vería a las escenas nuevas.
    await sembrarRepartoInicial(tx, escena.id, proyecto.mainCharacterId);
    await sincronizarAfirmaciones(tx, escena.id, escena.scriptText);
    await tocarProyecto(tx, proyecto.id);
    return escena;
  });
}

/** Edita una escena a mano. Si estaba aprobada, deja de estarlo y se dice por qué. */
export async function editarEscena(actor: Actor, escenaId: unknown, datos: DatosEscena): Promise<FilaEscena> {
  const { escena } = await escenaPropia(actor, escenaId);
  const campos = { ...camposLimpios(datos), ...(await camposDeProducto(actor, datos)) };
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
    if (campos.scriptText !== undefined) {
      await sincronizarAfirmaciones(tx, escena.id, actualizada.scriptText);
      // El diálogo es lo que se oye y lo que se lee: cambiarlo deja sin valer la pista de voz y los subtítulos
      // que ya había (0.21.0). No se borra ni se regenera nada; solo se dice por qué dejaron de corresponder.
      if (actualizada.scriptText !== escena.scriptText) await invalidarVozDeEscena(escena.id, tx);
    }
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
  // El protagonista del proyecto, para sembrar el reparto de cada escena que propone el asistente.
  const [proyecto] = await tx
    .select({ protagonista: projects.mainCharacterId })
    .from(projects)
    .where(eq(projects.id, proyectoId))
    .limit(1);
  const protagonista = proyecto?.protagonista ?? null;
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
    if (escena) {
      await sembrarRepartoInicial(tx, escena.id, protagonista);
      await sincronizarAfirmaciones(tx, escena.id, escena.scriptText);
    }
  }
  await invalidarPlan(tx, proyectoId);
  return orden;
}
