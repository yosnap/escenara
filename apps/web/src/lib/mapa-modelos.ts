import { PROVEEDORES_PUBLICOS, type Proveedor } from "./boveda";

/**
 * **Mapa de modelos** (0.21.1, decisión firme del propietario): para cada tipo de generación, una lista
 * ordenada de con quién se intenta. La primera entrada es la principal; las siguientes son reservas que se
 * prueban solas **únicamente cuando se ha probado que la anterior no cobró**.
 *
 * Esto vive en `lib/` porque lo usan el servidor al resolver el mapa y la pantalla del usuario al editarlo.
 * Aquí no hay secretos: una entrada dice **con qué credencial** se paga, nunca la credencial.
 */

export const TIPOS_DE_MAPA = ["texto", "voz", "transcripcion", "imagen", "video"] as const;
export type TipoDeMapa = (typeof TIPOS_DE_MAPA)[number];

/**
 * Tipos que consultan de verdad el mapa. Desde la 0.22.0 son **todos**: imagen y vídeo se añaden con la misma
 * regla que los demás (el usuario elige y ordena, quien administra solo recomienda) y con la misma regla de
 * dinero del recorrido.
 */
export const TIPOS_EN_USO: readonly TipoDeMapa[] = TIPOS_DE_MAPA;

export const esTipoDeMapa = (v: unknown): v is TipoDeMapa => TIPOS_DE_MAPA.includes(v as TipoDeMapa);

export const NOMBRE_DE_TIPO: Record<TipoDeMapa, string> = {
  texto: "Texto",
  voz: "Voz",
  transcripcion: "Subtítulos",
  imagen: "Imagen",
  video: "Vídeo",
};

export const DESCRIPCION_DE_TIPO: Record<TipoDeMapa, string> = {
  texto: "Traducir los prompts al inglés y escribir el guion con el asistente.",
  voz: "Leer el diálogo de tus escenas cuando el proyecto usa pista de voz aparte.",
  transcripcion: "Sacar los subtítulos del audio ya generado.",
  imagen: "Los fotogramas de tus escenas, las imágenes de «Crear» y las vistas generadas de tus personajes.",
  video: "Los clips de tus escenas, y las escenas habladas cuando el proyecto usa el modo Omni.",
};

/** Una entrada del mapa tal como viaja al navegador. */
export interface EntradaMapa {
  proveedor: Proveedor;
  /** Servicio compatible concreto cuando `proveedor` es `compatible`; `null` en los demás. */
  compatibleId: string | null;
  /** Identificador del modelo en ese proveedor; vacío en `local`. */
  modelo: string;
}

/** Entrada con lo que hace falta para pintarla y para decir por qué no se puede usar. */
export interface EntradaMapaVista extends EntradaMapa {
  /** Nombre visible del proveedor: el del catálogo público, o el que el usuario le puso a su servicio. */
  nombreProveedor: string;
  /** Nombre del modelo tal como se lee («Gemini Omni 1.1 Flash (vídeo)»); vacío si no está en el catálogo. */
  nombreModelo?: string;
  /** Coste en palabras («63 créditos por clip de 4 s a 720p», «Cuota de tu plan»); vacío si no se conoce. */
  coste?: string;
  /** `true` si ahora mismo se puede usar: hay credencial válida y, en `compatible`, el servicio sigue existiendo. */
  utilizable: boolean;
  /** Por qué no se puede usar, en una frase con la acción concreta. Vacío cuando sí se puede. */
  motivo: string;
}

export interface MapaVista {
  tipo: TipoDeMapa;
  /** `false` cuando el usuario no ha tocado su mapa y se está usando el recomendado por la plataforma. */
  propio: boolean;
  entradas: EntradaMapaVista[];
  /** Lo que recomienda la plataforma para este tipo, en su orden. Se enseña antes de elegir. */
  recomendadas: EntradaMapaVista[];
}

/** «NaN builders · gemma4», o «Esta instalación» cuando la entrada no elige modelo. */
export function etiquetaDeEntrada(entrada: EntradaMapaVista): string {
  if (entrada.modelo === "") return entrada.nombreProveedor;
  // El nombre legible del modelo si el catálogo lo tiene; el identificador técnico solo cuando no.
  return `${entrada.nombreModelo || entrada.modelo} · ${entrada.nombreProveedor}`;
}

/** Nombre visible de un proveedor de la bóveda; los servicios compatibles traen el suyo propio. */
export const nombreDeProveedor = (proveedor: Proveedor): string => PROVEEDORES_PUBLICOS[proveedor]?.nombre ?? proveedor;

/**
 * Entradas de un tipo del mapa. Holgado a propósito: la recomendación de la plataforma puede traer todos los
 * modelos elegibles de su capacidad (en vídeo ya son ocho), y con 6 reordenarla no se podía guardar.
 */
export const ENTRADAS_MAXIMAS = 20;

/** Limpia y valida una lista de entradas que llega del navegador. `null` si no sirve. */
export function entradasValidas(valores: unknown): EntradaMapa[] | null {
  if (!Array.isArray(valores) || valores.length === 0 || valores.length > ENTRADAS_MAXIMAS) return null;
  const limpias: EntradaMapa[] = [];
  for (const valor of valores) {
    const v = valor as Partial<EntradaMapa> | null;
    if (!v || typeof v.proveedor !== "string" || !(v.proveedor in PROVEEDORES_PUBLICOS)) return null;
    const modelo = typeof v.modelo === "string" ? v.modelo.trim() : "";
    if (modelo.length > 120 || (modelo !== "" && !/^[\w.:@/-]+$/.test(modelo))) return null;
    const compatibleId = typeof v.compatibleId === "string" && v.compatibleId !== "" ? v.compatibleId : null;
    // Una entrada de un servicio compatible sin decir cuál no se puede resolver, y una de otro proveedor con
    // un identificador de servicio pegado sería una entrada que dice dos cosas a la vez.
    if ((v.proveedor === "compatible") !== (compatibleId !== null)) return null;
    if (v.proveedor !== "local" && modelo === "") return null;
    const entrada: EntradaMapa = { proveedor: v.proveedor as Proveedor, compatibleId, modelo };
    if (
      limpias.some(
        (e) =>
          e.proveedor === entrada.proveedor && e.compatibleId === entrada.compatibleId && e.modelo === entrada.modelo,
      )
    ) {
      continue;
    }
    limpias.push(entrada);
  }
  return limpias.length === 0 ? null : limpias;
}
