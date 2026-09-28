/**
 * Fechas que el servidor y el navegador escriben **igual**.
 *
 * `new Date(iso).toLocaleString("es-ES")` sin zona da un texto distinto en cada lado: el servidor formatea con
 * la zona del proceso (en un contenedor, casi siempre UTC) y el navegador con la del usuario. Cuando eso pasa
 * dentro de una página renderizada en el servidor, React encuentra un texto que no coincide al hidratar,
 * descarta el HTML recibido y vuelve a pintar el árbol entero en el cliente. Durante esa repintada la página
 * se ve bien pero **no responde**: es lo que hacía que los primeros clics en las pestañas de la ficha de un
 * personaje no cambiaran de pestaña (visto el 2026-09-28).
 *
 * Por eso la zona se fija: Escenara es un producto en español de España y sus fechas se leen en esa zona,
 * tanto si el servidor está en UTC como si quien mira está de viaje. Es lo que ya hacía el historial del
 * catálogo en el panel de administración; aquí vive una sola vez.
 */

/** Zona en la que se leen todas las fechas de la interfaz. Fija a propósito: ver arriba. */
export const ZONA = "Europe/Madrid";

/** Fecha y hora, cortas: «28/9/26, 7:41». */
export const fechaYHora = (iso: string | Date): string =>
  new Date(iso).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short", timeZone: ZONA });

/** Fecha y hora con el mes escrito: «28 de septiembre de 2026, 7:41». */
export const fechaLarga = (iso: string | Date): string =>
  new Date(iso).toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short", timeZone: ZONA });

/** Solo la fecha: «28/9/2026». */
export const soloFecha = (iso: string | Date): string => new Date(iso).toLocaleDateString("es-ES", { timeZone: ZONA });
