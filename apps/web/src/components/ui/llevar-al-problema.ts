"use client";

import { MS_FLECHA, type Problema, planDeLlegada, posicionDeFlecha } from "@/lib/llevar-al-problema";
import type { NavegacionDePasos } from "./contexto-pasos";

/**
 * **Llevar al problema** en la página: cambia al paso que lo contiene, lo desplaza a la vista, enfoca su control (sin
 * atrapar el foco), lo resalta con un aro de marca y le pone encima una flecha que lo señala. La flecha y el aro se
 * quitan a los pocos segundos, al tocar el campo o al pulsar en otro sitio.
 *
 * Con «reducir movimiento» no hay desplazamiento suave, la flecha no se mueve y el aro no late (ver `globals.css`).
 */

/** Clases de la flecha, compartidas con la muestra del catálogo (`FlechaProblema`) para que las dos sean la misma. */
export const CLASES_FLECHA =
  "pointer-events-none flex size-10 items-center justify-center rounded-full bg-acento text-sobre-acento shadow-lg";
/** El rebote solo corre si la persona no ha pedido reducir el movimiento. */
export const CLASES_FLECHA_ANIMADA =
  "motion-safe:animate-[rebote-flecha_900ms_ease-in-out_infinite] motion-reduce:animate-none";

/** Flecha hacia abajo (la misma forma que `ArrowDown` de lucide), como texto fijo: no lleva nada que venga de fuera. */
const SVG_FLECHA =
  '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>';

/** Lo que se puede enfocar dentro de un bloque marcado: el propio control, no su envoltorio. */
const CONTROL_ENFOCABLE =
  'textarea, input:not([type="hidden"]), button:not([disabled]), [role="checkbox"], [role="combobox"], [tabindex]:not([tabindex="-1"])';

const escaparSelector = (valor: string) =>
  typeof CSS !== "undefined" && "escape" in CSS ? CSS.escape(valor) : valor.replace(/["\\]/g, "\\$&");

/** El bloque marcado con `data-requisito`, si está en la página. */
export const buscarProblema = (id: string, documento: Document = document) =>
  documento.querySelector<HTMLElement>(`[data-requisito="${escaparSelector(id)}"]`);

export const sinMovimiento = (documento: Document) =>
  documento.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** Cada cuánto se comprueba, mientras dura la señal, que el bloque sigue ahí y dónde está. */
const MS_VIGILANCIA = 200;

/** El señalamiento en curso: solo hay uno a la vez; señalar otro bloque quita el anterior. */
let quitarSenalActual: (() => void) | null = null;

/** Quita la flecha y el aro del bloque señalado, si hay alguno. */
export function quitarSenal(): void {
  const quitar = quitarSenalActual;
  quitarSenalActual = null;
  quitar?.();
}

function senalar(marca: HTMLElement, documento: Document): void {
  quitarSenal();
  const ventana = documento.defaultView;
  // Quitar y volver a poner la marca reinicia el latido si se pulsa dos veces seguidas.
  marca.removeAttribute("data-resaltado");
  void marca.offsetWidth;
  marca.setAttribute("data-resaltado", "true");

  const flecha = documento.createElement("span");
  flecha.setAttribute("aria-hidden", "true");
  flecha.setAttribute("data-flecha-problema", "");
  flecha.className = `${CLASES_FLECHA} ${CLASES_FLECHA_ANIMADA}`;
  flecha.style.position = "absolute";
  flecha.style.zIndex = "60";
  flecha.innerHTML = SVG_FLECHA;
  /**
   * Coloca la flecha encima del bloque. Se llama al empezar, al desplazarse **cualquier** contenedor (la página o un
   * diálogo con desplazamiento propio: el `scroll` se escucha en captura porque no burbujea), al terminar el
   * desplazamiento, al cambiar el tamaño de la ventana y cada poco mientras dura. Si el bloque ya no está en la página
   * (se ha cerrado el diálogo, se ha cambiado de pantalla) o su paso se ha ocultado, la señal se quita.
   */
  const colocar = () => {
    if (!marca.isConnected || marca.closest("[hidden]")) {
      quitarSenal();
      return;
    }
    const rect = marca.getBoundingClientRect();
    const { top, left } = posicionDeFlecha(
      rect,
      { x: ventana?.scrollX ?? 0, y: ventana?.scrollY ?? 0 },
      ventana?.innerWidth ?? rect.width,
    );
    flecha.style.top = `${top}px`;
    flecha.style.left = `${left}px`;
  };
  colocar();
  documento.body.appendChild(flecha);

  const alPulsarFuera = (evento: Event) => {
    const dentro = typeof Node !== "undefined" && evento.target instanceof Node && marca.contains(evento.target);
    if (!dentro) quitarSenal();
  };
  // Escape cierra diálogos y menús: la flecha no se queda encima de lo que haya debajo.
  const alPulsarTecla = (evento: Event) => {
    if ((evento as KeyboardEvent).key === "Escape") quitarSenal();
  };
  const alResolver = () => quitarSenal();
  const escuchas: [EventTarget | null | undefined, string, EventListener, boolean][] = [
    [documento, "pointerdown", alPulsarFuera, true],
    [documento, "keydown", alPulsarTecla, true],
    [documento, "scroll", colocar, true],
    [documento, "scrollend", colocar, true],
    [marca, "input", alResolver, false],
    [marca, "change", alResolver, false],
    [ventana, "resize", colocar, false],
  ];
  for (const [objetivo, evento, escucha, captura] of escuchas) objetivo?.addEventListener(evento, escucha, captura);
  const temporizador = ventana?.setTimeout(quitarSenal, MS_FLECHA);
  const vigilancia = ventana?.setInterval(colocar, MS_VIGILANCIA);

  quitarSenalActual = () => {
    // Primero se suelta: `colocar` puede volver a llamar a `quitarSenal` mientras se limpia.
    quitarSenalActual = null;
    if (temporizador !== undefined) ventana?.clearTimeout(temporizador);
    if (vigilancia !== undefined) ventana?.clearInterval(vigilancia);
    for (const [objetivo, evento, escucha, captura] of escuchas)
      objetivo?.removeEventListener(evento, escucha, captura);
    marca.removeAttribute("data-resaltado");
    flecha.remove();
  };
}

/**
 * Lleva a un bloque que ya se ve: lo desplaza a la vista, enfoca su control y lo señala. Devuelve `false` si no está en
 * la página o si su paso sigue oculto (no hay dónde enfocar).
 */
export function enfocarProblema(id: string, documento: Document = document): boolean {
  const marca = buscarProblema(id, documento);
  if (!marca || marca.closest("[hidden]")) return false;
  const control = marca.matches(CONTROL_ENFOCABLE) ? marca : marca.querySelector<HTMLElement>(CONTROL_ENFOCABLE);
  marca.scrollIntoView({ block: "center", behavior: sinMovimiento(documento) ? "auto" : "smooth" });
  if (control) control.focus({ preventScroll: true });
  else {
    marca.tabIndex = -1;
    marca.focus({ preventScroll: true });
  }
  senalar(marca, documento);
  return true;
}

/** Enfoca en cuanto el paso se pinta: el cambio de paso se aplica al terminar el evento, y a veces tarda un poco más. */
function enfocarCuandoSeVea(id: string, documento?: Document): void {
  const ventana = documento?.defaultView ?? window;
  ventana.setTimeout(() => {
    if (!enfocarProblema(id, documento ?? document))
      ventana.setTimeout(() => enfocarProblema(id, documento ?? document), 80);
  }, 0);
}

/** Lo que hace falta de un flujo por pasos para llegar a un problema. Sin paso actual se va siempre al del problema. */
export type NavegacionParaProblema = Pick<NavegacionDePasos, "ir" | "estaBloqueado" | "avisar"> & {
  actual?: string;
};

/**
 * Lleva a un problema: cambia al paso que lo contiene (el que dice el problema o, si no lo dice, el del panel donde está
 * en la página), lo desplaza, lo enfoca y lo señala. Un paso bloqueado no se abre: se dice por qué. Fuera de un flujo
 * por pasos solo se desplaza y se enfoca.
 */
export function llevarAlProblema(
  problema: Problema,
  navegacion?: NavegacionParaProblema | null,
  documento?: Document,
): void {
  const id = problema.id;
  if (id === undefined || id === "") return;
  if (!navegacion) {
    enfocarProblema(id, documento ?? document);
    return;
  }
  // Si el problema ya dice su paso no hace falta mirar la página (y se puede llamar antes de que se pinte).
  const pasoEnLaPagina =
    problema.paso !== undefined && problema.paso !== ""
      ? null
      : (buscarProblema(id, documento ?? document)
          ?.closest("[data-panel-paso]")
          ?.getAttribute("data-panel-paso") ?? null);
  const plan = planDeLlegada(problema, {
    pasoEnLaPagina,
    pasoActual: navegacion.actual ?? null,
    estaBloqueado: navegacion.estaBloqueado,
  });
  if (plan.accion === "paso-bloqueado") navegacion.avisar(plan.paso);
  else if (plan.accion === "cambiar-paso") {
    navegacion.ir(plan.paso);
    enfocarCuandoSeVea(id, documento);
  } else if (plan.accion === "enfocar" && !enfocarProblema(id, documento ?? document))
    enfocarCuandoSeVea(id, documento);
}
