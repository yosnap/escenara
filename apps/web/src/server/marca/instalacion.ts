import { desc, eq, inArray, sql } from "drizzle-orm";
import { describirPar, revisarContraste } from "@/lib/marca-contraste";
import { type DocumentoMarca, validarDocumentoMarca } from "@/lib/marca-esquema";
import {
  type ActivosDeVersion,
  type ActivoVista,
  type EstadoMarcaVista,
  ROLES_LOGO,
  type RolDerivado,
  type VersionMarcaVista,
} from "@/lib/marca-vista";
import { borrarObjeto } from "../almacenamiento";
import type { Ejecutor } from "../db/cliente";
import { db } from "../db/cliente";
import { brandAssets, brandVersions, type FilaActivoMarca, type FilaVersionMarca } from "../db/esquema";
import type { Actor } from "../media/servicio";
import { type GeneradorDeDerivados, generarDerivados, guardarActivo, urlDeActivo } from "./activos";
import { documentoBase } from "./base";
import { ErrorMarca, esUuid, exigirAdministracion } from "./http";
import { olvidarMarcaAplicada } from "./publicada";

/**
 * **Marca de la instalación** (RF15): borrador, historial y publicación atómica.
 *
 * - Hay **un borrador** como mucho. Guardarlo valida el documento entero con el esquema; uno inválido no se guarda y
 *   la respuesta dice qué falla **campo por campo**. Lo publicado no se toca.
 * - **Publicar** es una transacción: se vuelve a validar, se comprueba el contraste AA (un texto que no se lee
 *   **bloquea**), se retira la publicada, se generan los activos derivados y se publica el borrador. Si cualquier paso
 *   falla, no cambia nada: sigue la versión anterior, entera, y los archivos a medio subir se borran.
 * - **Revertir** vuelve a publicar una versión del historial tal como era, con sus mismos archivos.
 * - Sin ninguna publicada, la instalación usa la marca de Escenara de siempre.
 *
 * Todas las operaciones van bajo el mismo cerrojo de transacción: dos administradores publicando a la vez se ponen
 * en fila en lugar de pisarse. Todas comprueban que quien llama administra, no solo la página.
 */

/** Cerrojo de la marca: una sola escritura de la marca a la vez en toda la instalación. */
const cerrojo = (tx: Ejecutor) => tx.execute(sql`select pg_advisory_xact_lock(hashtext('escenara:marca'))`);

function exigirDocumento(entrada: unknown): DocumentoMarca {
  const resultado = validarDocumentoMarca(entrada);
  if (!resultado.ok) {
    throw new ErrorMarca(
      422,
      `La marca tiene ${resultado.errores.length === 1 ? "un campo que no es válido" : `${resultado.errores.length} campos que no son válidos`}: no se ha guardado nada y sigue la versión anterior.`,
      resultado.errores,
    );
  }
  return resultado.documento;
}

function exigirContraste(documento: DocumentoMarca): void {
  const { bloqueos } = revisarContraste(documento);
  if (bloqueos.length === 0) return;
  throw new ErrorMarca(
    422,
    `No se publica: ${bloqueos.length === 1 ? "un texto no se lee" : `${bloqueos.length} textos no se leen`} con suficiente contraste. ${describirPar(bloqueos[0] as (typeof bloqueos)[number])} Sigue publicada la versión anterior.`,
    [],
    bloqueos,
  );
}

/**
 * Comprueba los activos que dice usar una versión: cada logotipo en su papel, cada fuente con su familia declarada,
 * todos de la instalación y del tipo que toca. Devuelve la lista limpia (sin claves inventadas).
 */
async function exigirActivos(ejecutor: Ejecutor, entrada: unknown): Promise<ActivosDeVersion> {
  const crudo = (typeof entrada === "object" && entrada !== null ? entrada : {}) as Record<string, unknown>;
  const logosCrudos = (typeof crudo.logos === "object" && crudo.logos !== null ? crudo.logos : {}) as Record<
    string,
    unknown
  >;
  const fuentesCrudas = Array.isArray(crudo.fuentes) ? crudo.fuentes : [];
  const logos: ActivosDeVersion["logos"] = {};
  for (const [rol, id] of Object.entries(logosCrudos)) {
    if (!ROLES_LOGO.includes(rol as (typeof ROLES_LOGO)[number])) {
      throw new ErrorMarca(422, `«${rol.slice(0, 40)}» no es un papel de logotipo.`, [
        { campo: `logos.${rol}`, mensaje: "Papel no válido." },
      ]);
    }
    if (id === null || id === undefined || id === "") continue;
    if (!esUuid(id))
      throw new ErrorMarca(422, "Un logotipo no es válido.", [
        { campo: `logos.${rol}`, mensaje: "Archivo no válido." },
      ]);
    logos[rol as (typeof ROLES_LOGO)[number]] = id;
  }
  if (fuentesCrudas.length > 4) throw new ErrorMarca(422, "Como mucho cuatro fuentes propias por versión.");
  const fuentes: ActivosDeVersion["fuentes"] = [];
  for (const f of fuentesCrudas) {
    const activoId = (f as { activoId?: unknown })?.activoId;
    if (!esUuid(activoId))
      throw new ErrorMarca(422, "Una fuente propia no es válida.", [
        { campo: "fuentes", mensaje: "Archivo no válido." },
      ]);
    fuentes.push({ activoId, familia: "" });
  }
  const ids = [...Object.values(logos), ...fuentes.map((f) => f.activoId)];
  const filas = ids.length === 0 ? [] : await ejecutor.select().from(brandAssets).where(inArray(brandAssets.id, ids));
  const porId = new Map(filas.map((f) => [f.id, f]));
  for (const [rol, id] of Object.entries(logos)) {
    const fila = porId.get(id);
    if (fila?.scope !== "instalacion" || fila.kind !== "logotipo") {
      throw new ErrorMarca(422, "Un logotipo de esta versión ya no existe: vuelve a subirlo.", [
        { campo: `logos.${rol}`, mensaje: "El archivo ya no existe." },
      ]);
    }
  }
  for (const fuente of fuentes) {
    const fila = porId.get(fuente.activoId);
    if (fila?.scope !== "instalacion" || fila.kind !== "fuente" || !fila.family) {
      throw new ErrorMarca(422, "Una fuente de esta versión ya no existe: vuelve a subirla.", [
        { campo: "fuentes", mensaje: "El archivo ya no existe." },
      ]);
    }
    // La familia es la que se declaró al subirla, no la que diga la petición.
    fuente.familia = fila.family;
  }
  return { logos, fuentes };
}

// ── Vistas ──────────────────────────────────────────────────────────────────────────────────────────────────

const aVista = (fila: FilaVersionMarca): VersionMarcaVista => ({
  id: fila.id,
  version: fila.version,
  estado: fila.state,
  documento: fila.document,
  activos: fila.assets,
  notas: fila.notes,
  creadaEn: fila.createdAt.toISOString(),
  publicadaEn: fila.publishedAt?.toISOString() ?? null,
});

export const activoAVista = (fila: FilaActivoMarca): ActivoVista => ({
  id: fila.id,
  url: urlDeActivo(fila.id),
  mime: fila.mimeType,
  ancho: fila.width,
  alto: fila.height,
  familia: fila.family,
  licencia: fila.license
    ? { tipo: fila.license.tipo, titular: fila.license.titular, declaradaEn: fila.license.declaradaEn }
    : null,
});

/** Todo lo que necesita el editor: borrador, publicada, historial, la marca de referencia y los archivos que usan. */
export async function estadoDeLaMarca(actor: Actor): Promise<EstadoMarcaVista> {
  exigirAdministracion(actor);
  const filas = await db().select().from(brandVersions).orderBy(desc(brandVersions.version)).limit(50);
  const borrador = filas.find((f) => f.state === "borrador") ?? null;
  const publicada = filas.find((f) => f.state === "publicada") ?? null;
  const historial = filas.filter((f) => f.state !== "borrador" && f.publishedAt !== null);
  const ids = new Set<string>();
  for (const f of filas) {
    for (const id of Object.values(f.assets.logos)) if (id) ids.add(id);
    for (const fuente of f.assets.fuentes) ids.add(fuente.activoId);
  }
  const activos =
    ids.size === 0
      ? []
      : await db()
          .select()
          .from(brandAssets)
          .where(inArray(brandAssets.id, [...ids]));
  return {
    borrador: borrador ? aVista(borrador) : null,
    publicada: publicada ? aVista(publicada) : null,
    historial: historial.map(aVista),
    base: documentoBase(),
    activos: Object.fromEntries(activos.map((a) => [a.id, activoAVista(a)])),
  };
}

// ── Borrador ────────────────────────────────────────────────────────────────────────────────────────────────

const LARGO_NOTAS = 500;

/**
 * Guarda el borrador (lo crea si no hay). El documento se valida entero; si no pasa, no se guarda nada y el error
 * lleva la lista de campos. El contraste **no** impide guardar un borrador: impide publicarlo.
 */
export async function guardarBorrador(
  actor: Actor,
  entrada: { documento: unknown; activos: unknown; notas: unknown },
): Promise<VersionMarcaVista> {
  exigirAdministracion(actor);
  const documento = exigirDocumento(entrada.documento);
  const notas = typeof entrada.notas === "string" ? entrada.notas.trim() : "";
  if (notas.length > LARGO_NOTAS) throw new ErrorMarca(422, `Las notas admiten hasta ${LARGO_NOTAS} caracteres.`);
  return db().transaction(async (tx) => {
    await cerrojo(tx);
    const activos = await exigirActivos(tx, entrada.activos);
    const [actual] = await tx.select().from(brandVersions).where(eq(brandVersions.state, "borrador")).limit(1);
    if (actual) {
      const [fila] = await tx
        .update(brandVersions)
        .set({ document: documento, assets: activos, notes: notas, authorId: actor.id, updatedAt: new Date() })
        .where(eq(brandVersions.id, actual.id))
        .returning();
      if (!fila) throw new ErrorMarca(409, "El borrador ha cambiado mientras lo guardabas. Vuelve a cargar la página.");
      return aVista(fila);
    }
    const [{ siguiente } = { siguiente: 1 }] = await tx
      .select({ siguiente: sql<number>`coalesce(max(${brandVersions.version}), 0) + 1` })
      .from(brandVersions);
    const [fila] = await tx
      .insert(brandVersions)
      .values({
        version: Number(siguiente),
        state: "borrador",
        document: documento,
        assets: activos,
        notes: notas,
        authorId: actor.id,
      })
      .returning();
    if (!fila) throw new Error("La inserción del borrador no ha devuelto ninguna fila.");
    return aVista(fila);
  });
}

/** Descarta el borrador. Lo publicado no cambia. */
export async function descartarBorrador(actor: Actor): Promise<void> {
  exigirAdministracion(actor);
  await db().transaction(async (tx) => {
    await cerrojo(tx);
    await tx.delete(brandVersions).where(eq(brandVersions.state, "borrador"));
  });
}

// ── Publicar, revertir y volver a la de Escenara ────────────────────────────────────────────────────────────

/**
 * Publica el borrador de forma atómica. `generador` es el de producción; los tests lo sustituyen para provocar un fallo
 * a mitad y comprobar que no queda nada a medias.
 */
export async function publicarBorrador(
  actor: Actor,
  generador: GeneradorDeDerivados = generarDerivados,
): Promise<VersionMarcaVista> {
  exigirAdministracion(actor);
  const subidos: string[] = [];
  try {
    const publicada = await db().transaction(async (tx) => {
      await cerrojo(tx);
      const [borrador] = await tx.select().from(brandVersions).where(eq(brandVersions.state, "borrador")).limit(1);
      if (!borrador) throw new ErrorMarca(409, "No hay ningún borrador que publicar. Guarda uno primero.");
      const documento = exigirDocumento(borrador.document);
      exigirContraste(documento);
      const activos = await exigirActivos(tx, borrador.assets);

      await tx.update(brandVersions).set({ state: "retirada" }).where(eq(brandVersions.state, "publicada"));
      const derivados: Partial<Record<RolDerivado, string>> = {};
      for (const d of await generador(documento, activos)) {
        const fila = await guardarActivo(tx, {
          scope: "instalacion",
          kind: "derivado",
          ownerId: null,
          uploadedBy: actor.id,
          bytes: d.bytes,
          mime: "image/png",
          ancho: d.ancho,
          alto: d.alto,
        });
        subidos.push(fila.storageKey);
        derivados[d.rol] = fila.id;
      }
      const ahora = new Date();
      const [fila] = await tx
        .update(brandVersions)
        .set({
          state: "publicada",
          document: documento,
          assets: activos,
          derived: derivados,
          publishedAt: ahora,
          publishedBy: actor.id,
          updatedAt: ahora,
        })
        .where(eq(brandVersions.id, borrador.id))
        .returning();
      if (!fila)
        throw new ErrorMarca(409, "El borrador ha desaparecido mientras se publicaba. No se ha publicado nada.");
      return fila;
    });
    olvidarMarcaAplicada();
    return aVista(publicada);
  } catch (error) {
    // La transacción ya se ha deshecho: se borran los archivos derivados que llegaron a subirse.
    await Promise.all(subidos.map((clave) => borrarObjeto(clave).catch(() => {})));
    if (error instanceof ErrorMarca) throw error;
    const detalle = error instanceof Error ? error.message : String(error);
    console.error(`[marca] publicar: ${detalle}`);
    throw new ErrorMarca(
      500,
      "No se ha podido publicar la marca: ha fallado la generación del favicon, los iconos o la imagen social. No ha cambiado nada: sigue publicada la versión anterior. Revisa que los logotipos se ven bien y vuelve a intentarlo.",
    );
  }
}

/** Vuelve a publicar una versión del historial, tal como era. Un clic, y atómico como publicar. */
export async function revertirA(actor: Actor, id: unknown): Promise<VersionMarcaVista> {
  exigirAdministracion(actor);
  if (!esUuid(id)) throw new ErrorMarca(404, "Esa versión de la marca no existe.");
  const fila = await db().transaction(async (tx) => {
    await cerrojo(tx);
    const [destino] = await tx.select().from(brandVersions).where(eq(brandVersions.id, id)).limit(1);
    if (!destino) throw new ErrorMarca(404, "Esa versión de la marca no existe.");
    if (destino.state === "publicada") throw new ErrorMarca(409, `La versión ${destino.version} ya es la publicada.`);
    if (destino.state !== "retirada" || destino.publishedAt === null) {
      throw new ErrorMarca(409, "Solo se puede volver a una versión que ya estuvo publicada. Publica el borrador.");
    }
    // Las reglas de hoy mandan también sobre una versión antigua: si ya no se leería, no vuelve.
    exigirContraste(exigirDocumento(destino.document));
    await exigirActivos(tx, destino.assets);
    await tx.update(brandVersions).set({ state: "retirada" }).where(eq(brandVersions.state, "publicada"));
    const ahora = new Date();
    const [publicada] = await tx
      .update(brandVersions)
      .set({ state: "publicada", publishedAt: ahora, publishedBy: actor.id, updatedAt: ahora })
      .where(eq(brandVersions.id, destino.id))
      .returning();
    if (!publicada) throw new ErrorMarca(409, "La versión ha cambiado mientras se revertía. No ha cambiado nada.");
    return publicada;
  });
  olvidarMarcaAplicada();
  return aVista(fila);
}

/** Retira la marca publicada: la instalación vuelve a la de Escenara. La versión queda en el historial. */
export async function volverALaMarcaDeEscenara(actor: Actor): Promise<void> {
  exigirAdministracion(actor);
  await db().transaction(async (tx) => {
    await cerrojo(tx);
    await tx.update(brandVersions).set({ state: "retirada" }).where(eq(brandVersions.state, "publicada"));
  });
  olvidarMarcaAplicada();
}
