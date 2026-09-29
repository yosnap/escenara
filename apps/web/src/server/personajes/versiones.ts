import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  componerContexto,
  type DiferenciaFicha,
  diferenciasDeFicha,
  FICHA_VACIA,
  type FichaVersionada,
} from "@/lib/ficha-personaje";
import type { Medio } from "@/lib/media/tipos";
import {
  ACCION_APROBACION_INVALIDA,
  type AprobacionVista,
  ASUNTO_APROBACION_MAXIMO,
  esTipoAprobacion,
  type HistorialVersiones,
  type TipoAprobacion,
  type VersionPersonajeVista,
} from "@/lib/personajes";
import { db, type Ejecutor } from "../db/cliente";
import {
  characterApprovals,
  characterVersions,
  type FilaAprobacion,
  type FilaPersonaje,
  type FilaVersionPersonaje,
  media,
} from "../db/esquema";
import { type Actor, aDto } from "../media/servicio";
import { invalidarRevisionesDePersonaje } from "../revision/resultados";
import { filaPropia, filaVisible, mediosDeReferenciaVigentes, tuvoConsentimientoDeTercero } from "./consulta";
import { ErrorPersonaje } from "./errores";
import {
  hojaDeFicha,
  instantaneaDeFila,
  instantaneaDeVersion,
  type ReferenciasVersionables,
  ultimaVersion,
} from "./ficha";
import { registrarAccesoAConsentimiento } from "./registro-acceso";

/**
 * Versiones de la ficha de un personaje (decisión 1 de la fase 15): **lo que afecta a la apariencia o al
 * prompt versiona; los metadatos no**. Concretamente versionan la ficha (rasgos, estilo, vestuario,
 * personalidad y voz), la descripción y las referencias incluidas; el nombre y las notas de especie, no.
 *
 * Reglas duras:
 *
 * - **crear versión e invalidar aprobaciones pasan en la misma transacción**, con la fila del personaje
 *   bloqueada. Si no, dos ediciones a la vez leerían el mismo número y una aprobación podría sobrevivir a la
 *   versión que la deja obsoleta;
 * - **las versiones no se borran nunca** (decisión 3): son la trazabilidad de lo ya generado. Desaparecen
 *   solo al borrar el personaje;
 * - **un cambio que no cambia nada no crea versión**: guardar el mismo texto otra vez no gasta un número.
 */

/** Medios de referencia utilizables del personaje, en su orden, cada uno con su vista. */
const referenciasActuales = async (personajeId: string): Promise<ReferenciasVersionables> => {
  const filas = await mediosDeReferenciaVigentes(personajeId);
  return { ids: filas.map((r) => r.mediaId), vistas: filas.map((r) => r.vista) };
};

/**
 * Inserta una versión con el número siguiente e invalida las aprobaciones vigentes del personaje. Se llama
 * **dentro** de una transacción que ya tiene bloqueada la fila del personaje.
 */
async function insertarVersion(
  tx: Ejecutor,
  personaje: FilaPersonaje,
  instantanea: FichaVersionada,
  opciones: { motivo: string; diferencias: DiferenciaFicha[]; usuarioId: string | null; hojaMedioId?: string | null },
): Promise<FilaVersionPersonaje> {
  const [maxima] = await tx
    .select({ numero: sql<number | null>`max(${characterVersions.number})` })
    .from(characterVersions)
    .where(eq(characterVersions.characterId, personaje.id));
  const numero = (maxima?.numero ?? 0) + 1;
  const [creada] = await tx
    .insert(characterVersions)
    .values({
      characterId: personaje.id,
      number: numero,
      sheet: hojaDeFicha(instantanea.ficha, instantanea.descripcion, instantanea),
      referenceMediaIds: instantanea.referencias,
      referenceViewKeys: instantanea.vistas,
      sheetMediaId: opciones.hojaMedioId ?? null,
      changeReason: opciones.motivo,
      changedFields: opciones.diferencias.map((d) => d.campo),
      createdBy: opciones.usuarioId,
    })
    .returning();
  if (!creada) throw new ErrorPersonaje(500, "No se ha podido guardar la versión del personaje.");

  // Las aprobaciones que dependían de lo anterior quedan invalidadas, con el motivo y la acción concreta:
  // una invalidación que no dice qué hacer solo asusta.
  const invalidadas = await tx
    .update(characterApprovals)
    .set({
      invalidatedAt: new Date(),
      invalidatedByVersionId: creada.id,
      invalidationReason: `Se creó la versión ${numero} del personaje «${personaje.name}», que cambia ${resumenDeCambios(opciones.diferencias)}.`,
    })
    .where(and(eq(characterApprovals.characterId, personaje.id), isNull(characterApprovals.invalidatedAt)))
    .returning({ id: characterApprovals.id });
  /**
   * Y las revisiones de continuidad de las escenas de sus proyectos (RF07, 0.20.0): lo que se revisó se generó con
   * la versión anterior del personaje, así que ya no corresponde al personaje vigente. **No se borran**: se marcan
   * con el motivo, y se vuelve a comprobar cuando el usuario quiera.
   */
  await invalidarRevisionesDePersonaje(
    tx,
    personaje.id,
    `Se creó la versión ${numero} del personaje «${personaje.name}», que cambia ${resumenDeCambios(opciones.diferencias)}, así que la comparación con su hoja ya no vale.`,
  );

  if (invalidadas.length > 0) {
    await tx
      .update(characterVersions)
      .set({ invalidatedApprovals: invalidadas.length })
      .where(eq(characterVersions.id, creada.id));
    return { ...creada, invalidatedApprovals: invalidadas.length };
  }
  return creada;
}

const resumenDeCambios = (diferencias: DiferenciaFicha[]): string =>
  diferencias.length === 0
    ? "su ficha"
    : diferencias
        .map((d) => d.etiqueta.toLowerCase())
        .join(", ")
        .replace(/, ([^,]*)$/, " y $1");

/**
 * Versión vigente del personaje, creándola si no tiene ninguna. Es el punto de entrada de todo lo que cita
 * una versión (generar, hoja de personaje, historial): los personajes que existían antes de 0.15.0 no tienen
 * versión, y la ganan la primera vez que hace falta, con lo que tienen ahora mismo.
 *
 * La creación es idempotente frente a carreras: va en una transacción con la fila del personaje bloqueada, y
 * si otra petición se adelantó, se devuelve la suya.
 */
export async function asegurarVersionVigente(personaje: FilaPersonaje): Promise<FilaVersionPersonaje> {
  const existente = await ultimaVersion(personaje.id);
  if (existente) return existente;
  const referencias = await referenciasActuales(personaje.id);
  return db().transaction(async (tx) => {
    await tx.execute(sql`select 1 from characters where id = ${personaje.id} for update`);
    const yaHay = await ultimaVersion(personaje.id, tx);
    if (yaHay) return yaHay;
    return insertarVersion(tx, personaje, instantaneaDeFila(personaje, referencias), {
      motivo: "",
      diferencias: [],
      usuarioId: personaje.ownerId,
    });
  });
}

export interface Versionado {
  version: FilaVersionPersonaje;
  /** `false` cuando la apariencia no había cambiado: no se ha gastado un número de versión. */
  nueva: boolean;
  diferencias: DiferenciaFicha[];
}

/**
 * Crea una versión nueva **si la apariencia ha cambiado**, dentro de una transacción que ya tiene la fila del
 * personaje bloqueada. Es la mitad que se comparte con quien guarda el cambio en la misma transacción.
 */
export async function versionarEnTransaccion(
  tx: Ejecutor,
  personaje: FilaPersonaje,
  referencias: ReferenciasVersionables,
  usuarioId: string,
  motivo = "",
): Promise<Versionado> {
  const actual = instantaneaDeFila(personaje, referencias);
  const anterior = await ultimaVersion(personaje.id, tx);
  // Sin versión previa, esta es la primera: no hay nada con lo que comparar ni nada que invalidar.
  if (!anterior) {
    const version = await insertarVersion(tx, personaje, actual, { motivo, diferencias: [], usuarioId });
    return { version, nueva: true, diferencias: [] };
  }
  const diferencias = diferenciasDeFicha(instantaneaDeVersion(anterior), actual);
  if (diferencias.length === 0) return { version: anterior, nueva: false, diferencias };
  const version = await insertarVersion(tx, personaje, actual, { motivo, diferencias, usuarioId });
  return { version, nueva: true, diferencias };
}

/**
 * Crea una versión nueva si la apariencia ha cambiado, en su propia transacción con la fila del personaje
 * bloqueada. Para quien ya guardó el cambio por otro camino (referencias, vistas generadas).
 */
export async function versionarSiCambia(personaje: FilaPersonaje, usuarioId: string, motivo = ""): Promise<Versionado> {
  const referencias = await referenciasActuales(personaje.id);
  return db().transaction(async (tx) => {
    await tx.execute(sql`select 1 from characters where id = ${personaje.id} for update`);
    return versionarEnTransaccion(tx, personaje, referencias, usuarioId, motivo);
  });
}

/** Referencias utilizables del personaje, para versionar desde fuera sin repetir la consulta. */
export const referenciasParaVersionar = referenciasActuales;

/** Vista de una versión para el navegador. `hoja` va a `null` para quien no es el dueño. */
function vistaDeVersion(
  fila: FilaVersionPersonaje,
  anterior: FilaVersionPersonaje | null,
  tipo: FilaPersonaje["kind"],
  opciones: { vigente: boolean; esDueno: boolean; hoja: Medio | null },
): VersionPersonajeVista {
  const instantanea = instantaneaDeVersion(fila);
  const diferencias = anterior ? diferenciasDeFicha(instantaneaDeVersion(anterior), instantanea) : [];
  /**
   * Quien no es el dueño ve el historial —números, fechas y **qué campo** cambió— y nada más. Ni el contenido
   * de la ficha, ni la hoja, ni **los valores de las diferencias** (`antes` y `despues` llevan el texto de la
   * ficha dentro), ni el **motivo del cambio**, que lo escribe el usuario y puede describir a la persona
   * («ahora lleva el pelo corto»). Se vacían aquí, en el único sitio que construye la respuesta.
   */
  const publicas: DiferenciaFicha[] = opciones.esDueno
    ? diferencias
    : diferencias.map((d) => ({ ...d, antes: "", despues: "" }));
  return {
    id: fila.id,
    numero: fila.number,
    ficha: opciones.esDueno ? instantanea.ficha : FICHA_VACIA,
    descripcion: opciones.esDueno ? instantanea.descripcion : "",
    totalReferencias: instantanea.referencias.length,
    hoja: opciones.esDueno ? opciones.hoja : null,
    motivo: opciones.esDueno ? fila.changeReason : "",
    diferencias: publicas,
    aprobacionesInvalidadas: fila.invalidatedApprovals,
    contexto: opciones.esDueno ? componerContexto(instantanea.ficha, tipo, instantanea.descripcion) : "",
    creadaEn: fila.createdAt.toISOString(),
    vigente: opciones.vigente,
  };
}

/** Hojas de personaje por identificador, en una sola consulta. Las que están en la papelera no se devuelven. */
async function mediosPorId(ids: string[], actor: Actor): Promise<Map<string, Medio>> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return new Map();
  const filas = await db()
    .select()
    .from(media)
    .where(and(inArray(media.id, unicos), isNull(media.deletedAt)));
  return new Map(filas.map((f) => [f.id, aDto(f, actor)]));
}

/**
 * Aprobación tal como la devuelve la API. `esDueno` a `false` deja fuera el **asunto**: lo escribe el usuario y
 * puede decir cualquier cosa; quien administra solo necesita saber que hay algo pendiente de revisar.
 */
export const vistaDeAprobacion = (
  fila: FilaAprobacion,
  numeros: Map<string, number>,
  esDueno = true,
): AprobacionVista => ({
  id: fila.id,
  tipo: (esTipoAprobacion(fila.kind) ? fila.kind : "escena") as TipoAprobacion,
  asunto: esDueno ? fila.subject : "",
  versionNumero: numeros.get(fila.characterVersionId) ?? 0,
  aprobadaEn: fila.approvedAt.toISOString(),
  invalidada: fila.invalidatedAt !== null,
  invalidadaEn: fila.invalidatedAt?.toISOString() ?? null,
  motivoInvalidacion: fila.invalidatedAt
    ? `${fila.invalidationReason} ${ACCION_APROBACION_INVALIDA[esTipoAprobacion(fila.kind) ? fila.kind : "escena"]}`.trim()
    : "",
  invalidadaPorVersion: fila.invalidatedByVersionId ? (numeros.get(fila.invalidatedByVersionId) ?? null) : null,
});

/**
 * Historial de versiones del personaje con sus aprobaciones. El dueño lo ve entero; quien administra ve los
 * números, las fechas y qué cambió —para poder auditar un consentimiento— pero **no** el contenido de la
 * ficha ni la hoja de personaje, y su acceso queda registrado, igual que al abrir la ficha.
 */
export async function historialDeVersiones(actor: Actor, id: unknown): Promise<HistorialVersiones> {
  const personaje = await filaVisible(actor, id);
  const esDueno = personaje.ownerId === actor.id;
  if (!esDueno) {
    // Misma puerta que la ficha (`obtenerPersonaje`): un personaje ajeno **sin** consentimiento de tercero no
    // le corresponde a nadie más y responde 404. Administrar no es poder mirar.
    if (!(await tuvoConsentimientoDeTercero(personaje.id))) throw new ErrorPersonaje(404, "El personaje no existe.");
    await registrarAccesoAConsentimiento(actor.id, personaje.id, "ficha");
  }
  // **Esta lectura no escribe nada.** La versión 1 la crean el alta del personaje y el relleno de la migración
  // 0015; un historial vacío aquí solo puede significar que el personaje no tiene versiones, y entonces se
  // devuelve vacío en lugar de crear una fila desde un GET.
  const [filas, aprobaciones] = await Promise.all([
    db()
      .select()
      .from(characterVersions)
      .where(eq(characterVersions.characterId, personaje.id))
      .orderBy(asc(characterVersions.number)),
    db()
      .select()
      .from(characterApprovals)
      .where(eq(characterApprovals.characterId, personaje.id))
      .orderBy(desc(characterApprovals.approvedAt)),
  ]);

  const vigente = filas.at(-1) ?? null;
  // Las hojas de todas las versiones en **una** consulta, no una por versión.
  const hojas = esDueno
    ? await mediosPorId(
        filas.flatMap((f) => (f.sheetMediaId ? [f.sheetMediaId] : [])),
        actor,
      )
    : new Map<string, Medio>();
  const versiones = filas.map((fila, i) =>
    vistaDeVersion(fila, filas[i - 1] ?? null, personaje.kind, {
      vigente: fila.id === vigente?.id,
      esDueno,
      hoja: fila.sheetMediaId ? (hojas.get(fila.sheetMediaId) ?? null) : null,
    }),
  );
  const numeros = new Map(filas.map((f) => [f.id, f.number]));
  return {
    versiones: versiones.reverse(),
    aprobaciones: aprobaciones.map((a) => vistaDeAprobacion(a, numeros, esDueno)),
  };
}

/**
 * Registra una aprobación con la versión vigente del personaje. Es la pieza que usarán las aprobaciones de
 * guion y escenas (0.17.0); aquí existe para que la invalidación tenga algo que invalidar y se pueda probar.
 */
export async function registrarAprobacion(
  actor: Actor,
  id: unknown,
  datos: { tipo: unknown; asunto?: unknown },
): Promise<AprobacionVista> {
  const personaje = await filaPropia(actor, id);
  if (!esTipoAprobacion(datos.tipo)) throw new ErrorPersonaje(400, "Ese tipo de aprobación no existe.");
  const asunto =
    typeof datos.asunto === "string" ? datos.asunto.trim().replace(/\s+/g, " ").slice(0, ASUNTO_APROBACION_MAXIMO) : "";
  const version = await asegurarVersionVigente(personaje);
  const [creada] = await db()
    .insert(characterApprovals)
    .values({
      characterId: personaje.id,
      characterVersionId: version.id,
      kind: datos.tipo,
      subject: asunto,
      approvedBy: actor.id,
    })
    .returning();
  if (!creada) throw new ErrorPersonaje(500, "No se ha podido registrar la aprobación.");
  return vistaDeAprobacion(creada, new Map([[version.id, version.number]]));
}
