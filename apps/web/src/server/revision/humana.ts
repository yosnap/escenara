import { REGLAS_VERSION } from "@/lib/controles";
import {
  type AccionRevision,
  MOTIVO_MAXIMO,
  MOTIVO_MINIMO,
  type SeveridadRevision,
  type VeredictoRevision,
} from "@/lib/revision";
import { escenaPropia } from "../asistente/consulta";
import { ErrorProyecto } from "../asistente/errores";
import { db } from "../db/cliente";
import type { Actor } from "../media/servicio";
import { clipDeEscena } from "./ejecutar";
import { cerrarCriticosHumanos, exigirClipVigente, guardarRevision } from "./resultados";

/**
 * Revisión **humana** de una escena (RF07): la única que valida la identidad del personaje.
 *
 * Tres acciones, cada una con su fila propia:
 *
 * - `aceptar`: esta escena vale. Cierra también los críticos que marcó una persona antes, porque el crítico era
 *   suyo; los críticos **técnicos** de la comprobación automática no se cierran así, y por eso la lectura los
 *   sigue contando: un clip que dura otra cosa no deja de durarla porque alguien lo acepte;
 * - `rechazar`: no vale, con el motivo. Avisa, pero no bloquea la exportación: quien rechaza puede regenerar;
 * - `marcar-critico`: no vale **y no se exporta** hasta que se resuelva. Es la decisión más cara de las tres, así
 *   que exige motivo igual que rechazar.
 *
 * Quien revisa es el dueño del proyecto: `escenaPropia` responde 404 para una escena ajena, también para quien
 * administra (decisión provisional del propietario, 2026-09-27).
 */

const RESULTADO: Record<AccionRevision, { severidad: SeveridadRevision; veredicto: VeredictoRevision }> = {
  aceptar: { severidad: "informativa", veredicto: "acepta" },
  rechazar: { severidad: "aviso", veredicto: "rechaza" },
  "marcar-critico": { severidad: "critica", veredicto: "rechaza" },
};

/** Rechazar o marcar como crítico **exige motivo**: «no me gusta» no dice qué arreglar. Aceptar no lo necesita. */
export function exigirMotivo(accion: AccionRevision, motivo: string): string {
  const limpio = motivo.trim();
  if (accion === "aceptar") return limpio.slice(0, MOTIVO_MAXIMO);
  if (limpio.length < MOTIVO_MINIMO) {
    throw new ErrorProyecto(
      400,
      `Escribe qué falla en esta escena, con al menos ${MOTIVO_MINIMO} caracteres: sin el motivo, nadie sabrá qué arreglar.`,
    );
  }
  if (limpio.length > MOTIVO_MAXIMO) {
    throw new ErrorProyecto(400, `El motivo no puede pasar de ${MOTIVO_MAXIMO} caracteres.`);
  }
  return limpio;
}

/** Apunta la decisión de la persona que ha mirado el clip. */
export async function revisarAMano(
  actor: Actor,
  escenaId: unknown,
  accion: AccionRevision,
  motivo: string,
): Promise<void> {
  const { escena } = await escenaPropia(actor, escenaId);
  // Sin clip no hay nada que revisar: aceptar una escena que todavía no existe sería un visto bueno vacío que
  // además cerraría la puerta de la exportación por la vía de atrás.
  const clip = await clipDeEscena(escena);
  const notas = exigirMotivo(accion, motivo);
  const { severidad, veredicto } = RESULTADO[accion];
  /**
   * Las dos escrituras van en **una sola transacción con la escena bloqueada**: guardar la decisión y retirar los
   * críticos que cierra son la misma decisión del usuario, y separarlas dejaría una ventana en la que la escena
   * aparece aceptada y todavía bloqueada (o al revés). El cerrojo comprueba además que el clip revisado siga
   * siendo el de la escena, así que una regeneración a mitad tira la revisión con su motivo en lugar de aprobar
   * un vídeo que nadie ha visto.
   */
  await db().transaction(async (tx) => {
    await exigirClipVigente(tx, escena.id, clip.id);
    await guardarRevision(
      {
        escenaId: escena.id,
        trabajoId: escena.clipJobId,
        clipMedioId: clip.id,
        tipo: "humana",
        severidad,
        veredicto,
        // Una revisión humana no mide nada: lo medido es de la automática y se muestra al lado, no se copia aquí.
        comprobaciones: [],
        revisorId: actor.id,
        notas,
        creditos: null,
        reglasVersion: REGLAS_VERSION,
      },
      tx,
    );
    // Aceptar cierra los críticos que marcó una persona: eran suyos y los retira. Los técnicos siguen en pie.
    if (accion === "aceptar") await cerrarCriticosHumanos(escena.id, tx);
  });
}
