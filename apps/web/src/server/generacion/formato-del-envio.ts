import type { ModeloVista } from "@/lib/catalogo";
import { motivoIncompatible } from "@/lib/presets";
import type { OpcionDeGeneracion } from "../mapa/generacion";
import type { PromptCompuesto } from "../prompts/render";
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

/**
 * Un clip que parte de un fotograma en una proporción que el modelo de vídeo **no admite** (p. ej. 4:5 con Veo, que
 * solo hace 9:16 y 16:9) no se envía con la del modelo sin más: se avisa y se ofrecen las posibles. Si el usuario
 * ya ha elegido una de ellas para el clip, sigue: lo ha decidido él, no se recorta en silencio.
 */
export function exigirFormatoDelFotograma(
  proporcionDelFotograma: string | null,
  proporcionDelClip: string | null,
  modelo: ModeloVista,
): void {
  const admitidas = modelo.parametros.proporciones;
  if (proporcionDelFotograma === null || proporcionDelClip !== null || admitidas.length === 0) return;
  if (admitidas.includes(proporcionDelFotograma)) return;
  throw new ErrorGeneracion(
    409,
    `El fotograma está en ${proporcionDelFotograma} y ${modelo.nombre} solo hace clips en ${admitidas.join(" o ")}. Elige en el formato del clip uno de esos: el modelo encajará el fotograma en él, y Escenara no lo recorta por su cuenta. No se ha enviado nada ni se te ha cobrado.`,
  );
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
