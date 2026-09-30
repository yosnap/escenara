"use client";

import { useState } from "react";
import { irARequisito } from "@/components/ui/requisitos";
import type { PasoDelFlujo } from "@/lib/multipaso";
import type { Requisito } from "@/lib/requisitos";

/**
 * **Cuándo se marca en rojo lo que falta.** El bloque «Antes de generar, falta:» y el número de la barra están siempre
 * (son información), pero el aro rojo, `aria-invalid` y el mensaje bajo el campo solo salen para los pasos «señalados»:
 * aquellos de los que la persona ya ha salido, a los que ha ido desde un requisito o en los que ha intentado generar o
 * continuar con algo pendiente. Al abrir un paso por primera vez no hay nada en rojo.
 */
export function useRequisitosSenalados<
  C extends { actual: string; ir: (id: string) => void; avisar: (id: string) => void },
>(pasos: readonly PasoDelFlujo[], control: C) {
  const [senalados, setSenalados] = useState<string[]>([]);
  const senalar = (paso: string) => setSenalados((antes) => (antes.includes(paso) ? antes : [...antes, paso]));

  /** Los requisitos que ya se pueden marcar: los de pasos señalados. */
  const marcados = (requisitos: readonly Requisito[]) => requisitos.filter((r) => senalados.includes(r.paso));

  /** Va al paso y al campo de un requisito y lo marca. Un paso bloqueado no se abre: se dice por qué. */
  const irAlRequisito = (requisito: Requisito) => {
    senalar(requisito.paso);
    irARequisito(requisito, {
      irAlPaso: control.ir,
      estaBloqueado: (paso) => pasos.find((p) => p.id === paso)?.estado === "bloqueado",
      avisarBloqueado: control.avisar,
      // En el mismo paso no se cambia de paso: se lleva al campo al momento.
      actual: control.actual,
    });
  };

  /** El control de pasos que se le da a `Multipaso`: salir de un paso, o intentar continuar sin poder, lo señala. */
  const controlConSenales = {
    ...control,
    ir: (id: string) => {
      if (id !== control.actual) senalar(control.actual);
      control.ir(id);
    },
    avisar: (id: string) => {
      senalar(control.actual);
      control.avisar(id);
    },
  };

  return { senalados, marcados, irAlRequisito, controlConSenales };
}
