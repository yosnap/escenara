import { ETIQUETA_MOTIVO_FALLO, type MotivoFallo } from "./generacion";

/**
 * Causa concreta por la que el proveedor no ha completado una tarea que **sí aceptó**. Es una lista cerrada y
 * propia: el texto del proveedor solo se usa para elegir una de estas claves y después se tira, porque puede
 * repetir datos de la petición (claves incluidas). No cambia qué se puede reintentar: eso lo sigue decidiendo el
 * motivo del fallo (`contenido`), que no se toca.
 *
 * `desconocida` = el proveedor no ha dicho nada que reconozcamos: se muestra el mensaje genérico de siempre.
 */
export const CAUSAS_FALLO_PROVEEDOR = [
  "bloqueo_seguridad",
  "contenido_no_permitido",
  "imagen_rechazada",
  "saturado",
  "limite",
  "desconocida",
] as const;
export type CausaFalloProveedor = (typeof CAUSAS_FALLO_PROVEEDOR)[number];

export function esCausaFalloProveedor(valor: unknown): valor is CausaFalloProveedor {
  return typeof valor === "string" && (CAUSAS_FALLO_PROVEEDOR as readonly string[]).includes(valor);
}

/** Etiqueta corta de la causa, para la línea de motivo del historial. */
export const ETIQUETA_CAUSA_FALLO: Record<CausaFalloProveedor, string> = {
  bloqueo_seguridad: "El filtro de seguridad del proveedor bloqueó la generación",
  contenido_no_permitido: "El proveedor ha rechazado la petición por sus normas de contenido",
  imagen_rechazada: "El proveedor no ha podido usar una de las imágenes de referencia",
  saturado: "El proveedor estaba saturado y no terminó la generación",
  limite: "El proveedor cortó la generación por exceso de peticiones",
  desconocida: ETIQUETA_MOTIVO_FALLO.contenido,
};

/** `true` si el fallo tiene una causa concreta reconocida (no vacía ni `desconocida`). */
export function causaConocida(causa: CausaFalloProveedor | null): causa is Exclude<CausaFalloProveedor, "desconocida"> {
  return causa !== null && causa !== "desconocida";
}

/** Etiqueta del fallo de un trabajo: la causa concreta si se conoce; si no, la del motivo, como siempre. */
export function etiquetaDelFallo(motivo: MotivoFallo, causa: CausaFalloProveedor | null): string {
  return causaConocida(causa) ? ETIQUETA_CAUSA_FALLO[causa] : ETIQUETA_MOTIVO_FALLO[motivo];
}

/** Mensaje genérico de siempre, para lo que el proveedor no explica de forma reconocible. */
export const MENSAJE_FALLO_GENERICO =
  "El proveedor no ha podido completar la generación. No se ha vuelto a enviar nada.";

export interface ContextoFallo {
  /** Nombre público del proveedor que ejecutó la tarea («KIE»). */
  proveedor: string;
  /** Nombre del modelo tal como está en el catálogo («Gemini Omni 1.1 Flash»). */
  modelo: string;
  /** Créditos que informa el proveedor por el intento; `null` si no ha informado de ninguno. */
  creditos: number | null;
  /** El envío llevaba un producto: solo entonces tiene sentido sugerir quitarlo o usar menos fotos suyas. */
  conProducto: boolean;
  /** El envío llevaba un personaje: solo entonces tiene sentido sugerir revisar sus fotos. */
  conPersonaje: boolean;
}

function cobro(creditos: number | null): string {
  if (creditos === null) return "el proveedor no ha informado de ningún cobro";
  if (creditos <= 0) return "no se ha cobrado nada";
  return `el proveedor ha cobrado ${creditos} ${creditos === 1 ? "crédito" : "créditos"} por el intento`;
}

/** Une las sugerencias como se diría en voz alta: «a, b, o c». */
function opciones(lista: string[]): string {
  if (lista.length <= 1) return lista.join("");
  return `${lista.slice(0, -1).join(", ")} o ${lista.at(-1)}`;
}

/**
 * Mensaje para quien generó: qué ha pasado, con qué proveedor y modelo, si se ha cobrado y qué puede probar.
 * Solo sugiere lo que la aplicación permite hacer de verdad (quitar el producto o elegir sus fotos, cambiar la
 * descripción, elegir otro modelo, revisar las fotos del personaje en su ficha). Nunca incluye texto del
 * proveedor.
 */
export function mensajeDeFalloDelProveedor(causa: CausaFalloProveedor, c: ContextoFallo): string {
  // Sin paréntesis propios: el nombre del modelo ya puede llevarlos («Gemini Omni 1.1 Flash (vídeo)»).
  const quien = `${c.modelo}, en ${c.proveedor},`;
  switch (causa) {
    case "bloqueo_seguridad": {
      const pruebas = [
        ...(c.conProducto ? ["quitar el producto o usar menos fotos suyas"] : []),
        "cambiar la descripción",
        "generar con otro modelo",
      ];
      return `El filtro de seguridad de ${quien} bloqueó la generación (${cobro(c.creditos)}). No dice qué le ha disgustado. Prueba a: ${opciones(pruebas)}.`;
    }
    case "contenido_no_permitido": {
      const pruebas = [
        "cambiar la descripción",
        ...(c.conProducto ? ["quitar el producto"] : []),
        "generar con otro modelo",
      ];
      return `${quien} ha rechazado la petición por sus normas de contenido (${cobro(c.creditos)}). Prueba a: ${opciones(pruebas)}.`;
    }
    case "imagen_rechazada": {
      const pruebas = [
        ...(c.conProducto ? ["elegir otras fotos del producto"] : []),
        ...(c.conPersonaje ? ["revisar las fotos del personaje en su ficha"] : []),
        "generar con otro modelo",
      ];
      return `${quien} no ha podido usar una de las imágenes de referencia (${cobro(c.creditos)}). Prueba a: ${opciones(pruebas)}.`;
    }
    case "saturado":
      return `${quien} estaba saturado y no ha terminado la generación (${cobro(c.creditos)}). Prueba a: volver a generarlo dentro de un rato o generar con otro modelo.`;
    case "limite":
      return `${quien} ha cortado la generación por exceso de peticiones (${cobro(c.creditos)}). Espera unos minutos antes de volver a generarlo.`;
    case "desconocida":
      return MENSAJE_FALLO_GENERICO;
  }
}
