import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import sharp, { type Sharp } from "sharp";
import {
  CONVERTIR_LOGOTIPO,
  LADO_MAXIMO_LOGO,
  LADO_MINIMO_LOGO,
  LIMITE_FUENTE,
  LIMITE_LOGO_RASTER,
  motivoFuenteNoValida,
  motivoTipoDeLogoNoValido,
} from "@/lib/marca-activos";
import type { DocumentoMarca } from "@/lib/marca-esquema";
import { CONTROL_O_ETIQUETA, motivoNombreFuenteNoValido } from "@/lib/marca-esquema";
import {
  type ActivosDeVersion,
  LICENCIAS_FUENTE,
  type RolDerivado,
  type TipoLicenciaFuente,
  urlDeActivoMarca,
} from "@/lib/marca-vista";
import { borrarObjeto, guardarObjeto, leerObjeto } from "../almacenamiento";
import type { Ejecutor } from "../db/cliente";
import { db } from "../db/cliente";
import { brandAssets, type FilaActivoMarca, type LicenciaFuente } from "../db/esquema";
import { detectarTipo } from "../media/deteccion";
import type { Actor } from "../media/servicio";
import { ErrorMarca, exigirAdministracion } from "./http";
import { conCupoDeImagen, SEGUNDOS_MAXIMOS_PROCESADO } from "./procesado";

/**
 * **Archivos de marca**: comprobar, normalizar, guardar, servir y derivar.
 *
 * - Un logotipo **raster** (PNG, JPEG, WebP) se identifica por su firma, se mide y **se vuelve a codificar** con sharp:
 *   lo que se guarda son píxeles recién escritos, sin metadatos ni nada añadido al final del archivo original.
 * - Un **SVG no se admite** en esta versión: se rechaza al momento por su contenido, antes de que sharp lo lea.
 * - Todo procesado con sharp va con cupo (dos a la vez) y tiempo máximo (`procesado.ts`).
 * - El logotipo del **kit del creador** se guarda siempre en PNG: es lo que se superpone al vídeo con FFmpeg.
 * - Una **fuente** solo en WOFF2, con cabecera comprobada y licencia declarada.
 *
 * No hay antivirus en la instalación: la defensa es no aceptar nada que no se pueda comprobar por su contenido y no
 * servir nunca nada que el navegador pueda ejecutar (tipo real, `nosniff` y CSP cerrada en la ruta que los sirve).
 */

export const TIPOS_LOGO = ["image/png", "image/jpeg", "image/webp"] as const;
const EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "font/woff2": "woff2",
};

/** Logotipo ya comprobado y normalizado, listo para guardar. */
interface LogoPreparado {
  datos: Uint8Array;
  mime: string;
  ancho: number;
  alto: number;
}

function exigirMedidas(ancho: number | undefined, alto: number | undefined): { ancho: number; alto: number } {
  if (!ancho || !alto) throw new ErrorMarca(422, "No se han podido leer las medidas del logotipo.");
  if (ancho > LADO_MAXIMO_LOGO || alto > LADO_MAXIMO_LOGO) {
    throw new ErrorMarca(422, `El logotipo mide ${ancho} × ${alto} px y el máximo es ${LADO_MAXIMO_LOGO} px por lado.`);
  }
  if (ancho < LADO_MINIMO_LOGO || alto < LADO_MINIMO_LOGO) {
    throw new ErrorMarca(422, `El logotipo mide ${ancho} × ${alto} px y el mínimo es ${LADO_MINIMO_LOGO} px por lado.`);
  }
  return { ancho, alto };
}

/** Lado máximo del PNG del kit: sobra para una esquina de un vídeo 1080 × 1920. */
const LADO_PNG_KIT = 1024;

/**
 * **El lector de SVG de libvips queda bloqueado en todo el proceso.** Ningún flujo de la aplicación lo necesita (la
 * detección por firma no admite SVG en ningún sitio) y así ningún archivo con firma falsa puede acabar en él, sea cual
 * sea el orden en que libvips pruebe sus lectores.
 */
sharp.block({ operation: ["VipsForeignLoadSvgFile", "VipsForeignLoadSvgBuffer", "VipsForeignLoadSvgSource"] });

/** Formatos que se procesan, según lo que dice libvips que ha leído (además de la firma). */
const FORMATOS_RASTER = new Set(["png", "jpeg", "webp"]);

function exigirRaster(formato: string | undefined): "png" | "jpeg" | "webp" {
  if (!formato || !FORMATOS_RASTER.has(formato)) {
    throw new ErrorMarca(415, `El logotipo tiene que ser PNG, JPEG o WebP. ${CONVERTIR_LOGOTIPO}`);
  }
  return formato as "png" | "jpeg" | "webp";
}

/** Opciones comunes de sharp: tope de píxeles contra las «bombas» de descompresión y sin fallar por avisos menores. */
const ENTRADA = { limitInputPixels: LADO_MAXIMO_LOGO * LADO_MAXIMO_LOGO } as const;

/**
 * Comprueba y normaliza un logotipo: solo PNG, JPEG o WebP (por su firma), con peso y medidas acotados, y siempre
 * **recodificado** (se guardan píxeles recién escritos, sin metadatos). La orientación EXIF se aplica antes de quitarla,
 * así un JPEG de móvil no queda girado. `enPng` lo guarda en PNG (el kit del creador, que se superpone con FFmpeg).
 *
 * Lo que no es raster se rechaza **antes** de que sharp lo lea, y el procesado va con cupo y tiempo máximo
 * (`conCupoDeImagen`).
 */
export async function prepararLogotipo(bytes: Uint8Array, enPng: boolean): Promise<LogoPreparado> {
  const detectado = bytes.byteLength > 0 ? detectarTipo(bytes) : null;
  const motivo = motivoTipoDeLogoNoValido(bytes, detectado?.mime ?? null);
  if (motivo) throw new ErrorMarca(bytes.byteLength === 0 ? 422 : 415, motivo);
  if (bytes.byteLength > LIMITE_LOGO_RASTER) {
    throw new ErrorMarca(413, `El logotipo pesa más de ${LIMITE_LOGO_RASTER / (1024 * 1024)} MB.`);
  }
  return conCupoDeImagen(async () => {
    try {
      const meta = await sharp(bytes, ENTRADA).timeout({ seconds: SEGUNDOS_MAXIMOS_PROCESADO }).metadata();
      const leido = exigirRaster(meta.format);
      exigirMedidas(meta.width, meta.height);
      const imagen = sharp(bytes, ENTRADA).timeout({ seconds: SEGUNDOS_MAXIMOS_PROCESADO }).rotate();
      const formato = enPng ? "png" : leido;
      const salida = enPng
        ? imagen.resize(LADO_PNG_KIT, LADO_PNG_KIT, { fit: "inside", withoutEnlargement: true })
        : imagen;
      const { data, info } = await salida.toFormat(formato).toBuffer({ resolveWithObject: true });
      return { datos: new Uint8Array(data), mime: `image/${formato}`, ancho: info.width, alto: info.height };
    } catch (error) {
      if (error instanceof ErrorMarca) throw error;
      throw new ErrorMarca(422, "El logotipo está dañado o no se puede leer como imagen.");
    }
  });
}

/** Datos de la declaración de licencia de una fuente, tal como llegan del formulario. */
export interface DeclaracionFuente {
  familia: unknown;
  tipo: unknown;
  titular: unknown;
  nota: unknown;
  acepto: unknown;
}

const TIPOS_LICENCIA = Object.keys(LICENCIAS_FUENTE) as TipoLicenciaFuente[];

/** Comprueba la fuente y su declaración. Sin declaración completa no entra ninguna fuente. */
export function prepararFuente(
  bytes: Uint8Array,
  declaracion: DeclaracionFuente,
  actor: Actor,
): { familia: string; licencia: LicenciaFuente } {
  const motivo = motivoFuenteNoValida(bytes);
  if (motivo) throw new ErrorMarca(422, motivo);
  const motivoFamilia = motivoNombreFuenteNoValido(declaracion.familia);
  if (motivoFamilia) throw new ErrorMarca(422, motivoFamilia, [{ campo: "familia", mensaje: motivoFamilia }]);
  const tipo = TIPOS_LICENCIA.find((t) => t === declaracion.tipo);
  if (!tipo) {
    throw new ErrorMarca(422, "Elige la licencia de la fuente.", [
      { campo: "licencia", mensaje: "Elige una licencia." },
    ]);
  }
  const titular = typeof declaracion.titular === "string" ? declaracion.titular.trim() : "";
  if (titular === "" || titular.length > 120 || CONTROL_O_ETIQUETA.test(titular)) {
    throw new ErrorMarca(422, "Escribe quién tiene los derechos de la fuente (hasta 120 caracteres).", [
      { campo: "titular", mensaje: "Escribe el titular de la licencia." },
    ]);
  }
  const nota = typeof declaracion.nota === "string" ? declaracion.nota.trim() : "";
  if (nota.length > 500 || CONTROL_O_ETIQUETA.test(nota.replace(/[\n\r\t]/g, " "))) {
    throw new ErrorMarca(422, "La nota de la licencia admite hasta 500 caracteres, sin < ni >.");
  }
  if (declaracion.acepto !== "si") {
    throw new ErrorMarca(422, "Confirma que tienes derecho a usar esta fuente en la web.", [
      { campo: "acepto", mensaje: "Hace falta la declaración." },
    ]);
  }
  return {
    familia: (declaracion.familia as string).trim(),
    licencia: { tipo, titular, nota, declaradaEn: new Date().toISOString(), declaradaPor: actor.id },
  };
}

/** Guarda un archivo de marca ya comprobado: primero el objeto y después la fila; si la fila falla, se borra. */
export async function guardarActivo(
  ejecutor: Ejecutor,
  datos: {
    scope: "instalacion" | "kit";
    kind: "logotipo" | "fuente" | "derivado";
    ownerId: string | null;
    uploadedBy: string | null;
    bytes: Uint8Array;
    mime: string;
    ancho?: number | null;
    alto?: number | null;
    familia?: string | null;
    licencia?: LicenciaFuente | null;
  },
): Promise<FilaActivoMarca> {
  const extension = EXTENSION[datos.mime];
  if (!extension) throw new ErrorMarca(415, "Tipo de archivo de marca no admitido.");
  const clave = `marca/${datos.scope}/${crypto.randomUUID()}.${extension}`;
  await guardarObjeto(clave, datos.bytes, datos.mime);
  try {
    const [fila] = await ejecutor
      .insert(brandAssets)
      .values({
        scope: datos.scope,
        kind: datos.kind,
        ownerId: datos.ownerId,
        uploadedBy: datos.uploadedBy,
        storageKey: clave,
        mimeType: datos.mime,
        sizeBytes: datos.bytes.byteLength,
        width: datos.ancho ?? null,
        height: datos.alto ?? null,
        sha256: createHash("sha256").update(datos.bytes).digest("hex"),
        family: datos.familia ?? null,
        license: datos.licencia ?? null,
      })
      .returning();
    if (!fila) throw new Error("La inserción del archivo de marca no ha devuelto ninguna fila.");
    return fila;
  } catch (error) {
    await borrarObjeto(clave).catch(() => {});
    throw error;
  }
}

/** Límite de subida por tipo de archivo de marca. */
export const LIMITE_SUBIDA = { logotipo: LIMITE_LOGO_RASTER, fuente: LIMITE_FUENTE } as const;

export const urlDeActivo = urlDeActivoMarca;

/**
 * Activo para servir. Los de la instalación son públicos (el favicon lo pide cualquiera); los de un kit, **solo su
 * dueño**. Lo ajeno responde 404, igual que en la biblioteca.
 */
export async function activoParaServir(id: string, actor: Actor | null): Promise<FilaActivoMarca> {
  const [fila] = await db().select().from(brandAssets).where(eq(brandAssets.id, id)).limit(1);
  if (!fila) throw new ErrorMarca(404, "Ese archivo de marca no existe.");
  if (fila.scope === "kit" && fila.ownerId !== actor?.id) throw new ErrorMarca(404, "Ese archivo de marca no existe.");
  return fila;
}

/** Filas de los activos de la instalación con esos identificadores. */
export async function activosDeInstalacion(ids: readonly string[]): Promise<FilaActivoMarca[]> {
  if (ids.length === 0) return [];
  return db()
    .select()
    .from(brandAssets)
    .where(and(inArray(brandAssets.id, [...ids]), eq(brandAssets.scope, "instalacion")));
}

// ── Activos derivados ───────────────────────────────────────────────────────────────────────────────────────

export interface Derivado {
  rol: RolDerivado;
  bytes: Uint8Array;
  ancho: number;
  alto: number;
}

/**
 * Cómo se generan los derivados. Devuelve una secuencia que se recorre dentro de la transacción de publicar: cada
 * derivado se sube y se apunta según sale. Se puede sustituir en los tests para provocar un fallo a mitad.
 */
export type GeneradorDeDerivados = (
  documento: DocumentoMarca,
  activos: ActivosDeVersion,
) => Promise<Iterable<Derivado>>;

const TAMANOS_CUADRADOS: [RolDerivado, number][] = [
  ["favicon-16", 16],
  ["favicon-32", 32],
  ["icono-192", 192],
  ["icono-512", 512],
];

async function bytesDeActivo(id: string): Promise<Uint8Array> {
  const [fila] = await activosDeInstalacion([id]);
  if (!fila) throw new ErrorMarca(409, "Un logotipo de esta versión ya no existe. Vuelve a subirlo antes de publicar.");
  return new Uint8Array(await leerObjeto(fila.storageKey).arrayBuffer());
}

/**
 * Genera favicon 16/32, iconos de la aplicación (192 y 512) e imagen social (1200 × 630) desde el símbolo claro (o el
 * logotipo horizontal si no hay símbolo). Sin ningún logotipo subido no genera nada: la instalación sigue con los
 * iconos de Escenara. Va con el mismo cupo y el mismo tiempo máximo que cualquier procesado de imágenes.
 */
export const generarDerivados: GeneradorDeDerivados = (documento, activos) =>
  conCupoDeImagen(() => derivar(documento, activos), (SEGUNDOS_MAXIMOS_PROCESADO + 2) * 3 * 1000);

const conTiempo = (imagen: Sharp) => imagen.timeout({ seconds: SEGUNDOS_MAXIMOS_PROCESADO });

/** Bytes de un logotipo para derivar, solo si libvips lo lee como PNG, JPEG o WebP. */
async function bytesRaster(id: string): Promise<Uint8Array> {
  const bytes = await bytesDeActivo(id);
  exigirRaster((await conTiempo(sharp(bytes, ENTRADA)).metadata()).format);
  return bytes;
}

async function derivar(documento: DocumentoMarca, activos: ActivosDeVersion): Promise<Derivado[]> {
  const simbolo = activos.logos["simbolo-claro"] ?? activos.logos["horizontal-claro"];
  const horizontal = activos.logos["horizontal-claro"] ?? simbolo;
  if (!simbolo || !horizontal) return [];
  const origen = await bytesRaster(simbolo);
  const fondo = documento.theme.light.surface;
  const lista: Derivado[] = [];
  for (const [rol, lado] of TAMANOS_CUADRADOS) {
    const esFavicon = rol.startsWith("favicon");
    const margen = esFavicon ? 0 : Math.round(lado * 0.12);
    const interior = lado - margen * 2;
    const logo = await conTiempo(sharp(origen, ENTRADA))
      .resize(interior, interior, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    const datos = await conTiempo(
      sharp({
        create: {
          width: lado,
          height: lado,
          channels: 4,
          background: esFavicon ? { r: 0, g: 0, b: 0, alpha: 0 } : fondo,
        },
      }),
    )
      .composite([{ input: logo, top: margen, left: margen }])
      .png()
      .toBuffer();
    lista.push({ rol, bytes: new Uint8Array(datos), ancho: lado, alto: lado });
  }
  const logoSocial = await conTiempo(sharp(horizontal === simbolo ? origen : await bytesRaster(horizontal), ENTRADA))
    .resize(720, 300, { fit: "inside" })
    .png()
    .toBuffer({ resolveWithObject: true });
  const social = await conTiempo(
    sharp({ create: { width: 1200, height: 630, channels: 4, background: documento.theme.light.background } }),
  )
    .composite([
      {
        input: logoSocial.data,
        top: Math.round((630 - logoSocial.info.height) / 2),
        left: Math.round((1200 - logoSocial.info.width) / 2),
      },
    ])
    .png()
    .toBuffer();
  lista.push({ rol: "imagen-social", bytes: new Uint8Array(social), ancho: 1200, alto: 630 });
  return lista;
}

// ── Subida de la instalación ────────────────────────────────────────────────────────────────────────────────

/**
 * Sube un logotipo o una fuente de la instalación. No lo usa ninguna versión hasta que se guarda en el borrador, así
 * que subir no cambia nada de lo publicado.
 */
export async function subirActivoDeInstalacion(
  actor: Actor,
  tipo: unknown,
  archivo: File,
  campos: FormData,
): Promise<FilaActivoMarca> {
  exigirAdministracion(actor);
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  if (tipo === "logotipo") {
    const logo = await prepararLogotipo(bytes, false);
    return guardarActivo(db(), {
      scope: "instalacion",
      kind: "logotipo",
      ownerId: null,
      uploadedBy: actor.id,
      bytes: logo.datos,
      mime: logo.mime,
      ancho: logo.ancho,
      alto: logo.alto,
    });
  }
  if (tipo === "fuente") {
    const { familia, licencia } = prepararFuente(
      bytes,
      {
        familia: campos.get("familia"),
        tipo: campos.get("licencia"),
        titular: campos.get("titular"),
        nota: campos.get("nota") ?? "",
        acepto: campos.get("acepto"),
      },
      actor,
    );
    return guardarActivo(db(), {
      scope: "instalacion",
      kind: "fuente",
      ownerId: null,
      uploadedBy: actor.id,
      bytes,
      mime: "font/woff2",
      familia,
      licencia,
    });
  }
  throw new ErrorMarca(400, "Di si subes un logotipo o una fuente.");
}
