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
  /** Requisitos que aún faltan en este paso (casillas, campos): la barra los cuenta. Ausente o 0 = ninguno. */
  pendientes?: number;
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
  const abrible = (id: string | null) => pasos.find((p) => p.id === id && p.estado !== "bloqueado")?.id;
  // Ni el pedido ni el predeterminado se abren si están bloqueados: se cae al primero que se pueda abrir.
  return (
    abrible(pedido) ?? abrible(predeterminado) ?? pasos.find((p) => p.estado !== "bloqueado")?.id ?? predeterminado
  );
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

/** Lo que se dice de un paso al que todavía no se puede saltar: el motivo del bloqueo o que aún no se ha llegado. */
export const NO_ALCANZADO = "Todavía no has llegado a este paso: avanza con «Siguiente» desde el anterior.";

export function motivoNoNavegable(paso: PasoDelFlujo, visitados: readonly string[]): string | null {
  if (paso.estado === "bloqueado") return paso.motivo ?? "Depende de un paso anterior que aún no está hecho.";
  return esNavegable(paso, visitados) ? null : NO_ALCANZADO;
}

/**
 * Estado de la navegación: el paso actual, los visitados y el paso cuyo motivo se está enseñando porque se ha
 * pulsado sin poder abrirse. Es puro para poder probar las transiciones sin montar nada.
 */
export interface EstadoMultipaso {
  actual: string;
  visitados: string[];
  /** Paso pulsado que no se podía abrir; su motivo se enseña hasta cambiar de paso o hasta que se pueda abrir. */
  avisoDe: string | null;
  /** `true` desde el primer cambio de paso hecho por la persona: a partir de ahí el foco sigue al paso. */
  enfocar: boolean;
}

export type AccionMultipaso = { tipo: "ir"; id: string } | { tipo: "avisar"; id: string };

export const estadoInicialMultipaso = (pasos: readonly PasoDelFlujo[], inicial: string): EstadoMultipaso => ({
  actual: inicial,
  visitados: visitadosAlAbrir(pasos, inicial),
  avisoDe: null,
  enfocar: false,
});

export function reducirMultipaso(estado: EstadoMultipaso, accion: AccionMultipaso): EstadoMultipaso {
  if (accion.tipo === "avisar") return { ...estado, avisoDe: accion.id };
  // Cambiar de paso (a mano o porque la pantalla avanza sola) siempre retira el aviso que hubiera.
  return {
    actual: accion.id,
    visitados: estado.visitados.includes(accion.id) ? estado.visitados : [...estado.visitados, accion.id],
    avisoDe: null,
    enfocar: true,
  };
}

/** El aviso que sigue siendo verdad: si el paso ya se puede abrir (o ya no está), no se enseña. */
export function avisoVigente(
  estado: EstadoMultipaso,
  pasos: readonly PasoDelFlujo[],
): { paso: PasoDelFlujo; motivo: string } | null {
  const paso = pasos.find((p) => p.id === estado.avisoDe);
  if (!paso) return null;
  const motivo = motivoNoNavegable(paso, estado.visitados);
  return motivo ? { paso, motivo } : null;
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

/** Escribe el paso en la dirección de la ventana sin recargar ni añadir entradas al historial. */
export function escribirPasoEnLaDireccion(
  paso: string,
  ventana: {
    location: { href: string };
    history: { replaceState: (datos: null, sinUso: string, url: string) => void };
  },
): void {
  ventana.history.replaceState(null, "", direccionConPaso(ventana.location.href, paso));
}
