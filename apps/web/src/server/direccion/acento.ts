import { eq, inArray, sql } from "drizzle-orm";
import { type Acento, NOMBRE_ACENTO } from "@/lib/direccion";
import { ErrorProyecto } from "../asistente/errores";
import type { Ejecutor } from "../db/cliente";
import { type FilaEscena, scenes } from "../db/esquema";

/**
 * **Cambiar el acento de un proyecto** (0.25.1).
 *
 * El acento es del proyecto entero y entra en dos sitios que cuestan dinero: la descripción de voz que se
 * registra en el proveedor y el prompt de cada clip hablado. Cambiarlo deja sin valer lo que salió con el
 * anterior, exactamente igual que cambiar la voz, así que se trata igual: **se dice cuántas escenas pierde, se
 * exige su confirmación y no se regenera ni se borra nada**.
 *
 * Lo que se marca es la escena, no el archivo: el clip y el audio ya están pagados y siguen en la biblioteca de
 * su dueño. Lo que cambia es que la pantalla dice que ya no corresponden a lo que pide el proyecto.
 */

/**
 * Escenas a las que el acento afecta: las que tienen voz, subtítulos o transcripción generados —el acento está
 * en la voz— y las que ya tienen clip producido, porque el personaje lo dijo con el acento anterior.
 *
 * Una escena sin nada generado no está afectada: no hay nada que dejara de valer.
 */
export async function escenasAfectadasPorAcento(tx: Ejecutor, proyectoId: string): Promise<string[]> {
  const escenas: FilaEscena[] = await tx.select().from(scenes).where(eq(scenes.projectId, proyectoId));
  return escenas
    .filter(
      (escena) =>
        escena.voiceMediaId !== null ||
        escena.subtitles.length > 0 ||
        escena.transcript.length > 0 ||
        escena.clipMediaId !== null,
    )
    .map((escena) => escena.id);
}

/**
 * Cambia el acento dentro de la transacción que actualiza el proyecto: primero se exige la confirmación con la
 * cuenta exacta, y después se marca. Si se hiciera al revés, habría un rato en el que la pantalla daría por buena
 * una voz que ya no es la del proyecto.
 *
 * Devuelve cuántas escenas han quedado invalidadas.
 */
export async function aplicarCambioDeAcento(
  tx: Ejecutor,
  proyectoId: string,
  acento: Acento,
  confirmado: boolean,
): Promise<number> {
  const afectadas = await escenasAfectadasPorAcento(tx, proyectoId);
  if (afectadas.length > 0 && !confirmado) {
    const cuantas = afectadas.length;
    throw new ErrorProyecto(
      409,
      `Cambiar el acento a «${NOMBRE_ACENTO[acento]}» deja sin valer la voz o el clip de ${cuantas} ${cuantas === 1 ? "escena que ya está generada" : "escenas que ya están generadas"}: el personaje las dijo con el acento anterior. No se borra nada y no se regenera nada por su cuenta. Confirma el cambio para aplicarlo y luego regenera las escenas que quieras, confirmando su coste.`,
    );
  }
  if (afectadas.length === 0) return 0;
  await tx
    .update(scenes)
    .set({
      voiceInvalidationReason: `El acento de este proyecto ha pasado a ser «${NOMBRE_ACENTO[acento]}». Lo que se generó antes sonaba con otro acento, así que ya no vale: regenéralo cuando quieras, confirmando su coste.`,
      // Un clip ya producido deja de corresponder a lo que la escena pide, igual que al cambiar su duración.
      changedSinceGeneration: sql`${scenes.changedSinceGeneration} or ${scenes.clipMediaId} is not null`,
      updatedAt: new Date(),
    })
    .where(inArray(scenes.id, afectadas));
  return afectadas.length;
}
