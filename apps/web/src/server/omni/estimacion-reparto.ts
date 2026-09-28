import { noCabeElDialogo, palabrasDeTurnos, segundosNecesarios } from "@/lib/reparto-envio";
import { escenaPropia } from "../asistente/consulta";
import type { FilaEscena, FilaProyecto } from "../db/esquema";
import type { Actor } from "../media/servicio";
import { clipsDePodcast, miembrosDelReparto, turnosDelReparto } from "../reparto/consulta";
import { creditosDeEscenaHablada, duracionesDeOmni, precioDeDuracionEstimado, segundosDeEscenaOmni } from "./escena";
import { eleccionOmni } from "./registro";
import { faltasDeRegistroDelReparto } from "./reparto";

/**
 * **Lo que va a costar una escena con dos personajes, antes de gastar nada** (0.28.0).
 *
 * Aquí **no se gasta un solo crédito y no se llama a ningún proveedor de generación**: se lee el precio registrado
 * del modelo de escenas habladas y se multiplica por los clips que de verdad se van a pedir. Es la cifra que la
 * pantalla enseña y **exactamente** la que el servidor va a exigir confirmada, porque las dos salen del mismo
 * sitio (`omni/escena.ts › creditosDeEscenaHablada`).
 *
 * Y la regla de los clips, medida el 2026-09-29: un **dualcast es un clip** (dos `character_ids` cuestan lo mismo
 * que uno) y un **podcast son dos**, uno por personaje.
 */

/** Un clip de la estimación: quién sale en él y qué cuesta. */
export interface ClipEstimado {
  orden: number;
  nombre: string;
  creditos: number;
  /** Turnos que dice en este clip. 0 significa que en ese clip solo escucha. */
  turnos: number;
  palabras: number;
}

export interface EstimacionReparto {
  escenaId: string;
  formato: "solo" | "podcast" | "dualcast";
  clips: ClipEstimado[];
  /** Suma de los clips: es el total que hay que confirmar, y no se puede confirmar solo uno. */
  creditos: number;
  /** Sello del precio con el que se ha estimado. Si cambia, el servidor rechaza la confirmación. */
  sello: string;
  /** Segundos de cada clip, ya resueltos contra lo que el modelo admite. */
  segundosPorClip: number;
  /** `true` cuando el precio de esa duración es una estimación en proporción y no una tarifa registrada. */
  precioEstimado: boolean;
  /** Avisos confirmables, ya escritos en castellano. No bloquean: se confirman antes de pagar. */
  avisos: string[];
  /** Lo que **impide** producir, ya escrito en castellano. Con algo aquí, no hay nada que confirmar. */
  impedimentos: string[];
}

/**
 * Estima el reparto de una escena. Sin modelo de escenas habladas utilizable no se inventa ningún precio: se
 * devuelve el impedimento con su causa y el total a cero, que es lo único honesto que se puede decir.
 */
export async function estimarReparto(
  actor: Actor,
  escena: FilaEscena,
  proyecto: FilaProyecto,
): Promise<EstimacionReparto> {
  const [miembros, turnos] = await Promise.all([miembrosDelReparto(escena.id), turnosDelReparto(escena.id)]);
  const vacia: EstimacionReparto = {
    escenaId: escena.id,
    formato: escena.castFormat,
    clips: [],
    creditos: 0,
    sello: "",
    segundosPorClip: 0,
    precioEstimado: false,
    avisos: [],
    impedimentos: [],
  };
  let creditosPorClip: number;
  let sello: string;
  let segundos: number;
  let precioEstimado: boolean;
  try {
    const { creditos, sello: selloLeido } = await creditosDeEscenaHablada(actor.id, proyecto);
    const { modelo } = await eleccionOmni(actor.id);
    segundos = segundosDeEscenaOmni(duracionesDeOmni(modelo), proyecto);
    creditosPorClip = creditos;
    sello = selloLeido;
    precioEstimado = precioDeDuracionEstimado(modelo, segundos);
  } catch (error) {
    return {
      ...vacia,
      impedimentos: [
        (error as Error).message ||
          "Esta instalación no tiene ningún modelo de escenas habladas con precio registrado, así que no se puede estimar lo que costaría.",
      ],
    };
  }

  /**
   * **Un clip por lo que de verdad se va a pedir.** En podcast se listan los clips del reparto, con los turnos de
   * cada uno, que es lo que permite a la pantalla decir «dos clips, 63 créditos cada uno». En dualcast es un clip
   * con todos los turnos, y en `solo` es el clip de siempre.
   */
  const clips: ClipEstimado[] =
    escena.castFormat === "podcast"
      ? (await clipsDePodcast(escena)).map((clip, indice) => ({
          orden: indice + 1,
          nombre: clip.nombre,
          creditos: creditosPorClip,
          turnos: clip.turnos.length,
          palabras: palabrasDeTurnos(clip.turnos),
        }))
      : [
          {
            orden: 1,
            nombre: miembros.map((m) => m.nombre).join(" y ") || "sin reparto",
            creditos: creditosPorClip,
            turnos: turnos.length,
            palabras: palabrasDeTurnos(turnos),
          },
        ];

  const avisos: string[] = [];
  const impedimentos: string[] = [];
  for (const clip of clips) {
    if (!noCabeElDialogo(clip.palabras, segundos)) continue;
    avisos.push(
      `El clip ${clip.orden} (${clip.nombre}) dice ${clip.palabras} palabras y harían falta unos ${segundosNecesarios(clip.palabras)} s, pero el clip es de ${segundos} s: se va a cortar a media frase.`,
    );
  }
  if (escena.castFormat !== "solo" && turnos.length === 0) {
    avisos.push(
      "El diálogo de esta escena no está repartido por turnos, así que el modelo decidirá quién dice cada frase.",
    );
  }
  for (const falta of await faltasDeRegistroDelReparto(escena, proyecto.omniAudioId)) {
    impedimentos.push(`«${falta.nombre}» ${falta.falta}`);
  }

  return {
    escenaId: escena.id,
    formato: escena.castFormat,
    clips,
    creditos: clips.reduce((suma, clip) => suma + clip.creditos, 0),
    sello,
    segundosPorClip: segundos,
    precioEstimado,
    avisos,
    impedimentos,
  };
}

/** La estimación de una escena **propia**. Una escena ajena responde 404, sin decir que existe. */
export async function estimacionDeRepartoPropia(actor: Actor, escenaId: unknown): Promise<EstimacionReparto> {
  const { escena, proyecto } = await escenaPropia(actor, escenaId);
  return estimarReparto(actor, escena, proyecto);
}
