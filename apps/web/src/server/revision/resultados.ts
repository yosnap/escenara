import { and, desc, eq, inArray, isNull, type SQL, sql } from "drizzle-orm";
import {
  COMPROBACIONES_CLIP,
  type ComprobacionClip,
  type ComprobacionRevision,
  mantieneCritico,
  type RevisionVista,
  type SeveridadRevision,
  type TipoRevision,
  type VeredictoRevision,
} from "@/lib/revision";
import { ErrorProyecto } from "../asistente/errores";
import { db, type Ejecutor } from "../db/cliente";
import { type ComprobacionGuardada, type FilaRevision, projects, reviewResults, scenes } from "../db/esquema";

/**
 * Guardado y lectura de los resultados de revisión (RF07).
 *
 * Aquí está **todo el acceso a datos** de la revisión y ninguna regla: qué se mide lo deciden
 * `revision/automatica.ts` y la persona que mira el clip, qué bloquea lo dice `lib/revision.ts`, y el motor de
 * controles es quien cierra la puerta de la exportación.
 *
 * Dos reglas de este fichero:
 *
 * 1. **una revisión no se borra nunca**: se invalida, con su motivo y su fecha. Es lo que permite responder «por
 *    qué se dio por buena esta escena» meses después, y lo que hace que regenerar no pierda el rastro;
 * 2. **el bloqueo no se guarda**: se cuenta a partir de los críticos abiertos. Una bandera guardada se
 *    desincronizaría en cuanto alguien regenerase una escena.
 */

const esComprobacionConocida = (clave: string): clave is ComprobacionClip =>
  (COMPROBACIONES_CLIP as readonly string[]).includes(clave);

/** Comprobación guardada tal como viaja al navegador. Una clave que ya no existe se descarta al leer. */
const comprobacionDeGuardada = (guardada: ComprobacionGuardada): ComprobacionRevision | null =>
  esComprobacionConocida(guardada.clave)
    ? {
        clave: guardada.clave,
        resultado: guardada.resultado,
        severidad: guardada.severidad,
        medido: guardada.medido,
        esperado: guardada.esperado,
        motivo: guardada.motivo,
      }
    : null;

const guardadaDeComprobacion = (c: ComprobacionRevision): ComprobacionGuardada => ({
  clave: c.clave,
  resultado: c.resultado,
  severidad: c.severidad,
  medido: c.medido,
  esperado: c.esperado,
  motivo: c.motivo,
});

/** Una fila de revisión tal como la pinta la pantalla. Nunca sale nada del servidor que el usuario no deba ver. */
export function vistaDeRevision(fila: FilaRevision): RevisionVista {
  return {
    id: fila.id,
    tipo: fila.kind,
    severidad: fila.severity,
    veredicto: fila.verdict,
    comprobaciones: fila.checks.map(comprobacionDeGuardada).filter((c): c is ComprobacionRevision => c !== null),
    notas: fila.notes,
    creditos: fila.credits,
    reglasVersion: fila.rulesVersion,
    motivoInvalidacion: fila.invalidationReason,
    invalidada: fila.invalidatedAt !== null,
    creadoEn: fila.createdAt.toISOString(),
  };
}

/** Lo que hace falta para dejar una revisión apuntada. */
export interface RevisionPorGuardar {
  escenaId: string;
  /** Trabajo del que salió el clip revisado; `null` si la escena no lo tiene apuntado. */
  trabajoId: string | null;
  /**
   * Medio del clip que se ha revisado. Es contra lo que se comprueba que la escena **siga teniendo ese clip** al
   * guardar: si se regeneró mientras alguien lo miraba, la revisión no se guarda.
   */
  clipMedioId: string;
  tipo: TipoRevision;
  severidad: SeveridadRevision;
  veredicto: VeredictoRevision;
  comprobaciones: readonly ComprobacionRevision[];
  /** Quién revisó; `null` en la automática, que no la hace nadie. */
  revisorId: string | null;
  notas: string;
  /** Créditos que costó, si costó algo. */
  creditos: number | null;
  reglasVersion: string;
  /** Estado del **gasto**: `reservado` solo en una multimodal que aún tiene que cerrarlo. */
  estado?: "reservado" | "cerrado";
  /** Clave con la que el navegador firmó una revisión de pago; `null` en las que no cuestan nada. */
  claveIdempotencia?: string | null;
}

/**
 * Error de una revisión que llega tarde: la escena ya no tiene el clip que se revisó. Es un `ErrorProyecto` con
 * 409, así que las rutas ya lo traducen igual que cualquier otro conflicto y el usuario recibe su motivo, no un
 * «error interno»: no es un fallo del servidor, es que el mundo cambió mientras miraba.
 */
export class ErrorClipCambiado extends ErrorProyecto {
  constructor(mensaje: string) {
    super(409, mensaje);
    this.name = "ErrorClipCambiado";
  }
}

/**
 * Bloquea la fila de la escena y comprueba que **el clip que se revisó sigue siendo el suyo**.
 *
 * Es la carrera que cierra: entre que alguien mira un vídeo y pulsa «Aceptar» pueden pasar minutos, y en ese rato
 * otra pestaña puede haber regenerado la escena. Sin este cerrojo, el visto bueno se guardaría **después** de la
 * invalidación y quedaría vigente sobre un clip que nadie ha visto, con lo que una escena regenerada aparecería
 * como aprobada.
 *
 * Tiene que llamarse **dentro** de la transacción que va a escribir la revisión: el `for update` solo serializa
 * mientras esa transacción siga abierta.
 */
export async function exigirClipVigente(tx: Ejecutor, escenaId: string, clipMedioId: string): Promise<void> {
  const [fila] = await tx
    .select({ clip: scenes.clipMediaId })
    .from(scenes)
    .where(eq(scenes.id, escenaId))
    .limit(1)
    .for("update");
  if (!fila) throw new ErrorClipCambiado("Esa escena ya no existe.");
  if (fila.clip === null) {
    throw new ErrorClipCambiado(
      "Esta escena se ha quedado sin clip mientras la revisabas (se ha regenerado o se ha borrado su vídeo), así que no se ha guardado tu revisión. Vuelve a cargar la página.",
    );
  }
  if (fila.clip !== clipMedioId) {
    throw new ErrorClipCambiado(
      "El clip de esta escena ha cambiado mientras la revisabas, así que no se ha guardado tu revisión: se referiría a un vídeo que ya no está. Vuelve a cargar la página y revisa el nuevo.",
    );
  }
}

/**
 * Guarda una revisión. Todo pasa **en una transacción con la escena bloqueada**, y dentro de ella:
 *
 * 1. se comprueba que el clip revisado siga siendo el de la escena ({@link exigirClipVigente});
 * 2. si es una comprobación **automática**, se invalidan las automáticas vigentes de esa escena: manda la más
 *    reciente (decisión provisional del propietario, 2026-09-27). Si no, volver a comprobar un clip arreglado
 *    dejaría dos automáticas vigentes y el bloqueo saldría de la vieja mientras la insignia sale de la nueva;
 * 3. se inserta la fila.
 *
 * Acepta una transacción ya abierta (`tx`) para que la revisión multimodal pueda crear su fila y reservar su coste
 * en la **misma**: así no queda nunca una fila sin reserva ni una reserva sin fila. Quien la pasa tiene que haber
 * bloqueado la escena él, porque el cerrojo vive en la transacción, no en la llamada.
 */
export async function guardarRevision(datos: RevisionPorGuardar, tx?: Ejecutor): Promise<FilaRevision> {
  if (tx) return insertarRevision(tx, datos);
  return db().transaction(async (propia) => {
    await exigirClipVigente(propia, datos.escenaId, datos.clipMedioId);
    return insertarRevision(propia, datos);
  });
}

async function insertarRevision(tx: Ejecutor, datos: RevisionPorGuardar): Promise<FilaRevision> {
  if (datos.tipo === "automatica") {
    await tx
      .update(reviewResults)
      .set({
        invalidatedAt: new Date(),
        invalidationReason: "Se volvió a comprobar el mismo clip, así que manda la comprobación más reciente.",
      })
      .where(
        and(
          eq(reviewResults.sceneId, datos.escenaId),
          eq(reviewResults.kind, "automatica"),
          isNull(reviewResults.invalidatedAt),
        ),
      );
  }
  const [fila] = await tx
    .insert(reviewResults)
    .values({
      sceneId: datos.escenaId,
      jobId: datos.trabajoId,
      clipMediaId: datos.clipMedioId,
      kind: datos.tipo,
      severity: datos.severidad,
      verdict: datos.veredicto,
      checks: datos.comprobaciones.map(guardadaDeComprobacion),
      reviewerId: datos.revisorId,
      notes: datos.notas,
      credits: datos.creditos,
      rulesVersion: datos.reglasVersion,
      state: datos.estado ?? "cerrado",
      idempotencyKey: datos.claveIdempotencia ?? null,
    })
    .returning();
  if (!fila) throw new Error("No se ha podido guardar el resultado de la revisión.");
  return fila;
}

/**
 * Revisión de pago que ya salió de **esta misma confirmación**, si la hay. Es el corte de idempotencia: con la
 * clave repetida no se reserva nada y no se llama al proveedor.
 */
export async function revisionDeLaConfirmacion(
  revisorId: string,
  claveIdempotencia: string,
  ejecutor: Ejecutor = db(),
): Promise<FilaRevision | null> {
  const [fila] = await ejecutor
    .select()
    .from(reviewResults)
    .where(and(eq(reviewResults.reviewerId, revisorId), eq(reviewResults.idempotencyKey, claveIdempotencia)))
    .limit(1);
  return fila ?? null;
}

/**
 * Invalida las revisiones vigentes de una escena: lo revisado ya no es lo que hay. **No se borra nada**, se
 * marca con la fecha y el motivo.
 *
 * Es lo que llaman regenerar una escena y crear una versión nueva del personaje. Devuelve cuántas se han
 * invalidado, que es lo que permite decírselo al usuario sin adivinarlo.
 */
export async function invalidarRevisionesDeEscena(
  escenaId: string,
  motivo: string,
  ejecutor: Ejecutor = db(),
): Promise<number> {
  return invalidarEnOrden(
    ejecutor,
    and(eq(reviewResults.sceneId, escenaId), isNull(reviewResults.invalidatedAt)),
    motivo,
  );
}

/**
 * Invalida las filas que cumplan la condición **bloqueándolas antes en orden de identificador**.
 *
 * Un `UPDATE ... WHERE` a secas toma los cerrojos en el orden que decida el plan de ejecución, y ese orden puede
 * ser distinto en dos consultas que se solapan: regenerar una escena y versionar su personaje tocan las mismas
 * filas por caminos distintos, así que sin un orden común se pueden bloquear la una a la otra. Con `order by id ...
 * for update` el orden de adquisición es siempre el mismo y el interbloqueo no puede darse; la que llegue segunda
 * espera y luego no encuentra nada vigente que invalidar, que es lo correcto.
 */
async function invalidarEnOrden(ejecutor: Ejecutor, condicion: SQL | undefined, motivo: string): Promise<number> {
  const candidatas = await ejecutor
    .select({ id: reviewResults.id })
    .from(reviewResults)
    .where(condicion)
    .orderBy(reviewResults.id)
    .for("update");
  if (candidatas.length === 0) return 0;
  const filas = await ejecutor
    .update(reviewResults)
    .set({ invalidatedAt: new Date(), invalidationReason: motivo })
    .where(
      inArray(
        reviewResults.id,
        candidatas.map((c) => c.id),
      ),
    )
    .returning({ id: reviewResults.id });
  return filas.length;
}

/**
 * Invalida las revisiones vigentes de todas las escenas de los proyectos que tienen a ese personaje como
 * protagonista. Se llama **dentro de la transacción** que crea la versión nueva: si la versión existe, lo que se
 * revisó con la anterior ya no corresponde al personaje vigente.
 */
export async function invalidarRevisionesDePersonaje(
  tx: Ejecutor,
  personajeId: string,
  motivo: string,
): Promise<number> {
  // Mismo bloqueo ordenado que en la invalidación por escena, y por lo mismo: estas dos se solapan.
  return invalidarEnOrden(
    tx,
    and(
      isNull(reviewResults.invalidatedAt),
      inArray(
        reviewResults.sceneId,
        tx
          .select({ id: scenes.id })
          .from(scenes)
          .innerJoin(projects, eq(projects.id, scenes.projectId))
          .where(eq(projects.mainCharacterId, personajeId)),
      ),
    ),
    motivo,
  );
}

/**
 * Cierra los críticos que **marcó una persona** en esa escena: su veredicto pasa a `acepta`, así que dejan de
 * mantener el crítico abierto (`lib/revision.ts › mantieneCritico`).
 *
 * Solo los humanos. Un crítico técnico de la comprobación automática —un clip que dura otra cosa, que no se lee o
 * que tiene otra proporción— **no se cierra aceptándolo**, porque no es una cuestión de gusto: se cierra
 * regenerando la escena, que es lo que invalida su revisión.
 */
export async function cerrarCriticosHumanos(escenaId: string, ejecutor: Ejecutor = db()): Promise<number> {
  const filas = await ejecutor
    .update(reviewResults)
    .set({ verdict: "acepta" })
    .where(
      and(
        eq(reviewResults.sceneId, escenaId),
        isNull(reviewResults.invalidatedAt),
        eq(reviewResults.kind, "humana"),
        eq(reviewResults.severity, "critica"),
        sql`${reviewResults.verdict} <> 'acepta'`,
      ),
    )
    .returning({ id: reviewResults.id });
  return filas.length;
}

/** Todas las revisiones de esas escenas, de la más reciente a la más antigua, incluidas las invalidadas. */
export async function revisionesDeEscenas(escenaIds: readonly string[]): Promise<Map<string, FilaRevision[]>> {
  const porEscena = new Map<string, FilaRevision[]>(escenaIds.map((id) => [id, []]));
  if (escenaIds.length === 0) return porEscena;
  const filas = await db()
    .select()
    .from(reviewResults)
    .where(inArray(reviewResults.sceneId, [...escenaIds]))
    .orderBy(desc(reviewResults.createdAt));
  for (const fila of filas) porEscena.get(fila.sceneId)?.push(fila);
  return porEscena;
}

/** Revisiones de una sola escena, de la más reciente a la más antigua. */
export const revisionesDeEscena = (escenaId: string): Promise<FilaRevision[]> =>
  db().select().from(reviewResults).where(eq(reviewResults.sceneId, escenaId)).orderBy(desc(reviewResults.createdAt));

/** La revisión vigente más reciente de cada tipo, a partir de una lista ya ordenada por fecha descendente. */
export function vigentesPorTipo(revisiones: readonly RevisionVista[]): Record<TipoRevision, RevisionVista | null> {
  const buscar = (tipo: TipoRevision) => revisiones.find((r) => r.tipo === tipo && !r.invalidada) ?? null;
  return { automatica: buscar("automatica"), humana: buscar("humana"), multimodal: buscar("multimodal") };
}

/**
 * Escenas de un proyecto con un **crítico abierto**, con el motivo de cada una en lenguaje llano.
 *
 * Es el hecho que evalúa el motor de controles para bloquear la exportación, así que se calcula **una sola vez y
 * en un sitio**: la pantalla de revisión y la puerta de la exportación no pueden decir cosas distintas.
 */
export async function criticosAbiertosDeProyecto(proyectoId: string): Promise<{ orden: number; motivo: string }[]> {
  const filas = await db()
    .select({ fila: reviewResults, orden: scenes.sortOrder })
    .from(reviewResults)
    .innerJoin(scenes, eq(scenes.id, reviewResults.sceneId))
    .where(
      and(
        eq(scenes.projectId, proyectoId),
        isNull(reviewResults.invalidatedAt),
        eq(reviewResults.severity, "critica"),
        sql`${reviewResults.verdict} <> 'acepta'`,
      ),
    )
    .orderBy(scenes.sortOrder, desc(reviewResults.createdAt));
  const porEscena = new Map<number, string>();
  for (const { fila, orden } of filas) {
    const vista = vistaDeRevision(fila);
    if (!mantieneCritico(vista)) continue;
    // La primera de cada escena es la más reciente: es la que explica por qué sigue bloqueada.
    if (!porEscena.has(orden)) porEscena.set(orden, motivoDeCritico(vista));
  }
  return [...porEscena.entries()].map(([orden, motivo]) => ({ orden, motivo }));
}

/**
 * Por qué una revisión crítica bloquea, en lenguaje llano y **con su acción**. Un bloqueo sin salida es un
 * callejón: aquí siempre se dice qué hacer.
 */
export function motivoDeCritico(revision: RevisionVista): string {
  const falladas = revision.comprobaciones.filter((c) => c.severidad === "critica");
  const primera = falladas[0];
  if (primera) return primera.motivo;
  if (revision.notas.trim() !== "") return revision.notas.trim();
  return "Marcaste esta escena como fallo crítico. Regenérala o acéptala expresamente para poder exportar.";
}
