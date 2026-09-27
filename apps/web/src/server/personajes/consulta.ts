import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Medio } from "@/lib/media/tipos";
import type {
  ConsentimientoVista,
  EstadoPersonaje,
  PersonajeElegible,
  PersonajeVista,
  ReferenciaVista,
} from "@/lib/personajes";
import { leerAjustes } from "../ajustes";
import { db, type Ejecutor } from "../db/cliente";
import {
  characterReferences,
  characters,
  consentRecords,
  type FilaConsentimiento,
  type FilaMedio,
  type FilaPersonaje,
  type FilaReferencia,
  media,
  users,
} from "../db/esquema";
import { type Actor, aDto } from "../media/servicio";
import { ErrorPersonaje } from "./errores";
import {
  type ConsentimientoEfectivo,
  consentimientoVigente,
  estadoDePersonaje,
  impedimentosDePersonaje,
  personajePuedeGenerar,
} from "./estado";
import { registrarAccesoAConsentimiento, registrarAccesoAListado } from "./registro-acceso";

/**
 * Lecturas de personajes y conversión a lo que ve el navegador. Todo lo que sale de aquí ya está filtrado
 * por quien pregunta: **un personaje ajeno responde 404**, igual que en la biblioteca de 0.8.0, y el admin
 * solo lo ve para revisar consentimientos (nunca para cambiarlo ni para generar con él).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const esUuidPersonaje = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/**
 * El último registro de consentimiento del personaje, revocado o no. Es el único que se consulta en todas
 * partes (ficha, estado y puerta de la generación) a propósito: leer «el vigente» confundiría un
 * consentimiento revocado con no haber registrado ninguno, y el motivo que se le muestra al usuario sería
 * falso.
 */
export async function ultimoConsentimientoDe(
  personajeId: string,
  ejecutor: Ejecutor = db(),
): Promise<FilaConsentimiento | null> {
  const [fila] = await ejecutor
    .select()
    .from(consentRecords)
    .where(eq(consentRecords.characterId, personajeId))
    .orderBy(desc(consentRecords.registeredAt))
    .limit(1);
  return fila ?? null;
}

export const efectivo = (fila: FilaConsentimiento | null): ConsentimientoEfectivo | null =>
  fila ? { titular: fila.holderType, aceptado: fila.reviewApproved, revocado: fila.revokedAt !== null } : null;

/**
 * Referencias **utilizables** del personaje: las que apuntan a una foto que sigue en la biblioteca y fuera de la
 * papelera. Una foto en la papelera no se puede enviar a ningún proveedor, así que no cuenta para el mínimo: si
 * contara, un personaje con tres fotos en la papelera diría «listo» y fallaría al generar.
 */
export async function contarReferencias(personajeId: string, ejecutor: Ejecutor = db()): Promise<number> {
  const [fila] = await ejecutor
    .select({ total: count() })
    .from(characterReferences)
    .innerJoin(media, eq(media.id, characterReferences.mediaId))
    .where(and(eq(characterReferences.characterId, personajeId), isNull(media.deletedAt)));
  return fila?.total ?? 0;
}

/**
 * Identificadores de los medios que son referencia utilizable del personaje, en el orden que fijó el usuario.
 * Es la lista que la cola cruza con lo que guardó el trabajo: entre encolar y enviar, una referencia puede
 * haberse quitado o haber ido a la papelera.
 */
export async function mediosDeReferenciaVigentes(personajeId: string): Promise<string[]> {
  const filas = await db()
    .select({ mediaId: characterReferences.mediaId })
    .from(characterReferences)
    .innerJoin(media, eq(media.id, characterReferences.mediaId))
    .where(and(eq(characterReferences.characterId, personajeId), isNull(media.deletedAt)))
    .orderBy(asc(characterReferences.sortOrder), asc(characterReferences.createdAt));
  return filas.map((f) => f.mediaId);
}

/**
 * Fila del personaje visible para quien pregunta. Lo ajeno responde 404 y no revela que existe; el admin
 * puede leer cualquiera, porque tiene que poder revisar los documentos de consentimiento.
 */
export async function filaVisible(actor: Actor, id: unknown, ejecutor: Ejecutor = db()): Promise<FilaPersonaje> {
  if (!esUuidPersonaje(id)) throw new ErrorPersonaje(404, "El personaje no existe.");
  const [fila] = await ejecutor.select().from(characters).where(eq(characters.id, id)).limit(1);
  if (!fila || (fila.ownerId !== actor.id && !actor.esAdmin)) throw new ErrorPersonaje(404, "El personaje no existe.");
  return fila;
}

/** Fila que quien pregunta puede **cambiar**: solo la propia. El admin revisa, no edita fichas ajenas. */
export async function filaPropia(actor: Actor, id: unknown, ejecutor: Ejecutor = db()): Promise<FilaPersonaje> {
  const fila = await filaVisible(actor, id, ejecutor);
  if (fila.ownerId !== actor.id) throw new ErrorPersonaje(404, "El personaje no existe.");
  return fila;
}

/** Medios de la biblioteca por identificador, para montar las vistas sin una consulta por fila. */
async function mediosPorId(ids: string[], actor: Actor): Promise<Map<string, Medio>> {
  if (ids.length === 0) return new Map();
  const filas = await db()
    .select()
    .from(media)
    .where(inArray(media.id, [...new Set(ids)]));
  return new Map(filas.map((f: FilaMedio) => [f.id, aDto(f, actor)]));
}

export function vistaConsentimiento(fila: FilaConsentimiento, documento: Medio | null): ConsentimientoVista {
  return {
    id: fila.id,
    titular: fila.holderType,
    mayoriaDeEdad: fila.adultDeclared,
    alcance: fila.usageScope,
    documento,
    registradoEn: fila.registeredAt.toISOString(),
    revisadoEn: fila.reviewedAt?.toISOString() ?? null,
    aceptado: fila.reviewApproved,
    revocadoEn: fila.revokedAt?.toISOString() ?? null,
    motivoRevocacion: fila.revokedAt ? fila.revocationReason : fila.reviewNote || null,
    vigente: consentimientoVigente(efectivo(fila)),
  };
}

function vistaReferencia(fila: FilaReferencia, medio: Medio): ReferenciaVista {
  return { id: fila.id, medio, origen: fila.origin, vista: fila.declaredView, orden: fila.sortOrder };
}

/** Referencias de un personaje, en el orden que fijó el usuario. */
export async function referenciasDe(personajeId: string, ejecutor: Ejecutor = db()): Promise<FilaReferencia[]> {
  return ejecutor
    .select()
    .from(characterReferences)
    .where(eq(characterReferences.characterId, personajeId))
    .orderBy(asc(characterReferences.sortOrder), asc(characterReferences.createdAt));
}

interface OpcionesVista {
  /** Incluye el consentimiento (ficha completa). */
  completa?: boolean;
  /**
   * Incluye la lista de referencias. **Nunca para un personaje ajeno**: quien administra revisa
   * consentimientos, no mira las fotos de la gente. Se decide aquí y no en la interfaz porque lo que no sale
   * en la respuesta no se puede mirar de ninguna manera.
   */
  conReferencias?: boolean;
  /** Añade el dueño del personaje (solo en la vista de administración). */
  conPropietario?: boolean;
  /** Mínimo de referencias ya leído de los ajustes: evita una lectura por personaje en los listados. */
  minimo?: number;
  /** Nombre del dueño ya resuelto, para los listados. */
  nombreDelDueno?: string;
}

/**
 * Personaje tal como lo devuelve la API, con su estado deducido de los datos y los motivos por los que no
 * puede generar. Lo que decide es siempre lo que hay en la base de datos, no la columna `state`.
 */
export async function vistaDePersonaje(
  fila: FilaPersonaje,
  actor: Actor,
  opciones: OpcionesVista = {},
): Promise<PersonajeVista> {
  const minimo = opciones.minimo ?? (await leerAjustes()).minimoReferenciasPersonaje;
  const [consentimiento, referencias] = await Promise.all([ultimoConsentimientoDe(fila.id), referenciasDe(fila.id)]);
  const idsMedios = [
    ...referencias.map((r) => r.mediaId),
    ...(consentimiento?.documentMediaId ? [consentimiento.documentMediaId] : []),
  ];
  const medios = await mediosPorId(idsMedios, actor);
  // Las que están en la papelera se siguen mostrando (para que se vea qué ha pasado), pero no cuentan.
  const utilizables = referencias.filter((r) => medios.get(r.mediaId)?.enPapelera === false).length;
  const datos = { consentimiento: efectivo(consentimiento), referencias: utilizables, minimoReferencias: minimo };
  const esDueno = fila.ownerId === actor.id;
  const portada = esDueno && referencias[0] ? (medios.get(referencias[0].mediaId) ?? null) : null;
  const propietario = opciones.conPropietario
    ? { id: fila.ownerId, nombre: opciones.nombreDelDueno ?? (await nombreDeDueno(fila.ownerId)).nombre }
    : undefined;

  return {
    id: fila.id,
    nombre: fila.name,
    tipo: fila.kind,
    especie: fila.speciesNotes,
    descripcion: fila.description,
    estado: estadoDePersonaje(datos),
    totalReferencias: utilizables,
    minimoReferencias: minimo,
    puedeGenerar: personajePuedeGenerar(datos),
    impedimentos: impedimentosDePersonaje(datos),
    portada,
    creadoEn: fila.createdAt.toISOString(),
    actualizadoEn: fila.updatedAt.toISOString(),
    puedeEditar: esDueno,
    ...(opciones.conReferencias && esDueno
      ? {
          referencias: referencias.flatMap((r) => {
            const medio = medios.get(r.mediaId);
            return medio ? [vistaReferencia(r, medio)] : [];
          }),
        }
      : {}),
    ...(opciones.completa
      ? {
          consentimiento: consentimiento
            ? vistaConsentimiento(
                consentimiento,
                consentimiento.documentMediaId ? (medios.get(consentimiento.documentMediaId) ?? null) : null,
              )
            : null,
        }
      : {}),
    ...(propietario ? { propietario } : {}),
  };
}

async function nombreDeDueno(ownerId: string): Promise<{ id: string; nombre: string }> {
  const [fila] = await db().select({ nombre: users.name }).from(users).where(eq(users.id, ownerId)).limit(1);
  return { id: ownerId, nombre: fila?.nombre ?? "Cuenta borrada" };
}

/**
 * Resumen agregado de una lista de personajes en **cuatro consultas**, no en cuatro por personaje: el último
 * consentimiento de cada uno, cuántas referencias tiene, su portada y el nombre de su dueño. Con veinte
 * personajes, la versión ingenua hacía más de ochenta viajes a la base de datos.
 */
interface ResumenDeLista {
  consentimientos: Map<string, ConsentimientoEfectivo>;
  referencias: Map<string, number>;
  portadas: Map<string, Medio>;
  duenos: Map<string, string>;
}

async function resumenDeLista(filas: FilaPersonaje[], actor: Actor): Promise<ResumenDeLista> {
  const ids = filas.map((f) => f.id);
  if (ids.length === 0) {
    return { consentimientos: new Map(), referencias: new Map(), portadas: new Map(), duenos: new Map() };
  }
  const lista = sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  // `distinct on` para quedarse con el último registro de cada personaje en una sola pasada.
  const [ultimos, conteos, primeras, nombres] = await Promise.all([
    db().execute<{
      character_id: string;
      holder_type: string;
      review_approved: boolean | null;
      revoked_at: Date | null;
    }>(
      sql`select distinct on (character_id) character_id, holder_type, review_approved, revoked_at
          from consent_records where character_id in (${lista})
          order by character_id, registered_at desc`,
    ),
    db()
      .select({ id: characterReferences.characterId, total: count() })
      .from(characterReferences)
      .innerJoin(media, eq(media.id, characterReferences.mediaId))
      .where(and(inArray(characterReferences.characterId, ids), isNull(media.deletedAt)))
      .groupBy(characterReferences.characterId),
    db().execute<{ character_id: string; media_id: string }>(
      sql`select distinct on (cr.character_id) cr.character_id, cr.media_id
          from character_references cr join media m on m.id = cr.media_id
          where cr.character_id in (${lista}) and m.deleted_at is null
          order by cr.character_id, cr.sort_order asc, cr.created_at asc`,
    ),
    db()
      .select({ id: users.id, nombre: users.name })
      .from(users)
      .where(inArray(users.id, [...new Set(filas.map((f) => f.ownerId))])),
  ]);

  const idsPortada = [...primeras].map((f) => f.media_id);
  const medios = await mediosPorId(idsPortada, actor);
  return {
    consentimientos: new Map(
      [...ultimos].map((f) => [
        f.character_id,
        {
          titular: f.holder_type as ConsentimientoEfectivo["titular"],
          aceptado: f.review_approved,
          revocado: f.revoked_at !== null,
        },
      ]),
    ),
    referencias: new Map(conteos.map((c) => [c.id, c.total])),
    portadas: new Map(
      [...primeras].flatMap((f) => {
        const medio = medios.get(f.media_id);
        return medio ? ([[f.character_id, medio]] as [string, Medio][]) : [];
      }),
    ),
    duenos: new Map(nombres.map((n) => [n.id, n.nombre])),
  };
}

/** Vista de lista de varios personajes, sin referencias ni consentimiento detallado y sin consultas por fila. */
async function vistasDeLista(
  filas: FilaPersonaje[],
  actor: Actor,
  opciones: { conPropietario?: boolean } = {},
): Promise<PersonajeVista[]> {
  const { minimoReferenciasPersonaje: minimo } = await leerAjustes();
  const resumen = await resumenDeLista(filas, actor);
  return filas.map((fila) => {
    const datos = {
      consentimiento: resumen.consentimientos.get(fila.id) ?? null,
      referencias: resumen.referencias.get(fila.id) ?? 0,
      minimoReferencias: minimo,
    };
    const esDueno = fila.ownerId === actor.id;
    return {
      id: fila.id,
      nombre: fila.name,
      tipo: fila.kind,
      especie: fila.speciesNotes,
      descripcion: fila.description,
      estado: estadoDePersonaje(datos),
      totalReferencias: datos.referencias,
      minimoReferencias: minimo,
      puedeGenerar: personajePuedeGenerar(datos),
      impedimentos: impedimentosDePersonaje(datos),
      // La portada es una foto del personaje: solo la ve su dueño.
      portada: esDueno ? (resumen.portadas.get(fila.id) ?? null) : null,
      puedeEditar: esDueno,
      creadoEn: fila.createdAt.toISOString(),
      actualizadoEn: fila.updatedAt.toISOString(),
      ...(opciones.conPropietario
        ? { propietario: { id: fila.ownerId, nombre: resumen.duenos.get(fila.ownerId) ?? "Cuenta borrada" } }
        : {}),
    };
  });
}

/** Personajes propios, los más recientes primero. */
export async function listarPersonajes(actor: Actor): Promise<PersonajeVista[]> {
  const filas = await db()
    .select()
    .from(characters)
    .where(eq(characters.ownerId, actor.id))
    .orderBy(desc(characters.createdAt));
  return vistasDeLista(filas, actor);
}

/**
 * Ficha de un personaje. El dueño la ve entera; quien administra ve **el consentimiento y nada más**: ni las
 * fotos de referencia ni la portada, y solo si el titular es un tercero (lo único que tiene que revisar). Cada
 * acceso queda registrado en `consent_access_log`.
 */
export async function obtenerPersonaje(actor: Actor, id: unknown): Promise<PersonajeVista> {
  const fila = await filaVisible(actor, id);
  const esDueno = fila.ownerId === actor.id;
  if (esDueno) return vistaDePersonaje(fila, actor, { completa: true, conReferencias: true });

  // Un personaje ajeno sin consentimiento de tercero no le corresponde a nadie más: responde 404, igual que
  // uno que no existe. Administrar no es poder mirar.
  if (!(await tuvoConsentimientoDeTercero(fila.id))) throw new ErrorPersonaje(404, "El personaje no existe.");
  await registrarAccesoAConsentimiento(actor.id, fila.id, "ficha");
  return vistaDePersonaje(fila, actor, { completa: true, conPropietario: true });
}

/** `true` si el personaje tiene (o tuvo) algún consentimiento con titular «otra persona». */
async function tuvoConsentimientoDeTercero(personajeId: string): Promise<boolean> {
  const [fila] = await db()
    .select({ id: consentRecords.id })
    .from(consentRecords)
    .where(and(eq(consentRecords.characterId, personajeId), eq(consentRecords.holderType, "tercero")))
    .limit(1);
  return fila !== undefined;
}

/**
 * Personajes propios para el selector de «Crear», con la forma mínima que necesita: nombre, tipo, estado,
 * cuántas fotos tiene y su portada. Ni descripción, ni impedimentos, ni consentimiento.
 */
export async function personajesElegibles(actor: Actor): Promise<PersonajeElegible[]> {
  const filas = await db()
    .select()
    .from(characters)
    .where(eq(characters.ownerId, actor.id))
    .orderBy(desc(characters.createdAt));
  const { minimoReferenciasPersonaje: minimo } = await leerAjustes();
  const resumen = await resumenDeLista(filas, actor);
  return filas.map((fila) => {
    const referencias = resumen.referencias.get(fila.id) ?? 0;
    return {
      id: fila.id,
      nombre: fila.name,
      tipo: fila.kind,
      estado: estadoDePersonaje({
        consentimiento: resumen.consentimientos.get(fila.id) ?? null,
        referencias,
        minimoReferencias: minimo,
      }),
      totalReferencias: referencias,
      portada: resumen.portadas.get(fila.id) ?? null,
    };
  });
}

/** Cuántos consentimientos de tercero se revisan por página. */
export const POR_PAGINA_REVISION = 20;

export interface PaginaDeRevision {
  elementos: PersonajeVista[];
  total: number;
  pagina: number;
  porPagina: number;
}

/** Condición de «pendiente de revisión»: tercero, sin revocar y sin revisar. */
const condicionPendiente = () =>
  and(eq(consentRecords.holderType, "tercero"), isNull(consentRecords.revokedAt), isNull(consentRecords.reviewedAt));

/**
 * Personajes con un consentimiento de tercero pendiente de revisión, para `/admin/personajes`. Solo para
 * administradores, y **sin las fotos de referencia**: lo que se revisa es el documento, no la cara de nadie.
 *
 * Paginado y con consultas agregadas: el listado puede crecer y no puede convertirse en cuatro consultas por
 * personaje. El acceso queda registrado **una vez por carga del listado** (no una por personaje): la auditoría
 * de quién abre un documento concreto la deja la ficha, que es donde el documento se ve de verdad.
 */
export async function pendientesDeRevision(actor: Actor, pagina = 1): Promise<PaginaDeRevision> {
  if (!actor.esAdmin) throw new ErrorPersonaje(404, "El personaje no existe.");
  const pedida = Math.max(1, Math.floor(pagina) || 1);
  const [filas, [totales]] = await Promise.all([
    db()
      .select({ personaje: characters, consentimiento: consentRecords })
      .from(characters)
      .innerJoin(consentRecords, eq(consentRecords.characterId, characters.id))
      .where(condicionPendiente())
      .orderBy(asc(consentRecords.registeredAt))
      .limit(POR_PAGINA_REVISION)
      .offset((pedida - 1) * POR_PAGINA_REVISION),
    db()
      .select({ total: count() })
      .from(characters)
      .innerJoin(consentRecords, eq(consentRecords.characterId, characters.id))
      .where(condicionPendiente()),
  ]);

  // Los documentos de los consentimientos de la página, de una vez.
  const idsDocumento = filas.flatMap((f) =>
    f.consentimiento.documentMediaId ? [f.consentimiento.documentMediaId] : [],
  );
  const [documentos, resumen] = await Promise.all([
    mediosPorId(idsDocumento, actor),
    resumenDeLista(
      filas.map((f) => f.personaje),
      actor,
    ),
  ]);
  const { minimoReferenciasPersonaje: minimo } = await leerAjustes();

  const elementos = filas.map(({ personaje, consentimiento }) => {
    const datos = {
      consentimiento: efectivo(consentimiento),
      referencias: resumen.referencias.get(personaje.id) ?? 0,
      minimoReferencias: minimo,
    };
    return {
      id: personaje.id,
      nombre: personaje.name,
      tipo: personaje.kind,
      especie: personaje.speciesNotes,
      descripcion: personaje.description,
      estado: estadoDePersonaje(datos),
      totalReferencias: datos.referencias,
      minimoReferencias: minimo,
      puedeGenerar: personajePuedeGenerar(datos),
      impedimentos: impedimentosDePersonaje(datos),
      // Ni portada ni referencias: lo que se revisa es el documento.
      portada: null,
      puedeEditar: false,
      creadoEn: personaje.createdAt.toISOString(),
      actualizadoEn: personaje.updatedAt.toISOString(),
      consentimiento: vistaConsentimiento(
        consentimiento,
        consentimiento.documentMediaId ? (documentos.get(consentimiento.documentMediaId) ?? null) : null,
      ),
      propietario: { id: personaje.ownerId, nombre: resumen.duenos.get(personaje.ownerId) ?? "Cuenta borrada" },
    } satisfies PersonajeVista;
  });

  await registrarAccesoAListado(actor.id);
  return { elementos, total: totales?.total ?? 0, pagina: pedida, porPagina: POR_PAGINA_REVISION };
}

/** Deja la columna `state` al día con lo que dicen los datos. Se llama tras cualquier cambio. */
export async function recalcularEstado(personajeId: string, ejecutor: Ejecutor = db()): Promise<EstadoPersonaje> {
  const { minimoReferenciasPersonaje: minimo } = await leerAjustes();
  const [consentimiento, referencias] = await Promise.all([
    ultimoConsentimientoDe(personajeId, ejecutor),
    contarReferencias(personajeId, ejecutor),
  ]);
  const estado = estadoDePersonaje({
    consentimiento: efectivo(consentimiento),
    referencias,
    minimoReferencias: minimo,
  });
  await ejecutor.update(characters).set({ state: estado, updatedAt: new Date() }).where(eq(characters.id, personajeId));
  return estado;
}

/** Siguiente posición libre en el orden de las referencias de un personaje. */
export async function siguienteOrden(personajeId: string, ejecutor: Ejecutor = db()): Promise<number> {
  const [fila] = await ejecutor
    .select({ maximo: sql<number | null>`max(${characterReferences.sortOrder})` })
    .from(characterReferences)
    .where(eq(characterReferences.characterId, personajeId));
  return (fila?.maximo ?? -1) + 1;
}
