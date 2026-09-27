import { limpiarTextoDePrompt } from "./ficha-personaje";
import type { TipoPersonaje } from "./personajes";
import {
  type CategoriaPreset,
  MAXIMO_VARIABLES,
  PLANTILLA_MAXIMA,
  PROMPT_RENDERIZADO_MAXIMO,
  type PresetElegible,
  type PresetVisible,
  type SeleccionPresets,
  VARIABLE_TEXTO_MAXIMA,
  type VariablePlantilla,
} from "./presets";

/**
 * Interpolación de una plantilla de prompt (0.16.0). Función **pura y determinista**: la misma entrada da
 * exactamente el mismo texto, sin fechas, sin azar y sin orden de objeto (las variables se recorren en el
 * orden en que las declara la plantilla).
 *
 * Es la misma función en el servidor y en el navegador, igual que la limpieza de la ficha: lo que el usuario
 * ve en la previsualización es lo que se enviará. Lo que **no** es compartido es de dónde salen los valores:
 * el servidor los resuelve a partir de identificadores de preset y de la versión de la plantilla, nunca del
 * texto que mande el navegador.
 *
 * Reglas duras:
 *
 * - solo se sustituyen las variables **declaradas**. Un `{{otra_cosa}}` que no esté declarado no se sustituye
 *   por nada: se borra, junto con los separadores que se quedasen sueltos;
 * - todo valor que venga de una persona pasa por {@link limpiarTextoDePrompt}, la misma limpieza
 *   anti-inyección de la ficha: sin saltos de línea, sin caracteres de estructura y sin parámetros del
 *   proveedor ni instrucciones de redirección;
 * - un valor **no puede introducir más variables**: lo sustituido no se vuelve a recorrer, así que
 *   `{{escena}}` con el texto «{{formato}}» no expande nada (y además las llaves las quita la limpieza);
 * - el resultado va acotado en longitud, y falta una variable obligatoria → no hay texto, hay motivo.
 */

/** Marca de variable en la plantilla: `{{nombre}}`, con espacios opcionales dentro. */
const MARCA = /\{\{\s*([a-z][a-z0-9_]{0,29})\s*\}\}/g;

/** Valor que puede tomar una variable ya resuelta. Los números se formatean sin localización. */
export type ValorVariable = string | number;

export interface ResultadoRender {
  /** Texto final en inglés, listo para entrar en el prompt. Vacío si {@link faltan} no está vacío. */
  texto: string;
  /** Etiquetas de las variables obligatorias sin valor, en el orden de la plantilla. */
  faltan: string[];
  /** Motivos por los que no se puede continuar, en lenguaje llano. Vacío si todo está bien. */
  motivos: string[];
}

/**
 * Sujeto con el que se nombra al personaje en el prompt. Son **dos textos fijos**: una variable de tipo
 * `personaje` no puede valer nada más, así que el nombre de la persona nunca sale hacia el proveedor.
 */
export const SUJETO_PERSONAJE: Record<TipoPersonaje, string> = {
  persona: "the same person as in the reference photos",
  animal: "the same animal as in the reference photos",
};

/** Texto de una variable ya resuelta, limpio y acotado. Los números se escriben tal cual. */
function textoDeValor(valor: ValorVariable | undefined): string {
  if (valor === undefined) return "";
  if (typeof valor === "number") return Number.isFinite(valor) ? String(Math.trunc(valor)) : "";
  return limpiarTextoDePrompt(valor, VARIABLE_TEXTO_MAXIMA);
}

/**
 * Recoloca la puntuación que se queda huérfana al borrar una variable vacía: separadores duplicados, un
 * punto detrás de dos puntos («Wardrobe: .»), espacios delante de la puntuación y comas al final.
 */
function recolocarPuntuacion(texto: string): string {
  return (
    texto
      .replace(/[ \t]+/g, " ")
      .replace(/\s+([.,;:])/g, "$1")
      // Un rótulo que se quedó sin valor («Wardrobe: .») se va entero, **con su punto**: dejarlo sería mandarle
      // al proveedor una etiqueta vacía, y dejar solo el punto, una línea con un punto. Va **antes** de limpiar
      // la puntuación duplicada: si no, esa limpieza se comería el `:` y dejaría el rótulo escrito («Wardrobe.»).
      .replace(/[\w][\w ]{0,29}:[ \t]*\.[ \t]*/g, "")
      .replace(/[\w][\w ]{0,29}:[ \t]*(?=\n|$)/g, "")
      .replace(/([:,;])\s*(?=[.,;:])/g, "")
      .replace(/([.,;:])\1+/g, "$1")
      .replace(/\s+\n/g, "\n")
      // Un rótulo borrado deja su línea vacía: el bloque sigue siendo un bloque.
      .replace(/\n{2,}/g, "\n")
      .replace(/(^|\n)[\s.,;:]+/g, "$1")
      .trim()
  );
}

/**
 * Renderiza la plantilla con los valores dados. `valores` ya viene resuelto por quien llama: en el servidor,
 * de los presets y del personaje; en el navegador, de los mismos presets que se le enviaron para pintar la
 * botonera.
 */
export function renderizarPlantilla(
  plantilla: string,
  variables: readonly VariablePlantilla[],
  valores: Readonly<Record<string, ValorVariable | undefined>>,
): ResultadoRender {
  // Los topes se comprueban **antes** de iterar y antes de que ninguna expresión regular recorra el texto: una
  // plantilla con cien variables o con cien mil caracteres se rechaza sin trabajo, diciendo qué pasa.
  if (variables.length > MAXIMO_VARIABLES) {
    return { texto: "", faltan: [], motivos: [`La plantilla declara más de ${MAXIMO_VARIABLES} variables.`] };
  }
  if (plantilla.length > PLANTILLA_MAXIMA) {
    return { texto: "", faltan: [], motivos: [`El texto de la plantilla pasa de ${PLANTILLA_MAXIMA} caracteres.`] };
  }
  const declaradas = new Map(variables.map((v) => [v.nombre, v]));
  const faltan: string[] = [];
  const motivos: string[] = [];
  const resueltos = new Map<string, string>();

  for (const variable of variables) {
    const texto = textoDeValor(valores[variable.nombre]);
    if (texto === "") {
      if (variable.obligatoria) {
        faltan.push(variable.etiqueta);
        motivos.push(`Falta «${variable.etiqueta}».`);
      }
      continue;
    }
    if (variable.tipo === "numero") {
      const numero = Number(texto);
      if (variable.minimo !== undefined && numero < variable.minimo) {
        motivos.push(`«${variable.etiqueta}» no puede bajar de ${variable.minimo}.`);
        continue;
      }
      if (variable.maximo !== undefined && numero > variable.maximo) {
        motivos.push(`«${variable.etiqueta}» no puede pasar de ${variable.maximo}.`);
        continue;
      }
    }
    resueltos.set(variable.nombre, texto);
  }

  if (motivos.length > 0) return { texto: "", faltan, motivos };

  // Una sola pasada: lo sustituido no se vuelve a recorrer, así que un valor no puede meter más variables.
  const crudo = plantilla.replace(MARCA, (_, nombre: string) =>
    declaradas.has(nombre) ? (resueltos.get(nombre) ?? "") : "",
  );
  return { texto: recolocarPuntuacion(crudo).slice(0, PROMPT_RENDERIZADO_MAXIMO), faltan, motivos };
}

/** Nombres de variable que usa la plantilla, en el orden en que aparecen y sin repetir. */
export function variablesUsadas(plantilla: string): string[] {
  const vistas = new Set<string>();
  for (const coincidencia of plantilla.matchAll(MARCA)) {
    const nombre = coincidencia[1];
    if (nombre) vistas.add(nombre);
  }
  return [...vistas];
}

/**
 * Texto final que se le envía al proveedor cuando el usuario **edita** la previsualización. Pasa por la
 * misma limpieza que todo lo demás: editar el texto no es una puerta para colar parámetros del proveedor.
 */
export function limpiarTextoEditado(valor: unknown): string {
  return limpiarTextoDePrompt(valor, PROMPT_RENDERIZADO_MAXIMO);
}

/**
 * Presets elegidos de una categoría, **en el orden del catálogo** y no en el que lleguen: es lo que hace
 * determinista el texto. `ordenados` es la lista completa tal como la devuelve el servidor (por categoría,
 * orden y nombre), así que el servidor y el navegador ordenan igual.
 */
export function elegidosDeCategoria<T extends { id: string; categoria: CategoriaPreset }>(
  ordenados: readonly T[],
  categoria: CategoriaPreset,
  ids: readonly string[] | undefined,
): T[] {
  if (!ids || ids.length === 0) return [];
  const pedidos = new Set(ids);
  return ordenados.filter((p) => p.categoria === categoria && pedidos.has(p.id));
}

/**
 * La escena que escribió la persona, repartida entre **todas** las variables de tipo `texto` de la plantilla.
 *
 * En «Crear» hay un solo campo de escena, así que una plantilla cuya variable se llame `descripcion` o
 * `que_se_ve` tiene que funcionar igual que la sembrada, que la llama `escena`. Es la **misma** función en el
 * servidor y en el navegador: si solo la aplicara uno de los dos, la previsualización diría una cosa y se
 * enviaría otra.
 */
export function textosDeEscena(variables: readonly VariablePlantilla[], escena: string): Record<string, string> {
  return Object.fromEntries(variables.filter((v) => v.tipo === "texto").map((v) => [v.nombre, escena]));
}

/**
 * Valores de todas las variables declaradas, resueltos igual en el servidor y en el navegador. Lo único que
 * cambia entre los dos es de dónde sale `ordenados`: del catálogo autorizado en el servidor, de lo que el
 * servidor le envió en el navegador.
 */
export function valoresDeVariables(
  variables: readonly VariablePlantilla[],
  entrada: {
    ordenados: readonly PresetElegible[];
    seleccion: SeleccionPresets;
    textos: Readonly<Record<string, string>>;
    tipoPersonaje: TipoPersonaje | null;
  },
): Record<string, ValorVariable | undefined> {
  const valores: Record<string, ValorVariable | undefined> = {};
  for (const variable of variables) {
    if (variable.tipo === "texto") {
      valores[variable.nombre] = entrada.textos[variable.nombre] ?? "";
      continue;
    }
    if (variable.tipo === "personaje") {
      valores[variable.nombre] = entrada.tipoPersonaje ? SUJETO_PERSONAJE[entrada.tipoPersonaje] : "";
      continue;
    }
    if (!variable.categoria) continue;
    const elegidos = elegidosDeCategoria(entrada.ordenados, variable.categoria, entrada.seleccion[variable.categoria]);
    valores[variable.nombre] =
      variable.tipo === "numero"
        ? (elegidos[0]?.segundos ?? undefined)
        : elegidos
            .map((p) => p.prompt)
            .filter((p) => p !== "")
            .join(", ");
  }
  return valores;
}

/**
 * Qué falta por elegir y qué no encaja, **sin componer el prompt**.
 *
 * Es lo único que el navegador necesita saber para habilitar el botón de generar y para decir qué falta: desde la
 * 0.17.0 el texto compuesto no sale hacia el navegador (ADR-0022), así que ni se renderiza allí ni se le envían
 * las piezas. La comprobación es la misma que hace el renderizador del servidor sobre las mismas variables.
 */
export function faltanPorElegir(
  variables: readonly VariablePlantilla[],
  entrada: {
    ordenados: readonly PresetVisible[];
    seleccion: SeleccionPresets;
    /** La escena que ha escrito la persona: es el valor de todas las variables de tipo `texto`. */
    escena: string;
    tipoPersonaje: TipoPersonaje | null;
  },
): { faltan: string[]; motivos: string[] } {
  const faltan: string[] = [];
  const motivos: string[] = [];
  if (variables.length > MAXIMO_VARIABLES) {
    return { faltan, motivos: [`La plantilla declara más de ${MAXIMO_VARIABLES} variables.`] };
  }
  for (const variable of variables) {
    const elegidos =
      variable.tipo === "enumerado" || variable.tipo === "numero"
        ? variable.categoria
          ? elegidosDeCategoria(entrada.ordenados, variable.categoria, entrada.seleccion[variable.categoria])
          : []
        : [];
    const numero = variable.tipo === "numero" ? (elegidos[0]?.segundos ?? null) : null;
    const tieneValor =
      variable.tipo === "texto"
        ? entrada.escena.trim() !== ""
        : variable.tipo === "personaje"
          ? entrada.tipoPersonaje !== null
          : variable.tipo === "numero"
            ? numero !== null
            : elegidos.length > 0;
    if (!tieneValor) {
      if (variable.obligatoria) {
        faltan.push(variable.etiqueta);
        motivos.push(`Falta «${variable.etiqueta}».`);
      }
      continue;
    }
    if (numero !== null) {
      if (variable.minimo !== undefined && numero < variable.minimo) {
        motivos.push(`«${variable.etiqueta}» no puede bajar de ${variable.minimo}.`);
      }
      if (variable.maximo !== undefined && numero > variable.maximo) {
        motivos.push(`«${variable.etiqueta}» no puede pasar de ${variable.maximo}.`);
      }
    }
  }
  return { faltan, motivos };
}
