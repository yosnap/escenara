import { inArray } from "drizzle-orm";
import type { Medio } from "@/lib/media/tipos";
import { resumenDeEscena } from "@/lib/proyectos";
import {
  type EscenaRevisionVista,
  mantieneCritico,
  type RevisionProyectoVista,
  type RevisionVista,
  severidadDeEscena,
} from "@/lib/revision";
import { leerAjustes } from "../ajustes";
import { escenaPropia, escenasDe, proyectoPropio } from "../asistente/consulta";
import { db } from "../db/cliente";
import { characterVersions, type FilaEscena, type FilaMedio, type FilaProyecto, media } from "../db/esquema";
import { type Actor, aDto } from "../media/servicio";
import { ultimaVersion } from "../personajes/ficha";
import { disponibilidadMultimodal, HERRAMIENTAS_REVISION, type HerramientasRevision } from "./multimodal";
import { motivoDeCritico, revisionesDeEscenas, vigentesPorTipo, vistaDeRevision } from "./resultados";

/**
 * Lectura del estado de revisión de un proyecto (RF07, 0.20.0).
 *
 * **Es solo lectura**: no mide ningún clip, no llama a ningún modelo, no aparta presupuesto y no escribe ninguna
 * revisión. Lo único que hace es juntar, escena a escena, el clip con sus referencias y con las revisiones que ya
 * se hicieron, y decir **qué bloquea la exportación y por qué**.
 *
 * Un proyecto que no es tuyo responde 404, también para quien administra: quien revisa es el dueño (decisión
 * provisional del propietario, 2026-09-27).
 */

/** Medios que la pantalla tiene que poder mostrar. Una consulta para todos, con su URL temporal de siempre. */
async function mediosDeLaRevision(actor: Actor, ids: readonly (string | null)[]): Promise<Map<string, Medio>> {
  const unicos = [...new Set(ids.filter((id): id is string => id !== null))];
  if (unicos.length === 0) return new Map();
  const filas: FilaMedio[] = await db().select().from(media).where(inArray(media.id, unicos));
  return new Map(filas.map((fila) => [fila.id, aDto(fila, actor)]));
}

/**
 * Hoja de personaje con la que comparar la identidad, escena a escena.
 *
 * Se usa la de **la versión que congeló la aprobación** de cada escena si la tiene, y la última del protagonista si
 * no: lo que se compara tiene que ser la referencia con la que se generó, no la que hay hoy. Sin esto, cambiar la
 * ficha convertiría la comparación en un juicio sobre un personaje que nadie pidió.
 */
async function hojasDePersonaje(
  proyecto: FilaProyecto,
  escenas: readonly FilaEscena[],
): Promise<{ porVersion: Map<string, string>; porDefecto: string | null }> {
  const versiones = [
    ...new Set(escenas.map((e) => e.approvedCharacterVersionId).filter((v): v is string => v !== null)),
  ];
  const porVersion = new Map<string, string>();
  if (versiones.length > 0) {
    const filas = await db()
      .select({ id: characterVersions.id, hoja: characterVersions.sheetMediaId })
      .from(characterVersions)
      .where(inArray(characterVersions.id, versiones));
    for (const fila of filas) if (fila.hoja) porVersion.set(fila.id, fila.hoja);
  }
  const ultima = proyecto.mainCharacterId ? await ultimaVersion(proyecto.mainCharacterId) : null;
  return { porVersion, porDefecto: ultima?.sheetMediaId ?? null };
}

/** Estado de revisión de una escena a partir de datos ya cargados. Función pura sobre lo leído. */
function vistaDeEscena(
  fila: FilaEscena,
  revisiones: readonly RevisionVista[],
  hojaId: string | null,
  medios: Map<string, Medio>,
): EscenaRevisionVista {
  const vigentes = vigentesPorTipo(revisiones);
  const bloqueante = revisiones.find(mantieneCritico) ?? null;
  return {
    id: fila.id,
    orden: fila.sortOrder,
    resumen: resumenDeEscena({ accion: fila.action, texto: fila.scriptText, orden: fila.sortOrder }),
    segundos: fila.plannedSeconds,
    clip: fila.clipMediaId === null ? null : (medios.get(fila.clipMediaId) ?? null),
    fotogramaAprobado: fila.approvedFrameMediaId === null ? null : (medios.get(fila.approvedFrameMediaId) ?? null),
    hojaDePersonaje: hojaId === null ? null : (medios.get(hojaId) ?? null),
    automatica: vigentes.automatica,
    humana: vigentes.humana,
    multimodal: vigentes.multimodal,
    historial: [...revisiones],
    severidad: severidadDeEscena([vigentes.automatica, vigentes.humana, vigentes.multimodal]),
    bloquea: bloqueante !== null,
    motivoBloqueo: bloqueante === null ? "" : motivoDeCritico(bloqueante),
  };
}

/** Estado completo de la revisión de un proyecto. Un proyecto ajeno responde 404, igual que en 0.17.0–0.19.1. */
export async function estadoDeRevision(
  actor: Actor,
  proyectoId: unknown,
  h: HerramientasRevision = HERRAMIENTAS_REVISION,
): Promise<RevisionProyectoVista> {
  const proyecto = await proyectoPropio(actor, proyectoId);
  const filas = await escenasDe(proyecto.id);
  const [porEscena, hojas, ajustes, multimodal] = await Promise.all([
    revisionesDeEscenas(filas.map((e) => e.id)),
    hojasDePersonaje(proyecto, filas),
    leerAjustes(),
    disponibilidadMultimodal(h),
  ]);
  const hojaDe = (fila: FilaEscena) =>
    (fila.approvedCharacterVersionId ? hojas.porVersion.get(fila.approvedCharacterVersionId) : null) ??
    hojas.porDefecto ??
    null;
  const medios = await mediosDeLaRevision(actor, [
    ...filas.flatMap((e) => [e.clipMediaId, e.approvedFrameMediaId]),
    ...filas.map(hojaDe),
  ]);
  const escenas = filas.map((fila) =>
    vistaDeEscena(fila, (porEscena.get(fila.id) ?? []).map(vistaDeRevision), hojaDe(fila), medios),
  );
  return {
    proyectoId: proyecto.id,
    titulo: proyecto.title,
    escenas,
    revisables: escenas.filter((e) => e.clip !== null).length,
    criticosAbiertos: escenas.filter((e) => e.bloquea).length,
    multimodalDisponible: multimodal.disponible,
    motivoSinMultimodal: multimodal.motivo,
    creditosPorMultimodal: multimodal.creditos,
    selloMultimodal: multimodal.sello,
    umbralAvisoCreditos: ajustes.avisoCreditos,
  };
}

/** Estado del proyecto al que pertenece una escena propia: es lo que se responde tras cada acción de revisión. */
export async function estadoDeRevisionDeEscena(
  actor: Actor,
  escenaId: unknown,
  h: HerramientasRevision = HERRAMIENTAS_REVISION,
): Promise<RevisionProyectoVista> {
  const { proyecto } = await escenaPropia(actor, escenaId);
  return estadoDeRevision(actor, proyecto.id, h);
}
