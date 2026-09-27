import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/cliente";
import { characterReferences, characters, consentRecords, media } from "../db/esquema";
import { ErrorMedioEnUso, ErrorPersonaje } from "./errores";

/**
 * Comprobación de uso en el borrado definitivo de un medio. Quedó aplazada en la 0.8.0 porque no había
 * ningún consumidor real; los personajes son el primero: borrar la foto que sostiene la identidad de un
 * personaje (o el documento que prueba su consentimiento) sin avisar es perder algo que no se recupera.
 *
 * No impide el borrado: **avisa**. Quien insiste con la confirmación borra igual, y entonces el personaje
 * pierde esa referencia y puede quedarse por debajo del mínimo, con lo que deja de poder generar hasta que
 * añada otra foto.
 */

/**
 * Condición SQL: este medio **no** es material reservado de un personaje. Un medio lo es cuando es un documento
 * de consentimiento o cuando es foto de referencia de algún personaje.
 *
 * Se usa para acotar lo que ve quien **no es el dueño** del archivo: por decisión del propietario, quien
 * administra sigue viendo y editando la biblioteca de todos como en 0.8.0, pero no esto. Los documentos de
 * terceros se revisan por `/admin/personajes`, que está auditado; las fotos de un personaje no se miran.
 */
export function condicionMedioNoReservado() {
  return and(
    eq(media.isDocument, false),
    sql`not exists (select 1 from character_references cr where cr.media_id = ${media.id})`,
  );
}

/** `true` si el medio es un documento de consentimiento o referencia de algún personaje. */
export async function esMedioReservado(medioId: string): Promise<boolean> {
  const [fila] = await db()
    .select({ id: media.id })
    .from(media)
    .where(and(eq(media.id, medioId), condicionMedioNoReservado()))
    .limit(1);
  return fila === undefined;
}

/**
 * Impide borrar para siempre el documento que respalda un consentimiento **vigente**: es la prueba de que
 * alguien autorizó el uso de su imagen, y borrarla dejaría el personaje generando sin nada que lo sostenga.
 * No es un aviso que se pueda confirmar: primero se revoca el consentimiento, y entonces ya se puede borrar.
 */
export async function exigirDocumentoSinConsentimientoVigente(medioId: string): Promise<void> {
  const filas = await db()
    .select({ nombre: characters.name })
    .from(consentRecords)
    .innerJoin(characters, eq(characters.id, consentRecords.characterId))
    .where(and(eq(consentRecords.documentMediaId, medioId), isNull(consentRecords.revokedAt)))
    .limit(1);
  const nombre = filas[0]?.nombre;
  if (nombre !== undefined) {
    throw new ErrorPersonaje(
      409,
      `Este documento respalda el consentimiento vigente de «${nombre}», así que no se puede borrar: sin él, el personaje generaría sin ninguna prueba de que su titular lo autorizó. Revoca primero su consentimiento y después bórralo.`,
    );
  }
}

export interface UsoDeMedio {
  /** Personajes que usan el medio como foto de referencia. */
  referenciaDe: { id: string; nombre: string }[];
  /** Personajes cuyo consentimiento tiene este medio como documento firmado. */
  documentoDe: { id: string; nombre: string }[];
}

export async function usoDeMedio(medioId: string): Promise<UsoDeMedio> {
  const [referencias, documentos] = await Promise.all([
    db()
      .select({ id: characters.id, nombre: characters.name })
      .from(characterReferences)
      .innerJoin(characters, eq(characters.id, characterReferences.characterId))
      .where(eq(characterReferences.mediaId, medioId)),
    db()
      .select({ id: characters.id, nombre: characters.name })
      .from(consentRecords)
      .innerJoin(characters, eq(characters.id, consentRecords.characterId))
      .where(eq(consentRecords.documentMediaId, medioId)),
  ]);
  return {
    referenciaDe: [...new Map(referencias.map((r) => [r.id, r])).values()],
    documentoDe: [...new Map(documentos.map((d) => [d.id, d])).values()],
  };
}

/**
 * Personajes a los que afecta borrar este medio, comprobando antes el aviso: si está en uso y la petición **no**
 * lleva la confirmación, lanza {@link ErrorMedioEnUso} (409, con la lista) y no se borra nada. Con `confirmado`
 * devuelve la lista para que quien borra pueda recalcular su estado después.
 *
 * Las dos cosas van juntas a propósito: quien borra necesita saber a quién afecta **antes** de borrar, porque
 * después la relación ya no existe y no habría a quién recalcular.
 */
export async function personajesQueUsan(medioId: string, confirmado: boolean): Promise<string[]> {
  const uso = await usoDeMedio(medioId);
  const afectados = [...new Map([...uso.referenciaDe, ...uso.documentoDe].map((a) => [a.id, a])).values()];
  if (afectados.length > 0 && !confirmado) throw new ErrorMedioEnUso(afectados);
  return afectados.map((a) => a.id);
}
