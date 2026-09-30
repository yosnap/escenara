import { and, count, desc, eq, ilike, inArray, isNotNull, isNull, or, type SQL, sql, sum } from "drizzle-orm";
import { LIMITE_BYTES, POR_PAGINA, TIPOS_MEDIO, type TipoMedio } from "@/lib/media/reglas";
import type {
  CambiosMetadatos,
  DatosReproduccion,
  EspacioUsado,
  FiltroMedios,
  Medio,
  PaginaMedios,
} from "@/lib/media/tipos";
import { leerAjustes } from "../ajustes";
import { borrarObjeto, guardarObjeto } from "../almacenamiento";
import { db } from "../db/cliente";
import { collectionMedia, collections, type FilaMedio, media, users } from "../db/esquema";
import { recalcularEstado } from "../personajes/consulta";
import {
  condicionMedioNoReservado,
  esMedioReservado,
  exigirDocumentoSinConsentimientoVigente,
  personajesQueUsan,
} from "../personajes/uso-de-medio";
import { type TipoDetectado, validarArchivo } from "./deteccion";
import { dimensionesVideo } from "./dimensiones-video";
import { type Actor, aDto } from "./dto";
import { ErrorMedio } from "./errores";
import { esMimeDeDocumento, limpiarMetadatosDocumento } from "./metadatos-documento";
import { medidasDeImagen, procesarImagen } from "./procesado";

export type { Actor };
export { aDto, ErrorMedio };

const LARGO_MAX_TEXTO = 500;
const PAGINA_MAXIMA = 100_000;

/** Límite de tamaño más alto entre los tipos permitidos: se comprueba antes de leer el archivo en memoria. */
export function limiteSubida(permitidos: readonly TipoMedio[] = TIPOS_MEDIO): number {
  return Math.max(...permitidos.map((t) => LIMITE_BYTES[t]));
}

/** Borra un objeto sin interrumpir la operación; si falla, deja constancia de la clave huérfana. */
async function borrarSinBloquear(clave: string) {
  await borrarObjeto(clave).catch((error) =>
    console.error("[media] objeto huérfano en el almacenamiento:", clave, error),
  );
}

/** Resultado de un UPDATE: si la fila ha desaparecido entretanto, responde 404 en lugar de fallar. */
function filaOError(fila: FilaMedio | undefined): FilaMedio {
  if (!fila) throw new ErrorMedio(404, "El medio no existe.");
  return fila;
}

function nuevaClave(extension: string) {
  const ahora = new Date();
  const mes = String(ahora.getUTCMonth() + 1).padStart(2, "0");
  return `media/${ahora.getUTCFullYear()}/${mes}/${crypto.randomUUID()}.${extension}`;
}

/** Acepta solo números finitos y positivos dentro de un rango razonable. */
function numeroValido(valor: unknown, maximo: number): number | null {
  return typeof valor === "number" && Number.isFinite(valor) && valor > 0 && valor <= maximo ? valor : null;
}

interface ArchivoPreparado {
  datos: Uint8Array;
  detectado: TipoDetectado;
  ancho: number | null;
  alto: number | null;
  duracion: number | null;
}

async function prepararArchivo(
  archivo: File,
  reproduccion: DatosReproduccion,
  permitidos?: readonly TipoMedio[],
  /** Documento de consentimiento: se guarda tal cual, sin recortar ni reconvertir. */
  documento = false,
): Promise<ArchivoPreparado> {
  if (archivo.size > limiteSubida(permitidos)) throw new ErrorMedio(413, "El archivo supera el tamaño máximo.");
  const bruto = new Uint8Array(await archivo.arrayBuffer());
  const validacion = validarArchivo(bruto, archivo.type, permitidos);
  if (!validacion.ok) throw new ErrorMedio(415, validacion.motivo);
  const { detectado } = validacion;

  // Un documento de consentimiento se guarda **sin pasar por el procesado**: el recorte a 1920 × 1080 y la
  // reconversión a WebP pueden dejar ilegible la letra pequeña de una hoja firmada, que es justo lo que hay
  // que poder leer al revisarlo. Lo único que se le quita son los metadatos (EXIF con la localización de donde
  // se firmó, marca del teléfono, fecha exacta), y eso se hace a nivel de contenedor: los píxeles salen byte a
  // byte idénticos. Solo JPEG y PNG, que son los formatos en los que ese recorte es fiable.
  if (documento) {
    if (!esMimeDeDocumento(detectado.mime)) {
      throw new ErrorMedio(
        415,
        "Sube el documento de consentimiento como JPEG o PNG: son los formatos que se pueden guardar sin recomprimir y limpiando sus metadatos.",
      );
    }
    const limpio = limpiarMetadatosDocumento(bruto, detectado.mime);
    const medidas = await medidasDeImagen(limpio);
    return { datos: limpio, detectado, ancho: medidas.ancho, alto: medidas.alto, duracion: null };
  }

  if (detectado.tipo === "imagen") {
    const imagen = await procesarImagen(bruto, detectado).catch(() => {
      throw new ErrorMedio(415, "No se ha podido leer la imagen.");
    });
    return {
      datos: imagen.datos,
      detectado: { ...detectado, mime: imagen.mime, extension: imagen.extension },
      ancho: imagen.ancho,
      alto: imagen.alto,
      duracion: null,
    };
  }
  // Vídeo y audio se guardan sin transcodificar. Las medidas del vídeo salen de su cabecera cuando se
  // puede (los generados por el servidor no pasan por el navegador); si no, de lo que midió el navegador.
  const leidas = detectado.tipo === "video" ? dimensionesVideo(bruto) : null;
  return {
    datos: bruto,
    detectado,
    ancho: detectado.tipo === "video" ? numeroValido(leidas?.ancho ?? reproduccion.ancho, 16384) : null,
    alto: detectado.tipo === "video" ? numeroValido(leidas?.alto ?? reproduccion.alto, 16384) : null,
    duracion: numeroValido(reproduccion.duracion, 24 * 3600),
  };
}

const MB = 1024 * 1024;

/** Espacio que ocupan los medios de un usuario (también los de la papelera) y su cuota. */
export async function espacioUsado(actor: Actor): Promise<EspacioUsado> {
  const [fila] = await db()
    .select({ total: sum(media.sizeBytes) })
    .from(media)
    .where(eq(media.ownerId, actor.id));
  const { cuotaMb } = await leerAjustes();
  return {
    usadoBytes: Number(fila?.total ?? 0),
    cuotaBytes: actor.esAdmin || cuotaMb === 0 ? null : cuotaMb * MB,
  };
}

type Transaccion = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];

function errorCuota(cuotaBytes: number) {
  return new ErrorMedio(
    413,
    `Has llegado a tu límite de espacio (${Math.round(cuotaBytes / MB)} MB). Vacía la papelera o borra archivos.`,
  );
}

/** Comprobación rápida antes de subir nada al almacenamiento (evita trabajo inútil). */
async function comprobarCuota(actor: Actor, bytesNuevos: number) {
  const { usadoBytes, cuotaBytes } = await espacioUsado(actor);
  if (cuotaBytes !== null && usadoBytes + bytesNuevos > cuotaBytes) throw errorCuota(cuotaBytes);
}

/**
 * Comprobación definitiva dentro de la transacción que guarda el medio: bloquea la fila del usuario, así
 * dos subidas simultáneas no pueden leer el mismo espacio usado y pasarse las dos de la cuota.
 */
async function reservarCuota(tx: Transaccion, actor: Actor, bytesNuevos: number) {
  const { cuotaMb } = await leerAjustes();
  if (actor.esAdmin || cuotaMb === 0 || bytesNuevos <= 0) return;
  await tx.execute(sql`select 1 from users where id = ${actor.id} for update`);
  const [fila] = await tx
    .select({ total: sum(media.sizeBytes) })
    .from(media)
    .where(eq(media.ownerId, actor.id));
  const cuotaBytes = cuotaMb * MB;
  if (Number(fila?.total ?? 0) + bytesNuevos > cuotaBytes) throw errorCuota(cuotaBytes);
}

export interface OpcionesCreacion {
  /** Documento de consentimiento: se guarda sin procesar y no puede usarse como referencia. */
  documento?: boolean;
  /**
   * Personaje del que este medio es su hoja (0.15.0). Se marca **en el propio `insert`**, no después: entre
   * crear la fila y marcarla habría un hueco en el que la hoja sería un medio corriente y visible para quien
   * administra, y es un montaje con las fotos de una persona.
   */
  hojaDePersonaje?: string;
}

export async function crearMedio(
  actor: Actor,
  archivo: File,
  reproduccion: DatosReproduccion = {},
  permitidos?: readonly TipoMedio[],
  origen: string | null = null,
  opciones: OpcionesCreacion = {},
): Promise<Medio> {
  const documento = opciones.documento === true;
  const preparado = await prepararArchivo(archivo, reproduccion, permitidos, documento);
  await comprobarCuota(actor, preparado.datos.byteLength);
  const clave = nuevaClave(preparado.detectado.extension);
  await guardarObjeto(clave, preparado.datos, preparado.detectado.mime);
  try {
    const fila = await db().transaction(async (tx) => {
      await reservarCuota(tx, actor, preparado.datos.byteLength);
      const [insertada] = await tx
        .insert(media)
        .values({
          ownerId: actor.id,
          kind: preparado.detectado.tipo,
          storageKey: clave,
          originalName: (archivo.name || "sin-nombre").slice(0, LARGO_MAX_TEXTO),
          mimeType: preparado.detectado.mime,
          sizeBytes: preparado.datos.byteLength,
          width: preparado.ancho,
          height: preparado.alto,
          durationSeconds: preparado.duracion,
          sourceUrl: origen,
          isDocument: documento,
          characterSheetOf: opciones.hojaDePersonaje ?? null,
        })
        .returning();
      return insertada;
    });
    if (!fila) throw new Error("Inserción sin resultado");
    return aDto(fila, actor);
  } catch (error) {
    await borrarSinBloquear(clave);
    throw error;
  }
}

function escaparComodines(texto: string) {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Colección accesible: la propia, o cualquiera si quien consulta es administrador (solo lectura). */
async function coleccionVisible(actor: Actor, id: string) {
  const [coleccion] = await db().select().from(collections).where(eq(collections.id, id)).limit(1);
  if (!coleccion || (coleccion.ownerId !== actor.id && !actor.esAdmin)) {
    throw new ErrorMedio(404, "La colección no existe.");
  }
  return coleccion;
}

export async function listarMedios(actor: Actor, filtro: FiltroMedios, porPagina = POR_PAGINA): Promise<PaginaMedios> {
  const condiciones: SQL[] = [filtro.papelera ? isNotNull(media.deletedAt) : isNull(media.deletedAt)];
  // Los documentos de consentimiento no se ofrecen donde se eligen fotos.
  if (filtro.sinDocumentos) condiciones.push(eq(media.isDocument, false));
  // Un usuario solo ve lo suyo; el admin elige «todos» o un usuario concreto (por defecto, lo suyo).
  const verTodos = actor.esAdmin && filtro.propietario === "todos";
  const dueno = actor.esAdmin && filtro.propietario && filtro.propietario !== "mios" ? filtro.propietario : actor.id;
  if (!verTodos) condiciones.push(eq(media.ownerId, dueno));
  // Lo ajeno nunca incluye material reservado de un personaje (documentos de consentimiento y fotos de
  // referencia): para quien no es su dueño, esos archivos no existen. Los documentos de terceros se revisan por
  // `/admin/personajes`, que está auditado.
  if (verTodos || dueno !== actor.id) {
    const acotado = or(eq(media.ownerId, actor.id), condicionMedioNoReservado());
    if (acotado) condiciones.push(acotado);
  }
  // El dueño solo se muestra cuando el admin mira archivos de otros.
  const mostrarDueno = verTodos || dueno !== actor.id;
  if (filtro.coleccion) {
    await coleccionVisible(actor, filtro.coleccion);
    condiciones.push(
      inArray(
        media.id,
        db()
          .select({ id: collectionMedia.mediaId })
          .from(collectionMedia)
          .where(eq(collectionMedia.collectionId, filtro.coleccion)),
      ),
    );
  }
  if (filtro.tipos.length > 0) condiciones.push(inArray(media.kind, filtro.tipos));
  const busqueda = filtro.busqueda.trim().slice(0, 100);
  if (busqueda) {
    const patron = `%${escaparComodines(busqueda)}%`;
    const coincide = or(
      ilike(media.originalName, patron),
      ilike(media.title, patron),
      ilike(media.altEs, patron),
      ilike(media.altEn, patron),
    );
    if (coincide) condiciones.push(coincide);
  }
  const donde = and(...condiciones);
  const pagina = Math.min(PAGINA_MAXIMA, Math.max(1, Math.floor(filtro.pagina) || 1));
  const [filas, [totales]] = await Promise.all([
    db()
      .select({ medio: media, nombreDueno: users.name })
      .from(media)
      .innerJoin(users, eq(users.id, media.ownerId))
      .where(donde)
      .orderBy(desc(media.createdAt), desc(media.id))
      .limit(porPagina)
      .offset((pagina - 1) * porPagina),
    db().select({ total: count() }).from(media).where(donde),
  ]);
  return {
    elementos: filas.map(({ medio, nombreDueno }) =>
      aDto(medio, actor, mostrarDueno ? { id: medio.ownerId, nombre: nombreDueno } : undefined),
    ),
    total: totales?.total ?? 0,
    pagina,
    porPagina,
  };
}

/**
 * Fila visible para quien consulta: la suya o, si es administrador, cualquiera. Lo ajeno responde 404
 * (no revela que existe).
 */
async function buscarFila(actor: Actor, id: string): Promise<FilaMedio> {
  const [fila] = await db().select().from(media).where(eq(media.id, id)).limit(1);
  if (!fila || (fila.ownerId !== actor.id && !actor.esAdmin)) throw new ErrorMedio(404, "El medio no existe.");
  // Para quien no es el dueño, el material reservado de un personaje responde igual que un medio inexistente:
  // ni se lista, ni se obtiene por identificador, ni se sirve su archivo.
  if (fila.ownerId !== actor.id && (await esMedioReservado(fila.id))) {
    throw new ErrorMedio(404, "El medio no existe.");
  }
  return fila;
}

/** Solo el dueño: editar la imagen o borrar para siempre (el admin tampoco puede con lo ajeno). */
async function buscarFilaPropia(actor: Actor, id: string, accion: string): Promise<FilaMedio> {
  const fila = await buscarFila(actor, id);
  if (fila.ownerId !== actor.id) throw new ErrorMedio(403, `Solo quien subió el archivo puede ${accion}.`);
  return fila;
}

export async function obtenerMedio(actor: Actor, id: string): Promise<Medio> {
  return aDto(await buscarFila(actor, id), actor);
}

/** Clave del archivo para servirlo (dueño o admin). */
export async function archivoDeMedio(actor: Actor, id: string) {
  const fila = await buscarFila(actor, id);
  if (fila.deletedAt) throw new ErrorMedio(404, "El medio no existe.");
  return { clave: fila.storageKey, mime: fila.mimeType };
}

export async function actualizarMetadatos(actor: Actor, id: string, cambios: CambiosMetadatos): Promise<Medio> {
  const valores: Partial<Pick<FilaMedio, "title" | "altEs" | "altEn">> = {};
  for (const [campo, columna] of [
    ["titulo", "title"],
    ["altEs", "altEs"],
    ["altEn", "altEn"],
  ] as const) {
    const valor = cambios[campo];
    if (valor === undefined) continue;
    if (typeof valor !== "string") throw new ErrorMedio(400, "Los metadatos deben ser texto.");
    valores[columna] = valor.trim().slice(0, LARGO_MAX_TEXTO);
  }
  await buscarFila(actor, id);
  const [fila] = await db()
    .update(media)
    .set({ ...valores, updatedAt: new Date() })
    .where(eq(media.id, id))
    .returning();
  return aDto(filaOError(fila), actor);
}

/** Sustituye el archivo de una imagen (editor en modo «sobrescribir»). Conserva el identificador y los textos. */
export async function reemplazarImagen(actor: Actor, id: string, archivo: File): Promise<Medio> {
  const anterior = await buscarFilaPropia(actor, id, "editar la imagen");
  if (anterior.kind !== "imagen") throw new ErrorMedio(400, "Solo se pueden editar imágenes.");
  if (anterior.deletedAt) throw new ErrorMedio(409, "Restaura el medio antes de editarlo.");
  const preparado = await prepararArchivo(archivo, {}, ["imagen"]);
  await comprobarCuota(actor, Math.max(0, preparado.datos.byteLength - anterior.sizeBytes));
  const clave = nuevaClave(preparado.detectado.extension);
  await guardarObjeto(clave, preparado.datos, preparado.detectado.mime);
  let fila: FilaMedio;
  try {
    const [actualizada] = await db().transaction(async (tx) => {
      await reservarCuota(tx, actor, preparado.datos.byteLength - anterior.sizeBytes);
      return tx
        .update(media)
        .set({
          storageKey: clave,
          mimeType: preparado.detectado.mime,
          sizeBytes: preparado.datos.byteLength,
          width: preparado.ancho,
          height: preparado.alto,
          updatedAt: new Date(),
        })
        .where(eq(media.id, id))
        .returning();
    });
    fila = filaOError(actualizada);
  } catch (error) {
    await borrarSinBloquear(clave);
    throw error;
  }
  // El archivo anterior solo se borra cuando la fila ya apunta al nuevo.
  await borrarSinBloquear(anterior.storageKey);
  return aDto(fila, actor);
}

/** Envía a la papelera. Si ya estaba, no cambia la fecha original del borrado. */
export async function enviarAPapelera(actor: Actor, id: string): Promise<Medio> {
  const actual = await buscarFila(actor, id);
  if (actual.deletedAt) return aDto(actual, actor);
  const [fila] = await db().update(media).set({ deletedAt: new Date() }).where(eq(media.id, id)).returning();
  return aDto(filaOError(fila), actor);
}

export async function restaurarMedio(actor: Actor, id: string): Promise<Medio> {
  const actual = await buscarFila(actor, id);
  if (!actual.deletedAt) return aDto(actual, actor);
  const [fila] = await db().update(media).set({ deletedAt: null }).where(eq(media.id, id)).returning();
  return aDto(filaOError(fila), actor);
}

/**
 * Borrado definitivo: solo desde la papelera, para evitar pérdidas por un clic, y solo con confirmación si
 * el medio está en uso como referencia de un personaje o como documento de un consentimiento (0.13.0). El
 * aviso de uso se responde con 409 y la lista de personajes afectados; `confirmado` lo salta.
 */
export async function eliminarDefinitivamente(actor: Actor, id: string, confirmado = false): Promise<void> {
  const fila = await buscarFilaPropia(actor, id, "borrarlo para siempre");
  if (!fila.deletedAt) throw new ErrorMedio(409, "Envía primero el medio a la papelera.");
  // Quiénes lo usaban se lee **antes** de borrarlo: después, la relación ya no existe y no habría a quién
  // recalcular. Un personaje que se queda por debajo del mínimo tiene que pasar a `borrador` al momento, o su
  // ficha diría «listo» mientras la generación lo rechaza.
  await exigirDocumentoSinConsentimientoVigente(id);
  const afectados = await personajesQueUsan(id, confirmado);
  await db().delete(media).where(eq(media.id, id));
  await borrarSinBloquear(fila.storageKey);
  for (const personajeId of afectados) {
    await recalcularEstado(personajeId).catch((error) =>
      console.error(
        `[media] no se ha podido recalcular el estado del personaje ${personajeId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
    );
  }
}
