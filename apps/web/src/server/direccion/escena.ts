import { type DireccionElegidaConAcento, ejesVozDe } from "@/lib/direccion";
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
export type DireccionSinTextoLibre = Omit<
  DireccionDeClip,
  "escena" | "dialogo" | "segundos" | "direccionVocal" | "instruccionesExtra" | "descripcionExperta"
> & {
  /** Matiz de voz tal como lo escribió el usuario, en castellano y sin traducir. */
  direccionVocalOriginal: string;
  /** Instrucciones adicionales tal como las escribió, en castellano. Quien compone las traduce. */
  instruccionesExtraOriginal: string;
  /** La descripción del modo experto, en castellano. Quien compone la traduce. */
  descripcionExpertaOriginal: string;
};

/**
 * Dirección de un clip a partir de **lo que el usuario eligió**, resuelta con el catálogo de esta instalación.
 *
 * Es el único sitio donde una clave se convierte en un fragmento en inglés, y por eso lo usan los dos caminos:
 * la escena de un proyecto, que guarda su elección en la fila, y «Crear», que la manda con la confirmación del
 * clip. Que el navegador mande claves y no texto es lo que evita que pueda colar algo suyo en el prompt
 * (ADR-0022): una clave que no esté en el catálogo se comporta como «no elegido».
 */
export async function direccionDesdeEleccion(
  usuarioId: string,
  elegida: DireccionElegidaConAcento,
  personaje: PersonajeDirigido,
): Promise<DireccionSinTextoLibre> {
  const catalogo = await leerCatalogoDeDireccion(usuarioId);
  const movimiento = fragmento(catalogo, "camara", elegida.camara);
  return {
    formato: elegida.formatoClip,
    movimientosCamara: movimiento === "" ? [] : [movimiento],
    nivelCamara: nivelDelMovimiento(catalogo, elegida.camara),
    plano: fragmento(catalogo, "plano", elegida.plano),
    angulo: fragmento(catalogo, "angulo", elegida.angulo),
    registroEstetico: elegida.registroEstetico,
    // Con una persona real la identidad sale de sus referencias y se dice expresamente que no se la retoque.
    sujeto: personaje.real
      ? `${personaje.descripcion}. ${IDENTIDAD_DE_REFERENCIA}`.trim()
      : personaje.descripcion.trim(),
    personajeReal: personaje.real,
    microaccion: fragmento(catalogo, "microaccion", elegida.microaccion),
    momentoMicroaccion: elegida.momentoMicroaccion,
    /**
     * El texto libre lo escribe el usuario **en castellano**, así que sale de aquí en crudo y con nombre propio:
     * quien compone lo traduce junto al resto y lo pone en su campo. Traducirlo aquí obligaría a esta función a
     * llamar a un proveedor, y aquí no se paga nada ni se habla con nadie.
     */
    direccionVocalOriginal: elegida.direccionVocal.trim(),
    instruccionesExtraOriginal: elegida.instruccionesExtra.trim(),
    modoExperto: elegida.modoExperto,
    descripcionExpertaOriginal: elegida.descripcionExperta.trim(),
    // Los anclajes no los elige el usuario: son del catálogo de quien administra, y sostienen el modo experto.
    anclajes: anclajesDe(catalogo),
    ejesVoz: ejesVozDe(personaje.ejesVoz),
    acento: elegida.acento,
  };
}

/** Lo que la escena tiene elegido, leído de su fila. El acento es del proyecto, no suyo. */
export const eleccionDeLaEscena = (escena: FilaEscena, proyecto: FilaProyecto): DireccionElegidaConAcento => ({
  formatoClip: escena.clipFormat,
  plano: escena.shotType,
  angulo: escena.cameraAngle,
  camara: escena.cameraMove,
  microaccion: escena.microAction,
  momentoMicroaccion: escena.microActionTiming,
  direccionVocal: escena.dialogueDirection,
  optica: escena.opticsPreset,
  luz: escena.lightPreset,
  localizacion: escena.locationPreset,
  registroEstetico: escena.aestheticRegister,
  instruccionesExtra: escena.extraInstructions,
  modoExperto: escena.expertMode,
  descripcionExperta: escena.expertDescription,
  acento: proyecto.speechAccent,
});

/**
 * Dirección del clip de una escena, sin el texto libre. Es lo que se le pasa a `crearAnimacion` y a la
 * producción de escenas habladas.
 */
export const direccionDeLaEscena = (
  usuarioId: string,
  escena: FilaEscena,
  proyecto: FilaProyecto,
  personaje: PersonajeDirigido,
): Promise<DireccionSinTextoLibre> =>
  direccionDesdeEleccion(usuarioId, eleccionDeLaEscena(escena, proyecto), personaje).then((direccion) => ({
    ...direccion,
    animado: proyecto.renderStyle === "animado",
    // El plano del lugar solo: sin nadie y mudo. Si la escena ya no tiene lugar, la producción lo dice antes.
    ...(escena.placeShot === "solo_lugar" ? { soloLugar: true } : {}),
  }));

/** Las 6C del fotograma de una escena, sin el texto libre del contexto. */
export async function seisCDeLaEscena(
  usuarioId: string,
  escena: FilaEscena,
  proyecto: FilaProyecto,
  personaje: PersonajeDirigido,
  ropa: string,
): Promise<Omit<SeisC, "contextoLibre">> {
  const catalogo = await leerCatalogoDeDireccion(usuarioId);
  return {
    animado: proyecto.renderStyle === "animado",
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
