import type { ModeloElegible } from "./catalogo";
import type { PlantillaVisible } from "./presets";

/**
 * **Qué modelo del clip sirve para la duración de un trend.** Un trend fija los segundos del clip y cada modelo solo
 * cobra las duraciones que tiene tarifadas (Veo 3.1 Fast, por ejemplo, solo 4 y 8 s): si el modelo elegido no tiene
 * precio para esa duración, el servidor no estima ni deja gastar. Este módulo decide, sin tocar la red, si hace falta
 * cambiar de modelo y a cuál, y por qué un modelo no se puede elegir con esa duración.
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

/** Por qué un modelo no vale para clips de esa duración, con las que sí tiene. `null` si vale. */
export function motivoSinDuracion(modelo: ModeloElegible, segundos: number): string | null {
  if (tieneTarifaParaDuracion(modelo, segundos)) return null;
  const tiene = `${listaConY(modelo.duracionesConCoste.map((d) => String(d.segundos)))} s`;
  return `${modelo.nombre} no tiene clips de ${segundos} s (solo ${tiene}).`;
}

export type DecisionDeModelo =
  /** El modelo actual ya tiene tarifa para la duración: no se toca. */
  | { tipo: "mantener" }
  /** Se cambia a este modelo y se dice por qué. */
  | { tipo: "cambiar"; modelo: ModeloElegible; aviso: string }
  /** Ningún modelo usable cobra esa duración: el trend no se aplica. */
  | { tipo: "ninguno"; error: string };

/**
 * Decide qué modelo usar al elegir un trend de `segundos`.
 *
 * - Si el actual tiene tarifa para la duración, se mantiene.
 * - Si no, se cambia **solo** a un modelo de los `candidatos` (ya son de imagen a vídeo y de estado usable) con tarifa
 *   para esa duración y que la plantilla admita (`modelosPermitidos` vacío = cualquiera). Si el actual tenía voz se
 *   prefiere uno que también la tenga; entre ellos, el predeterminado y, si no, el primero del catálogo.
 * - Si no hay ninguno, error con la causa: el trend no se aplica y no se cambia nada.
 */
export function decidirModeloParaTrend(datos: {
  actual: ModeloElegible | null;
  candidatos: readonly ModeloElegible[];
  /** El trend elegido; sin trend, o sin duración fija, no hay nada que decidir. */
  trend: Pick<PlantillaVisible, "nombre" | "targetSeconds" | "modelosPermitidos"> | null;
  /** Identificador del modelo predeterminado de la capacidad. */
  predeterminado: string;
}): DecisionDeModelo {
  const { actual, candidatos, trend, predeterminado } = datos;
  if (!trend || trend.targetSeconds === null) return { tipo: "mantener" };
  const { targetSeconds: segundos, nombre: nombreTrend } = trend;
  const modelosPermitidos = trend.modelosPermitidos ?? [];
  if (actual && tieneTarifaParaDuracion(actual, segundos)) return { tipo: "mantener" };

  const validos = candidatos.filter(
    (m) =>
      tieneTarifaParaDuracion(m, segundos) && (modelosPermitidos.length === 0 || modelosPermitidos.includes(m.modelo)),
  );
  const conVoz = actual?.conVoz ? validos.filter((m) => m.conVoz) : [];
  const grupo = conVoz.length > 0 ? conVoz : validos;
  const elegido = grupo.find((m) => m.modelo === predeterminado) ?? grupo[0];

  if (!elegido) {
    const restringido = modelosPermitidos.length > 0 ? " y que este trend admita" : "";
    return {
      tipo: "ninguno",
      error: `El trend «${nombreTrend}» pide clips de ${segundos} s y ningún modelo disponible tiene precio para esa duración${restringido}${actual ? ` (${motivoSinDuracion(actual, segundos) ?? actual.nombre})` : ""}. No se ha aplicado y no se ha cobrado nada: pide a quien administra que registre esa tarifa o elige otro formato.`,
    };
  }

  const de = actual
    ? `${actual.nombre} no tiene clips de ${segundos} s`
    : `el modelo actual no tiene clips de ${segundos} s`;
  const sinVoz = actual?.conVoz && !elegido.conVoz ? ` Ojo: ${elegido.nombre} genera vídeo sin voz.` : "";
  return {
    tipo: "cambiar",
    modelo: elegido,
    aviso: `Hemos cambiado a ${elegido.nombre} porque ${de}, y el trend «${nombreTrend}» dura ${segundos} s.${sinVoz}`,
  };
}
