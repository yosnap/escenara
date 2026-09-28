import { AVISO_REGISTRO_OMNI, type RegistroOmniVista } from "@/lib/omni";
import type { FilaPersonaje, FilaRegistroOmni, FilaVersionPersonaje } from "../db/esquema";
import { HERRAMIENTAS, type Herramientas } from "../generacion/herramientas";
import type { Actor } from "../media/servicio";
import { ErrorOmni } from "../omni/errores";
import {
  guardarRegistro,
  imagenesParaRegistrar,
  marcarReemplazado,
  registrarPersonajeEnProveedor,
  registroVigente,
  ultimoRegistro,
} from "../omni/registro";
import { contextoDeVersion } from "./contexto";
import { ultimaVersion } from "./ficha";
import { motivosParaNoGenerar, personajePropio } from "./puede-generar";

/**
 * Registro de un personaje en Gemini Omni para las escenas habladas (RF02 y RF10, 0.22.0).
 *
 * **Uno por versión de la ficha** (decisión provisional del propietario, 2026-09-28): la ficha y el retrato son
 * lo que se envía al proveedor, así que cambiarlos crea versión nueva y obliga a registrar otra vez. Registrar no
 * cuesta créditos, así que la regla no le cuesta dinero a nadie; lo que evita es que una escena salga con una
 * cara que ya no es la que el personaje describe.
 *
 * **Sin consentimiento vigente no se registra nada.** Registrar es enviar la cara de una persona al proveedor y
 * dejarla alojada allí con un identificador, que es exactamente lo que el consentimiento autoriza o no: la
 * comprobación es la misma que la de generar (`motivosParaNoGenerar`), no una copia relajada.
 */

/** El texto de la ficha que se le manda al proveedor como descripción del personaje. */
const descripcionDe = (personaje: FilaPersonaje, version: FilaVersionPersonaje): string =>
  contextoDeVersion(version, personaje.kind).trim() || personaje.description.trim() || personaje.name;

/** Lo que la ficha enseña del registro: con qué versión se hizo y si esa versión sigue siendo la vigente. */
export function vistaDeRegistro(
  registro: FilaRegistroOmni | null,
  version: FilaVersionPersonaje | null,
  vigenteId: string | null,
): RegistroOmniVista | null {
  if (!registro || !version) return null;
  return {
    versionNumero: version.number,
    vigente: registro.supersededAt === null && registro.characterVersionId === vigenteId,
    audioId: registro.audioId,
    registradoEn: registro.registeredAt.toISOString(),
    retratoMedioId: registro.portraitMediaId,
  };
}

/**
 * Registra al personaje con la voz Omni del proyecto y devuelve el registro guardado. Si ya hay uno vigente para
 * esa versión y esa voz, **no se vuelve a llamar al proveedor**: el registro que existe es el bueno y repetirlo
 * solo crearía una segunda identidad con la misma cara.
 */
export async function registrarPersonajeOmni(
  actor: Actor,
  personajeId: unknown,
  audioId: string,
  h: Herramientas = HERRAMIENTAS,
): Promise<FilaRegistroOmni> {
  if (audioId === "") {
    throw new ErrorOmni(
      409,
      "Este proyecto todavía no tiene voz Omni registrada, así que no se puede registrar al personaje con ella. Elige y registra la voz del proyecto antes.",
    );
  }
  const personaje = await personajePropio(actor, personajeId);
  const motivos = await motivosParaNoGenerar(personaje.id);
  if (motivos.length > 0) {
    throw new ErrorOmni(
      409,
      `«${personaje.name}» no se puede registrar en el proveedor todavía. ${motivos.join(" ")} ${AVISO_REGISTRO_OMNI} No se ha enviado nada.`,
    );
  }
  const version = await ultimaVersion(personaje.id);
  if (!version) {
    throw new ErrorOmni(409, "Este personaje no tiene todavía ninguna versión de su ficha que registrar.");
  }
  const yaRegistrado = await registroVigente(personaje.id, version.id, audioId);
  if (yaRegistrado) return yaRegistrado;

  const imagenes = await imagenesParaRegistrar(personaje);
  const registrado = await registrarPersonajeEnProveedor(
    actor.id,
    { nombre: personaje.name, descripcion: descripcionDe(personaje, version), audioId, imagenes },
    h,
  );
  return guardarRegistro({
    actor,
    personaje,
    version,
    audioId,
    remoteCharacterId: registrado.remoteCharacterId,
    imagenUrl: registrado.imagenUrl,
    imagenCuerpoUrl: registrado.imagenCuerpoUrl,
    imagenes,
    creditosObservados: registrado.creditosObservados,
  });
}

/**
 * Vuelve a registrar al personaje porque el proveedor ha rechazado su identificador (caducado o borrado en su
 * lado). Marca el anterior como reemplazado, registra otra vez —sin coste— y devuelve el nuevo.
 *
 * **Una sola vez por envío** (decisión provisional del propietario, 2026-09-28): quien llama no vuelve a
 * intentarlo si esto falla. Reintentar en bucle contra un proveedor que rechaza es la forma de convertir una
 * avería suya en una tormenta de peticiones nuestra.
 */
export async function volverARegistrar(
  actor: Actor,
  personajeId: string,
  audioId: string,
  motivo: string,
  h: Herramientas = HERRAMIENTAS,
): Promise<FilaRegistroOmni> {
  // La propiedad se comprueba **antes** de tocar nada: sin esto, cualquiera podía marcar como reemplazado el
  // registro del personaje de otra cuenta y dejarle la producción bloqueada.
  await personajePropio(actor, personajeId);
  const anterior = await ultimoRegistro(personajeId);
  if (anterior && anterior.supersededAt === null) await marcarReemplazado(anterior.id, motivo);
  return registrarPersonajeOmni(actor, personajeId, audioId, h);
}
