import type { TipoPersonaje } from "@/lib/personajes";
import { proporcionDelTrabajo } from "../cola/entrada-del-trabajo";
import type { FilaTrabajo } from "../db/esquema";
import { lugarDeLaImagen, sitioLugarDe } from "../lugares/en-el-envio";
import { contextoParaGenerar, personajePorId } from "../personajes/contexto";
import { imagenPropia } from "./comprobaciones";
import { ErrorGeneracion } from "./errores";
import type { PeticionAnimacion } from "./servicio";
import { esUuidGeneracion, filaPropia, personajeDeLaCadena } from "./trabajos";

/**
 * **De dónde sale el clip**: el primer fotograma que se va a animar y todo lo que arrastra con él.
 *
 * Hay dos caminos y los dos acaban aquí, con la misma forma:
 *
 * - **un fotograma ya generado**: hereda su escena, su personaje y la versión de ficha con la que se hizo, y el
 *   clip queda colgado de él como trabajo hijo;
 * - **una imagen de la biblioteca** (0.25.1): no hay trabajo padre ni escena. El dueño se comprueba al leerla
 *   (`imagenPropia` responde 404 para una ajena) y, si la imagen salió de un trabajo hecho con un personaje, el
 *   clip **hereda ese personaje**: es la misma cara, así que cumple sus reglas. Es exactamente lo que ya hacía
 *   el fotograma con una imagen suelta.
 */
export interface PartidaDelClip {
  /** Imagen que será el primer fotograma del clip. */
  medioId: string;
  trabajoPadreId: string | null;
  escenaId: string | null;
  personajeId: string | null;
  versionPersonajeId: string | null;
  referenciaIdentidad: FilaTrabajo["identityReferenceKind"];
  /** Proporción en la que se generó el fotograma de partida, si se sabe. */
  proporcionFotograma?: string | null;
  /**
   * Lugar y versión con los que se hizo el fotograma de partida: el clip hereda el lugar de su imagen, porque el
   * sitio ya está dentro de ella. `null` si no se sabe (una imagen de la biblioteca) o no llevaba lugar.
   */
  lugarDelFotograma: { placeId: string | null; placeVersion: number | null; sitio: string } | null;
}

export async function partidaDelClip(usuarioId: string, peticion: PeticionAnimacion): Promise<PartidaDelClip> {
  if (peticion.trabajoPadreId) {
    if (!esUuidGeneracion(peticion.trabajoPadreId)) throw new ErrorGeneracion(404, "El trabajo no existe.");
    const padre = await filaPropia(usuarioId, peticion.trabajoPadreId);
    if (padre.kind !== "fotograma") throw new ErrorGeneracion(400, "Solo se animan fotogramas.");
    if (padre.state !== "listo" || !padre.resultMediaId) {
      throw new ErrorGeneracion(409, "Espera a que el fotograma esté listo y guardado antes de animarlo.");
    }
    return {
      medioId: padre.resultMediaId,
      trabajoPadreId: padre.id,
      escenaId: padre.sceneId,
      personajeId: padre.characterId,
      versionPersonajeId: padre.characterVersionId,
      referenciaIdentidad: padre.identityReferenceKind,
      proporcionFotograma: proporcionDelTrabajo(padre),
      lugarDelFotograma: { placeId: padre.placeId, placeVersion: padre.placeVersion, sitio: sitioLugarDe(padre.input) },
    };
  }
  const medioId = peticion.medioId;
  if (!medioId) {
    throw new ErrorGeneracion(400, "Elige el fotograma de partida: un fotograma ya generado o una imagen tuya.");
  }
  // Que la imagen exista y sea suya lo decide esta lectura, no quien llama: una ajena responde 404.
  const medio = await imagenPropia(usuarioId, medioId);
  // La cara que sale en la imagen manda; si la imagen es una foto suelta, en un proyecto es la del protagonista.
  const personajeId =
    (await personajeDeLaCadena(usuarioId, medio.id)) ?? peticion.escenaDelProyecto?.personajeId ?? null;
  /**
   * La versión de ficha que se cita es la **vigente** del personaje heredado: la imagen puede ser de hace meses
   * y el clip se genera ahora. Sin personaje no hay ninguna que citar.
   */
  const conFicha = await fichaHeredada(personajeId, 1);
  return {
    medioId: medio.id,
    // No hay trabajo padre: el clip nace de una imagen, no de una generación de esta cadena.
    trabajoPadreId: null,
    escenaId: peticion.escenaDelProyecto?.escenaId ?? null,
    personajeId,
    versionPersonajeId: conFicha.versionId,
    // La imagen es la referencia: no se citó ninguna hoja 3×3 al hacerla desde aquí.
    referenciaIdentidad: "vistas",
    // Si la imagen salió de un trabajo con lugar, el sitio ya está en ella: el clip lo hereda.
    lugarDelFotograma: await lugarDeLaImagen(usuarioId, medio.id),
  };
}

/**
 * Contexto del personaje **heredado** por una imagen suelta que salió de otro trabajo hecho con él. Sin
 * personaje no hay contexto ni versión que citar.
 */
export async function fichaHeredada(
  personajeId: string | null,
  maximoDelModelo: number,
): Promise<{ versionId: string | null; contexto: string; tipo: TipoPersonaje | null }> {
  if (!personajeId) return { versionId: null, contexto: "", tipo: null };
  const personaje = await personajePorId(personajeId);
  if (!personaje) return { versionId: null, contexto: "", tipo: null };
  const { version, contexto } = await contextoParaGenerar(personaje, Math.max(1, maximoDelModelo));
  return { versionId: version.id, contexto, tipo: personaje.kind };
}
