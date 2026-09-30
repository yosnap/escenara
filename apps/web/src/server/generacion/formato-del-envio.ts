import { esSeleccionable, type ModeloVista } from "@/lib/catalogo";
import { modeloAnimaLaProporcion, motivoFormatoDelFotograma } from "@/lib/formatos";
import { motivoIncompatible } from "@/lib/presets";
import type { OpcionDeGeneracion } from "../mapa/generacion";
import type { PromptCompuesto } from "../prompts/render";
import { cargarCatalogo } from "../proveedores/catalogo";
import { ErrorGeneracion } from "./errores";

/**
 * **Formato del envío** (0.41.0): en qué proporción se le pide la pieza al modelo y a qué reservas se puede relevar.
 *
 * La proporción sale, por este orden, de lo que fija el servidor (el formato principal de un proyecto) o del preset
 * de formato elegido en la botonera («Reels · TikTok · Stories (9:16)», «YouTube · horizontal (16:9)»…). Sin
 * ninguno de los dos no se elige nada y manda la del modelo, como hasta ahora.
 *
 * Dos reglas duras, las dos antes de reservar nada:
 *
 * - **un modelo que no admite la proporción no la recibe**: se rechaza con su motivo (la misma función que
 *   deshabilita la opción en la pantalla), en lugar de dejar que el adaptador mande otra en silencio;
 * - **las reservas que no la admiten no se guardan**: un relevo automático nunca puede cambiar el formato que se
 *   pidió.
 */

/** Proporción que se pide en este envío, ya comprobada contra el modelo. `null` = la del modelo, sin elegir. */
export function proporcionDelEnvio(
  fijada: string | undefined,
  compuesto: PromptCompuesto | null,
  modelo: ModeloVista,
): string | null {
  const proporcion = fijada ?? compuesto?.proporcion ?? null;
  if (proporcion === null) return null;
  const motivo = motivoIncompatible(
    { proporcion, segundos: null },
    { nombre: modelo.nombre, proporciones: modelo.parametros.proporciones, duraciones: [] },
  );
  if (motivo) {
    throw new ErrorGeneracion(
      409,
      `${motivo} Elige un formato que admita o cambia de modelo. No se ha enviado nada ni se te ha cobrado.`,
    );
  }
  return proporcion;
}

/** Nombres de los modelos de vídeo que se pueden elegir y animan esa proporción sin recortar. */
export async function modelosQueAnimanLaProporcion(proporcion: string): Promise<string[]> {
  const { modelos } = await cargarCatalogo();
  return modelos
    .filter(
      (m) =>
        m.capacidades.includes("image_to_video") &&
        esSeleccionable(m.estado) &&
        m.precio !== null &&
        modeloAnimaLaProporcion(m.parametros.proporciones, proporcion),
    )
    .map((m) => m.nombre);
}

/**
 * Exige que el modelo de vídeo pueda animar el fotograma **generado** del que sale el clip; si no, dice las salidas
 * posibles. La regla es la misma que usa el aviso de «Crear» (`lib/formatos.ts › motivoFormatoDelFotograma`), así
 * que la pantalla y el servidor no pueden decir cosas distintas. Una imagen propia no pasa por aquí: se envía como
 * siempre y el modelo la encaja.
 */
export async function exigirFormatoDelFotograma(
  proporcionDelFotograma: string | null,
  proporcionDelClip: string | null,
  modelo: ModeloVista,
): Promise<void> {
  const conProporciones = { nombre: modelo.nombre, proporciones: modelo.parametros.proporciones };
  if (motivoFormatoDelFotograma(proporcionDelFotograma, proporcionDelClip, conProporciones) === null) return;
  const alternativas = await modelosQueAnimanLaProporcion(proporcionDelFotograma ?? "");
  const motivo = motivoFormatoDelFotograma(proporcionDelFotograma, proporcionDelClip, conProporciones, alternativas);
  if (motivo) throw new ErrorGeneracion(409, `${motivo} No se ha enviado ni reservado nada, y no se te ha cobrado.`);
}

/**
 * Reservas autorizadas que se guardan con el trabajo: a dónde puede relevarse si el proveedor rechaza la
 * petición **probando que no ha cobrado**, y con qué tope en la moneda de cada uno. Sin esto, el worker no
 * podría cambiar de proveedor sin gastar más de lo que el usuario tenía delante (`cola/despacho.ts`).
 *
 * Con una proporción elegida, solo las que la admiten: el relevo cambia de proveedor, no de formato.
 */
export const reservasGuardadas = (reservas: readonly OpcionDeGeneracion[], proporcion: string | null = null) => {
  const validas = reservas.filter(
    (r) => proporcion === null || r.eleccion.modelo.parametros.proporciones.includes(proporcion),
  );
  return validas.length === 0
    ? {}
    : {
        reservas: validas.map((r) => ({
          proveedor: r.eleccion.modelo.proveedor,
          compatibleId: r.entrada.compatibleId,
          modelo: r.eleccion.modelo.modelo,
          creditos: r.creditos,
          urlBase: "",
        })),
      };
};
