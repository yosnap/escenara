/**
 * Datos públicos de los servicios **compatibles con la API de OpenAI** que da de alta cada usuario (0.21.1).
 * Se usan en el servidor y en el navegador, así que aquí nunca hay secretos ni claves.
 *
 * Qué son: servicios de texto que hablan `POST {base}/chat/completions` y `GET {base}/models`, y que **se cobran
 * por cuota o por plan, no por petición**. Por eso su gasto se apunta con 0 créditos y lo que se guarda de cada
 * llamada son los tokens que informa el proveedor.
 *
 * Para qué sirven en Escenara: son la **reserva de la traducción de prompts y del asistente de guion** cuando el
 * modelo de texto del catálogo falla (decisión firme del propietario, 2026-09-28).
 */

/** Nombre visible: lo elige el usuario y aparece en los mensajes de error, así que se acota su forma. */
export const NOMBRE_MAXIMO = 60;
export const URL_MAXIMA = 300;
/** Modelos por proveedor: la lista se recorre entera en el peor caso, así que no puede ser infinita. */
export const MODELOS_MAXIMOS = 12;
export const MODELO_MAXIMO = 120;
/** Proveedores compatibles por usuario. Suficiente para tener uno de reserva del de reserva. */
export const COMPATIBLES_MAXIMOS = 5;

/** Plantilla precargada de un servicio conocido: solo rellena el formulario, no guarda nada. */
export interface PlantillaCompatible {
  nombre: string;
  urlBase: string;
  /** Modelos de texto **en el orden en que conviene probarlos**. */
  modelos: readonly string[];
  /** Dónde se consigue la clave y qué conviene saber antes de pegarla. */
  ayuda: string;
}

/**
 * NaN builders, comprobado el 2026-09-28 contra su API real: `GET /v1/models` responde 200 con su catálogo y
 * `POST /v1/chat/completions` sigue la forma de OpenAI. El orden de los modelos es deliberado: `gemma4` primero
 * por rapidez, y `glm5.3-flash` antes que `deepseek-v4-flash` porque ese día era el que contestaba.
 */
export const PLANTILLAS: readonly PlantillaCompatible[] = [
  {
    nombre: "NaN builders",
    urlBase: "https://api.nan.builders/v1",
    modelos: ["gemma4", "glm5.3-flash", "deepseek-v4-flash", "qwen3.8-flash"],
    ayuda:
      "Se paga por cuota del plan, no por petición: en Escenara sus llamadas se apuntan con 0 créditos y lo que se guarda son los tokens.",
  },
];

/** Vista de un proveedor compatible que sí puede llegar al navegador: nunca incluye el secreto. */
export interface CompatibleVista {
  id: string;
  nombre: string;
  urlBase: string;
  /** Últimos cuatro caracteres de la clave. */
  pista: string;
  modelos: string[];
  estado: "valida" | "invalida";
  /** Dato público de la última prueba (cuántos modelos ofrece); nunca texto libre del proveedor. */
  ultimoDetalle: string | null;
  orden: number;
  alta: string;
  ultimaPrueba: string | null;
  ultimaRotacion: string | null;
}

/** Limpia y valida el nombre visible. Devuelve `null` si no sirve. */
export function nombreValido(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpio = valor.trim().replace(/\s+/g, " ");
  // Sin caracteres de control: este nombre se incrusta en los mensajes que lee el usuario.
  if (limpio.length === 0 || limpio.length > NOMBRE_MAXIMO) return null;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: es justo lo que hay que descartar.
  return /[\u0000-\u001f\u007f]/.test(limpio) ? null : limpio;
}

/**
 * Limpia y valida la lista ordenada de modelos: sin repetidos, sin vacíos y con los caracteres que admite un
 * identificador de modelo. Devuelve `null` si la lista no sirve.
 */
export function modelosValidos(valores: unknown): string[] | null {
  if (!Array.isArray(valores)) return null;
  const limpios: string[] = [];
  for (const valor of valores) {
    if (typeof valor !== "string") return null;
    const modelo = valor.trim();
    if (modelo === "") continue;
    if (modelo.length > MODELO_MAXIMO || !/^[\w.:@/-]+$/.test(modelo)) return null;
    if (!limpios.includes(modelo)) limpios.push(modelo);
  }
  if (limpios.length === 0 || limpios.length > MODELOS_MAXIMOS) return null;
  return limpios;
}
