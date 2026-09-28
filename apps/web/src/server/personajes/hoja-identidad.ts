import { eq } from "drizzle-orm";
import type { TrabajoVista } from "@/lib/generacion";
import { db } from "../db/cliente";
import { characters } from "../db/esquema";
import { AVISO_HOJA_IDENTIDAD, motivoSinHoja, promptHojaIdentidad } from "../direccion/hoja-identidad";
import { HERRAMIENTAS, type Herramientas } from "../generacion/herramientas";
import { crearFotograma } from "../generacion/servicio";
import type { Actor } from "../media/servicio";
import { claveDerivada } from "../produccion/producir";
import { contarReferencias, filaPropia } from "./consulta";
import { ErrorPersonaje } from "./errores";

/**
 * Genera la **hoja de identidad 3×3** de un personaje: una imagen con nueve retratos suyos desde ángulos y
 * expresiones distintas, hecha a partir de sus fotos de referencia.
 *
 * Pasa por **el mismo camino de dinero que todo lo demás**: `crearFotograma` estima, exige la confirmación de
 * créditos, el sello del precio, la clave de idempotencia, el motor de controles y la reserva. Aquí no hay
 * ningún atajo, y por eso este fichero es tan corto: lo único propio es el prompt y dónde se guarda.
 *
 * La hoja nace **candidata** y no se usa por defecto (decisión firme del propietario, 2026-09-28): primero se
 * compara con las vistas sueltas en el panel de coherencia, y solo si gana y el propietario lo aprueba pasa a
 * ser la referencia del personaje.
 */

export interface ConfirmacionHoja {
  creditosConfirmados: number;
  derechos: boolean;
  claveIdempotencia: string;
  selloEstimacion?: string;
  modelo?: string;
  avisoUmbralAceptado?: boolean;
  avisosConfirmados?: string[];
}

/** Fotos mínimas para que la hoja tenga de dónde sacar los nueve ángulos. Con menos sale una cara inventada. */
export const REFERENCIAS_MINIMAS_HOJA = 3;

export async function generarHojaDeIdentidad(
  actor: Actor,
  id: unknown,
  confirmacion: ConfirmacionHoja,
  h: Herramientas = HERRAMIENTAS,
): Promise<{ trabajo: TrabajoVista; aviso: string }> {
  const personaje = await filaPropia(actor, id);
  const referencias = await contarReferencias(personaje.id);
  const motivo = motivoSinHoja(referencias, REFERENCIAS_MINIMAS_HOJA);
  if (motivo !== "") throw new ErrorPersonaje(409, motivo);

  const envio = await crearFotograma(
    actor,
    {
      // El prompt de la hoja lo compone el servidor: el usuario no escribe nada aquí.
      prompt: promptHojaIdentidad(personaje.description.trim()),
      personajeId: personaje.id,
      derechos: confirmacion.derechos,
      creditosConfirmados: confirmacion.creditosConfirmados,
      // La clave se deriva del personaje: repetir el clic no encarga dos hojas.
      claveIdempotencia: claveDerivada(confirmacion.claveIdempotencia, "hoja-identidad", personaje.id),
      ...(confirmacion.selloEstimacion === undefined ? {} : { selloEstimacion: confirmacion.selloEstimacion }),
      ...(confirmacion.modelo === undefined ? {} : { modelo: confirmacion.modelo }),
      ...(confirmacion.avisoUmbralAceptado === undefined
        ? {}
        : { avisoUmbralAceptado: confirmacion.avisoUmbralAceptado }),
      ...(confirmacion.avisosConfirmados === undefined ? {} : { avisosConfirmados: confirmacion.avisosConfirmados }),
    },
    h,
  );
  return { trabajo: envio.trabajo, aviso: AVISO_HOJA_IDENTIDAD };
}

/**
 * Deja la hoja ya generada como la del personaje, en estado `candidata`.
 *
 * Lo llama quien recoge el resultado del trabajo. **Siempre `candidata`**, nunca otro estado: ascenderla es
 * una decisión del propietario con la métrica delante, no una consecuencia de haberla generado.
 */
export async function guardarHojaDeIdentidad(personajeId: string, medioId: string): Promise<void> {
  await db()
    .update(characters)
    .set({ identitySheetMediaId: medioId, identitySheetStatus: "candidata", updatedAt: new Date() })
    .where(eq(characters.id, personajeId));
}
