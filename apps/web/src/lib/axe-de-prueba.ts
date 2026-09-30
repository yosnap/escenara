import type { AxeResults, Result, RunOptions } from "axe-core";
import { Window } from "happy-dom";

/**
 * **axe sobre el HTML del servidor**, para la suite: se pinta la pantalla con `renderToStaticMarkup` y datos de
 * ejemplo, se carga en un documento de happy-dom (sin navegador) y axe-core revisa lo que un lector de pantalla y el
 * teclado van a encontrar: nombres accesibles, `aria`, encabezados, etiquetas, listas, tablas, landmarks e `id`
 * repetidos.
 *
 * Lo que necesita pintar de verdad no se comprueba aquí (no hay CSS ni cajas):
 * - el **contraste** lo cubren los tests de tokens y de la marca publicada con los pares reales de la interfaz;
 * - el **tamaño de los objetivos táctiles** y el **foco visible**, el test de clases de los controles
 *   (`controles-accesibles.test.ts`).
 *
 * axe se carga una sola vez contra una ventana propia y **no deja `window` ni `document` globales**: el resto de la
 * suite sigue viéndose como servidor.
 */

const ventana = new Window({ url: "http://localhost/" });
const global = globalThis as { window?: unknown; document?: unknown };
global.window = ventana;
global.document = ventana.document;
const axe = (await import("axe-core")).default;
delete global.window;
delete global.document;

const SIN_PINTAR = { "color-contrast": { enabled: false }, "target-size": { enabled: false } };

export interface OpcionesAxe {
  /** Fragmento suelto (un componente): sin landmarks ni `<h1>` obligatorios. Por defecto se revisa como página. */
  fragmento?: boolean;
  /** Reglas que no aplican a este caso, con su motivo en el test. */
  sinReglas?: string[];
}

/** Violaciones de axe del HTML dado, envuelto en un documento en castellano. Solo las serias y críticas bloquean. */
export async function revisarConAxe(html: string, opciones: OpcionesAxe = {}): Promise<Result[]> {
  const cuerpo = opciones.fragmento ? `<main><h1>Prueba</h1>${html}</main>` : html;
  ventana.document.documentElement.innerHTML = `<head><title>Prueba</title></head><body>${cuerpo}</body>`;
  ventana.document.documentElement.setAttribute("lang", "es");
  const reglas: RunOptions["rules"] = { ...SIN_PINTAR };
  for (const id of opciones.sinReglas ?? []) reglas[id] = { enabled: false };
  if (opciones.fragmento) reglas.region = { enabled: false };
  const resultado: AxeResults = await axe.run(ventana.document.documentElement as unknown as Element, {
    resultTypes: ["violations"],
    rules: reglas,
  });
  return resultado.violations;
}

/** Resumen legible de las violaciones para el mensaje del test: regla, gravedad y el primer nodo afectado. */
export function resumirViolaciones(violaciones: readonly Result[]): string[] {
  return violaciones.map(
    (v) => `${v.id} (${v.impact ?? "?"}, ${v.nodes.length}): ${v.help} → ${v.nodes[0]?.html.slice(0, 160) ?? ""}`,
  );
}

/** Solo las serias y críticas: las moderadas y menores se listan en el informe, pero no rompen la suite. */
export const graves = (violaciones: readonly Result[]): Result[] =>
  violaciones.filter((v) => v.impact === "serious" || v.impact === "critical");

/**
 * Revisa el HTML y devuelve el resumen de las violaciones que bloquean (serias y críticas) y de todas. El test compara
 * las graves con `[]`, así el fallo enseña la regla y el nodo en lugar de un número.
 */
export async function auditar(
  html: string,
  opciones: OpcionesAxe = {},
): Promise<{ graves: string[]; todas: string[] }> {
  const violaciones = await revisarConAxe(html, opciones);
  return { graves: resumirViolaciones(graves(violaciones)), todas: resumirViolaciones(violaciones) };
}
