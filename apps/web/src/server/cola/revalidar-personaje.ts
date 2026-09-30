import { sql } from "drizzle-orm";
import type { ModeloVista } from "@/lib/catalogo";
import { hechosDePersonajeCitado, parametrosDeControles } from "../controles/hechos";
import { frenosQueGatean } from "../controles/motor";
import { evaluarRegistrando, mensajeDeFreno } from "../controles/puerta";
import { db } from "../db/cliente";
import type { FilaTrabajo } from "../db/esquema";
import { declaracionVigente } from "../lugares/consulta";

/** `true` si la escena del trabajo sigue existiendo en el proyecto con el que se encoló. */
async function escenaDelProyectoViva(fila: FilaTrabajo): Promise<boolean> {
  if (!fila.sceneId || !fila.projectId) return false;
  const filas = (await db().execute(
    sql`select 1 from scenes where id = ${fila.sceneId} and project_id = ${fila.projectId} limit 1`,
  )) as unknown as unknown[];
  return filas.length > 0;
}

/** Motivo con el que se cierra un trabajo que no se puede enviar. */
type MotivoFalloTrabajo = NonNullable<FilaTrabajo["failureReason"]>;

/**
 * El personaje del trabajo ya no puede generar (consentimiento revocado o rechazado, referencias por debajo
 * del mínimo, o un modelo que dejó de aceptar referencias). No es reintentable: el trabajo se cierra sin coste.
 */
export class ErrorPersonajeNoUsable extends Error {
  constructor(
    mensaje: string,
    readonly motivo: MotivoFalloTrabajo = "consentimiento",
  ) {
    super(mensaje);
    this.name = "ErrorPersonajeNoUsable";
  }
}

/**
 * Revalida el personaje de un trabajo justo antes de mandarlo al proveedor, con las reglas del motor, y **guarda
 * esa decisión** como cualquier otra. Lanza {@link ErrorPersonajeNoUsable} si ya no puede generar.
 */
export async function revalidarPersonajeDelTrabajo(fila: FilaTrabajo, modelo: ModeloVista): Promise<void> {
  // Un trabajo de un proyecto que se ha borrado (su escena ya no está) no sale: se cierra sin cobro.
  if (fila.projectId && !(await escenaDelProyectoViva(fila))) {
    throw new ErrorPersonajeNoUsable(
      "El proyecto de este trabajo se ha borrado, así que no se ha enviado nada y no se te ha cobrado.",
      "cancelado",
    );
  }
  // ── Reevaluación de los controles previos, **antes** de subir nada. El encolado los evaluó, pero entre
  // encolar y enviar el usuario puede haber revocado el consentimiento o borrado fotos, y en un reintento puede
  // haber pasado más rato todavía. Sin esto, revocar no impediría que la cara saliera hacia el proveedor: solo
  // impediría pedir trabajos nuevos, que es la mitad de la regla.
  //
  // Se reevalúan las reglas que **pueden haber cambiado sin que el usuario pida nada** y que se pueden decidir
  // con lo que hay en la fila: el consentimiento del personaje y si el modelo sigue aceptando referencias. Las
  // de dinero no: su reserva ya está apartada desde el encolado, y volver a compararlas aquí rechazaría un
  // trabajo por su propia reserva.
  // Una pista de voz no lleva personaje ni referencias, así que no hay nada que revalidar: sus reglas son las del
  // dinero, y esas ya se decidieron al encolar con su reserva apartada.
  if (fila.characterId && fila.kind !== "voz") {
    const freno = frenosQueGatean(
      // Es una decisión del motor como cualquier otra: se guarda con su evidencia, pase o no pase.
      await evaluarRegistrando(
        {
          usuarioId: fila.userId,
          sujeto: fila.sceneId ? "escena" : "trabajo",
          sujetoId: fila.sceneId ?? fila.id,
          tipo: fila.kind,
        },
        {
          tipo: fila.kind,
          parametros: await parametrosDeControles(),
          /**
           * Si la ficha del personaje ya no está, esto bloquea en lugar de dejar pasar. Y el **primer retrato de
           * un personaje inventado** (0.22.0) se revalida sin exigirle las fotos que todavía no tiene. Una vista
           * sintética de un inventado también puede completar su mínimo desde el maestro ya aprobado.
           */
          personaje: await hechosDePersonajeCitado(fila.characterId, {
            primerRetrato: (fila.input as { retratoInventado?: unknown }).retratoInventado === true,
            vistaSintetica: (fila.input as { vistaSintetica?: unknown }).vistaSintetica !== undefined,
          }),
          modelo: {
            nombre: modelo.nombre,
            maximoReferencias: modelo.parametros.maximoReferencias,
            // El precio y la acotación se decidieron al encolar y su reserva ya está apartada: volver a
            // juzgarlos aquí rechazaría el trabajo por su propio apartado.
            precioComprobado: "",
            precioCaducado: false,
            costeAcotado: true,
            motivoSinAcotar: "",
          },
        },
      ),
    )[0];
    if (freno) {
      throw new ErrorPersonajeNoUsable(
        `${mensajeDeFreno(freno)} No se ha enviado nada y no se te ha cobrado.`,
        freno.regla === "consentimiento" ? "consentimiento" : "interno",
      );
    }
  }
  /**
   * El **lugar** también se revalida, como el consentimiento: revocar su declaración o borrarlo impide generar con él
   * desde ese momento, también lo que ya estaba en la cola. Un trabajo que se pidió con lugar (`place_version`) y ya no
   * lo tiene es que el lugar se ha borrado. Lo generado antes se conserva.
   */
  if (fila.kind !== "voz" && fila.placeVersion !== null) {
    if (!fila.placeId) {
      throw new ErrorPersonajeNoUsable(
        "El lugar con el que pediste este trabajo se ha borrado, así que ya no se genera con él. No se ha enviado nada y no se te ha cobrado: vuelve a pedirlo con otro lugar o sin lugar.",
      );
    }
    if (!(await declaracionVigente(fila.placeId))) {
      throw new ErrorPersonajeNoUsable(
        "La declaración de derechos del lugar se ha revocado desde que pediste el trabajo, así que ya no se genera con él. No se ha enviado nada y no se te ha cobrado: vuelve a declararla en la ficha del lugar o quítalo de la escena.",
      );
    }
  }
}
