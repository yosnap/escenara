import { esRetratoVertical, proporcionEscrita } from "@/lib/canto";
import { cantoDe, leerAjustes } from "../ajustes";
import type { HechosCanto } from "../controles/contrato";
import type { FilaEscena, FilaMedio, FilaProyecto } from "../db/esquema";
import type { Actor } from "../media/servicio";
import { personajePropio, referenciasParaGenerar } from "../personajes/puede-generar";
import { type AudioDeLaEscena, audioDeLaEscena, motivoAudioIncompatible } from "./audio";
import { hayDeclaracion } from "./declaracion";

/**
 * **Hechos del canto para el motor de controles** (0.29.0). Aquí está todo el acceso a datos y ninguna regla: el
 * motor es puro y decide con lo que se le da, así que la **misma** lectura sirve para pintar lo que falta en la
 * pantalla de la escena y para cerrar la puerta del encolado.
 *
 * Que sea la misma es lo que importa: si la pantalla mirara una cosa y la puerta otra, la pantalla podría decir
 * «listo» justo antes de un rechazo, y eso con un botón que cuesta dinero es lo peor que puede pasar.
 */

/**
 * **Retrato de partida del canto**: el que sale del personaje, no una subida suelta (decisión del propietario,
 * 2026-09-28).
 *
 * Por qué del personaje y no de una imagen cualquiera: porque así **la puerta del consentimiento sigue aplicando**
 * (0.13.0). Un retrato subido al vuelo pondría la cara de alguien en un clip sin que nadie haya declarado que se
 * puede usar, y el consentimiento dejaría de ser una condición para convertirse en una recomendación.
 *
 * Se pide **una sola** referencia porque `image_url` es un campo suelto y no una lista: la que devuelve
 * `referenciasParaGenerar` con tope 1 es la mejor del personaje por cobertura, que es la que su dueño querría.
 */
export interface RetratoDeCanto {
  medio: FilaMedio | null;
  vertical: boolean;
  proporcion: string;
  /** Versión de la ficha del personaje con la que se cita, para que el trabajo quede atado a ella. */
  versionId: string | null;
  /** Contexto de esa versión, que es lo que describe al personaje en el prompt. */
  contexto: string;
}

const SIN_RETRATO: RetratoDeCanto = {
  medio: null,
  vertical: false,
  proporcion: "",
  versionId: null,
  contexto: "",
};

/**
 * Retrato con el que cantaría el protagonista del proyecto, y si su proporción sirve.
 *
 * Un personaje sin referencias utilizables devuelve {@link SIN_RETRATO} en lugar de lanzar: **la puerta es la que
 * decide**, y aquí lanzar convertiría un «te falta el retrato» en un error interno. Lo mismo con un retrato sin
 * medidas guardadas: sin ancho y alto no se puede afirmar que sea vertical, así que se trata como que no lo es y
 * la regla lo dice con su proporción vacía.
 */
export async function retratoDeCanto(actor: Actor, proyecto: FilaProyecto): Promise<RetratoDeCanto> {
  if (!proyecto.mainCharacterId) return SIN_RETRATO;
  const personaje = await personajePropio(actor, proyecto.mainCharacterId);
  let elegido: Awaited<ReturnType<typeof referenciasParaGenerar>>;
  try {
    elegido = await referenciasParaGenerar(personaje, 1);
  } catch {
    // Sin referencias utilizables no hay retrato. Lo cuenta la regla `canto-sin-retrato`, no una excepción.
    return SIN_RETRATO;
  }
  const medio = elegido.referencias[0] ?? null;
  if (!medio) return SIN_RETRATO;
  const ancho = medio.width ?? 0;
  const alto = medio.height ?? 0;
  return {
    medio,
    vertical: esRetratoVertical(ancho, alto),
    proporcion: ancho > 0 && alto > 0 ? proporcionEscrita(ancho, alto) : "un tamaño que no se ha podido leer",
    versionId: elegido.version.id,
    contexto: elegido.contexto,
  };
}

/** Todo lo que el motor necesita saber del canto de una escena, con el audio y el retrato ya resueltos. */
export interface EstadoDelCanto {
  hechos: HechosCanto;
  audio: AudioDeLaEscena | null;
  retrato: RetratoDeCanto;
  segundosMaximos: number;
}

/**
 * Reúne el estado del canto de una escena. Es **lectura**: no escribe nada, no encola nada y no llama a ningún
 * endpoint de pago. Lo único que tarda es medir el audio con `ffprobe`, que no sale de la máquina.
 */
export async function estadoDelCanto(
  actor: Actor,
  escena: FilaEscena,
  proyecto: FilaProyecto,
): Promise<EstadoDelCanto> {
  const { activo, modelo, segundosMaximos } = cantoDe(await leerAjustes());
  const [audio, retrato] = await Promise.all([audioDeLaEscena(escena, actor.id), retratoDeCanto(actor, proyecto)]);
  const declarado = audio === null ? false : await hayDeclaracion(actor.id, audio.medio.id);
  return {
    audio,
    retrato,
    segundosMaximos,
    hechos: {
      activa: activo,
      conAudio: audio !== null,
      motivoAudioIncompatible: audio ? (motivoAudioIncompatible(audio.medio, modelo) ?? "") : "",
      declarado,
      duracion: audio?.duracion ?? null,
      segundosMaximos,
      conRetrato: retrato.medio !== null,
      motivoRetratoIncompatible:
        retrato.medio && retrato.medio.sizeBytes > 10 * 1024 * 1024
          ? `El retrato del personaje ocupa ${(retrato.medio.sizeBytes / 1024 / 1024).toFixed(1)} MB y ${modelo} admite hasta 10 MB. Elige o sube un retrato más pequeño.`
          : "",
      retratoVertical: retrato.vertical,
      proporcionRetrato: retrato.proporcion,
    },
  };
}
