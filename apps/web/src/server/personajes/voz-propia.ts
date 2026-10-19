import { eq } from "drizzle-orm";
import { db } from "../db/cliente";
import { characters, type FilaPersonaje } from "../db/esquema";
import { HERRAMIENTAS, type Herramientas } from "../generacion/herramientas";
import type { Actor } from "../media/servicio";
import { ErrorOmni } from "../omni/errores";
import { registrarVozEnProveedor } from "../omni/registro";
import { type EleccionVozOmni, vozPropiaDe } from "../voz/omni";
import { registrarPersonajeOmni } from "./omni";
import { personajePropio } from "./puede-generar";

/**
 * **Voz registrada propia de un personaje**: la que suena cuando habla en un podcast o una entrevista, para que cada
 * uno tenga su timbre y no hablen los dos con la voz del proyecto (decisión del propietario, 2026-10-18).
 *
 * La voz pertenece al personaje y le acompaña en todos sus proyectos. El proyecto conserva su voz como la de su
 * protagonista cuando este no tiene la suya, que es lo de siempre.
 *
 * Registrarla **no cuesta créditos** (medido el 2026-09-28, como la del proyecto). En el proveedor la voz viaja
 * dentro del personaje registrado (`audio_ids` al crear el personaje), así que cambiarla obliga a registrar otra vez
 * al personaje con ella; eso tampoco cuesta, y se hace aquí mismo en cuanto el consentimiento y las fotos lo
 * permiten. Lo que sí cuesta es **regenerar** las escenas que salieron con la voz anterior, y eso no se hace nunca
 * por su cuenta.
 */

/** Resultado de registrar la voz: el personaje ya con ella y, si no se pudo registrar su identidad, por qué. */
export interface VozPropiaRegistrada {
  personaje: FilaPersonaje;
  /** `true` si se ha registrado también al personaje con la voz nueva. */
  registrado: boolean;
  /** Por qué no se ha podido registrar al personaje con su voz (consentimiento, fotos…); vacío si se registró. */
  avisoRegistro: string;
}

/**
 * Nombre de la voz en el proveedor. Ahí dentro solo sirve para reconocerla, así que no se manda nada del personaje:
 * su nombre ya viaja al registrar su identidad, y no hace falta repetirlo en otro sitio.
 */
const nombreDeLaVoz = (personajeId: string): string => `escenara-voz-${personajeId.slice(0, 8)}`;

/**
 * Registra la voz propia del personaje y, a continuación, al personaje con ella. Si la voz pedida es la que ya
 * tiene, no se llama a nadie.
 *
 * El orden es el de la voz del proyecto: primero la llamada al proveedor (fuera de toda transacción), y solo con el
 * `audioId` en la mano se escribe la fila. Si el registro de la voz falla, el personaje queda **como estaba** y el
 * mensaje dice qué pasó, que no se ha cobrado nada y qué hacer.
 */
export async function registrarVozPropia(
  actor: Actor,
  personajeId: unknown,
  eleccion: EleccionVozOmni,
  h: Herramientas = HERRAMIENTAS,
): Promise<VozPropiaRegistrada> {
  const personaje = await personajePropio(actor, personajeId);
  const anterior = vozPropiaDe(personaje);
  const misma =
    anterior !== null &&
    anterior.voz === eleccion.voz &&
    anterior.descripcion === eleccion.descripcion &&
    anterior.ejemplo === eleccion.ejemplo;
  if (misma) return { personaje, registrado: false, avisoRegistro: "" };

  const { audioId } = await registrarVozEnProveedor(
    actor.id,
    {
      voz: eleccion.voz,
      nombre: nombreDeLaVoz(personaje.id),
      descripcion: eleccion.descripcion,
      ejemplo: eleccion.ejemplo,
    },
    h,
  );
  const [actualizado] = await db()
    .update(characters)
    .set({
      omniVoice: eleccion.voz,
      omniVoiceDescription: eleccion.descripcion,
      omniVoiceExample: eleccion.ejemplo,
      omniAudioId: audioId,
      omniVoiceSetAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(characters.id, personaje.id))
    .returning();
  if (!actualizado) throw new ErrorOmni(404, "Ese personaje no existe.");
  return { personaje: actualizado, ...(await registrarConSuVoz(actor, actualizado.id, h)) };
}

/**
 * Quita la voz propia: el personaje vuelve a hablar con la del proyecto en el que salga. Sus registros con la voz
 * propia dejan de ser los vigentes (se buscan por voz), así que habrá que registrarlo con la del proyecto, sin coste.
 */
export async function quitarVozPropia(actor: Actor, personajeId: unknown): Promise<FilaPersonaje> {
  const personaje = await personajePropio(actor, personajeId);
  if (personaje.omniAudioId === "") return personaje;
  const [actualizado] = await db()
    .update(characters)
    .set({
      omniVoice: "",
      omniVoiceDescription: "",
      omniVoiceExample: "",
      omniAudioId: "",
      omniVoiceSetAt: null,
      updatedAt: new Date(),
    })
    .where(eq(characters.id, personaje.id))
    .returning();
  if (!actualizado) throw new ErrorOmni(404, "Ese personaje no existe.");
  return actualizado;
}

/**
 * Registra al personaje con su voz recién registrada. Si no se puede (consentimiento retirado, fotos que faltan,
 * clave del proveedor), la voz **se queda guardada** y se devuelve el motivo para enseñarlo: la voz no depende de su
 * cara, y el registro se puede repetir desde la ficha cuando se arregle.
 */
async function registrarConSuVoz(
  actor: Actor,
  personajeId: string,
  h: Herramientas,
): Promise<{ registrado: boolean; avisoRegistro: string }> {
  try {
    await registrarPersonajeOmni(actor, personajeId, "", h);
    return { registrado: true, avisoRegistro: "" };
  } catch (error) {
    if (error instanceof ErrorOmni) {
      return {
        registrado: false,
        avisoRegistro: `Su voz se ha guardado, pero todavía no está registrado con ella: ${error.message}`,
      };
    }
    throw error;
  }
}
