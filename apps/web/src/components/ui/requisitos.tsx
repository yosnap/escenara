"use client";

import { ArrowRight, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useId } from "react";
import type { Requisito } from "@/lib/requisitos";
import { cn } from "./cn";

/**
 * **Aviso de requisitos** (0.33.1): lo que falta antes de poder generar, arriba del paso y con cada punto como botón
 * que lleva al campo. Es zona de claridad: borde completo (nunca lateral), icono y texto (nunca solo color) y sin
 * animación propia.
 *
 * No sabe nada de pasos ni de formularios: recibe los requisitos y avisa de cuál se ha pulsado. Quien lo usa decide
 * cómo llegar al campo (normalmente `irARequisito`).
 */
export function AvisoRequisitos({
  requisitos,
  titulo = "Antes de generar, falta:",
  onIr,
  className,
}: {
  requisitos: readonly Requisito[];
  titulo?: string;
  onIr: (requisito: Requisito) => void;
  className?: string;
}) {
  const idTitulo = useId();
  if (requisitos.length === 0) return null;
  return (
    <section
      aria-labelledby={idTitulo}
      className={cn("flex flex-col gap-2 rounded-tarjeta border-2 border-error bg-superficie p-4", className)}
    >
      <h4 id={idTitulo} className="flex items-center gap-2 font-bold text-texto">
        <TriangleAlert className="size-5 shrink-0 text-error" aria-hidden />
        {titulo}
      </h4>
      <ul className="flex flex-col">
        {requisitos.map((requisito) => (
          <li key={`${requisito.id}|${requisito.texto}`}>
            <button
              type="button"
              onClick={() => onIr(requisito)}
              className="flex min-h-11 w-full items-center justify-between gap-3 rounded-control px-2 text-left text-texto hover:bg-elevada"
            >
              <span>{requisito.texto}</span>
              <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-acento">
                Ir al campo
                <ArrowRight className="size-4" aria-hidden />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Envoltorio para señalar un control que no lleva su propia marca de error (un selector, una lista de fotos): le pone
 * `data-requisito` para llegar a él, un aro de error completo y debajo lo que falta, con icono y texto.
 */
export function MarcaRequisito({ id, error, children }: { id: string; error?: string; children: ReactNode }) {
  return (
    <div data-requisito={id} className={cn("flex flex-col gap-1.5", error && "rounded-control p-2 ring-2 ring-error")}>
      {children}
      {error && (
        <p className="flex items-center gap-1 text-sm font-medium text-error">
          <span aria-hidden>●</span> {error}
        </p>
      )}
    </div>
  );
}

/** Lo que se puede enfocar dentro de un campo marcado: el propio control, no su envoltorio. */
const CONTROL_ENFOCABLE =
  'textarea, input:not([type="hidden"]), button:not([disabled]), [role="checkbox"], [role="combobox"], [tabindex]:not([tabindex="-1"])';

/** Cuánto dura la marca de resaltado tras llegar a un campo. */
const MS_RESALTADO = 2400;

const escaparSelector = (valor: string) =>
  typeof CSS !== "undefined" && "escape" in CSS ? CSS.escape(valor) : valor.replace(/["\\]/g, "\\$&");

/**
 * Lleva a un campo marcado con `data-requisito`: lo desplaza a la vista, le da el foco y lo resalta unos segundos.
 * Devuelve `false` si no está en la página o si su paso sigue oculto (no hay dónde enfocar).
 *
 * Respeta `prefers-reduced-motion`: sin animación ni desplazamiento suave; el resaltado es un aro fijo (ver
 * `[data-resaltado]` en `globals.css`).
 */
export function enfocarRequisito(id: string, documento: Document = document): boolean {
  const marca = documento.querySelector<HTMLElement>(`[data-requisito="${escaparSelector(id)}"]`);
  if (!marca || marca.closest("[hidden]")) return false;
  const control = marca.matches(CONTROL_ENFOCABLE) ? marca : marca.querySelector<HTMLElement>(CONTROL_ENFOCABLE);
  const sinMovimiento = documento.defaultView?.matchMedia("(prefers-reduced-motion: reduce)").matches ?? false;
  marca.scrollIntoView({ block: "center", behavior: sinMovimiento ? "auto" : "smooth" });
  if (control) control.focus({ preventScroll: true });
  else {
    marca.tabIndex = -1;
    marca.focus({ preventScroll: true });
  }
  // Quitar y volver a poner la marca reinicia la animación si se pulsa dos veces seguidas.
  marca.removeAttribute("data-resaltado");
  void marca.offsetWidth;
  marca.setAttribute("data-resaltado", "true");
  documento.defaultView?.setTimeout(() => marca.removeAttribute("data-resaltado"), MS_RESALTADO);
  return true;
}

/**
 * Cambia al paso del requisito y, cuando ese paso ya se ve, enfoca el campo. El cambio de paso se aplica al terminar
 * el evento, así que el enfoque espera un turno: mientras el panel sigue oculto no hay nada que enfocar.
 */
export function irARequisito(requisito: Requisito, irAlPaso: (paso: string) => void): void {
  irAlPaso(requisito.paso);
  // Un segundo intento por si el paso tarda un poco más en pintarse.
  window.setTimeout(() => {
    if (!enfocarRequisito(requisito.id)) window.setTimeout(() => enfocarRequisito(requisito.id), 80);
  }, 0);
}
