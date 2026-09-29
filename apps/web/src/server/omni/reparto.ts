import type { ClipDePodcast } from "@/lib/reparto";
import type { RepartoDeEnvio, TurnoDeEnvio } from "@/lib/reparto-envio";
import type { FilaEscena } from "../db/esquema";
import { ultimaVersion } from "../personajes/ficha";
import { clipsDePodcast, miembrosDelReparto, type PersonajeDelReparto } from "../reparto/consulta";
import { registroVigente } from "./registro";

/**
 * **Qué se le manda al proveedor cuando en la escena hablan dos** (0.28.0): cuántos envíos son, qué
 * `character_ids` lleva cada uno y con qué prompt.
 *
 * Aquí no se decide nada de dinero y no se llama a nadie: se **resuelve** el envío a partir de lo que dejó
 * escrito el reparto (`server/reparto/`) y de los registros de Omni que ya existen. Lo que sale de aquí es lo que
 * la estimación cuenta, lo que el motor de controles gatea y lo que la cola guarda.
 *
 * Las dos formas, medidas con dinero real el 2026-09-29:
 *
 * - **dualcast**: **un** envío con **dos** `character_ids`, que cuesta lo mismo que uno solo;
 * - **podcast**: **dos** envíos, un `character_id` cada uno, con mirada cruzada y solo sus turnos. Son dos clips
 *   y se pagan los dos.
 *
 * Y una regla que no se negocia: el nombre con el que se nombra a cada personaje en el prompt es
 * **`characters.name`**, porque es exactamente el que se le puso al registrarlo en Omni
 * (`personajes/omni.ts`). Nombrarlo de otra forma es pedirle al modelo que ate una cara a un nombre que no
 * conoce, y entonces reparte las caras al azar y el clip se paga igual.
 */

/** Un envío del reparto: un clip de podcast, o el clip único de un dualcast. */
export interface ClipDelReparto {
  /** Orden dentro del intercambio, desde 1. Es lo que el montaje (0.32.0) usa para alternar los planos. */
  orden: number;
  /** Personaje de este clip: el que sale en podcast, el hablante del plano en dualcast. */
  personajeId: string;
  /** Nombre del personaje de este clip, para los mensajes en castellano. */
  nombre: string;
  /** Versión de ficha con la que está registrado: es la que se apunta en el trabajo, como en cualquier clip. */
  personajeVersionId: string;
  /** `character_ids` que se van a enviar: uno en podcast, **dos** en dualcast. */
  personajesOmni: string[];
  /** Reparto de este envío, tal como lo va a leer el prompt. */
  reparto: RepartoDeEnvio;
}

/** Registro de Omni vigente de alguien del reparto: lo que viaja en `character_ids` y con qué ficha se registró. */
export interface RegistroDelReparto {
  omniId: string;
  versionId: string;
}

/** Lo que le falta a alguien del reparto para poder salir con su cara y su voz registradas. */
export interface FaltaDeRegistro {
  nombre: string;
  falta: string;
}

/** Traduce al inglés la dirección vocal de un turno. El **texto del turno no pasa por aquí**: no se traduce. */
export type AlIngles = (texto: string) => string;

/**
 * Registro de Omni vigente de cada uno del reparto, o lo que le falta.
 *
 * Se pide con la **voz del proyecto** (`audioId`) y con la **versión de ficha vigente** de cada personaje, igual
 * que el camino de un solo personaje: un registro hecho con otra voz o con una ficha anterior no sirve, porque la
 * cara o el timbre del clip no serían los que el usuario ha visto.
 */
export async function registrosDelReparto(
  miembros: readonly PersonajeDelReparto[],
  audioId: string,
): Promise<{ porPersonaje: Map<string, RegistroDelReparto>; faltan: FaltaDeRegistro[] }> {
  const porPersonaje = new Map<string, RegistroDelReparto>();
  const faltan: FaltaDeRegistro[] = [];
  for (const miembro of miembros) {
    const version = await ultimaVersion(miembro.personajeId);
    if (!version) {
      faltan.push({
        nombre: miembro.nombre,
        falta: `no tiene todavía ninguna versión de su ficha con la que registrarlo en el proveedor. Ábrele la ficha, guárdala y regístralo: registrar no cuesta créditos.`,
      });
      continue;
    }
    const registro = await registroVigente(miembro.personajeId, version.id, audioId);
    if (!registro) {
      faltan.push({
        nombre: miembro.nombre,
        falta: `no está registrado en el proveedor con la voz de este proyecto (o su ficha ha cambiado desde que se registró), así que su cara y su voz no pueden salir en el clip. Regístralo desde su ficha: no cuesta créditos.`,
      });
      continue;
    }
    porPersonaje.set(miembro.personajeId, { omniId: registro.remoteCharacterId, versionId: version.id });
  }
  return { porPersonaje, faltan };
}

/**
 * **Cuántos clips se van a pagar** por esta escena: 1 en `solo` y en `dualcast` —los dos personajes caben en un
 * plano y cuestan lo mismo que uno— y **uno por personaje** en `podcast`, que son clips distintos.
 *
 * Es la cifra con la que se estima, se confirma y se reserva, y la que la cola usa para saber que dos clips de la
 * misma escena son legítimos.
 */
export async function clipsEsperadosDe(escena: FilaEscena): Promise<number> {
  if (escena.castFormat !== "podcast") return 1;
  return Math.max(1, (await miembrosDelReparto(escena.id)).length);
}

/** Turnos de un clip tal como viajan al prompt: texto **literal** y dirección vocal ya en inglés. */
const turnosDeEnvio = (turnos: ClipDePodcast["turnos"], alIngles: AlIngles): TurnoDeEnvio[] =>
  turnos.map((turno) => ({ nombre: turno.nombre, texto: turno.texto, direccion: alIngles(turno.direccion) }));

/**
 * Los envíos de una escena en **podcast**: uno por personaje, con su `character_id`, su lado, su mirada cruzada y
 * **solo sus turnos**. El orden es el del reparto, y es el que se guarda con cada trabajo.
 */
function clipsPodcast(
  clips: readonly ClipDePodcast[],
  registros: Map<string, RegistroDelReparto>,
  alIngles: AlIngles,
): ClipDelReparto[] {
  return clips.map((clip, indice) => ({
    orden: indice + 1,
    personajeId: clip.personajeId,
    nombre: clip.nombre,
    personajeVersionId: registros.get(clip.personajeId)?.versionId ?? "",
    personajesOmni: [registros.get(clip.personajeId)?.omniId ?? ""],
    reparto: {
      formato: "podcast",
      presentes: [{ nombre: clip.nombre, lado: clip.lado, mirada: clip.mirada, habla: clip.turnos.length > 0 }],
      turnos: turnosDeEnvio(clip.turnos, alIngles),
      orden: indice + 1,
    },
  }));
}

/**
 * El envío único de un **dualcast**: los dos en el plano, los dos `character_ids` y **todos** los turnos, en su
 * orden. El personaje del trabajo es el primero del reparto: es el que se apunta como su protagonista, igual que
 * en cualquier otro clip, y los dos viajan en `character_ids`.
 */
function clipDualcast(
  miembros: readonly PersonajeDelReparto[],
  turnos: ClipDePodcast["turnos"],
  registros: Map<string, RegistroDelReparto>,
  alIngles: AlIngles,
): ClipDelReparto[] {
  const primero = miembros[0];
  if (!primero) return [];
  return [
    {
      orden: 1,
      personajeId: primero.personajeId,
      nombre: primero.nombre,
      personajeVersionId: registros.get(primero.personajeId)?.versionId ?? "",
      personajesOmni: miembros.map((m) => registros.get(m.personajeId)?.omniId ?? ""),
      reparto: {
        formato: "dualcast",
        presentes: miembros.map((m) => ({
          nombre: m.nombre,
          lado: m.lado,
          mirada: m.mirada,
          habla: turnos.some((t) => t.personajeId === m.personajeId),
        })),
        turnos: turnosDeEnvio(turnos, alIngles),
        orden: 1,
      },
    },
  ];
}

/**
 * Los envíos de una escena con dos personajes, ya con sus `character_ids` resueltos.
 *
 * Devuelve `null` en una escena `solo` o con un solo miembro: ahí no hay nada nuevo que enviar y el camino es
 * exactamente el de siempre. Si a alguien le falta el registro, se devuelve en `faltan` y **no se compone ningún
 * envío**: el motor de controles lo bloquea con el nombre de quién es, antes de tocar el dinero.
 */
export async function enviosDelReparto(
  escena: FilaEscena,
  audioId: string,
  alIngles: AlIngles = (texto) => texto,
): Promise<{ clips: ClipDelReparto[]; faltan: FaltaDeRegistro[] } | null> {
  if (escena.castFormat === "solo") return null;
  const miembros = await miembrosDelReparto(escena.id);
  if (miembros.length < 2) return null;
  const { porPersonaje, faltan } = await registrosDelReparto(miembros, audioId);
  if (faltan.length > 0) return { clips: [], faltan };
  if (escena.castFormat === "dualcast") {
    const clips = await clipsDePodcast(escena);
    const turnos = clips.flatMap((c) => c.turnos).sort((a, b) => a.orden - b.orden);
    return { clips: clipDualcast(miembros, turnos, porPersonaje, alIngles), faltan };
  }
  return { clips: clipsPodcast(await clipsDePodcast(escena), porPersonaje, alIngles), faltan };
}

/**
 * Lo que le falta al reparto para poder producirse, **sin componer ningún envío**: es lo que lee la pantalla y lo
 * que alimenta al motor de controles. Sin voz registrada en el proyecto no se mira nada, porque el registro se
 * hace contra esa voz y el aviso de que falta lo da ya el camino de siempre.
 */
export async function faltasDeRegistroDelReparto(escena: FilaEscena, audioId: string): Promise<FaltaDeRegistro[]> {
  if (escena.castFormat === "solo" || audioId === "") return [];
  const miembros = await miembrosDelReparto(escena.id);
  if (miembros.length < 2) return [];
  return (await registrosDelReparto(miembros, audioId)).faltan;
}
