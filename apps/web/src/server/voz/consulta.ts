import { and, eq, inArray } from "drizzle-orm";
import { ESTADOS_ACTIVOS, ETIQUETA_ESTADO } from "@/lib/generacion";
import type { Medio } from "@/lib/media/tipos";
import { resumenDeEscena } from "@/lib/proyectos";
import {
  avisosDeSubtitulos,
  type DisponibilidadVoz,
  PARAMETROS_VOZ_POR_DEFECTO,
  type EscenaVozVista,
  VOCES_OFRECIDAS,
  type VozProyectoVista,
} from "@/lib/voz";
import { leerAjustes } from "../ajustes";
import { escenasDe, proyectoPropio } from "../asistente/consulta";
import { db } from "../db/cliente";
import { type FilaEscena, type FilaMedio, type FilaProyecto, generationJobs, media } from "../db/esquema";
import { ErrorCatalogo } from "../proveedores/contrato";
import { type Actor, aDto } from "../media/servicio";
import { muestrasDe } from "./muestra";
import { musicaDe } from "./musica";
import { escenaInvalidada, vozDelProyecto } from "./proyecto";
import { eleccionDeVoz } from "./tts";
import { transcriptorDisponible } from "./transcripcion";

/**
 * Lectura del estado de voz y subtítulos de un proyecto (RF08, 0.21.0).
 *
 * **Es solo lectura**: no genera ninguna voz, no transcribe nada, no aparta presupuesto y no escribe en ninguna
 * escena. Lo único que hace es juntar, escena a escena, el clip con su pista de voz y sus subtítulos, y decir **qué
 * quedó invalidado y qué costaría regenerarlo**.
 *
 * Un proyecto que no es tuyo responde 404, también para quien administra: es el guion de alguien.
 */

/** Medios que la pantalla necesita reproducir, en una sola consulta y con su URL temporal de siempre. */
async function mediosDeLaVoz(actor: Actor, ids: readonly (string | null)[]): Promise<Map<string, Medio>> {
  const unicos = [...new Set(ids.filter((id): id is string => id !== null))];
  if (unicos.length === 0) return new Map();
  const filas: FilaMedio[] = await db().select().from(media).where(inArray(media.id, unicos));
  return new Map(filas.map((fila) => [fila.id, aDto(fila, actor)]));
}

/** Trabajos de voz que siguen vivos, por escena: es lo que la pantalla muestra como «en marcha». */
async function vocesEnMarcha(escenaIds: readonly string[]): Promise<Map<string, string>> {
  if (escenaIds.length === 0) return new Map();
  const filas = await db()
    .select({ escena: generationJobs.sceneId, estado: generationJobs.state })
    .from(generationJobs)
    .where(
      and(
        inArray(generationJobs.sceneId, [...escenaIds]),
        eq(generationJobs.kind, "voz"),
        inArray(generationJobs.state, [...ESTADOS_ACTIVOS]),
      ),
    );
  const mapa = new Map<string, string>();
  for (const fila of filas) if (fila.escena) mapa.set(fila.escena, ETIQUETA_ESTADO[fila.estado]);
  return mapa;
}

/**
 * Qué puede hacer esta instalación con la voz, **con su motivo cuando no puede**. Nunca se oculta un botón sin
 * decir por qué: un panel que simplemente no ofrece generar voz es indistinguible de uno roto.
 *
 * El precio se lee del catálogo y **no se inventa**: si el modelo de voz no tiene precio registrado,
 * `creditosPorEscena` es `null` y la pantalla se niega a ofrecer el gasto, igual que hace el resto de la
 * aplicación desde la 0.11.0.
 */
export async function disponibilidadDeVoz(): Promise<DisponibilidadVoz> {
  const { vozTtsActivo } = await leerAjustes();
  const transcripcion = await transcriptorDisponible();
  const base = {
    voces: VOCES_OFRECIDAS,
    transcripcionDisponible: transcripcion.disponible,
    motivoTranscripcion: transcripcion.motivo,
  };
  if (!vozTtsActivo) {
    return {
      ...base,
      ttsDisponible: false,
      motivoTts:
        "Esta instalación no ofrece la pista de voz aparte. Los proyectos usan la voz del propio clip; quien administra puede encenderla en Admin › Ajustes › Voz y subtítulos.",
      creditosPorEscena: null,
      sello: "",
      modelo: "",
    };
  }
  try {
    const { modelo, precio } = await eleccionDeVoz();
    return {
      ...base,
      ttsDisponible: true,
      motivoTts: "",
      creditosPorEscena: Math.ceil(precio.creditos),
      sello: precio.sello,
      modelo: modelo.modelo,
    };
  } catch (error) {
    // Sin modelo utilizable o sin precio registrado: se dice exactamente eso y no se ofrece gastar.
    const motivo =
      error instanceof ErrorCatalogo
        ? error.message
        : "No se ha podido leer el modelo de voz del catálogo de esta instalación.";
    return { ...base, ttsDisponible: false, motivoTts: motivo, creditosPorEscena: null, sello: "", modelo: "" };
  }
}

/** Estado de una escena a partir de datos ya cargados. Función pura sobre lo leído. */
function vistaDeEscena(
  proyecto: FilaProyecto,
  escena: FilaEscena,
  medios: Map<string, Medio>,
  enMarcha: Map<string, string>,
): EscenaVozVista {
  return {
    id: escena.id,
    orden: escena.sortOrder,
    resumen: resumenDeEscena({ accion: escena.action, texto: escena.scriptText, orden: escena.sortOrder }),
    segundos: escena.plannedSeconds,
    dialogo: escena.scriptText,
    clip: escena.clipMediaId === null ? null : (medios.get(escena.clipMediaId) ?? null),
    audio: escena.voiceMediaId === null ? null : (medios.get(escena.voiceMediaId) ?? null),
    invalidada: escenaInvalidada(proyecto, escena),
    invalidacion: escena.voiceInvalidationReason,
    subtitulos: escena.subtitles,
    editados: escena.subtitlesEditedAt !== null,
    avisos: avisosDeSubtitulos(escena.subtitles),
    trabajoEnMarcha: enMarcha.get(escena.id) ?? null,
  };
}

export async function estadoDeVoz(actor: Actor, proyectoId: unknown): Promise<VozProyectoVista> {
  const proyecto = await proyectoPropio(actor, proyectoId);
  const escenas = await escenasDe(proyecto.id);
  const [medios, enMarcha, disponibilidad, musica] = await Promise.all([
    mediosDeLaVoz(actor, escenas.flatMap((e) => [e.clipMediaId, e.voiceMediaId])),
    vocesEnMarcha(escenas.map((e) => e.id)),
    disponibilidadDeVoz(),
    musicaDe(actor, proyecto.id),
  ]);
  const vistas = escenas.map((escena) => vistaDeEscena(proyecto, escena, medios, enMarcha));
  /**
   * Muestras ya pagadas de la voz que usaría este proyecto. Se leen con los parámetros **del proyecto**: la misma
   * voz con otra estabilidad suena distinto, así que una muestra con otros parámetros no responde a la pregunta.
   */
  const muestras =
    disponibilidad.modelo === ""
      ? {}
      : Object.fromEntries(
          await muestrasDe(actor, disponibilidad.modelo, vozDelProyecto(proyecto)?.parametros ?? PARAMETROS_VOZ_POR_DEFECTO),
        );
  const porRegenerar = vistas.filter((e) => e.invalidada).length;
  /**
   * Coste de regenerar lo invalidado. En modo `clip` no hay ninguno: los subtítulos salen de transcribir, y
   * transcribir es local y gratis. En modo `pista` son las llamadas de voz de las escenas invalidadas, y **solo si
   * hay precio registrado**: sin precio no se estima, se dice por qué, y no se ofrece regenerar.
   */
  const soloTranscripcion = proyecto.voiceMode === "clip";
  const creditos = disponibilidad.creditosPorEscena;
  return {
    proyectoId: proyecto.id,
    titulo: proyecto.title,
    modo: proyecto.voiceMode,
    voz: vozDelProyecto(proyecto),
    disponibilidad,
    escenas: vistas,
    musica,
    muestras,
    porRegenerar,
    costeRegenerar: soloTranscripcion ? 0 : creditos === null ? null : creditos * porRegenerar,
    motivoSinCoste: soloTranscripcion || creditos !== null ? "" : disponibilidad.motivoTts,
  };
}
