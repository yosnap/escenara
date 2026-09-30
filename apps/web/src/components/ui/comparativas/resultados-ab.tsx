"use client";

import { Trophy } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import type { AlternativaVista, ComparativaVista } from "@/lib/comparativas";
import { ETIQUETA_ESTADO, formatearCreditos } from "@/lib/generacion";
import { Alerta } from "../alerta";
import { Boton } from "../button";
import { cn } from "../cn";

/** El diálogo de elegir ganadora se carga al pulsar: la página de resultados no lo necesita hasta entonces. */
const DialogoGanadora = dynamic(() => import("./dialogo-ganadora").then((m) => m.DialogoGanadora), { ssr: false });

/**
 * Resultados de una comparativa A/B **lado a lado**: cada alternativa con su estado real, su coste confirmado e
 * informado y su clip. Elegir ganadora no gasta nada, pero cambia el clip de la escena y deja sin valor su revisión,
 * así que se confirma en un diálogo del catálogo (nunca `confirm()`) que lo dice antes.
 */

function Coste({ alternativa }: { alternativa: AlternativaVista }) {
  return (
    <p className="text-sm text-texto-suave">
      Confirmado: {formatearCreditos(alternativa.creditosConfirmados)}
      {alternativa.creditosConsumidos !== null && ` · informado: ${formatearCreditos(alternativa.creditosConsumidos)}`}
    </p>
  );
}

function Alternativa({
  alternativa,
  ocupado,
  onElegir,
}: {
  alternativa: AlternativaVista;
  ocupado: boolean;
  onElegir: (a: AlternativaVista) => void;
}) {
  const estado = alternativa.estado === null ? "No se encoló" : ETIQUETA_ESTADO[alternativa.estado];
  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-tarjeta border-2 bg-superficie p-4",
        alternativa.elegida ? "border-correcto" : "border-borde",
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold text-texto">{alternativa.nombre}</h3>
        <span className="rounded-full bg-elevada px-3 py-1 text-sm font-semibold text-texto">
          {alternativa.elegida ? "Ganadora" : estado}
        </span>
      </header>
      <div className="flex aspect-[9/16] max-h-[28rem] items-center justify-center overflow-hidden rounded-control bg-elevada">
        {alternativa.medio ? (
          <video
            src={alternativa.medio.url}
            controls
            muted
            preload="none"
            playsInline
            className="size-full object-contain"
            aria-label={`Clip de ${alternativa.nombre}`}
          />
        ) : (
          <p className="p-4 text-center text-sm text-texto-suave">
            {alternativa.estado === "listo" ? "El archivo ya no está en tu biblioteca." : estado}
          </p>
        )}
      </div>
      <Coste alternativa={alternativa} />
      {alternativa.error !== "" && (
        <Alerta tipo="error" anuncio="ninguno" compacta titulo="Esta alternativa no ha salido">
          {alternativa.error}{" "}
          {alternativa.pudoCobrarse
            ? "Falló después de hablar con el proveedor, así que puede haberse cobrado: lo verás en tu historial."
            : "No llegó al proveedor: no se ha cobrado."}
        </Alerta>
      )}
      {alternativa.estado === "listo" && alternativa.medio && !alternativa.elegida && (
        <Boton
          variante="secundario"
          icono={<Trophy className="size-4" />}
          disabled={ocupado}
          onClick={() => onElegir(alternativa)}
          className="self-start"
        >
          Elegir esta
        </Boton>
      )}
    </article>
  );
}

export function ResultadosAB({
  comparativa,
  ocupado,
  onElegir,
}: {
  comparativa: ComparativaVista;
  ocupado: boolean;
  onElegir: (trabajoId: string) => void;
}) {
  const [pendiente, setPendiente] = useState<AlternativaVista | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-texto-suave">
        {comparativa.ejecucionesReales} de {comparativa.ejecucionesPrevistas} ejecuciones encoladas ·{" "}
        {formatearCreditos(comparativa.creditosEstimados)} confirmados ·{" "}
        {formatearCreditos(comparativa.creditosConsumidos)} informados por el proveedor
        {comparativa.terminada ? "" : " · se actualiza solo mientras hay alguna en marcha"}
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {comparativa.alternativas.map((a) => (
          <Alternativa key={a.modelo} alternativa={a} ocupado={ocupado} onElegir={setPendiente} />
        ))}
      </div>
      {pendiente !== null && (
        <DialogoGanadora
          nombre={pendiente.nombre}
          ocupado={ocupado}
          onCerrar={() => setPendiente(null)}
          onConfirmar={() => {
            const trabajoId = pendiente.trabajoId;
            setPendiente(null);
            if (trabajoId) onElegir(trabajoId);
          }}
        />
      )}
    </div>
  );
}
