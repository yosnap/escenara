/**
 * Lógica pura de un flujo por pasos (multipaso): qué estado tiene cada paso, a cuál se puede saltar y cómo se
 * guarda el paso actual en la dirección de la página. No hay aquí nada de React ni del navegador, para que las
 * mismas reglas se prueben sin pintar nada.
 *
 * El estado de un paso **se deduce de los datos** que hay en pantalla (lo que está escrito, lo que se ha generado,
 * lo que está aprobado): no se guarda ninguna columna de progreso. Lo único que recuerda la pantalla es qué pasos
 * has visitado, y eso solo sirve para decidir a cuáles puedes volver con un clic.
 */

/**
 * - `hecho`: lo que pide el paso ya está.
 * - `en-curso`: empezado y sin terminar, o con un trabajo en marcha.
 * - `pendiente`: todavía no se ha hecho, pero nada impide hacerlo.
 * - `bloqueado`: depende de otro paso; siempre lleva su motivo escrito.
 */
export const ESTADOS_DE_PASO = ["hecho", "en-curso", "pendiente", "bloqueado"] as const;
export type EstadoDePaso = (typeof ESTADOS_DE_PASO)[number];

export const ETIQUETA_ESTADO_DE_PASO: Record<EstadoDePaso, string> = {
  hecho: "Hecho",
  "en-curso": "En curso",
  pendiente: "Pendiente",
  bloqueado: "Bloqueado",
};

export interface PasoDelFlujo {
  /** Identificador estable: es lo que va en `?paso=`. Minúsculas y guiones. */
  id: string;
  /** Título completo, el del encabezado del paso. */
  titulo: string;
  /** Título corto para la barra, que tiene poco sitio. */
  corto: string;
  estado: EstadoDePaso;
  /** Por qué está bloqueado, en una frase con lo que hay que hacer. Obligatorio si el estado es `bloqueado`. */
  motivo?: string;
}

/** Nombre del parámetro de la dirección que guarda el paso actual. */
export const PARAMETRO_PASO = "paso";

const ID_VALIDO = /^[a-z][a-z0-9-]{0,39}$/;

/**
 * Lee el paso pedido en la dirección. Es una entrada externa: se acepta solo si es uno de los pasos de este flujo;
 * cualquier otra cosa (vacío, repetido, inventado) cuenta como no pedido.
 */
export function pasoDeLaUrl(valor: string | string[] | undefined | null, ids: readonly string[]): string | null {
  if (typeof valor !== "string") return null;
  const limpio = valor.trim().toLowerCase();
  return ID_VALIDO.test(limpio) && ids.includes(limpio) ? limpio : null;
}

/**
 * Paso con el que se abre la pantalla. El pedido en la dirección manda, salvo que esté bloqueado (al recargar,
 * lo que no estaba guardado ya no está, y abrir un paso bloqueado solo enseñaría el motivo): entonces se abre el
 * predeterminado de la pantalla.
 */
export function resolverPaso(pedido: string | null, pasos: readonly PasoDelFlujo[], predeterminado: string): string {
  const elegido = pasos.find((p) => p.id === pedido);
  if (elegido && elegido.estado !== "bloqueado") return elegido.id;
  return pasos.some((p) => p.id === predeterminado) ? predeterminado : (pasos[0]?.id ?? predeterminado);
}

/**
 * Pasos visitados al abrir la pantalla en `actual`: los anteriores cuentan como alcanzados, porque para llegar
 * al actual se ha pasado por ellos (o se ha compartido un enlace que ya estaba ahí).
 */
export function visitadosAlAbrir(pasos: readonly PasoDelFlujo[], actual: string): string[] {
  const indice = pasos.findIndex((p) => p.id === actual);
  return pasos.slice(0, Math.max(0, indice) + 1).map((p) => p.id);
}

/** Se puede saltar a un paso con un clic si no está bloqueado y ya está hecho o ya se ha visitado. */
export function esNavegable(paso: PasoDelFlujo, visitados: readonly string[]): boolean {
  if (paso.estado === "bloqueado") return false;
  return paso.estado === "hecho" || visitados.includes(paso.id);
}

/** Vecino anterior o siguiente del paso actual; `null` en los extremos. */
export function vecino(pasos: readonly PasoDelFlujo[], actual: string, salto: -1 | 1): PasoDelFlujo | null {
  const indice = pasos.findIndex((p) => p.id === actual);
  if (indice < 0) return null;
  return pasos[indice + salto] ?? null;
}

/**
 * La misma dirección con el paso cambiado, **sin tocar los demás parámetros** (por ejemplo `?personaje=` de
 * «Crear»). Devuelve ruta, parámetros y ancla, lista para `history.replaceState`.
 */
export function direccionConPaso(href: string, paso: string): string {
  const url = new URL(href, "http://escenara.local");
  url.searchParams.set(PARAMETRO_PASO, paso);
  return `${url.pathname}${url.search}${url.hash}`;
}
