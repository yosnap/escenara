import { and, eq, isNull } from "drizzle-orm";
import { ETIQUETA_VISTA, esVista } from "@/lib/captura-personaje";
import { coherenciaDe, leerAjustes } from "../ajustes";
import { leerObjeto } from "../almacenamiento";
import { db } from "../db/cliente";
import { characterReferences, consentRecords, type FilaPersonaje, media } from "../db/esquema";
import { imagenParaModelo } from "../media/procesado";
import { mejorReferenciaDe } from "../personajes/contexto";
import { decidirCoherencia, type ResultadoDecision } from "./decidir";
import { ErrorPercepcion, percibir } from "./percepcion";

/**
 * **Identidad**: comprobar que una vista generada es la **misma persona** que la cara de referencia del personaje.
 *
 * Es la única comprobación que nace **en modo activo** (propietario, 2026-09-28), y lo que decide es concreto: una
 * vista generada que pasa **cubre** en la cobertura de vistas de un personaje real, y una que no pasa se marca con
 * su motivo y no cuenta. Hasta la 0.23.x, en un personaje real ninguna vista generada cubría nunca, y el comentario
 * de `lib/captura-personaje.ts` decía literalmente «eso cambiará cuando haya verificación de parecido». Esto es esa
 * verificación.
 *
 * ## La puerta de privacidad, que manda sobre todo lo demás
 *
 * Comprobar la identidad de una persona real obliga a mandar **su cara** a un modelo de percepción que **no es** el
 * que genera: dos fotos suyas, descritas por un servicio ajeno. Un consentimiento firmado para producir vídeo no
 * dice nada de eso, así que aquí no vale: hace falta la declaración expresa
 * (`consent_records.coherence_declared`), y sin ella **no se percibe nada**. La vista se queda `sin_comprobar`, no
 * cubre, y la ficha explica qué falta y cómo darlo.
 *
 * Un personaje **inventado** no necesita ninguna declaración: no hay ninguna persona cuya cara salga de aquí, y
 * además sus vistas generadas ya cubren desde la 0.23.2 porque su cara **es** la generada. Se comprueba igual, para
 * poder avisar de una vista que se ha ido de parecido, pero su veredicto no le quita la cobertura.
 */

/** Lo que hay que saber de una comprobación de identidad que no se ha llegado a hacer. */
export interface IdentidadNoComprobada {
  comprobada: false;
  motivo: string;
}

export interface IdentidadComprobada {
  comprobada: true;
  decision: ResultadoDecision;
  /** Veredicto que se ha escrito en la referencia. En un inventado siempre queda en la fila, nunca quita nada. */
  veredicto: "pasa" | "revisar" | "no_pasa";
}

export type ResultadoIdentidad = IdentidadNoComprobada | IdentidadComprobada;

const SIN_DECLARACION =
  "Para comprobar si la vista generada es la misma persona hay que enviar su cara a un modelo de percepción, y el consentimiento de este personaje no lo cubre. Añade esa declaración en su consentimiento y vuelve a comprobarla; mientras tanto, la vista no cuenta para la cobertura.";

/** Imagen de un medio, reducida y en base64, lista para el modelo. `null` si no se puede leer. */
async function imagenDeMedio(medioId: string): Promise<{ mime: string; base64: string } | null> {
  const [fila] = await db()
    .select()
    .from(media)
    .where(and(eq(media.id, medioId), isNull(media.deletedAt)))
    .limit(1);
  if (!fila) return null;
  try {
    return await imagenParaModelo(new Uint8Array(await leerObjeto(fila.storageKey).arrayBuffer()));
  } catch (error) {
    console.error(`[coherencia] imagen ilegible al comprobar identidad: ${(error as Error).name}`);
    return null;
  }
}

/**
 * Cara de referencia del personaje: el retrato elegido en un inventado y la mejor foto original en uno real. Se
 * elige con **la misma** función que usa la generación (`mejorReferenciaDe`), así que lo que se compara es lo que
 * de verdad guía al modelo, no otra foto cualquiera.
 */
async function caraDeReferencia(personaje: FilaPersonaje, excluirMedioId: string): Promise<string | null> {
  const mejor = await mejorReferenciaDe(personaje.id, personaje.kind);
  if (mejor && mejor !== excluirMedioId) return mejor;
  // La mejor es justo la que se está comprobando (puede pasar en un inventado): se busca otra utilizable.
  const filas = await db()
    .select({ medioId: characterReferences.mediaId, origen: characterReferences.origin })
    .from(characterReferences)
    .innerJoin(media, eq(media.id, characterReferences.mediaId))
    .where(and(eq(characterReferences.characterId, personaje.id), isNull(media.deletedAt)))
    .orderBy(characterReferences.sortOrder, characterReferences.createdAt);
  const otras = filas.filter((f) => f.medioId !== excluirMedioId);
  // Una foto original guía mejor que otra generada, así que va primero si la hay.
  return otras.find((f) => f.origen === "foto_original")?.medioId ?? otras[0]?.medioId ?? null;
}

/** `true` si el consentimiento vigente del personaje declara que su cara puede ir al servicio de coherencia. */
export async function declaraCoherencia(personajeId: string): Promise<boolean> {
  const [fila] = await db()
    .select({ declarada: consentRecords.coherenceDeclared })
    .from(consentRecords)
    .where(and(eq(consentRecords.characterId, personajeId), isNull(consentRecords.revokedAt)))
    .limit(1);
  return fila?.declarada === true;
}

/**
 * Comprueba una referencia **generada** contra la cara de referencia del personaje y deja el veredicto escrito en
 * la propia referencia, que es lo que lee la cobertura.
 *
 * Nunca lanza por un fallo ajeno: si no se puede percibir o Jev no contesta, se devuelve el motivo y **no se toca**
 * el veredicto que hubiera. Cambiar un `pasa` por un `no_pasa` porque se cayó una red sería quitarle cobertura a
 * alguien por una avería.
 */
export async function comprobarIdentidad(personaje: FilaPersonaje, referenciaId: string): Promise<ResultadoIdentidad> {
  const ajustes = await leerAjustes();
  if (coherenciaDe(ajustes, "identidad").modo === "apagada") {
    return { comprobada: false, motivo: "La comprobación de identidad está apagada en esta instalación." };
  }

  const [referencia] = await db()
    .select()
    .from(characterReferences)
    .where(and(eq(characterReferences.id, referenciaId), eq(characterReferences.characterId, personaje.id)))
    .limit(1);
  if (!referencia) return { comprobada: false, motivo: "Esa foto ya no está en el personaje." };
  if (referencia.origin !== "vista_generada") {
    return {
      comprobada: false,
      motivo: "Esta es una foto original tuya: no hay nada que comparar, porque es ella la que define la cara.",
    };
  }
  // La puerta de privacidad, antes de leer un solo byte de la cara de nadie.
  if (!personaje.virtual && !(await declaraCoherencia(personaje.id))) {
    return { comprobada: false, motivo: SIN_DECLARACION };
  }

  const referenciaMedioId = await caraDeReferencia(personaje, referencia.mediaId);
  if (!referenciaMedioId) {
    return {
      comprobada: false,
      motivo: "Este personaje no tiene ninguna otra foto con la que comparar esta vista generada.",
    };
  }
  const [generada, original] = await Promise.all([imagenDeMedio(referencia.mediaId), imagenDeMedio(referenciaMedioId)]);
  if (!generada || !original) {
    return { comprobada: false, motivo: "No se han podido leer las dos imágenes que hay que comparar." };
  }

  const vista = esVista(referencia.viewKey) ? ETIQUETA_VISTA[referencia.viewKey] : "sin vista";
  let hechosGenerada: Awaited<ReturnType<typeof percibir>>;
  let hechosOriginal: Awaited<ReturnType<typeof percibir>>;
  try {
    // Las dos caras se describen por separado y con las **mismas** instrucciones: describirlas juntas dejaría que
    // el propio modelo las comparase, que es justo lo que aquí no queremos que haga.
    hechosGenerada = await percibir({
      usuarioId: personaje.ownerId,
      clase: "cara",
      claveIdempotencia: `coherencia:identidad:${referencia.id}:generada`,
      imagen: generada,
    });
    hechosOriginal = await percibir({
      usuarioId: personaje.ownerId,
      clase: "cara",
      claveIdempotencia: `coherencia:identidad:${referencia.id}:referencia`,
      imagen: original,
    });
  } catch (error) {
    if (error instanceof ErrorPercepcion) return { comprobada: false, motivo: error.message };
    throw error;
  }

  const decision = await decidirCoherencia({
    usuarioId: personaje.ownerId,
    comprobacion: "identidad",
    sujeto: { tipo: "referencia", id: referencia.id, personajeId: personaje.id },
    percepcion: hechosGenerada,
    referencia: { reference_face: hechosOriginal.hechos, generated_view: vista },
  });
  if (!decision.veredicto) return { comprobada: false, motivo: decision.motivo };

  await db()
    .update(characterReferences)
    .set({ identityVerdict: decision.veredicto, identityReason: decision.evidencia })
    .where(eq(characterReferences.id, referencia.id));

  return { comprobada: true, decision, veredicto: decision.veredicto };
}
