import { and, eq, isNull } from "drizzle-orm";
import {
  type AlcanceUso,
  esAlcanceUso,
  esTitularConsentimiento,
  exigeDocumento,
  MOTIVO_MAXIMO,
  type PersonajeVista,
  type TitularConsentimiento,
} from "@/lib/personajes";
import { db } from "../db/cliente";
import { characterReferences, consentRecords, media } from "../db/esquema";
import type { Actor } from "../media/servicio";
import { esUuidPersonaje, filaPropia, filaVisible, recalcularEstado } from "./consulta";
import { ErrorPersonaje } from "./errores";
import { registrarAccesoAConsentimiento } from "./registro-acceso";
import { fichaDePersonaje } from "./servicio";

/**
 * Registro, revisión y revocación del consentimiento de un personaje (RF10).
 *
 * Reglas duras de la versión, acordadas en las decisiones provisionales de la fase 13:
 *
 * - **sin declaración de mayoría de edad no se registra nada** (400). Es un control, no una garantía: nadie
 *   puede comprobar la edad de la persona de una foto, y así está escrito en la interfaz y en `docs/legal/`;
 * - «soy yo» y «animal propio» no tienen fricción: la declaración con la cuenta y la fecha basta;
 * - un **tercero exige documento firmado** subido a la biblioteca del usuario; con documento el personaje
 *   queda `en_revision` y **no genera** hasta que quien administra lo acepta;
 * - **revocar bloquea el personaje al momento**: no hay estado intermedio ni gracia. Lo ya generado se
 *   conserva, y la interfaz lo dice;
 * - un registro nuevo no pisa el anterior: el anterior se revoca con su motivo y queda como prueba de lo que
 *   se declaró y cuándo.
 */

/**
 * Violación del índice único parcial `consent_records_personaje_vigente_uq`. Se recorre la cadena de causas
 * porque Drizzle envuelve el error de PostgreSQL en un `DrizzleQueryError`.
 */
function esConsentimientoRepetido(error: unknown): boolean {
  for (let actual: unknown = error, salto = 0; actual && salto < 5; salto++) {
    const fallo = actual as { code?: unknown; errno?: unknown; message?: unknown; cause?: unknown };
    if (fallo.code === "23505" || fallo.errno === "23505") return true;
    if (String(fallo.message ?? "").includes("consent_records_personaje_vigente")) return true;
    actual = fallo.cause;
  }
  return false;
}

export interface DatosConsentimiento {
  titular: unknown;
  mayoriaDeEdad: unknown;
  /**
   * Autorización para la comprobación de identidad (0.24.0). **Opcional**, a diferencia de la mayoría de edad:
   * sin ella el personaje funciona igual que hasta la 0.23.x y sus vistas generadas no cuentan para la cobertura.
   */
  coherencia?: unknown;
  alcance?: unknown;
  /** Medio de la biblioteca con el documento firmado; obligatorio para un tercero. */
  documentoId?: unknown;
}

function titularValido(valor: unknown): TitularConsentimiento {
  if (!esTitularConsentimiento(valor)) throw new ErrorPersonaje(400, "Indica de quién es la imagen.");
  // `inventado` no se registra desde aquí: lo crea `inventado.ts`, que es el único camino que da de alta un
  // personaje sin cara real. Aceptarlo aquí permitiría marcar como inventado a uno que sí tiene fotos de alguien.
  if (valor === "inventado") {
    throw new ErrorPersonaje(
      400,
      "«Un personaje inventado» no es un consentimiento que se registre sobre un personaje existente: créalo como inventado desde el principio.",
    );
  }
  return valor;
}

function alcanceValido(valor: unknown): AlcanceUso {
  if (valor === undefined || valor === null) return "personal";
  if (!esAlcanceUso(valor)) throw new ErrorPersonaje(400, "Indica para qué se autoriza el uso.");
  return valor;
}

function motivoValido(valor: unknown, campo: string): string {
  if (valor === undefined || valor === null) return "";
  if (typeof valor !== "string") throw new ErrorPersonaje(400, `${campo} tiene que ser texto.`);
  const limpio = valor.trim();
  if (limpio.length > MOTIVO_MAXIMO)
    throw new ErrorPersonaje(400, `${campo} admite hasta ${MOTIVO_MAXIMO} caracteres.`);
  return limpio;
}

/**
 * Documento firmado: un medio propio **subido como documento**, fuera de la papelera.
 *
 * Tiene que haberse subido como documento (`is_document`) y no valer para nada más. Si se aceptara cualquier
 * imagen de la biblioteca, el documento habría pasado por el recorte y la recompresión —que es justo lo que
 * puede dejar ilegible una hoja firmada— y, peor, una foto del personaje podría hacer de «documento»: el
 * consentimiento se respaldaría con la propia cara que autoriza, lo que no prueba nada. Por lo mismo se rechaza
 * un medio que ya sea referencia de algún personaje.
 */
async function documentoPropio(usuarioId: string, documentoId: unknown): Promise<string> {
  if (!esUuidPersonaje(documentoId)) {
    throw new ErrorPersonaje(400, "Sube el documento de consentimiento firmado antes de registrarlo.");
  }
  const [fila] = await db()
    .select({ id: media.id, tipo: media.kind, documento: media.isDocument })
    .from(media)
    .where(and(eq(media.id, documentoId), eq(media.ownerId, usuarioId), isNull(media.deletedAt)))
    .limit(1);
  if (!fila) throw new ErrorPersonaje(404, "El documento no existe.");
  if (fila.tipo !== "imagen") {
    throw new ErrorPersonaje(400, "Sube el documento como imagen (una foto o un escaneo de la hoja firmada).");
  }
  if (!fila.documento) {
    throw new ErrorPersonaje(
      400,
      "Ese archivo no se subió como documento de consentimiento. Súbelo con el campo «Documento de consentimiento firmado»: así se guarda sin recortar ni recomprimir y sigue siendo legible al revisarlo.",
    );
  }
  const [comoReferencia] = await db()
    .select({ id: characterReferences.id })
    .from(characterReferences)
    .where(eq(characterReferences.mediaId, fila.id))
    .limit(1);
  if (comoReferencia) {
    throw new ErrorPersonaje(
      400,
      "Ese archivo ya se usa como foto de referencia de un personaje, así que no puede ser además su documento de consentimiento.",
    );
  }
  return fila.id;
}

/**
 * ¿Este personaje ha tenido alguna vez un consentimiento de tercero? Cuenta cualquiera: vigente, revocado o
 * rechazado.
 *
 * Es la marca que **no se puede quitar**. Si se pudiera, un personaje cuyo documento de tercero se acaba de
 * rechazar (o que se ha quedado esperando revisión) se desbloquearía registrando un consentimiento «soy yo»,
 * y la revisión humana sería un trámite que cualquiera puede saltarse. Una vez que una cara se ha declarado
 * de otra persona, deja de haber una versión de la historia en la que sea tuya.
 */
async function huboTerceroEn(personajeId: string): Promise<boolean> {
  const [fila] = await db()
    .select({ id: consentRecords.id })
    .from(consentRecords)
    .where(and(eq(consentRecords.characterId, personajeId), eq(consentRecords.holderType, "tercero")))
    .limit(1);
  return fila !== undefined;
}

/**
 * Registra el consentimiento del personaje. Si ya había uno, se revoca automáticamente indicando que lo
 * sustituye otro: los registros no se editan ni se borran, porque son la prueba.
 */
export async function registrarConsentimiento(
  actor: Actor,
  id: unknown,
  datos: DatosConsentimiento,
): Promise<PersonajeVista> {
  const personaje = await filaPropia(actor, id);
  /**
   * Un personaje inventado no registra consentimiento por este camino (0.22.0): no hay ninguna persona que
   * consienta, y dejar que se le registre uno «soy yo» convertiría un personaje sin cara real en uno que dice
   * tenerla. Su declaración se registra al crearlo (`inventado.ts`) y no se sustituye.
   */
  if (personaje.virtual) {
    throw new ErrorPersonaje(
      409,
      "Este personaje es inventado: no representa a ninguna persona real, así que no hay ningún consentimiento de imagen que registrar. Su declaración quedó guardada al crearlo.",
    );
  }
  const titular = titularValido(datos.titular);
  // Un personaje que alguna vez fue de un tercero lo sigue siendo: no se puede rebajar la fricción cambiando
  // de titular, ni saltarse una revisión rechazada o pendiente registrando «soy yo».
  if (!exigeDocumento(titular) && (await huboTerceroEn(personaje.id))) {
    throw new ErrorPersonaje(
      409,
      "Este personaje ya se registró como imagen de otra persona, así que no se puede cambiar a «soy yo» ni a «un animal mío». Registra otro consentimiento de tercero, con su documento firmado, y quien administra volverá a revisarlo.",
    );
  }
  if (datos.mayoriaDeEdad !== true) {
    throw new ErrorPersonaje(
      400,
      "Tienes que declarar que la persona de las fotos es mayor de edad. Sin esa declaración el personaje queda bloqueado.",
    );
  }
  const alcance = alcanceValido(datos.alcance);
  const documentoId = exigeDocumento(titular) ? await documentoPropio(actor.id, datos.documentoId) : null;

  try {
    await db().transaction(async (tx) => {
      await tx
        .update(consentRecords)
        .set({ revokedAt: new Date(), revocationReason: "Sustituido por un registro de consentimiento nuevo." })
        .where(and(eq(consentRecords.characterId, personaje.id), isNull(consentRecords.revokedAt)));
      await tx.insert(consentRecords).values({
        characterId: personaje.id,
        holderType: titular,
        adultDeclared: true,
        coherenceDeclared: datos.coherencia === true,
        usageScope: alcance,
        documentMediaId: documentoId,
        registeredBy: actor.id,
      });
      if (datos.coherencia !== true) await retirarVeredictosDeIdentidad(tx, personaje.id);
    });
  } catch (error) {
    // El índice único parcial de «un consentimiento sin revocar por personaje» ha saltado: son dos registros
    // a la vez (un doble clic). Es una repetición, no un error del servidor.
    if (esConsentimientoRepetido(error)) {
      throw new ErrorPersonaje(409, "Este personaje ya tiene un consentimiento registrado. Recarga la página.");
    }
    throw error;
  }
  await recalcularEstado(personaje.id);
  return fichaDePersonaje(actor, personaje.id);
}

/**
 * Retira los veredictos de identidad del personaje: se obtuvieron enviando su cara con una autorización que ya no
 * está vigente, así que sus vistas generadas dejan de cubrir hasta que se vuelvan a comprobar con una nueva.
 */
async function retirarVeredictosDeIdentidad(ejecutor: Pick<ReturnType<typeof db>, "update">, personajeId: string) {
  await ejecutor
    .update(characterReferences)
    .set({ identityVerdict: "sin_comprobar", identityReason: "" })
    .where(eq(characterReferences.characterId, personajeId));
}

/**
 * Revoca el consentimiento vigente. El personaje queda bloqueado al momento y no puede volver a generar:
 * lo que ya se generó se conserva, con su aviso en la interfaz.
 */
export async function revocarConsentimiento(actor: Actor, id: unknown, motivo: unknown): Promise<PersonajeVista> {
  const personaje = await filaPropia(actor, id);
  const [revocado] = await db()
    .update(consentRecords)
    .set({ revokedAt: new Date(), revocationReason: motivoValido(motivo, "El motivo") })
    .where(and(eq(consentRecords.characterId, personaje.id), isNull(consentRecords.revokedAt)))
    .returning({ id: consentRecords.id });
  if (!revocado) throw new ErrorPersonaje(409, "Este personaje no tiene ningún consentimiento vigente que revocar.");
  await retirarVeredictosDeIdentidad(db(), personaje.id);
  await recalcularEstado(personaje.id);
  return fichaDePersonaje(actor, personaje.id);
}

/**
 * Revisión humana del documento de un tercero: solo quien administra la instalación. Aceptar deja el
 * personaje listo (si ya tiene referencias suficientes); rechazar lo bloquea con la nota de la revisión.
 */
export async function revisarConsentimiento(
  actor: Actor,
  id: unknown,
  aceptado: unknown,
  nota: unknown,
): Promise<PersonajeVista> {
  if (!actor.esAdmin) throw new ErrorPersonaje(404, "El personaje no existe.");
  if (typeof aceptado !== "boolean") throw new ErrorPersonaje(400, "Indica si se acepta o se rechaza.");
  const personaje = await filaVisible(actor, id);
  const limpia = motivoValido(nota, "La nota de la revisión");
  if (!aceptado && limpia === "") {
    throw new ErrorPersonaje(400, "Escribe por qué se rechaza: quien lo pidió tiene que poder entenderlo.");
  }
  const [revisado] = await db()
    .update(consentRecords)
    .set({ reviewedBy: actor.id, reviewedAt: new Date(), reviewApproved: aceptado, reviewNote: limpia })
    .where(
      and(
        eq(consentRecords.characterId, personaje.id),
        eq(consentRecords.holderType, "tercero"),
        isNull(consentRecords.revokedAt),
        isNull(consentRecords.reviewedAt),
      ),
    )
    .returning({ id: consentRecords.id });
  if (!revisado) throw new ErrorPersonaje(409, "Este personaje no tiene ningún consentimiento pendiente de revisión.");
  await registrarAccesoAConsentimiento(actor.id, personaje.id, "revision");
  await recalcularEstado(personaje.id);
  return fichaDePersonaje(actor, personaje.id);
}
