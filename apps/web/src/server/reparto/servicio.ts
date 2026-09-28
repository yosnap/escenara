import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { limpiarTextoDePrompt } from "@/lib/ficha-personaje";
import { motivoDeInvalidacion } from "@/lib/proyectos";
import {
  DIRECCION_TURNO_MAXIMA,
  esFormatoDeDos,
  esFormatoReparto,
  esLadoReparto,
  esMiradaReparto,
  esPapelReparto,
  type FormatoReparto,
  ladoOpuesto,
  MAXIMO_PERSONAJES_REPARTO,
  porDefectoDelReparto,
  type RepartoVista,
  TEXTO_TURNO_MAXIMO,
  TURNOS_MAXIMOS,
} from "@/lib/reparto";
import { leerAjustes } from "../ajustes";
import { escenaPropia } from "../asistente/consulta";
import { ErrorProyecto } from "../asistente/errores";
import { db, type Ejecutor } from "../db/cliente";
import { characters, type FilaEscena, projects, sceneCharacters, sceneDialogueTurns, scenes } from "../db/esquema";
import type { Actor } from "../media/servicio";
import { miembrosDelReparto, repartoDeEscena } from "./consulta";

/**
 * **El reparto de una escena** (0.28.0): elegir formato, poner y quitar el segundo personaje y repartir el
 * diálogo por turnos.
 *
 * Cuatro reglas duras gobiernan este fichero, y ninguna vive en la interfaz:
 *
 * - **los dos personajes son del usuario que genera**. La puerta se apoya en la propiedad: uno ajeno responde
 *   404 igual que en la biblioteca, sin decir que existe;
 * - **como mucho dos** (`MAXIMO_PERSONAJES_REPARTO`). El proveedor admite tres, pero con tres el lado del cuadro
 *   y el turno no se respetan;
 * - **un turno solo puede ser de alguien del reparto**, y su texto es **literal**: se limpia contra inyección,
 *   pero no se traduce ni se reescribe;
 * - **lados distintos**: dos personajes no comparten sitio en el plano, y en podcast la mirada nace cruzada.
 *
 * Cambiar el reparto **invalida la aprobación** de la escena por lo mismo que la invalida editar su guion: lo
 * que se aprobó era otro clip, con otra gente y otro coste.
 */

/**
 * Cambiar el reparto **invalida la aprobación** de la escena y la de su plan, igual que editar su guion: lo que
 * se aprobó era otro clip, con otra gente, y con otro coste si pasa de uno a dos.
 */
const invalidacion = (escena: FilaEscena): Partial<typeof scenes.$inferInsert> =>
  escena.state === "aprobada"
    ? {
        state: "borrador",
        invalidationReason: motivoDeInvalidacion("Has cambiado el reparto de esta escena"),
        approvedAt: null,
      }
    : {};

/** Marca el cambio en la escena y en su proyecto: la escena deja de estar aprobada y el plan, de estar aprobado. */
async function anotarCambio(tx: Ejecutor, escena: FilaEscena): Promise<void> {
  await tx
    .update(scenes)
    .set({ ...invalidacion(escena), updatedAt: new Date() })
    .where(eq(scenes.id, escena.id));
  if (escena.state === "aprobada") {
    await tx
      .update(projects)
      .set({ state: "borrador", planApprovedAt: null, planApprovedBy: null, updatedAt: new Date() })
      .where(and(eq(projects.id, escena.projectId), eq(projects.state, "planificado")));
  }
  await tx.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, escena.projectId));
}

/**
 * Comprueba que el formato pedido está **activo en esta instalación**. Podcast y dualcast se apagan desde
 * Admin › Ajustes sin desplegar (es el rollback de la fase), y apagados no se puede elegir ninguno de los dos.
 */
async function exigirFormatoActivo(formato: FormatoReparto): Promise<void> {
  if (formato === "solo") return;
  const ajustes = await leerAjustes();
  if (formato === "podcast" && !ajustes.repartoPodcastActivo) {
    throw new ErrorProyecto(
      409,
      "El formato podcast está desactivado en esta instalación: pídeselo a quien la administra.",
    );
  }
  if (formato === "dualcast" && !ajustes.repartoDualcastActivo) {
    throw new ErrorProyecto(
      409,
      "El formato dualcast está desactivado en esta instalación: pídeselo a quien la administra.",
    );
  }
}

/** Personaje **propio**, comprobado contra la base de datos. Uno ajeno no existe para quien lo pide. */
async function personajeDelUsuario(actor: Actor, personajeId: unknown, ejecutor: Ejecutor = db()) {
  if (typeof personajeId !== "string" || personajeId === "") {
    throw new ErrorProyecto(400, "Elige el personaje que quieres añadir al reparto.");
  }
  const [fila] = await ejecutor
    .select({ id: characters.id, nombre: characters.name })
    .from(characters)
    .where(and(eq(characters.id, personajeId), eq(characters.ownerId, actor.id)))
    .limit(1);
  if (!fila) {
    throw new ErrorProyecto(
      404,
      "Ese personaje no es tuyo, así que no puede salir en tu escena: los dos personajes de una conversación tienen que ser tuyos.",
    );
  }
  return fila;
}

/**
 * Elige el **formato del reparto** de una escena.
 *
 * Pasar a `solo` deja a **un** personaje (el primero del reparto) y borra los turnos: con un solo personaje el
 * guion plano de la escena (`script_text`) vuelve a ser la fuente, y unos turnos huérfanos solo podrían
 * desincronizarse de él. Pasar a `podcast` estrena grupo si no tenía, para que el montaje pueda emparejar los
 * clips; pasar a `dualcast` lo suelta, porque un dualcast es **un** clip y no hay nada que emparejar.
 */
export async function elegirFormatoDeReparto(actor: Actor, escenaId: unknown, formato: unknown): Promise<RepartoVista> {
  if (!esFormatoReparto(formato)) {
    throw new ErrorProyecto(400, "Ese formato de reparto no existe: es un personaje, podcast o dualcast.");
  }
  const { escena } = await escenaPropia(actor, escenaId);
  await exigirFormatoActivo(formato);
  const actualizada = await db().transaction(async (tx) => {
    const miembros = await miembrosDelReparto(escena.id, tx);
    if (formato === "solo" && miembros.length > 1) {
      for (const sobra of miembros.slice(1)) {
        await tx.delete(sceneCharacters).where(eq(sceneCharacters.id, sobra.id));
      }
      await tx.delete(sceneDialogueTurns).where(eq(sceneDialogueTurns.sceneId, escena.id));
    }
    // Los valores por defecto se rehacen con el formato nuevo: la mirada cruzada de un podcast no es la de un
    // dualcast, y dejar la de antes sería pedirle al proveedor una conversación mirando a otro sitio.
    const quedan = formato === "solo" ? miembros.slice(0, 1) : miembros;
    for (const [indice, miembro] of quedan.entries()) {
      const posicion = indice === 0 ? 1 : 2;
      const defectos = porDefectoDelReparto(formato, posicion);
      await tx
        .update(sceneCharacters)
        .set({ role: defectos.papel, side: defectos.lado, gazeDirection: defectos.mirada, sortOrder: posicion })
        .where(eq(sceneCharacters.id, miembro.id));
    }
    const [fila] = await tx
      .update(scenes)
      .set({
        castFormat: formato,
        podcastGroupId: formato === "podcast" ? (escena.podcastGroupId ?? randomUUID()) : null,
      })
      .where(eq(scenes.id, escena.id))
      .returning();
    if (!fila) throw new ErrorProyecto(404, "Esa escena no existe.");
    await anotarCambio(tx, escena);
    return fila;
  });
  return repartoDeEscena(actualizada);
}

/** Lo que se puede decir de un miembro del reparto al añadirlo o al cambiarlo. */
export interface DatosMiembro {
  personajeId?: unknown;
  papel?: unknown;
  lado?: unknown;
  mirada?: unknown;
}

/**
 * Añade un personaje al reparto. El primero puede entrar en cualquier formato (es el protagonista de la escena);
 * el segundo **solo** en podcast o dualcast, porque es lo que esos formatos significan.
 *
 * Los valores por defecto se eligen aquí y son coherentes: lados distintos y, en podcast, mirada cruzada. Quien
 * quiera otros los manda, y se comprueban igual.
 */
export async function anadirAlReparto(actor: Actor, escenaId: unknown, datos: DatosMiembro): Promise<RepartoVista> {
  const { escena } = await escenaPropia(actor, escenaId);
  const personaje = await personajeDelUsuario(actor, datos.personajeId);
  await db().transaction(async (tx) => {
    const miembros = await miembrosDelReparto(escena.id, tx);
    if (miembros.some((m) => m.personajeId === personaje.id)) {
      throw new ErrorProyecto(409, `«${personaje.nombre}» ya está en el reparto de esta escena.`);
    }
    if (miembros.length >= MAXIMO_PERSONAJES_REPARTO) {
      throw new ErrorProyecto(
        409,
        `Una escena admite ${MAXIMO_PERSONAJES_REPARTO} personajes como máximo: quita uno antes de añadir a «${personaje.nombre}».`,
      );
    }
    if (miembros.length === 1 && !esFormatoDeDos(escena.castFormat)) {
      throw new ErrorProyecto(
        409,
        "Esta escena es de un solo personaje. Elige antes el formato podcast o dualcast para que hablen dos.",
      );
    }
    const posicion = miembros.length === 0 ? 1 : 2;
    const defectos = porDefectoDelReparto(escena.castFormat, posicion);
    // El lado del segundo es **siempre el contrario** del primero, valga lo que valga lo que mande el navegador:
    // dos personajes en el mismo lado del cuadro no son un plano, son un error que se paga.
    const primero = miembros[0];
    const lado = esLadoReparto(datos.lado) ? datos.lado : defectos.lado;
    const ladoFinal = primero ? ladoOpuesto(primero.lado) : lado;
    const mirada = esMiradaReparto(datos.mirada)
      ? datos.mirada
      : escena.castFormat === "podcast"
        ? ladoOpuesto(ladoFinal)
        : defectos.mirada;
    await tx.insert(sceneCharacters).values({
      sceneId: escena.id,
      characterId: personaje.id,
      role: esPapelReparto(datos.papel) ? datos.papel : defectos.papel,
      side: ladoFinal,
      gazeDirection: mirada,
      sortOrder: posicion,
    });
    await anotarCambio(tx, escena);
  });
  return repartoDeEscena(escena);
}

/** Cambia el papel, el lado o la mirada de alguien del reparto. Cambiar un lado mueve al otro al contrario. */
export async function cambiarEnElReparto(
  actor: Actor,
  escenaId: unknown,
  miembroId: unknown,
  datos: DatosMiembro,
): Promise<RepartoVista> {
  const { escena } = await escenaPropia(actor, escenaId);
  if (typeof miembroId !== "string" || miembroId === "") {
    throw new ErrorProyecto(400, "No has dicho a quién del reparto quieres cambiar.");
  }
  await db().transaction(async (tx) => {
    const miembros = await miembrosDelReparto(escena.id, tx);
    const miembro = miembros.find((m) => m.id === miembroId);
    if (!miembro) throw new ErrorProyecto(404, "Esa persona no está en el reparto de esta escena.");
    const campos: Partial<typeof sceneCharacters.$inferInsert> = {};
    if (datos.papel !== undefined) {
      if (!esPapelReparto(datos.papel)) throw new ErrorProyecto(400, "Ese papel no existe: habla, o escucha.");
      campos.role = datos.papel;
    }
    if (datos.lado !== undefined) {
      if (!esLadoReparto(datos.lado)) throw new ErrorProyecto(400, "Ese lado del plano no existe.");
      campos.side = datos.lado;
    }
    if (datos.mirada !== undefined) {
      if (!esMiradaReparto(datos.mirada)) throw new ErrorProyecto(400, "Esa dirección de mirada no existe.");
      campos.gazeDirection = datos.mirada;
    }
    if (Object.keys(campos).length === 0) return;
    await tx.update(sceneCharacters).set(campos).where(eq(sceneCharacters.id, miembro.id));
    // El otro se va al lado contrario en la misma operación: el lado es una relación entre los dos, no un dato
    // suelto de cada uno, y dejar a los dos a la izquierda es un plano imposible que se cobra igual.
    if (campos.side) {
      const otro = miembros.find((m) => m.id !== miembro.id);
      if (otro) {
        const contrario = ladoOpuesto(campos.side);
        await tx
          .update(sceneCharacters)
          .set({
            side: contrario,
            ...(escena.castFormat === "podcast" ? { gazeDirection: ladoOpuesto(contrario) } : {}),
          })
          .where(eq(sceneCharacters.id, otro.id));
      }
      if (escena.castFormat === "podcast" && datos.mirada === undefined) {
        await tx
          .update(sceneCharacters)
          .set({ gazeDirection: ladoOpuesto(campos.side) })
          .where(eq(sceneCharacters.id, miembro.id));
      }
    }
    await anotarCambio(tx, escena);
  });
  return repartoDeEscena(escena);
}

/**
 * Quita a alguien del reparto. Se van también **sus turnos**: un turno de quien ya no sale no lo puede decir
 * nadie, y dejarlo ahí sería pedirle al proveedor una frase sin boca.
 */
export async function quitarDelReparto(actor: Actor, escenaId: unknown, miembroId: unknown): Promise<RepartoVista> {
  const { escena } = await escenaPropia(actor, escenaId);
  if (typeof miembroId !== "string" || miembroId === "") {
    throw new ErrorProyecto(400, "No has dicho a quién del reparto quieres quitar.");
  }
  await db().transaction(async (tx) => {
    const [fila] = await tx
      .delete(sceneCharacters)
      .where(and(eq(sceneCharacters.id, miembroId), eq(sceneCharacters.sceneId, escena.id)))
      .returning();
    if (!fila) throw new ErrorProyecto(404, "Esa persona no está en el reparto de esta escena.");
    await tx
      .delete(sceneDialogueTurns)
      .where(and(eq(sceneDialogueTurns.sceneId, escena.id), eq(sceneDialogueTurns.characterId, fila.characterId)));
    // Quien quede se queda como primero del reparto, para que el orden no tenga huecos.
    const quedan = await miembrosDelReparto(escena.id, tx);
    for (const [indice, miembro] of quedan.entries()) {
      await tx
        .update(sceneCharacters)
        .set({ sortOrder: indice + 1 })
        .where(eq(sceneCharacters.id, miembro.id));
    }
    await anotarCambio(tx, escena);
  });
  return repartoDeEscena(escena);
}

/** Un turno tal como lo manda el navegador. */
export interface TurnoPedido {
  personajeId: string;
  texto: string;
  direccion: string;
}

/**
 * Lee la lista de turnos del cuerpo de la petición. Una entrada mal formada se rechaza **con su motivo**, nunca
 * se ignora en silencio: un turno que se pierde es una frase que el personaje no dice y que se ha pagado.
 */
export function leerTurnosPedidos(valor: unknown): TurnoPedido[] {
  if (!Array.isArray(valor)) throw new ErrorProyecto(400, "Envía el diálogo como una lista de turnos.");
  if (valor.length > TURNOS_MAXIMOS) {
    throw new ErrorProyecto(400, `Como mucho ${TURNOS_MAXIMOS} turnos por escena: no cabe más diálogo en un clip.`);
  }
  return valor.map((entrada, indice) => {
    const turno = (entrada ?? {}) as Record<string, unknown>;
    if (typeof turno.personajeId !== "string" || turno.personajeId === "") {
      throw new ErrorProyecto(400, `El turno ${indice + 1} no dice quién habla.`);
    }
    // El texto se limpia contra inyección, como todo lo que escribe el usuario, pero **no se traduce**: es lo
    // que se va a oír, literal y en castellano (decisión del propietario, 0.27.0).
    const texto = limpiarTextoDePrompt(turno.texto, TEXTO_TURNO_MAXIMO).trim();
    if (texto === "") throw new ErrorProyecto(400, `El turno ${indice + 1} está vacío: escribe lo que dice.`);
    return {
      personajeId: turno.personajeId,
      texto,
      direccion: limpiarTextoDePrompt(turno.direccion, DIRECCION_TURNO_MAXIMA),
    };
  });
}

/**
 * Reescribe el diálogo de la escena con los turnos que llegan, en ese orden.
 *
 * Se sustituyen todos de una vez y no de uno en uno: el orden es lo que da sentido a un intercambio, y
 * mantenerlo con altas y bajas sueltas obligaría a renumerar en cada llamada. **Solo pueden hablar los del
 * reparto**: un turno de alguien que no sale en la escena se rechaza diciendo de quién es.
 */
export async function repartirDialogo(actor: Actor, escenaId: unknown, pedidos: TurnoPedido[]): Promise<RepartoVista> {
  const { escena } = await escenaPropia(actor, escenaId);
  await db().transaction(async (tx) => {
    const miembros = await miembrosDelReparto(escena.id, tx);
    if (miembros.length === 0 && pedidos.length > 0) {
      throw new ErrorProyecto(
        409,
        "Esta escena no tiene reparto todavía: elige quién sale antes de repartir el diálogo.",
      );
    }
    const enReparto = new Map(miembros.map((m) => [m.personajeId, m.nombre]));
    for (const [indice, turno] of pedidos.entries()) {
      if (!enReparto.has(turno.personajeId)) {
        throw new ErrorProyecto(
          409,
          `El turno ${indice + 1} es de alguien que no sale en esta escena: añádelo al reparto o cambia de quién es el turno.`,
        );
      }
    }
    await tx.delete(sceneDialogueTurns).where(eq(sceneDialogueTurns.sceneId, escena.id));
    if (pedidos.length > 0) {
      await tx.insert(sceneDialogueTurns).values(
        pedidos.map((turno, indice) => ({
          sceneId: escena.id,
          sortOrder: indice + 1,
          characterId: turno.personajeId,
          text: turno.texto,
          direction: turno.direccion,
        })),
      );
    }
    await anotarCambio(tx, escena);
  });
  return repartoDeEscena(escena);
}

/** El reparto de una escena propia. Una escena ajena responde 404, sin decir que existe. */
export async function leerReparto(actor: Actor, escenaId: unknown): Promise<RepartoVista> {
  const { escena } = await escenaPropia(actor, escenaId);
  return repartoDeEscena(escena);
}
