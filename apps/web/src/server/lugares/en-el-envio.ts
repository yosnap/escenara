import type { LugarElegido } from "@/lib/lugares";
import type { RepartoDeReferencias } from "@/lib/reparto-referencias";
import { proyectoDeEscena as proyectoDe } from "../asistente/consulta";
import type { HechosLugar } from "../controles/contrato";
import type { FilaPersonaje } from "../db/esquema";
import { bloqueLugarSuelto, type LugarEnPrompt } from "../direccion/lugar";
import {
  type AcabadoEsperado,
  acabadoDelProyecto,
  columnasDelLugar,
  hechosDelLugar,
  type LugarParaGenerar,
  lugarDelTrabajo,
  lugarEnPrompt,
  lugarParaGenerar,
} from "./para-generar";

/**
 * **El lugar en un envío de fotograma**, en un solo sitio para que el aviso de antes de pagar y el envío lo
 * resuelvan igual: qué lugar es, con qué acabado tiene que casar, cuántas imágenes suyas compiten por el cupo y
 * qué se guarda en el trabajo.
 */

/** El lugar del envío ya resuelto, con el acabado con el que tiene que casar. `null` si no lleva ninguno. */
export interface LugarDelEnvio {
  lugar: LugarParaGenerar;
  esperado: AcabadoEsperado | null;
}

/**
 * Resuelve el lugar de un fotograma: el de la escena si sale de una (manda la escena) o el elegido en «Crear». El
 * acabado con el que tiene que casar es el del proyecto; en «Crear», el del personaje con el que se genera.
 */
export async function lugarDelEnvio(
  usuarioId: string,
  escena: { id: string; projectId: string } | null,
  elegido: LugarElegido | null | undefined,
  personaje: Pick<FilaPersonaje, "name" | "renderStyle" | "styleGuide"> | null,
): Promise<LugarDelEnvio | null> {
  const lugar = await lugarParaGenerar(usuarioId, await lugarDelTrabajo(usuarioId, escena?.id ?? null, elegido));
  if (!lugar) return null;
  const esperado = escena
    ? await acabadoDelProyecto(escena.projectId)
    : personaje
      ? {
          acabado: personaje.renderStyle,
          estilo: personaje.renderStyle === "animado" ? personaje.styleGuide.preset : "",
          de: `«${personaje.name}»`,
        }
      : null;
  return { lugar, esperado };
}

/**
 * Cuántas imágenes del lugar piden hueco en el cupo: la maestra, si la hay. En el plano del lugar solo no compite
 * con nada: es la imagen de partida del fotograma, como una imagen suelta.
 */
export const imagenesDelLugar = (conLugar: LugarDelEnvio | null): number =>
  conLugar?.lugar.maestraId && !conLugar.lugar.soloLugar ? 1 : 0;

/** Los hechos del lugar para el motor, con la cifra del mismo reparto que se envía. */
export const hechosDelEnvioConLugar = (
  conLugar: LugarDelEnvio | null,
  reparto: RepartoDeReferencias | null,
): { lugar?: HechosLugar } =>
  conLugar ? { lugar: hechosDelLugar(conLugar.lugar, conLugar.esperado, reparto?.lugar ?? null) } : {};

/** Los textos del lugar que hay que traducir junto al resto: su descripción y el sitio, en castellano. */
export const textosDelLugar = (conLugar: LugarDelEnvio | null): { texto: string }[] => [
  { texto: conLugar?.lugar.descripcionOriginal ?? "" },
  { texto: conLugar?.lugar.sitioOriginal ?? "" },
];

/** `true` si la maestra viaja de verdad: la imagen de partida del plano solo, o el hueco que le dio el reparto. */
const maestraViaja = (conLugar: LugarDelEnvio, reparto: RepartoDeReferencias | null): boolean =>
  conLugar.lugar.maestraId !== null && (conLugar.lugar.soloLugar || (reparto?.lugar ?? 0) > 0);

/** El lugar tal como entra en las 6C, ya en inglés. `null` sin lugar. */
export function lugarDelPrompt(
  conLugar: LugarDelEnvio | null,
  enIngles: Map<string, string>,
  reparto: RepartoDeReferencias | null,
): LugarEnPrompt | null {
  if (!conLugar) return null;
  return lugarEnPrompt(conLugar.lugar, (texto) => enIngles.get(texto) ?? texto, maestraViaja(conLugar, reparto));
}

/** El prompt de «Crear» (con plantilla, sin seis C) con el lugar detrás, igual que el producto suelto. */
export const conLugarSuelto = (escena: string, lugar: LugarEnPrompt | null): string =>
  lugar ? `${escena}\n${bloqueLugarSuelto(lugar)}` : escena;

/**
 * Lo que se guarda en la entrada del trabajo: la maestra si viaja como referencia y el «dónde, dentro del lugar» en
 * castellano (lo que eligió el usuario, para que el clip y la conversión en proyecto lo conserven). En el plano solo
 * la maestra no va aquí: allí es la imagen de partida (`source_media_id`), y guardarla también la enviaría dos veces.
 */
export function entradaDelLugar(
  conLugar: LugarDelEnvio | null,
  reparto: RepartoDeReferencias | null,
): { referenciasLugar?: string[]; sitioLugar?: string } {
  if (!conLugar) return {};
  const { lugar } = conLugar;
  const viaja = lugar.maestraId !== null && !lugar.soloLugar && (reparto?.lugar ?? 0) > 0;
  return {
    ...(viaja && lugar.maestraId ? { referenciasLugar: [lugar.maestraId] } : {}),
    ...(lugar.sitioOriginal === "" ? {} : { sitioLugar: lugar.sitioOriginal }),
  };
}

/** El «dónde, dentro del lugar» que guardó un trabajo, en castellano. Vacío si no llevaba. */
export const sitioLugarDe = (entrada: unknown): string => {
  const sitio = (entrada as { sitioLugar?: unknown } | null)?.sitioLugar;
  return typeof sitio === "string" ? sitio : "";
};

/**
 * **El lugar de un clip**: el de su fotograma, porque el sitio ya está dentro de esa imagen. Si el clip parte de una
 * imagen de la biblioteca dentro de una escena, el de la escena. En «Crear», sin fotograma de partida, ninguno.
 *
 * El trabajo guarda la versión **del fotograma** (es la que se ve en el clip); la puerta mira el lugar de ahora: si
 * su declaración se revocó entre el fotograma y el clip, el clip no sale.
 */
export async function lugarDelClip(
  usuarioId: string,
  partida: {
    escenaId: string | null;
    lugarDelFotograma: { placeId: string | null; placeVersion: number | null } | null;
  },
): Promise<{ conLugar: LugarDelEnvio | null; columnas: { placeId: string | null; placeVersion: number | null } }> {
  const delFotograma = partida.lugarDelFotograma;
  const pedido = delFotograma
    ? { lugarId: delFotograma.placeId, sitio: "", soloLugar: false }
    : await lugarDelTrabajo(usuarioId, partida.escenaId, null);
  const lugar = await lugarParaGenerar(usuarioId, pedido);
  if (!lugar) return { conLugar: null, columnas: { placeId: null, placeVersion: null } };
  const conLugar = {
    lugar,
    esperado: partida.escenaId ? await acabadoDelProyecto(await proyectoDe(partida.escenaId)) : null,
  };
  return {
    conLugar,
    columnas: delFotograma ? { placeId: lugar.id, placeVersion: delFotograma.placeVersion } : columnasDelLugar(lugar),
  };
}

/** En el clip no viaja la maestra (va dentro del fotograma): solo cuentan la declaración y el acabado. */
export const hechosDelClipConLugar = (conLugar: LugarDelEnvio | null): { lugar?: HechosLugar } =>
  conLugar
    ? { lugar: { ...hechosDelLugar(conLugar.lugar, conLugar.esperado, null), sinMaestra: false, maestraNoCabe: false } }
    : {};
