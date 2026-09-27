import { eq } from "drizzle-orm";
import { leerAjustes } from "../ajustes";
import { db } from "../db/cliente";
import { characters, type FilaMedio, type FilaPersonaje, media } from "../db/esquema";
import type { Actor } from "../media/servicio";
import {
  contarReferencias,
  efectivo,
  esUuidPersonaje,
  mediosDeReferenciaVigentes,
  ultimoConsentimientoDe,
} from "./consulta";
import { ErrorPersonaje } from "./errores";
import { impedimentosDePersonaje } from "./estado";

/**
 * La puerta de la generación con personaje: **sin consentimiento vigente y sin referencias suficientes no
 * sale nada hacia ningún proveedor**. La comprueba el servidor antes de encolar, no la interfaz, y se vuelve
 * a deducir de los datos en lugar de creerse la columna `characters.state`.
 *
 * Al elegir un personaje se envían **varias referencias** suyas, hasta el máximo que declare el modelo en el
 * catálogo: varias fotos dan mucha mejor guía de identidad que una sola (comparativa del 2026-09-27). La
 * ficha textual como contexto llega en la 0.15.0.
 */

export interface PersonajeParaGenerar {
  personaje: FilaPersonaje;
  /** Fotos que se enviarán al proveedor, en el orden que fijó el usuario. Nunca está vacío. */
  referencias: FilaMedio[];
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

/**
 * Personaje propio listo para generar, con sus referencias ya resueltas y recortadas a lo que admite el
 * modelo. Lanza con el motivo exacto si no puede: es lo que ve quien lo pidió.
 *
 * `maximoDelModelo` es `parametros.maximoReferencias` del catálogo. Un modelo que no declare referencias
 * (0) no puede recibir un personaje: se dice y no se envía nada.
 */
export async function personajeParaGenerar(
  actor: Actor,
  personajeId: unknown,
  maximoDelModelo: number,
): Promise<PersonajeParaGenerar> {
  if (!esUuidPersonaje(personajeId)) throw new ErrorPersonaje(400, "Elige un personaje.");
  const [personaje] = await db().select().from(characters).where(eq(characters.id, personajeId)).limit(1);
  // Lo ajeno responde 404 igual que en la biblioteca: no se revela que existe.
  if (!personaje || personaje.ownerId !== actor.id) throw new ErrorPersonaje(404, "El personaje no existe.");

  await exigirPersonajeUsable(personaje.id, personaje.name);
  // Solo las utilizables y en su orden: una referencia en la papelera no se envía a ningún proveedor.
  const idsVigentes = await mediosDeReferenciaVigentes(personaje.id);
  if (maximoDelModelo < 1) {
    throw new ErrorPersonaje(
      400,
      "El modelo elegido no acepta fotos de referencia, así que no se puede usar con un personaje. Elige otro modelo.",
    );
  }

  // Las fotos se leen en el mismo orden que las referencias y se recortan al tope del modelo.
  const filas = await Promise.all(
    idsVigentes.slice(0, maximoDelModelo).map(async (mediaId) => {
      const [fila] = await db().select().from(media).where(eq(media.id, mediaId)).limit(1);
      return fila ?? null;
    }),
  );
  const referencias = filas.filter((fila): fila is FilaMedio => fila !== null && fila.deletedAt === null);
  if (referencias.length === 0) {
    throw new ErrorPersonaje(409, "Las fotos de referencia de este personaje ya no están disponibles.");
  }
  return { personaje, referencias };
}
