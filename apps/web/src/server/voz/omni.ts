import { and, desc, eq } from "drizzle-orm";
import {
  DESCRIPCION_VOZ_OMNI_MAXIMA,
  DESCRIPCION_VOZ_OMNI_MINIMA,
  EJEMPLO_VOZ_OMNI_MAXIMO,
  esVozOmni,
  nombreDeVozOmni,
  type VozOmniDelProyecto,
} from "@/lib/omni";
import type { FirmaOmni } from "@/lib/voz";
import { proyectoPropio, proyectoPropioBloqueado } from "../asistente/consulta";
import { ErrorProyecto } from "../asistente/errores";
import { db } from "../db/cliente";
import { type FilaProyecto, projects } from "../db/esquema";
import { HERRAMIENTAS, type Herramientas } from "../generacion/herramientas";
import type { Actor } from "../media/servicio";
import { registrarVozEnProveedor, registroVigente } from "../omni/registro";
import { ultimaVersion } from "../personajes/ficha";
import { type CambioDeVoz, exigirConfirmacionDelCambio, marcarInvalidadas } from "./proyecto";

/**
 * Voz Omni de un proyecto (RF08, 0.22.0): **una voz registrada para todo el proyecto**, igual que la voz del modo
 * `pista` y por la misma razón. Si cada escena pudiera elegir, el timbre cambiaría de plano a plano, que es
 * justo lo que este modo viene a resolver.
 *
 * Registrar la voz **no cuesta créditos** (medido el 2026-09-28), pero sí invalida lo que se generó con la
 * anterior: las escenas habladas que salieron con otro `audioId` ya no corresponden a lo que el proyecto pide, y
 * eso se dice y se confirma antes de cambiar nada. Como siempre, **no se regenera nada por su cuenta**.
 */

/** La voz Omni registrada del proyecto, o `null` si todavía no se ha registrado ninguna. */
export function vozOmniDelProyecto(proyecto: FilaProyecto): VozOmniDelProyecto | null {
  if (proyecto.omniVoice === "" || proyecto.omniAudioId === "") return null;
  return {
    voz: proyecto.omniVoice,
    descripcion: proyecto.omniVoiceDescription,
    ejemplo: proyecto.omniVoiceExample,
    audioId: proyecto.omniAudioId,
    registradaEn: (proyecto.omniVoiceSetAt ?? proyecto.updatedAt).toISOString(),
  };
}

/**
 * Firma de lo que hace válida una escena hablada **ahora mismo**: la voz registrada del proyecto y la identidad
 * registrada de su protagonista, con su versión de ficha vigente.
 *
 * `null` cuando falta cualquiera de las dos: sin registro no hay escena hablada que pueda darse por buena, y eso
 * es lo que tiene que decir la firma en lugar de parecerse a la anterior.
 */
export async function firmaOmniDelProyecto(proyecto: FilaProyecto): Promise<FirmaOmni | null> {
  if (proyecto.omniAudioId === "" || !proyecto.mainCharacterId) return null;
  const version = await ultimaVersion(proyecto.mainCharacterId);
  if (!version) return null;
  const registro = await registroVigente(proyecto.mainCharacterId, version.id, proyecto.omniAudioId);
  if (!registro) return null;
  return { audioId: proyecto.omniAudioId, personajeOmniId: registro.remoteCharacterId };
}

/**
 * Proyectos de este usuario que están en modo `omni`, con si ya tienen su voz registrada. Es lo que la ficha del
 * personaje necesita para poder ofrecer registrarlo: la voz con la que se registra es **la del proyecto**, así
 * que sin proyecto en ese modo no hay nada con lo que registrar.
 */
export async function proyectosEnModoOmni(
  usuarioId: string,
): Promise<{ id: string; titulo: string; conVoz: boolean }[]> {
  const filas = await db()
    .select({ id: projects.id, titulo: projects.title, audioId: projects.omniAudioId })
    .from(projects)
    .where(and(eq(projects.userId, usuarioId), eq(projects.voiceMode, "omni")))
    .orderBy(desc(projects.updatedAt));
  return filas.map((f) => ({ id: f.id, titulo: f.titulo, conVoz: f.audioId !== "" }));
}

/** Lo que llega del navegador para registrar la voz Omni, ya validado en el borde. */
export interface EleccionVozOmni {
  voz: string;
  descripcion: string;
  ejemplo: string;
}

/** Valida la elección en el borde: lo que no tenga la forma que acepta el proveedor no sale de aquí. */
export function validarEleccionVozOmni(crudo: Record<string, unknown>): EleccionVozOmni {
  if (!esVozOmni(crudo.voz)) {
    throw new ErrorProyecto(400, "Esa voz no está entre las treinta que ofrece Gemini Omni.");
  }
  const descripcion = typeof crudo.descripcion === "string" ? crudo.descripcion.trim() : "";
  if (descripcion.length < DESCRIPCION_VOZ_OMNI_MINIMA) {
    throw new ErrorProyecto(
      400,
      `Describe la voz con al menos ${DESCRIPCION_VOZ_OMNI_MINIMA} caracteres: sin descripción, el proveedor decide el acento y no suena igual cada vez que se registra.`,
    );
  }
  if (descripcion.length > DESCRIPCION_VOZ_OMNI_MAXIMA) {
    throw new ErrorProyecto(400, `La descripción de la voz admite hasta ${DESCRIPCION_VOZ_OMNI_MAXIMA} caracteres.`);
  }
  const ejemplo = typeof crudo.ejemplo === "string" ? crudo.ejemplo.trim() : "";
  if (ejemplo === "") throw new ErrorProyecto(400, "Escribe una frase de ejemplo para la voz.");
  if (ejemplo.length > EJEMPLO_VOZ_OMNI_MAXIMO) {
    throw new ErrorProyecto(
      400,
      `La frase de ejemplo de la voz admite hasta ${EJEMPLO_VOZ_OMNI_MAXIMO} caracteres, que es lo que acepta el proveedor.`,
    );
  }
  return { voz: crudo.voz, descripcion, ejemplo };
}

/**
 * Registra la voz Omni del proyecto y la fija para todas sus escenas.
 *
 * El orden importa y es el mismo de siempre: primero se comprueba **qué invalidaría** y se exige la confirmación,
 * después se llama al proveedor (fuera de toda transacción: es una llamada de red y no puede tener una fila
 * bloqueada esperándola), y solo con el `audioId` en la mano se escribe el proyecto y se marca lo invalidado.
 *
 * Si el registro falla, el proyecto **queda exactamente como estaba** y el mensaje dice qué pasó, que no se ha
 * cobrado nada y qué hacer.
 */
export async function registrarVozOmni(
  actor: Actor,
  proyectoId: string,
  eleccion: EleccionVozOmni,
  confirmado: boolean,
  h: Herramientas = HERRAMIENTAS,
): Promise<CambioDeVoz> {
  const proyecto = await proyectoPropio(actor, proyectoId);
  if (proyecto.voiceMode !== "omni") {
    throw new ErrorProyecto(
      409,
      "Este proyecto no usa el modo Omni, así que no hay ninguna voz que registrar en el proveedor. Cambia primero el modo de voz a «Omni: misma cara y voz en todas las escenas».",
    );
  }
  const anterior = vozOmniDelProyecto(proyecto);
  const mismaVoz =
    anterior !== null &&
    anterior.voz === eleccion.voz &&
    anterior.descripcion === eleccion.descripcion &&
    anterior.ejemplo === eleccion.ejemplo;
  if (mismaVoz) return { proyecto, invalidadas: 0 };

  // Qué se perdería con la voz nueva: todavía con la firma de ahora, que es la que valida lo ya generado.
  const firmaActual = await firmaOmniDelProyecto(proyecto);
  await exigirConfirmacionDelCambio(
    db(),
    proyecto,
    // Con otra voz, ningún registro anterior sigue valiendo: la firma futura no tiene ni `audioId` ni identidad.
    { ...proyecto, omniVoice: eleccion.voz, omniAudioId: "" },
    confirmado,
    "de voz Omni",
    0,
    firmaActual,
  );

  const { audioId } = await registrarVozEnProveedor(
    actor.id,
    {
      voz: eleccion.voz,
      // Al proveedor se le manda el título del proyecto como nombre: ahí dentro solo sirve para reconocerla.
      nombre: proyecto.title,
      descripcion: eleccion.descripcion,
      ejemplo: eleccion.ejemplo,
    },
    h,
  );

  return db().transaction(async (tx) => {
    const bloqueado = await proyectoPropioBloqueado(actor, proyectoId, tx);
    const [actualizado] = await tx
      .update(projects)
      .set({
        omniVoice: eleccion.voz,
        omniVoiceDescription: eleccion.descripcion,
        omniVoiceExample: eleccion.ejemplo,
        omniAudioId: audioId,
        omniVoiceSetAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, bloqueado.id))
      .returning();
    if (!actualizado) throw new ErrorProyecto(404, "Ese proyecto no existe.");
    /**
     * Se marca con la firma **nueva**: la voz ya es otra, así que lo que se generó con la anterior es justo lo
     * que deja de valer. El registro del personaje también deja de servir (iba atado a la voz anterior) y la
     * ficha lo dirá: hay que volver a registrarlo, y eso tampoco cuesta créditos.
     */
    const invalidadas = await marcarInvalidadas(
      tx,
      actualizado,
      `La voz Omni de este proyecto ha pasado a ser «${nombreDeVozOmni(eleccion.voz)}». Lo que se generó con la anterior sonaba con otro timbre, así que ya no vale: vuelve a registrar al protagonista —no cuesta créditos— y regenera las escenas que quieras confirmando su coste.`,
      await firmaOmniDelProyecto(actualizado),
    );
    return { proyecto: actualizado, invalidadas };
  });
}
