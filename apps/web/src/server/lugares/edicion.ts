import { and, eq } from "drizzle-orm";
import { bloqueDeEstiloAnimado } from "@/lib/animados";
import type { TrabajoVista } from "@/lib/generacion";
import { db } from "../db/cliente";
import type { FilaTrabajo } from "../db/esquema";
import { placeReferences } from "../db/esquema-lugares";
import { claveDerivada } from "../generacion/comprobaciones";
import { HERRAMIENTAS, type Herramientas } from "../generacion/herramientas";
import { crearFotograma } from "../generacion/servicio";
import type { Actor } from "../media/servicio";
import { filaPropia, siguienteOrden } from "./consulta";
import { revocarPorCambioDeFotos } from "./declaracion";
import { ErrorLugar } from "./errores";
import { nuevaVersionDeLugar } from "./versiones";

/**
 * **Fotos generadas de un lugar**, por el mismo camino de dinero que todo lo demás (`crearFotograma`: estimación,
 * confirmación del coste, sello, idempotencia, motor de controles y reserva). Dos usos:
 *
 * - **retirar personas** de una foto real: la gente reconocible no se pixela (el generador copia el pixelado en el
 *   fotograma, medido con dinero real), se quita con una edición de imagen y se vuelve a mirar el resultado;
 * - **un candidato** del maestro de un lugar animado, desde su descripción y su estilo, sin foto de partida.
 *
 * El resultado entra en el lugar al cerrarse el trabajo, como foto **generada**. No sustituye a nada por su cuenta:
 * la retirada ocupa el sitio de la maestra solo si la foto de partida era la maestra, y un candidato no es maestro
 * hasta que el usuario lo aprueba marcándolo como maestra.
 */

export interface EdicionDeLugar {
  lugarId: string;
  tipo: "retirar_personas" | "candidato";
  /** Foto de la que se retiran las personas; ausente en un candidato. */
  referenciaId?: string;
}

export interface ConfirmacionEdicion {
  creditosConfirmados: number;
  derechos: boolean;
  claveIdempotencia: string;
  selloEstimacion?: string;
  modelo?: string;
  avisoUmbralAceptado?: boolean;
  avisosConfirmados?: string[];
}

/** Lo que se le pide al modelo al retirar a la gente. Inglés de prompt: el usuario no lo ve nunca (ADR-0022). */
export const PROMPT_RETIRAR_PERSONAS =
  "Remove every person from this photograph, including anyone in the foreground or the middle distance and any partial body. Rebuild what was behind them so the place looks exactly as it would without people: the same walls, floor, furniture, light and shadows. Change nothing else: the same framing, the same camera, the same light and the same colours. Do not add any person, text or logo.";

const confirmacionComun = (c: ConfirmacionEdicion) => ({
  derechos: c.derechos,
  creditosConfirmados: c.creditosConfirmados,
  ...(c.selloEstimacion === undefined ? {} : { selloEstimacion: c.selloEstimacion }),
  ...(c.modelo === undefined ? {} : { modelo: c.modelo }),
  ...(c.avisoUmbralAceptado === undefined ? {} : { avisoUmbralAceptado: c.avisoUmbralAceptado }),
  ...(c.avisosConfirmados === undefined ? {} : { avisosConfirmados: c.avisosConfirmados }),
});

/** Encarga la retirada de las personas de una foto del lugar. Coste confirmado: es una edición de imagen. */
export async function retirarPersonas(
  actor: Actor,
  lugarId: unknown,
  referenciaId: unknown,
  confirmacion: ConfirmacionEdicion,
  h: Herramientas = HERRAMIENTAS,
): Promise<TrabajoVista> {
  const lugar = await filaPropia(actor, lugarId);
  if (lugar.renderStyle !== "realista") {
    throw new ErrorLugar(
      409,
      "Retirar personas es para las fotos de un lugar real; un lugar animado no tiene gente de verdad.",
    );
  }
  if (typeof referenciaId !== "string" || referenciaId === "")
    throw new ErrorLugar(400, "Di de qué foto retirar a la gente.");
  const [referencia] = await db()
    .select()
    .from(placeReferences)
    .where(and(eq(placeReferences.id, referenciaId), eq(placeReferences.placeId, lugar.id)))
    .limit(1);
  if (!referencia) throw new ErrorLugar(404, `Esa foto no es de «${lugar.name}».`);
  const envio = await crearFotograma(
    actor,
    {
      prompt: PROMPT_RETIRAR_PERSONAS,
      // El usuario ve lo que ha pedido, en castellano; el prompt en inglés se queda en el servidor (ADR-0022).
      escenaVisible: `Retirar a las personas de una foto de «${lugar.name}».`,
      medioId: referencia.mediaId,
      edicionDeLugar: { lugarId: lugar.id, tipo: "retirar_personas", referenciaId: referencia.id },
      // La clave se deriva de la foto: repetir el clic no encarga dos ediciones.
      claveIdempotencia: claveDerivada(confirmacion.claveIdempotencia, "retirar-personas", referencia.id),
      ...confirmacionComun(confirmacion),
    },
    h,
  );
  return envio.trabajo;
}

/** Encarga un candidato del maestro de un lugar animado, desde su descripción y su estilo. */
export async function candidatoAnimado(
  actor: Actor,
  lugarId: unknown,
  confirmacion: ConfirmacionEdicion,
  h: Herramientas = HERRAMIENTAS,
): Promise<TrabajoVista> {
  const lugar = await filaPropia(actor, lugarId);
  if (lugar.renderStyle !== "animado") {
    throw new ErrorLugar(
      409,
      "Los candidatos generados son para un lugar animado. Un lugar real se hace con tus fotos.",
    );
  }
  if (lugar.description.trim().length < 12) {
    throw new ErrorLugar(409, "Describe el lugar en la ficha (qué hay, colores, luz) antes de generar un candidato.");
  }
  const envio = await crearFotograma(
    actor,
    {
      // Castellano del usuario y guía de estilo: el servidor lo traduce como cualquier otra descripción.
      prompt: `Plano general de este lugar, vacío y sin nadie: ${lugar.description.trim()} ${bloqueDeEstiloAnimado(lugar.styleGuide)}`,
      edicionDeLugar: { lugarId: lugar.id, tipo: "candidato" },
      claveIdempotencia: claveDerivada(confirmacion.claveIdempotencia, "candidato-lugar", lugar.id),
      ...confirmacionComun(confirmacion),
    },
    h,
  );
  return envio.trabajo;
}

/**
 * Al cerrarse un trabajo de edición o de candidato, su resultado entra en el lugar como foto **generada**. Si era la
 * retirada de personas de la maestra, la foto nueva pasa a ser la maestra y la original queda como plano general.
 * Cambiar las fotos retira la declaración y crea versión, como cualquier otro cambio de fotos.
 */
export async function adjuntarAlLugar(fila: FilaTrabajo, medioId: string): Promise<void> {
  const edicion = (fila.input as { edicionDeLugar?: EdicionDeLugar }).edicionDeLugar;
  if (!edicion?.lugarId) return;
  try {
    const lugar = await filaPropia({ id: fila.userId }, edicion.lugarId);
    await db().transaction(async (tx) => {
      const [origen] = edicion.referenciaId
        ? await tx
            .select()
            .from(placeReferences)
            .where(and(eq(placeReferences.id, edicion.referenciaId), eq(placeReferences.placeId, lugar.id)))
            .limit(1)
        : [];
      const esMaestra = origen?.kind === "maestra";
      if (esMaestra && origen)
        await tx.update(placeReferences).set({ kind: "general" }).where(eq(placeReferences.id, origen.id));
      await tx
        .insert(placeReferences)
        .values({
          placeId: lugar.id,
          mediaId: medioId,
          kind: esMaestra ? "maestra" : "general",
          origin: "vista_generada",
          sortOrder: await siguienteOrden(lugar.id),
        })
        .onConflictDoNothing({ target: [placeReferences.placeId, placeReferences.mediaId] });
      await revocarPorCambioDeFotos(tx, lugar.id);
      await nuevaVersionDeLugar(tx, lugar.id, fila.userId, [
        edicion.tipo === "retirar_personas" ? "personas retiradas" : "candidato generado",
      ]);
    });
  } catch (error) {
    // El lugar pudo borrarse mientras se generaba: el resultado se queda en la biblioteca, sin lugar al que ir.
    console.warn(`[lugares] el resultado del trabajo ${fila.id} no se ha podido adjuntar a su lugar:`, error);
  }
}
