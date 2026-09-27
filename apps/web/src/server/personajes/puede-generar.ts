import { eq } from "drizzle-orm";
import { leerAjustes } from "../ajustes";
import { db } from "../db/cliente";
import { characters, type FilaMedio, type FilaPersonaje, type FilaVersionPersonaje, media } from "../db/esquema";
import type { Actor } from "../media/servicio";
import { contarReferencias, efectivo, esUuidPersonaje, ultimoConsentimientoDe } from "./consulta";
import { contextoParaGenerar } from "./contexto";
import { ErrorPersonaje } from "./errores";
import { impedimentosDePersonaje } from "./estado";

/**
 * La puerta de la generación con personaje: **sin consentimiento vigente y sin referencias suficientes no
 * sale nada hacia ningún proveedor**. La comprueba el servidor antes de encolar, no la interfaz, y se vuelve
 * a deducir de los datos en lugar de creerse la columna `characters.state`.
 *
 * Al elegir un personaje se envían **varias referencias** suyas, hasta el máximo que declare el modelo en el
 * catálogo: varias fotos dan mucha mejor guía de identidad que una sola (comparativa del 2026-09-27). Desde
 * 0.15.0 se eligen **las mejores por cobertura de vistas** (una de cada ángulo antes que diez del mismo) y el
 * trabajo cita además la **versión de la ficha**, cuyo texto se añade al prompt como contexto.
 */

export interface PersonajeParaGenerar {
  personaje: FilaPersonaje;
  /** Fotos que se enviarán al proveedor, elegidas por cobertura de vistas. Nunca está vacío. */
  referencias: FilaMedio[];
  /** Versión de la ficha con la que sale el trabajo: es la que se guarda y la que compone el contexto. */
  version: FilaVersionPersonaje;
  /** Bloque de contexto que se añadirá al prompt; vacío si la ficha no dice nada. */
  contexto: string;
}

/**
 * Motivos, en lenguaje llano, por los que el personaje no puede generar ahora mismo. Vacío = puede.
 *
 * Se lee el **último** registro de consentimiento, revocado o no: es la misma lectura que hace la ficha, así
 * que el motivo que se muestra al rechazar un encolado coincide con el que ve el usuario en su personaje. Con
 * el registro vigente a secas, un consentimiento revocado se confundiría con «no hay ninguno».
 */
export async function motivosParaNoGenerar(personajeId: string): Promise<string[]> {
  const { minimoReferenciasPersonaje: minimo } = await leerAjustes();
  const [consentimiento, referencias] = await Promise.all([
    ultimoConsentimientoDe(personajeId),
    contarReferencias(personajeId),
  ]);
  return impedimentosDePersonaje({
    consentimiento: efectivo(consentimiento),
    referencias,
    minimoReferencias: minimo,
  });
}

/** `true` si el personaje puede usarse para generar ahora mismo. */
export async function puedeGenerarCon(personajeId: string): Promise<boolean> {
  return (await motivosParaNoGenerar(personajeId)).length === 0;
}

/** Lanza 409 con el motivo exacto si el personaje no puede generar. Es la puerta que usan `/crear` y la cola. */
export async function exigirPersonajeUsable(personajeId: string, nombre: string): Promise<void> {
  const motivos = await motivosParaNoGenerar(personajeId);
  if (motivos.length > 0) {
    throw new ErrorPersonaje(409, `«${nombre}» no se puede usar para generar todavía. ${motivos.join(" ")}`);
  }
}

/** Personaje propio, sin juzgar todavía si puede generar: eso lo decide el motor de controles (0.18.0). */
export async function personajePropio(actor: Actor, personajeId: unknown): Promise<FilaPersonaje> {
  if (!esUuidPersonaje(personajeId)) throw new ErrorPersonaje(400, "Elige un personaje.");
  const [personaje] = await db().select().from(characters).where(eq(characters.id, personajeId)).limit(1);
  // Lo ajeno responde 404 igual que en la biblioteca: no se revela que existe.
  if (!personaje || personaje.ownerId !== actor.id) throw new ErrorPersonaje(404, "El personaje no existe.");
  return personaje;
}

/**
 * Referencias, versión y contexto con los que se va a generar: las mejores por cobertura de vistas,
 * recortadas a lo que admite el modelo.
 *
 * **No comprueba si el personaje puede generar.** Desde 0.18.0 eso es una regla del motor de controles
 * (`server/controles/motor.ts › consentimiento`), que se evalúa **antes** de llamar aquí: tener la regla en dos
 * sitios es tenerla en ninguno, porque acabarían divergiendo. Quien llame sin haber pasado por el motor se lo
 * encuentra en la puerta del encolado, que exige todos los grupos de hechos resueltos.
 */
export async function referenciasParaGenerar(
  personaje: FilaPersonaje,
  maximoDelModelo: number,
): Promise<PersonajeParaGenerar> {
  // Versión vigente, contexto y las mejores referencias por cobertura, recortadas al tope del modelo. Solo
  // entran las utilizables: una referencia en la papelera no se envía a ningún proveedor.
  const { version, contexto, referencias: elegidas } = await contextoParaGenerar(personaje, maximoDelModelo);
  const filas = await Promise.all(
    elegidas.map(async (mediaId) => {
      const [fila] = await db().select().from(media).where(eq(media.id, mediaId)).limit(1);
      return fila ?? null;
    }),
  );
  const referencias = filas.filter((fila): fila is FilaMedio => fila !== null && fila.deletedAt === null);
  if (referencias.length === 0) {
    throw new ErrorPersonaje(409, "Las fotos de referencia de este personaje ya no están disponibles.");
  }
  return { personaje, referencias, version, contexto };
}
