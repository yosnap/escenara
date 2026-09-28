import { type AnguloVista, CATEGORIA_ANGULO } from "@/lib/anuncio";
import type { PresetVista } from "@/lib/presets";
import { listarPresets } from "../prompts/consulta";
import { ErrorAnuncio } from "./errores";

/**
 * El **catálogo de los doce ángulos** del anuncio, leído de los presets de la categoría `angulo-anuncio`.
 *
 * Está aquí y no en `lib/` porque es una lectura de la base de datos: el catálogo lo **amplía quien administra**
 * (decisión del propietario, 2026-09-28) y está versionado como el resto de los presets, así que la lista de
 * ángulos válidos de hoy no es una constante del código.
 *
 * Solo se miran los presets **de la instalación**: un usuario no crea ángulos propios, porque entonces Jev no
 * tendría una definición de referencia con la que comprobar el guion. Lo impide además `duplicarPreset`.
 *
 * Los presets **desactivados** no se ofrecen y no se pueden elegir, pero un brief que ya guardó su clave sigue
 * leyéndose: lo que se generó con ese ángulo no deja de ser cierto porque quien administra lo retire del catálogo.
 */

const vistaDeAngulo = (preset: PresetVista): AnguloVista => ({
  clave: preset.clave,
  nombre: preset.nombre,
  definicion: preset.descripcion,
  porDondeEntra: preset.valores.porDondeEntra ?? "",
  ejemplo: preset.valores.ejemplo ?? "",
  exigeDeclaracion: preset.valores.exigeDeclaracion === true,
});

/** Los ángulos **elegibles**: los de la instalación que están activos, en el orden del catálogo. */
export async function listarAngulos(): Promise<AnguloVista[]> {
  const presets = await listarPresets({ categoria: CATEGORIA_ANGULO });
  return presets.filter((p) => p.activo).map(vistaDeAngulo);
}

/**
 * Un ángulo por su clave, activo o no. `null` cuando esa clave no está en el catálogo: es lo que necesita quien
 * **lee** un brief guardado, que no puede fallar porque el preset se haya desactivado o borrado.
 */
export async function buscarAngulo(clave: string): Promise<AnguloVista | null> {
  if (clave === "") return null;
  const presets = await listarPresets({ categoria: CATEGORIA_ANGULO });
  const preset = presets.find((p) => p.clave === clave);
  return preset ? vistaDeAngulo(preset) : null;
}

/**
 * Comprueba que lo que llega es **un** ángulo elegible del catálogo y devuelve su clave. Cadena vacía = sin
 * elegir, que es válido: el brief se rellena a trozos y sin ángulo simplemente no se puede pedir guion todavía.
 *
 * Una **lista** de ángulos se rechaza con su motivo: la regla dura de la versión es un solo ángulo por vídeo, y
 * el esquema no admite dos, pero decirlo aquí es lo que convierte un error de tipos en un mensaje que se entiende.
 */
export async function exigirAnguloValido(valor: unknown): Promise<string> {
  if (valor === undefined || valor === null || valor === "") return "";
  if (Array.isArray(valor)) {
    throw new ErrorAnuncio(
      400,
      "Un anuncio lleva un solo ángulo: mezclar varios es el error más común y se nota en el resultado. Elige uno.",
    );
  }
  if (typeof valor !== "string") throw new ErrorAnuncio(400, "Ese ángulo no es válido: elige uno del catálogo.");
  const angulos = await listarAngulos();
  const angulo = angulos.find((a) => a.clave === valor);
  if (!angulo) {
    throw new ErrorAnuncio(400, "Ese ángulo no está en el catálogo o ya no se ofrece: elige uno de la lista.");
  }
  return angulo.clave;
}
