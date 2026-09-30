import type { ModeloElegible } from "./catalogo";
import type { PlantillaVisible } from "./presets";
import { textoDeDuraciones } from "./trends";

/**
 * **Qué modelo del clip sirve para las duraciones de un trend.** Un trend puede limitar los segundos del clip a unas
 * **duraciones admitidas** (vacía = cualquiera) y cada modelo solo cobra las duraciones que tiene tarifadas (Veo 3.1
 * Fast, por ejemplo, solo 4 y 8 s): si el modelo elegido no tiene precio para ninguna de las que admite el trend, el
 * servidor no estima ni deja gastar. Este módulo decide, sin tocar la red, si hace falta cambiar de modelo y a cuál, y
 * por qué un modelo no se puede elegir con ese trend.
 *
 * Es lógica pura: la misma regla decide el cambio automático al elegir el trend y las opciones marcadas como no
 * disponibles en el selector de modelo.
 */

/**
 * Un modelo sin ninguna duración registrada cobra igual dure lo que dure y el servidor no le exige tarifa por
 * duración: no hay nada que comprobar. Con duraciones registradas, hace falta la tarifa de la pedida.
 */
export const tieneTarifaParaDuracion = (modelo: ModeloElegible, segundos: number): boolean =>
  modelo.duracionesConCoste.length === 0 || modelo.duracionesConCoste.some((d) => d.segundos === segundos);

const listaConY = (partes: string[]) =>
  partes.length < 2 ? partes.join("") : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;

/**
 * `true` cuando el modelo cobra al menos una de las duraciones que admite el trend. Sin lista (el trend admite
 * cualquiera), siempre.
 */
export const tieneTarifaParaAlguna = (modelo: ModeloElegible, admitidas: readonly number[]): boolean =>
  admitidas.length === 0 || admitidas.some((s) => tieneTarifaParaDuracion(modelo, s));

/**
 * Por qué un modelo no vale para clips de esa duración (o de ninguna de esas duraciones), con las que sí tiene. `null`
 * si vale.
 */
export function motivoSinDuracion(modelo: ModeloElegible, segundos: number | readonly number[]): string | null {
  const pedidas = typeof segundos === "number" ? [segundos] : segundos;
  if (tieneTarifaParaAlguna(modelo, pedidas)) return null;
  const tiene = `${listaConY(modelo.duracionesConCoste.map((d) => String(d.segundos)))} s`;
  return `${modelo.nombre} no tiene clips de ${textoDeDuraciones(pedidas)} (solo ${tiene}).`;
}

export type DecisionDeModelo =
  /** El modelo actual sirve para el trend (tiene tarifa para la duración y el trend lo admite): no se toca. */
  | { tipo: "mantener" }
  /** Se cambia a este modelo y se dice por qué. */
  | { tipo: "cambiar"; modelo: ModeloElegible; aviso: string }
  /** Ningún modelo usable sirve para el trend: no se aplica. */
  | { tipo: "ninguno"; error: string };

/**
 * Decide qué modelo usar al elegir un trend.
 *
 * - Si el actual tiene tarifa para alguna de las duraciones que admite el trend (sin lista, cualquiera vale) y el trend
 *   lo admite (`modelosPermitidos` vacío = cualquiera), se mantiene.
 * - Si no, se cambia **solo** a un modelo de los `candidatos` (ya son de imagen a vídeo y de estado usable) que cumpla
 *   las dos cosas. Si el actual tenía voz se prefiere uno que también la tenga; entre ellos, el predeterminado y, si no,
 *   el primero del catálogo.
 * - Si no hay ninguno, error con la causa: el trend no se aplica y no se cambia nada.
 */
export function decidirModeloParaTrend(datos: {
  actual: ModeloElegible | null;
  candidatos: readonly ModeloElegible[];
  /** El trend elegido; sin trend no hay nada que decidir. */
  trend: Pick<PlantillaVisible, "nombre" | "duracionesAdmitidas" | "modelosPermitidos"> | null;
  /** Identificador del modelo predeterminado de la capacidad. */
  predeterminado: string;
}): DecisionDeModelo {
  const { actual, candidatos, trend, predeterminado } = datos;
  if (!trend) return { tipo: "mantener" };
  const { duracionesAdmitidas: admitidas, nombre: nombreTrend } = trend;
  const limita = admitidas.length > 0;
  const permitidos = trend.modelosPermitidos ?? [];
  const admitido = (m: ModeloElegible) => permitidos.length === 0 || permitidos.includes(m.modelo);
  const conTarifa = (m: ModeloElegible) => tieneTarifaParaAlguna(m, admitidas);
  if (actual && conTarifa(actual) && admitido(actual)) return { tipo: "mantener" };

  const validos = candidatos.filter((m) => conTarifa(m) && admitido(m));
  const conVoz = actual?.conVoz ? validos.filter((m) => m.conVoz) : [];
  const grupo = conVoz.length > 0 ? conVoz : validos;
  const elegido = grupo.find((m) => m.modelo === predeterminado) ?? grupo[0];
  const sinTarifa = actual !== null && !conTarifa(actual);
  const duraciones = textoDeDuraciones(admitidas);

  if (!elegido) {
    const causa = sinTarifa
      ? ` (${motivoSinDuracion(actual, admitidas)})`
      : actual
        ? ` (${actual.nombre} no está entre los modelos que admite)`
        : "";
    const que = limita ? `tenga precio para clips de ${duraciones}` : "sirva";
    const admite = permitidos.length > 0 ? " y que este trend admita" : "";
    return {
      tipo: "ninguno",
      error: `Para el trend «${nombreTrend}» hace falta un modelo que ${que}${admite}, y no hay ninguno disponible${causa}. No se ha aplicado y no se ha cobrado nada: pide a quien administra que registre esa tarifa o elige otro formato.`,
    };
  }

  const de = !actual
    ? "el modelo actual no sirve"
    : sinTarifa
      ? `${actual.nombre} no tiene clips de ${duraciones}`
      : `el trend no admite ${actual.nombre}`;
  const dura = `, y el trend «${nombreTrend}» solo admite ${duraciones}`;
  const sinVoz = actual?.conVoz && !elegido.conVoz ? ` Ojo: ${elegido.nombre} genera vídeo sin voz.` : "";
  return {
    tipo: "cambiar",
    modelo: elegido,
    aviso: `Hemos cambiado a ${elegido.nombre} porque ${de}${sinTarifa ? dura : ""}.${sinVoz}`,
  };
}
