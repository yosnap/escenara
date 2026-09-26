import { and, count, desc, eq, ilike, inArray, isNotNull, isNull, or, type SQL } from "drizzle-orm";
import { LIMITE_BYTES, POR_PAGINA, TIPOS_MEDIO, type TipoMedio } from "@/lib/media/reglas";
import type { CambiosMetadatos, DatosReproduccion, FiltroMedios, Medio, PaginaMedios } from "@/lib/media/tipos";
import { borrarObjeto, guardarObjeto, urlTemporal } from "../almacenamiento";
import { db } from "../db/cliente";
import { type FilaMedio, media } from "../db/esquema";
import { type TipoDetectado, validarArchivo } from "./deteccion";
import { ErrorMedio } from "./errores";
import { procesarImagen } from "./procesado";

export { ErrorMedio };

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

export function aDto(fila: FilaMedio): Medio {
  return {
    id: fila.id,
    tipo: fila.kind,
    nombre: fila.originalName,
    mime: fila.mimeType,
    tamano: fila.sizeBytes,
    ancho: fila.width,
    alto: fila.height,
    duracion: fila.durationSeconds,
    titulo: fila.title,
    altEs: fila.altEs,
    altEn: fila.altEn,
    url: urlTemporal(fila.storageKey),
    creadoEn: fila.createdAt.toISOString(),
    actualizadoEn: fila.updatedAt.toISOString(),
    enPapelera: fila.deletedAt !== null,
    origen: fila.sourceUrl,
  };
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
): Promise<ArchivoPreparado> {
  if (archivo.size > limiteSubida(permitidos)) throw new ErrorMedio(413, "El archivo supera el tamaño máximo.");
  const bruto = new Uint8Array(await archivo.arrayBuffer());
  const validacion = validarArchivo(bruto, archivo.type, permitidos);
  if (!validacion.ok) throw new ErrorMedio(415, validacion.motivo);
  const { detectado } = validacion;

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
  // Vídeo y audio se guardan sin transcodificar; sus datos de reproducción los lee el navegador.
  return {
    datos: bruto,
    detectado,
    ancho: detectado.tipo === "video" ? numeroValido(reproduccion.ancho, 16384) : null,
    alto: detectado.tipo === "video" ? numeroValido(reproduccion.alto, 16384) : null,
    duracion: numeroValido(reproduccion.duracion, 24 * 3600),
  };
}

export async function crearMedio(
  archivo: File,
  reproduccion: DatosReproduccion = {},
  permitidos?: readonly TipoMedio[],
  origen: string | null = null,
): Promise<Medio> {
  const preparado = await prepararArchivo(archivo, reproduccion, permitidos);
  const clave = nuevaClave(preparado.detectado.extension);
  await guardarObjeto(clave, preparado.datos, preparado.detectado.mime);
  try {
    const [fila] = await db()
      .insert(media)
      .values({
        kind: preparado.detectado.tipo,
        storageKey: clave,
        originalName: (archivo.name || "sin-nombre").slice(0, LARGO_MAX_TEXTO),
        mimeType: preparado.detectado.mime,
        sizeBytes: preparado.datos.byteLength,
        width: preparado.ancho,
        height: preparado.alto,
        durationSeconds: preparado.duracion,
        sourceUrl: origen,
      })
      .returning();
    if (!fila) throw new Error("Inserción sin resultado");
    return aDto(fila);
  } catch (error) {
    await borrarSinBloquear(clave);
    throw error;
  }
}

function escaparComodines(texto: string) {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function listarMedios(filtro: FiltroMedios, porPagina = POR_PAGINA): Promise<PaginaMedios> {
  const condiciones: SQL[] = [filtro.papelera ? isNotNull(media.deletedAt) : isNull(media.deletedAt)];
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
      .select()
      .from(media)
      .where(donde)
      .orderBy(desc(media.createdAt), desc(media.id))
      .limit(porPagina)
      .offset((pagina - 1) * porPagina),
    db().select({ total: count() }).from(media).where(donde),
  ]);
  return { elementos: filas.map(aDto), total: totales?.total ?? 0, pagina, porPagina };
}

async function buscarFila(id: string): Promise<FilaMedio> {
  const [fila] = await db().select().from(media).where(eq(media.id, id)).limit(1);
  if (!fila) throw new ErrorMedio(404, "El medio no existe.");
  return fila;
}

export async function obtenerMedio(id: string): Promise<Medio> {
  return aDto(await buscarFila(id));
}

export async function actualizarMetadatos(id: string, cambios: CambiosMetadatos): Promise<Medio> {
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
  await buscarFila(id);
  const [fila] = await db()
    .update(media)
    .set({ ...valores, updatedAt: new Date() })
    .where(eq(media.id, id))
    .returning();
  return aDto(filaOError(fila));
}

/** Sustituye el archivo de una imagen (editor en modo «sobrescribir»). Conserva el identificador y los textos. */
export async function reemplazarImagen(id: string, archivo: File): Promise<Medio> {
  const anterior = await buscarFila(id);
  if (anterior.kind !== "imagen") throw new ErrorMedio(400, "Solo se pueden editar imágenes.");
  if (anterior.deletedAt) throw new ErrorMedio(409, "Restaura el medio antes de editarlo.");
  const preparado = await prepararArchivo(archivo, {}, ["imagen"]);
  const clave = nuevaClave(preparado.detectado.extension);
  await guardarObjeto(clave, preparado.datos, preparado.detectado.mime);
  let fila: FilaMedio;
  try {
    const [actualizada] = await db()
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
    fila = filaOError(actualizada);
  } catch (error) {
    await borrarSinBloquear(clave);
    throw error;
  }
  // El archivo anterior solo se borra cuando la fila ya apunta al nuevo.
  await borrarSinBloquear(anterior.storageKey);
  return aDto(fila);
}

/** Envía a la papelera. Si ya estaba, no cambia la fecha original del borrado. */
export async function enviarAPapelera(id: string): Promise<Medio> {
  const actual = await buscarFila(id);
  if (actual.deletedAt) return aDto(actual);
  const [fila] = await db().update(media).set({ deletedAt: new Date() }).where(eq(media.id, id)).returning();
  return aDto(filaOError(fila));
}

export async function restaurarMedio(id: string): Promise<Medio> {
  const actual = await buscarFila(id);
  if (!actual.deletedAt) return aDto(actual);
  const [fila] = await db().update(media).set({ deletedAt: null }).where(eq(media.id, id)).returning();
  return aDto(filaOError(fila));
}

/** Borrado definitivo: solo desde la papelera, para evitar pérdidas por un clic. */
export async function eliminarDefinitivamente(id: string): Promise<void> {
  const fila = await buscarFila(id);
  if (!fila.deletedAt) throw new ErrorMedio(409, "Envía primero el medio a la papelera.");
  await db().delete(media).where(eq(media.id, id));
  await borrarSinBloquear(fila.storageKey);
}
