"use client";

import type { ReactNode } from "react";
import type { Requisito } from "@/lib/requisitos";
import { Alerta } from "./alerta";
import { cn } from "./cn";
import { enfocarProblema, llevarAlProblema } from "./llevar-al-problema";

/**
 * **Aviso de requisitos** (0.33.1): lo que falta antes de poder generar, arriba del paso. Es la `Alerta` de bloqueo con
 * cada punto como botón que lleva al campo, el primero destacado e «Ir al primero». Ya está en la pantalla al abrir el
 * paso, así que no se anuncia de golpe: es una región con nombre, y la barra de pasos dice cuántos faltan.
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
  if (requisitos.length === 0) return null;
  return (
    <Alerta
      tipo="bloqueo"
      titulo={titulo}
      elementos={requisitos}
      onIr={onIr}
      anuncio="ninguno"
      protege
      className={className}
    />
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

/**
 * Lleva a un campo marcado con `data-requisito`: lo desplaza a la vista, le da el foco, lo resalta y lo señala con la
 * flecha. Devuelve `false` si no está en la página o si su paso sigue oculto. Es `enfocarProblema` con el nombre de
 * siempre.
 */
export const enfocarRequisito = (id: string, documento?: Document): boolean =>
  enfocarProblema(id, documento ?? document);

/**
 * Cambia al paso del requisito y, cuando ese paso ya se ve, enfoca el campo. Un paso bloqueado no se abre: se dice por
 * qué. Es `llevarAlProblema` con la navegación de siempre.
 */
export function irARequisito(
  requisito: Requisito,
  navegacion: {
    irAlPaso: (paso: string) => void;
    /** `true` si el paso está bloqueado: no se salta el candado, se dice por qué. */
    estaBloqueado: (paso: string) => boolean;
    avisarBloqueado: (paso: string) => void;
    /** Paso en el que se está: si es el del requisito, no se cambia de paso. */
    actual?: string;
  },
): void {
  llevarAlProblema(requisito, {
    ir: navegacion.irAlPaso,
    estaBloqueado: navegacion.estaBloqueado,
    avisar: navegacion.avisarBloqueado,
    actual: navegacion.actual,
  });
}
