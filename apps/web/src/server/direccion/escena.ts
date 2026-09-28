import { ejesVozDe } from "@/lib/direccion";
import type { FilaEscena, FilaProyecto } from "../db/esquema";
import { anclajesDe, fragmento, leerCatalogoDeDireccion, nivelDelMovimiento } from "./catalogo";
import type { DireccionDeClip } from "./clip";
import type { SeisC } from "./fotograma";
import { IDENTIDAD_DE_REFERENCIA } from "./ingles";

/**
 * **De la escena a la dirección**: lee lo que la escena y su proyecto guardaron y lo convierte en lo que
 * esperan los compositores.
 *
 * Lo resuelve **el servidor** a partir de la fila de la escena, nunca el navegador. Si la dirección viajara en
 * la petición, el navegador podría mandar texto suyo al proveedor saltándose el catálogo, que es exactamente
 * lo que evita que los prompts sean material del servidor (ADR-0022).
 *
 * Los huecos del texto libre (`escena` y `dialogo` del clip, `contextoLibre` del fotograma) se rellenan
 * **después**, en `generacion/servicio.ts`, cuando ese texto ya está traducido al inglés.
 *
 * **`segundos` tampoco sale de aquí**, y es a propósito: la duración que decide si el gesto cabe es la que se
 * le va a pedir al modelo, no la que la escena tiene planificada. Un modelo que solo hace 6 s convierte una
 * escena de 8 s en un clip de 6 s, y prometer entonces un gesto «antes» sería prometer algo que no cabe.
 * Quien compone ya tiene la duración resuelta y sellada en el precio: la pone él.
 */

/** Lo que aporta el personaje a la dirección. Lo resuelve quien lo conoce y llega ya en inglés. */
export interface PersonajeDirigido {
  /** Descripción en inglés: la ficha. Con una persona real, nunca adjetivos de atractivo. */
  descripcion: string;
  /** `true` si es una persona real. Con `true`, no se embellece pase lo que pase. */
  real: boolean;
  /** Solo se mira si el personaje es inventado y el usuario lo eligió expresamente. */
  atractivoElegido: boolean;
  /** Los cinco ejes de su voz, tal como están guardados. Se normalizan aquí. */
  ejesVoz: unknown;
}

/**
 * La dirección sin nada que dependa de traducir ni del modelo: el texto libre (`escena`, `dialogo`), la
 * duración resuelta y el matiz de voz ya traducido los pone quien compone.
 */
export type DireccionSinTextoLibre = Omit<DireccionDeClip, "escena" | "dialogo" | "segundos" | "direccionVocal"> & {
  /** Matiz de voz tal como lo escribió el usuario, en castellano y sin traducir. */
  direccionVocalOriginal: string;
};

/**
 * Dirección del clip de una escena, sin el texto libre. Es lo que se le pasa a `crearAnimacion` y a la
 * producción de escenas habladas.
 */
export async function direccionDeLaEscena(
  usuarioId: string,
  escena: FilaEscena,
  proyecto: FilaProyecto,
  personaje: PersonajeDirigido,
): Promise<DireccionSinTextoLibre> {
  const catalogo = await leerCatalogoDeDireccion(usuarioId);
  const movimiento = fragmento(catalogo, "camara", escena.cameraMove);
  return {
    formato: escena.clipFormat,
    movimientosCamara: movimiento === "" ? [] : [movimiento],
    nivelCamara: nivelDelMovimiento(catalogo, escena.cameraMove),
    plano: fragmento(catalogo, "plano", escena.shotType),
    angulo: fragmento(catalogo, "angulo", escena.cameraAngle),
    registroEstetico: escena.aestheticRegister,
    // Con una persona real la identidad sale de sus referencias y se dice expresamente que no se la retoque.
    sujeto: personaje.real
      ? `${personaje.descripcion}. ${IDENTIDAD_DE_REFERENCIA}`.trim()
      : personaje.descripcion.trim(),
    personajeReal: personaje.real,
    microaccion: fragmento(catalogo, "microaccion", escena.microAction),
    momentoMicroaccion: escena.microActionTiming,
    /**
     * El matiz de voz lo escribe el usuario **en castellano**, así que sale de aquí en crudo y con su nombre
     * propio: quien compone lo traduce junto al resto del texto libre y lo pone en `direccionVocal`. Devolverlo
     * ya en ese campo obligaría a traducirlo aquí, y aquí no se paga nada ni se llama a nadie.
     */
    direccionVocalOriginal: escena.dialogueDirection.trim(),
    ejesVoz: ejesVozDe(personaje.ejesVoz),
    acento: proyecto.speechAccent,
  };
}

/** Las 6C del fotograma de una escena, sin el texto libre del contexto. */
export async function seisCDeLaEscena(
  usuarioId: string,
  escena: FilaEscena,
  personaje: PersonajeDirigido,
  ropa: string,
): Promise<Omit<SeisC, "contextoLibre">> {
  const catalogo = await leerCatalogoDeDireccion(usuarioId);
  return {
    personaje: personaje.descripcion,
    personajeReal: personaje.real,
    atractivoElegido: !personaje.real && personaje.atractivoElegido,
    plano: fragmento(catalogo, "plano", escena.shotType),
    angulo: fragmento(catalogo, "angulo", escena.cameraAngle),
    optica: fragmento(catalogo, "optica", escena.opticsPreset),
    ropa,
    localizacion: fragmento(catalogo, "localizacion", escena.locationPreset),
    luz: fragmento(catalogo, "luz", escena.lightPreset),
    accion: escena.action.trim(),
    registroEstetico: escena.aestheticRegister,
    anclajes: anclajesDe(catalogo),
  };
}
