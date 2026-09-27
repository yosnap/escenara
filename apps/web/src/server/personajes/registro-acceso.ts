import { db } from "../db/cliente";
import { consentAccessLog } from "../db/esquema";

/**
 * Registro de los accesos de administración a un consentimiento.
 *
 * Quien administra puede abrir el documento de identidad de un tercero: es la capacidad más delicada de la
 * instalación. Decir «solo lo ve el admin» no vale de nada si no se puede comprobar quién lo vio y cuándo, así
 * que cada acceso deja su línea. No guarda el contenido de nada, solo el hecho.
 *
 * Nunca interrumpe la operación: si el registro falla, se anota en el log del servidor y se sigue. Un fallo
 * escribiendo la auditoría no debe impedir revisar un consentimiento, pero tampoco debe pasar desapercibido.
 */

export type AccionDeAcceso = "listado" | "ficha" | "revision";

export async function registrarAccesoAConsentimiento(
  adminId: string,
  personajeId: string | null,
  accion: AccionDeAcceso,
): Promise<void> {
  try {
    await db().insert(consentAccessLog).values({ adminId, characterId: personajeId, action: accion });
  } catch (error) {
    console.error(
      `[personajes] no se ha podido registrar el acceso de administración (${accion}): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Registra **un solo apunte por carga** de la cola de revisión. Uno por personaje llenaría la auditoría de ruido
 * cada vez que alguien entra a mirar si hay trabajo pendiente, y en ese listado no se ve ningún documento: lo que
 * hay que poder auditar es quién abrió el documento de un personaje concreto, y eso lo apunta la ficha.
 */
export const registrarAccesoAListado = (adminId: string) => registrarAccesoAConsentimiento(adminId, null, "listado");
