"use client";

import type { ReactNode } from "react";
import type { Requisito } from "@/lib/requisitos";
import { Alerta } from "./alerta";
import { cn } from "./cn";
import { enfocarProblema, llevarAlProblema } from "./llevar-al-problema";

/**
 * **Aviso de requisitos** (0.33.1): lo que falta antes de poder generar, arriba del paso, con cada punto como botón que
 * lleva al campo, el primero destacado e «Ir al primero». Ya está en la pantalla al abrir el paso, así que no se
 * anuncia de golpe: es una región con nombre, y la barra de pasos dice cuántos faltan.
 *
 * Al llegar, lo que falta es un **paso pendiente** (tono neutro): todavía no ha fallado nada. Solo cuando la persona
 * ha intentado seguir o ha ido a un requisito (`marcar`) pasa a **bloqueo** rojo, igual que las casillas marcadas.
 *
 * No sabe nada de pasos ni de formularios: recibe los requisitos y avisa de cuál se ha pulsado. Quien lo usa decide
 * cómo llegar al campo (normalmente `irARequisito`).
 */
export function AvisoRequisitos({
  requisitos,
  titulo = "Antes de generar, falta:",
  marcar = false,
  onIr,
  className,
}: {
  requisitos: readonly Requisito[];
  titulo?: string;
  /** `true` cuando ya se ha intentado seguir o se ha ido a un requisito: entonces lo pendiente es un bloqueo. */
  marcar?: boolean;
  onIr: (requisito: Requisito) => void;
  className?: string;
}) {
  if (requisitos.length === 0) return null;
  return (
    <Alerta
      tipo={marcar ? "bloqueo" : "pendiente"}
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
      {/* alerta-permitida: mensaje bajo un control marcado */}
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
