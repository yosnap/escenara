import { and, eq, isNull } from "drizzle-orm";
import { type ModeloCanto, segundosFacturados } from "@/lib/canto";
import { MIME_ADMITIDOS } from "@/lib/media/reglas";
import { motivoDeInvalidacion } from "@/lib/proyectos";
import { cantoDe, leerAjustes } from "../ajustes";
import { escenaPropia } from "../asistente/consulta";
import { db } from "../db/cliente";
import { type FilaEscena, type FilaMedio, type FilaProyecto, media, projects, scenes } from "../db/esquema";
import type { Actor } from "../media/servicio";
import { duracionDeAudio } from "./duracion";
import { ErrorCanto } from "./errores";

/**
 * **Audio de canto de una escena** (0.29.0): elegirlo de la biblioteca del usuario, medirlo y quitarlo.
 *
 * Lo que este fichero **no** hace: gastar. Elegir un audio no cuesta nada, así que aquí no hay estimación, ni
 * confirmación, ni reserva. Lo único que se guarda es cuál es el audio de esa escena; el coste se confirma al
 * pedir el clip (`escena.ts`), que es donde el usuario ve la cifra.
 *
 * Y lo que sí hace, siempre antes de escribir nada:
 *
 * - **autorización estricta**: un audio de otra cuenta responde **404**, no 403. Un 403 confirmaría que ese
 *   identificador existe, y la biblioteca de alguien no es algo cuya existencia se pueda sondear;
 * - **que sea audio de verdad**, con un formato de los que acepta esta instalación. Una imagen elegida como
 *   canción daría un clip que no suena, y se habría pagado;
 * - **que quepa en el tope de duración**, medido con `ffprobe` sobre el archivo. Se comprueba aquí, al elegirlo,
 *   para que el usuario lo sepa **antes** de llegar al botón de pagar, y lo vuelve a comprobar la puerta de
 *   controles antes de reservar: el archivo no cambia, pero el tope de la instalación sí puede.
 */

/** Formatos de audio que esta instalación acepta. Los mismos que la biblioteca: no hay una lista aparte. */
const FORMATOS_AUDIO = MIME_ADMITIDOS.audio;
const FORMATOS_PROVEEDOR = ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4", "audio/aac"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Límites publicados por KIE para el audio de cada modelo, antes de subirlo al proveedor. */
export function motivoAudioIncompatible(medio: FilaMedio, modelo: ModeloCanto): string | null {
  if (!FORMATOS_PROVEEDOR.includes(medio.mimeType)) {
    return `El modelo ${modelo} no admite audio ${medio.mimeType}. Vuelve a subirlo como MP3, WAV, OGG, M4A o AAC.`;
  }
  const maximoMb = modelo === "infinitalk/from-audio" ? 10 : 100;
  if (medio.sizeBytes > maximoMb * 1024 * 1024) {
    return `El audio ocupa ${(medio.sizeBytes / 1024 / 1024).toFixed(1)} MB y ${modelo} admite hasta ${maximoMb} MB. Comprímelo o recórtalo y vuelve a subirlo.`;
  }
  return null;
}

/**
 * El audio elegido, comprobando que es de este usuario, que sigue en la biblioteca y que es audio.
 *
 * Un medio ajeno, borrado o inexistente responde **404 con el mismo mensaje**: los tres casos se cuentan igual a
 * propósito, porque distinguirlos diría si ese identificador existe en la cuenta de otro.
 */
export async function audioPropio(usuarioId: string, medioId: unknown): Promise<FilaMedio> {
  if (typeof medioId !== "string" || medioId === "") {
    throw new ErrorCanto(400, "Elige el audio con el que quieres que cante.");
  }
  if (!UUID.test(medioId)) throw new ErrorCanto(404, "Ese audio no está en tu biblioteca.");
  const [fila] = await db()
    .select()
    .from(media)
    .where(and(eq(media.id, medioId), eq(media.ownerId, usuarioId), isNull(media.deletedAt)))
    .limit(1);
  if (!fila) throw new ErrorCanto(404, "Ese audio no está en tu biblioteca.");
  if (fila.kind !== "audio") {
    throw new ErrorCanto(
      400,
      "Para cantar hace falta un archivo de audio: eso que has elegido no lo es. Sube la canción o la grabación y vuelve a elegirla.",
    );
  }
  if (!FORMATOS_AUDIO.includes(fila.mimeType)) {
    throw new ErrorCanto(
      400,
      `El formato de ese audio (${fila.mimeType}) no lo acepta esta instalación. Vuelve a subirlo como ${FORMATOS_AUDIO.map((m) => m.replace("audio/", "").toUpperCase()).join(", ")}.`,
    );
  }
  return fila;
}

/** Audio de canto de una escena, ya medido. `null` cuando la escena no tiene ninguno elegido. */
export interface AudioDeLaEscena {
  medio: FilaMedio;
  /** Duración medida con `ffprobe`; `null` si no se ha podido leer (entonces no se genera y se dice). */
  duracion: number | null;
  /** Segundos que se facturan (el entero siguiente); `null` sin duración medida. */
  facturados: number | null;
}

/** Cambiar el audio cambia el coste y el contenido aprobado del plan. */
async function guardarAudio(escena: FilaEscena, medioId: string | null): Promise<FilaEscena> {
  if (escena.singingAudioMediaId === medioId) return escena;
  return db().transaction(async (tx) => {
    const [actualizada] = await tx
      .update(scenes)
      .set({
        singingAudioMediaId: medioId,
        ...(escena.state === "aprobada"
          ? {
              state: "borrador" as const,
              approvedAt: null,
              invalidationReason: motivoDeInvalidacion("Has cambiado el audio de canto"),
            }
          : {}),
        ...(escena.clipMediaId !== null ? { changedSinceGeneration: true } : {}),
        updatedAt: new Date(),
      })
      .where(eq(scenes.id, escena.id))
      .returning();
    if (!actualizada) throw new ErrorCanto(500, "No se ha podido guardar el audio de esta escena.");
    if (escena.state === "aprobada") {
      await tx
        .update(projects)
        .set({ state: "borrador", planApprovedAt: null, planApprovedBy: null, updatedAt: new Date() })
        .where(and(eq(projects.id, escena.projectId), eq(projects.state, "planificado")));
    }
    return actualizada;
  });
}

/**
 * Audio de canto de la escena, con su duración medida. `null` si la escena no tiene ninguno **o si el medio ya
 * no está**: un audio borrado deja la escena sin él, y eso es lo que la puerta cuenta como «falta elegirlo».
 */
export async function audioDeLaEscena(escena: FilaEscena, usuarioId: string): Promise<AudioDeLaEscena | null> {
  if (!escena.singingAudioMediaId) return null;
  const [fila] = await db()
    .select()
    .from(media)
    .where(and(eq(media.id, escena.singingAudioMediaId), eq(media.ownerId, usuarioId), isNull(media.deletedAt)))
    .limit(1);
  if (!fila || fila.kind !== "audio") return null;
  const duracion = await duracionDeAudio(fila);
  return { medio: fila, duracion, facturados: duracion === null ? null : segundosFacturados(duracion) };
}

/**
 * Elige el audio de canto de una escena propia. Comprueba el tope **al elegir**, no solo al generar: enterarse de
 * que la canción no cabe justo antes de pagar es enterarse tarde, y recortarla es trabajo del usuario.
 *
 * No cambia el formato de la escena: eso lo hace la pantalla de la escena con el resto de su dirección
 * (`asistente/escenas.ts`), y hacerlo aquí sería decidir por el usuario qué clase de clip quiere.
 */
export async function elegirAudioDeCanto(
  actor: Actor,
  escenaId: unknown,
  medioId: unknown,
): Promise<{ escena: FilaEscena; proyecto: FilaProyecto; audio: AudioDeLaEscena }> {
  const { escena, proyecto } = await escenaPropia(actor, escenaId);
  const medio = await audioPropio(actor.id, medioId);
  const { modelo, segundosMaximos } = cantoDe(await leerAjustes());
  const motivoIncompatible = motivoAudioIncompatible(medio, modelo);
  if (motivoIncompatible) throw new ErrorCanto(409, `${motivoIncompatible} No se ha elegido nada ni se te ha cobrado.`);
  const duracion = await duracionDeAudio(medio);
  if (duracion === null) {
    throw new ErrorCanto(
      409,
      "No se ha podido medir cuánto dura este audio, y el clip se paga por segundo: sin la duración no se puede calcular el coste ni confirmarlo. Vuelve a subirlo en un formato corriente (MP3, WAV o M4A). No se ha cobrado nada.",
    );
  }
  if (duracion > segundosMaximos) {
    throw new ErrorCanto(
      409,
      `Este audio dura ${duracion.toLocaleString("es-ES", { maximumFractionDigits: 1 })} s y el tope de esta instalación es de ${segundosMaximos} s, que es el tramo con el que el proveedor publica su tarifa. Recórtalo a ${segundosMaximos} s como máximo y vuelve a subirlo, o reparte la canción en varias escenas de ${segundosMaximos} s. No se ha elegido nada y no se te ha cobrado.`,
    );
  }
  const actualizada = await guardarAudio(escena, medio.id);
  return {
    escena: actualizada,
    proyecto,
    audio: { medio, duracion, facturados: segundosFacturados(duracion) },
  };
}

/**
 * Quita el audio de canto de una escena. **No borra el archivo** de la biblioteca ni su declaración de derechos:
 * son del usuario y puede usarlos en otra escena. Lo que se retira es su uso aquí.
 */
export async function quitarAudioDeCanto(
  actor: Actor,
  escenaId: unknown,
): Promise<{ escena: FilaEscena; proyecto: FilaProyecto }> {
  const { escena, proyecto } = await escenaPropia(actor, escenaId);
  const actualizada = await guardarAudio(escena, null);
  return { escena: actualizada, proyecto };
}
