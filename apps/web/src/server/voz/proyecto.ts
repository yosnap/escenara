import { eq, inArray } from "drizzle-orm";
import {
  type FirmaOmni,
  firmaDeVoz,
  type ModoVoz,
  nombreDeVoz,
  type ParametrosVoz,
  parametrosVozDe,
  type VozDelProyecto,
} from "@/lib/voz";
import { proyectoPropioBloqueado } from "../asistente/consulta";
import { ErrorProyecto } from "../asistente/errores";
import { db, type Ejecutor } from "../db/cliente";
import { type FilaEscena, type FilaProyecto, generationJobs, projects, scenes } from "../db/esquema";
import type { Actor } from "../media/servicio";

/**
 * Modo y voz de un proyecto (RF08, 0.21.0). **Se fijan para el proyecto entero** (decisión firme del propietario,
 * 2026-09-28): una escena no puede elegir otra voz, y el servidor no ofrece ninguna forma de intentarlo.
 *
 * Cambiar el modo, la voz o cualquiera de sus parámetros **invalida** lo que dependía de ello y dice qué costaría
 * volver a generarlo. Lo que nunca hace es regenerarlo: ni aquí ni en ningún otro sitio se encola nada sin que el
 * usuario haya confirmado ese coste, escena a escena.
 *
 * La invalidación se escribe **marcando** la escena, no borrando su audio: el archivo ya está pagado y sigue en la
 * biblioteca de su dueño. Lo que cambia es que la pantalla dice que ya no corresponde a lo que pide el proyecto.
 */

/** La voz fijada en el proyecto, o `null` si no hay ninguna (que es el estado normal en modo `clip`). */
export function vozDelProyecto(proyecto: FilaProyecto): VozDelProyecto | null {
  if (!proyecto.voiceProvider || proyecto.voiceModel === "" || proyecto.voiceId === "") return null;
  return {
    proveedor: proyecto.voiceProvider,
    modelo: proyecto.voiceModel,
    voz: proyecto.voiceId,
    parametros: parametrosVozDe(proyecto.voiceParams),
    fijadaEn: (proyecto.voiceSetAt ?? proyecto.updatedAt).toISOString(),
  };
}

/**
 * Firma que tendría que tener la escena para que su voz y sus subtítulos siguieran valiendo.
 *
 * En modo `omni` (0.22.0) esa firma depende de **qué identidad y qué voz están registradas ahora** en el
 * proveedor, y eso no está en la fila del proyecto: lo lee quien llama (`voz/omni.ts › firmaOmniDelProyecto`) una
 * sola vez y lo pasa aquí. Sin ella, la firma dice «sin registro», que es justo lo que corresponde: lo generado
 * antes de registrar no se puede dar por bueno.
 */
export function firmaVigente(proyecto: FilaProyecto, escena: FilaEscena, omni: FirmaOmni | null = null): string {
  return firmaDeVoz(proyecto.voiceMode, vozDelProyecto(proyecto), escena.scriptText, omni);
}

/**
 * `true` si lo que la escena tiene guardado ya no corresponde a lo que pide el proyecto. Una escena **sin nada
 * generado no está invalidada**: no hay nada que dejara de valer.
 */
export function escenaInvalidada(proyecto: FilaProyecto, escena: FilaEscena, omni: FirmaOmni | null = null): boolean {
  const generado = escena.voiceMediaId !== null || escena.subtitles.length > 0 || escena.transcript.length > 0;
  if (!generado) return false;
  return escena.voiceSignature !== firmaVigente(proyecto, escena, omni);
}

/**
 * Escenas cuyo **clip ya producido lleva el diálogo hablado dentro**. Solo importa al pasar a modo `pista`: esos
 * clips se generaron en modo `clip`, así que el personaje ya dice el texto en la imagen. Si encima se les añade la
 * pista de voz, el montaje final tiene **dos voces distintas diciendo lo mismo** en cada escena, que es
 * exactamente el problema que el modo `pista` viene a resolver.
 *
 * No entra en {@link escenaInvalidada} porque el clip **no queda invalidado**: sigue valiendo como imagen y no hay
 * nada que regenerar por el cambio de modo. Lo que hace falta es que el usuario lo sepa, así que se cuenta aparte,
 * se le dice antes de aceptar y **la pantalla lo vuelve a calcular en cada carga** (`voz/consulta.ts`).
 *
 * Se recalcula en lugar de escribirse en la escena a propósito: así el aviso sobrevive al clic que lo confirma,
 * aparece también para quien nunca lo vio, y **desaparece solo** en cuanto esa escena se vuelve a producir en modo
 * `pista`, sin que nadie tenga que acordarse de borrar una marca.
 */
export async function clipsConDialogoHablado(tx: Ejecutor, proyectoId: string): Promise<string[]> {
  const escenas: FilaEscena[] = await tx.select().from(scenes).where(eq(scenes.projectId, proyectoId));
  const conClip = escenas.filter((escena) => escena.clipMediaId !== null && escena.clipJobId !== null);
  if (conClip.length === 0) return [];
  /**
   * Se mira **el trabajo con el que se produjo cada clip**, no el modo de ahora ni el diálogo de ahora: lo que
   * importa es si a ese clip se le pidió que dijera algo. Un proyecto que fue `pista`, luego `clip` y otra vez
   * `pista` tiene clips mudos y clips hablados mezclados, y contarlos todos avisaría de escenas que no hace falta
   * volver a producir.
   */
  const trabajos = await tx
    .select({ id: generationJobs.id, entrada: generationJobs.input })
    .from(generationJobs)
    .where(
      inArray(
        generationJobs.id,
        conClip.map((escena) => escena.clipJobId as string),
      ),
    );
  const hablados = new Set(
    trabajos
      .filter(({ entrada }) => String((entrada as { dialogo?: unknown }).dialogo ?? "").trim() !== "")
      .map(({ id }) => id),
  );
  return conClip.filter((escena) => hablados.has(escena.clipJobId as string)).map((escena) => escena.id);
}

/**
 * Marca como invalidado lo que ya no corresponde al modo o a la voz de ahora, y devuelve cuántas escenas lo están.
 * **No borra ni regenera nada.**
 *
 * Va dentro de la transacción que cambia el proyecto: si se hiciera después, entre el cambio y la marca habría un
 * rato en el que la pantalla daría por buena una voz que ya no es la del proyecto.
 */
export async function marcarInvalidadas(
  tx: Ejecutor,
  proyecto: FilaProyecto,
  motivo: string,
  omni: FirmaOmni | null = null,
): Promise<number> {
  const escenas: FilaEscena[] = await tx.select().from(scenes).where(eq(scenes.projectId, proyecto.id));
  const invalidadas = escenas.filter((escena) => escenaInvalidada(proyecto, escena, omni)).map((escena) => escena.id);
  if (invalidadas.length === 0) return 0;
  await tx
    .update(scenes)
    .set({ voiceInvalidationReason: motivo, updatedAt: new Date() })
    .where(inArray(scenes.id, invalidadas));
  return invalidadas.length;
}

/**
 * Escenas con algo generado que **dejaría de valer** si el proyecto pasara a ser `futuro`. Es la cifra que se le
 * muestra al usuario antes de cambiar y la que exige su confirmación: nunca se calcula de dos formas distintas.
 */
export async function escenasAfectadas(
  tx: Ejecutor,
  proyectoId: string,
  futuro: FilaProyecto,
  omni: FirmaOmni | null = null,
): Promise<number> {
  const escenas: FilaEscena[] = await tx.select().from(scenes).where(eq(scenes.projectId, proyectoId));
  return escenas.filter((escena) => escenaInvalidada({ ...futuro, id: proyectoId }, escena, omni)).length;
}

export interface CambioDeVoz {
  proyecto: FilaProyecto;
  /** Escenas cuya voz o subtítulos han quedado invalidados por este cambio. */
  invalidadas: number;
}

/**
 * Cambia el modo de voz del proyecto. `confirmado` es la confirmación de que quien lo pide **sabe qué invalida**:
 * sin ella, un cambio que dejaría sin valer escenas ya pagadas se rechaza con la cuenta de cuántas son.
 *
 * Cambiar a `pista` no genera ninguna voz, y cambiar a `clip` no borra las que haya: en los dos casos lo único que
 * pasa es que lo que ya no corresponde queda marcado.
 */
export async function fijarModoVoz(
  actor: Actor,
  proyectoId: string,
  modo: ModoVoz,
  confirmado: boolean,
): Promise<CambioDeVoz> {
  return db().transaction(async (tx) => {
    const proyecto = await proyectoPropioBloqueado(actor, proyectoId, tx);
    if (proyecto.voiceMode === modo) return { proyecto, invalidadas: 0 };
    const futuro = { ...proyecto, voiceMode: modo };
    // Pasar a `pista` con clips ya producidos es la única forma de acabar con dos voces en el mismo plano, así que
    // se cuenta aparte y entra en el mismo aviso que hay que confirmar.
    const conDialogoHablado = modo === "pista" ? await clipsConDialogoHablado(tx, proyecto.id) : [];
    await exigirConfirmacionDelCambio(tx, proyecto, futuro, confirmado, "de modo de voz", conDialogoHablado.length);
    const [actualizado] = await tx
      .update(projects)
      .set({ voiceMode: modo, updatedAt: new Date() })
      .where(eq(projects.id, proyecto.id))
      .returning();
    if (!actualizado) throw new ErrorProyecto(404, "Ese proyecto no existe.");
    const invalidadas = await marcarInvalidadas(
      tx,
      actualizado,
      modo === "pista"
        ? "Este proyecto ha pasado a usar una pista de voz aparte: los clips se pedirán sin diálogo y el audio del diálogo se genera por escena. Lo que había no corresponde a ese modo."
        : "Este proyecto ha vuelto a usar la voz del propio clip: la pista de voz aparte ya no se usa y los subtítulos tienen que salir del audio del clip.",
    );
    return { proyecto: actualizado, invalidadas };
  });
}

/**
 * Fija la voz y sus parámetros para **todo** el proyecto. Solo tiene sentido en modo `pista`: en modo `clip` la voz
 * la pone el modelo de vídeo y elegir una aquí sería configurar algo que no se usa.
 */
export async function fijarVoz(
  actor: Actor,
  proyectoId: string,
  eleccion: { proveedor: VozDelProyecto["proveedor"]; modelo: string; voz: string; parametros: ParametrosVoz },
  confirmado: boolean,
): Promise<CambioDeVoz> {
  return db().transaction(async (tx) => {
    const proyecto = await proyectoPropioBloqueado(actor, proyectoId, tx);
    if (proyecto.voiceMode !== "pista") {
      throw new ErrorProyecto(
        409,
        "Este proyecto usa la voz del propio clip, así que no hay ninguna voz que elegir. Cambia primero a «pista de voz aparte».",
      );
    }
    const futuro = {
      ...proyecto,
      voiceProvider: eleccion.proveedor,
      voiceModel: eleccion.modelo,
      voiceId: eleccion.voz,
      voiceParams: eleccion.parametros as unknown as Record<string, number>,
    };
    const anterior = vozDelProyecto(proyecto);
    const mismaVoz =
      anterior !== null &&
      firmaDeVoz("pista", anterior, "") === firmaDeVoz("pista", vozDelProyecto(futuro as FilaProyecto), "");
    if (mismaVoz) return { proyecto, invalidadas: 0 };
    await exigirConfirmacionDelCambio(tx, proyecto, futuro as FilaProyecto, confirmado, "de voz");
    const [actualizado] = await tx
      .update(projects)
      .set({
        voiceProvider: eleccion.proveedor,
        voiceModel: eleccion.modelo,
        voiceId: eleccion.voz,
        voiceParams: eleccion.parametros as unknown as Record<string, number>,
        voiceSetAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, proyecto.id))
      .returning();
    if (!actualizado) throw new ErrorProyecto(404, "Ese proyecto no existe.");
    const invalidadas = await marcarInvalidadas(
      tx,
      actualizado,
      `La voz de este proyecto ha pasado a ser «${nombreDeVoz(eleccion.voz)}». El audio anterior sonaba con otra voz, así que ya no vale: regenéralo cuando quieras, confirmando su coste.`,
    );
    return { proyecto: actualizado, invalidadas };
  });
}

/**
 * Un cambio que deja sin valer escenas ya pagadas **necesita confirmación**. No se cobra nada aquí y no se
 * regenera nada: lo único que se exige es que el usuario haya visto cuántas escenas pierde antes de perderlas.
 */
export async function exigirConfirmacionDelCambio(
  tx: Ejecutor,
  proyecto: FilaProyecto,
  futuro: FilaProyecto,
  confirmado: boolean,
  que: string,
  clipsHablados = 0,
  omni: FirmaOmni | null = null,
): Promise<void> {
  if (confirmado) return;
  const afectadas = await escenasAfectadas(tx, proyecto.id, futuro, omni);
  if (afectadas === 0 && clipsHablados === 0) return;
  const partes: string[] = [];
  if (afectadas > 0) {
    partes.push(
      `Este cambio ${que} invalida la voz o los subtítulos de ${afectadas} ${afectadas === 1 ? "escena" : "escenas"} que ya están generados. No se borra nada y no se regenera nada por su cuenta: confirma el cambio para aplicarlo y luego regenera escena a escena confirmando su coste.`,
    );
  }
  if (clipsHablados > 0) {
    partes.push(
      `Además, ${clipsHablados} ${clipsHablados === 1 ? "escena ya tiene su clip producido con el diálogo" : "escenas ya tienen su clip producido con el diálogo"} hablado dentro. Si les añades la pista de voz sin volver a producir el clip, se oirán dos voces distintas diciendo lo mismo: vuelve a producir esas escenas después del cambio.`,
    );
  }
  throw new ErrorProyecto(409, partes.join(" "));
}

/**
 * Invalida la voz y los subtítulos de una escena cuyo **diálogo** ha cambiado. Se llama desde la edición de la
 * escena: el texto que se oye y el que se lee son el diálogo, así que cambiarlo deja sin valer lo generado.
 */
export async function invalidarVozDeEscena(escenaId: string, tx: Ejecutor = db()): Promise<void> {
  await tx
    .update(scenes)
    .set({
      voiceInvalidationReason:
        "El diálogo de esta escena ha cambiado: el audio y los subtítulos anteriores decían otra cosa. Regenéralos cuando quieras, confirmando su coste.",
      updatedAt: new Date(),
    })
    .where(eq(scenes.id, escenaId));
}
