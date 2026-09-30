"use client";

import { Check, CircleHelp, X } from "lucide-react";
import type { ReactNode } from "react";
import { Alerta } from "@/components/ui/alerta";
import {
  type ComprobacionRevision,
  ETIQUETA_COMPROBACION,
  LIMITE_DE_LO_AUTOMATICO,
  type ResultadoComprobacion,
  type RevisionVista,
} from "@/lib/revision";

/**
 * Las comprobaciones técnicas de un clip, **cada una con su valor medido y el que se pedía**.
 *
 * Decir «falla la duración» sin decir cuánto dura no permite decidir nada, así que las dos cifras se muestran
 * siempre. Y debajo va, también siempre, lo que la comprobación automática **no** garantiza: un panel con seis
 * vistos verdes invita a pensar que el personaje está validado, y no lo está.
 */

const ICONO: Record<ResultadoComprobacion, ReactNode> = {
  pasa: <Check className="size-4 text-correcto" aria-hidden />,
  falla: <X className="size-4 text-error" aria-hidden />,
  no_medible: <CircleHelp className="size-4 text-aviso" aria-hidden />,
};

const TEXTO_RESULTADO: Record<ResultadoComprobacion, string> = {
  pasa: "Pasa",
  falla: "Falla",
  no_medible: "No se ha podido medir",
};

export function ListaComprobaciones({ revision }: { revision: RevisionVista }) {
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {revision.comprobaciones.map((c) => (
          <Fila key={c.clave} comprobacion={c} />
        ))}
      </ul>
      <Alerta tipo="info" compacta anuncio="ninguno">
        {LIMITE_DE_LO_AUTOMATICO}
      </Alerta>
      <p className="text-sm text-texto-suave">
        Comprobado con las reglas {revision.reglasVersion} el{" "}
        {new Date(revision.creadoEn).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}.
      </p>
    </div>
  );
}

function Fila({ comprobacion }: { comprobacion: ComprobacionRevision }) {
  return (
    <li className="rounded-control bg-elevada p-3">
      <div className="flex flex-wrap items-center gap-2">
        {ICONO[comprobacion.resultado]}
        <span className="font-semibold text-texto">{ETIQUETA_COMPROBACION[comprobacion.clave]}</span>
        <span className="text-sm text-texto-suave">{TEXTO_RESULTADO[comprobacion.resultado]}</span>
      </div>
      <dl className="mt-1 flex flex-wrap gap-x-6 gap-y-0.5 text-sm">
        <div className="flex gap-2">
          <dt className="text-texto-suave">Medido:</dt>
          <dd className="font-mono text-texto">{comprobacion.medido === "" ? "sin dato" : comprobacion.medido}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-texto-suave">Se pedía:</dt>
          <dd className="font-mono text-texto">{comprobacion.esperado}</dd>
        </div>
      </dl>
      <p className="mt-1 text-sm text-texto-suave">{comprobacion.motivo}</p>
    </li>
  );
}
