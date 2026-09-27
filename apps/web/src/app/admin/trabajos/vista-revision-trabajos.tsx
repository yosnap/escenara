"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { Aviso, EstadoVacio } from "@/components/ui/feedback";
import { Campo, EntradaTexto } from "@/components/ui/field";
import { formatearCreditos, MS_LATIDO_WORKER } from "@/lib/generacion";
import type { TrabajoEnRevision } from "@/server/cola/revision";
import { resolverTrabajoAccion } from "./acciones";

export interface WorkerVista {
  id: string;
  arrancado: string;
  visto: string;
  atendidos: number;
}

/**
 * Resolución manual de los trabajos sin respuesta y estado de los workers. Cerrar un trabajo aquí apunta los
 * créditos comprobados, suelta su reserva y deja el motivo escrito: es lo que evita que una reserva se quede
 * retenida para siempre.
 */
export function VistaRevisionTrabajos({
  iniciales,
  excesos,
  workers,
}: {
  iniciales: TrabajoEnRevision[];
  excesos: TrabajoEnRevision[];
  workers: WorkerVista[];
}) {
  const [trabajos, setTrabajos] = useState(iniciales);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <EstadoWorkers workers={workers} />
      <ExcesosDeLimite trabajos={excesos} />
      {error && <Aviso tono="error">{error}</Aviso>}
      {trabajos.length === 0 ? (
        <EstadoVacio
          titulo="No hay ningún trabajo en revisión"
          texto="Cuando un trabajo se queda sin respuesta del proveedor aparecerá aquí con su reserva apartada."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {trabajos.map((trabajo) => (
            <FilaRevision key={trabajo.id} trabajo={trabajo} onResuelto={setTrabajos} onError={setError} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Trabajos en los que el proveedor cobró más de lo que el usuario autorizó. No hay nada que corregir aquí: el
 * gasto real ya está apuntado. Lo que indica es que el precio del catálogo está desfasado o que el modelo cobra
 * por unidad de tiempo sin declararla.
 */
function ExcesosDeLimite({ trabajos }: { trabajos: TrabajoEnRevision[] }) {
  if (trabajos.length === 0) return null;
  return (
    <section className="flex flex-col gap-2 rounded-tarjeta border border-borde bg-superficie p-4">
      <h2 className="text-xl font-bold text-texto">Cobros por encima del límite autorizado</h2>
      <p className="text-texto-suave">
        En estos trabajos el proveedor cobró más de lo que la persona autorizó. El gasto apuntado es el real y quien lo
        pidió ya está avisado. Revisa el precio de esos modelos en Admin › Modelos.
      </p>
      <ul className="flex flex-col gap-1 text-sm text-texto-suave">
        {trabajos.map((t) => (
          <li key={t.id}>
            {t.usuario} · <span className="font-mono">{t.modelo}</span> · autorizó{" "}
            {t.limiteCreditos === null ? "sin límite" : formatearCreditos(t.limiteCreditos)} y se cobraron{" "}
            {formatearCreditos(t.excesoCreditos ?? 0)} de más · {new Date(t.creadoEn).toLocaleString("es-ES")}
          </li>
        ))}
      </ul>
    </section>
  );
}

function EstadoWorkers({ workers }: { workers: WorkerVista[] }) {
  const vivos = workers.filter((w) => Date.now() - new Date(w.visto).getTime() < MS_LATIDO_WORKER);
  return (
    <section className="flex flex-col gap-2 rounded-tarjeta border border-borde bg-superficie p-4">
      <h2 className="text-xl font-bold text-texto">Workers de la cola</h2>
      {workers.length === 0 ? (
        <p className="text-texto-suave">
          Nunca ha latido ningún worker en esta instalación. Arráncalo con{" "}
          <code className="font-mono">bun run worker</code> (o con <code className="font-mono">bun run dev</code>, que
          lo arranca junto a la web).
        </p>
      ) : (
        <>
          <p className="text-texto-suave">
            {vivos.length === 0
              ? "Ninguno está latiendo ahora mismo: los trabajos en cola esperan."
              : `${vivos.length} atendiendo la cola.`}
          </p>
          <ul className="flex flex-col gap-1 text-sm text-texto-suave">
            {workers.map((w) => (
              <li key={w.id}>
                <span className="font-mono">{w.id}</span> · último latido {new Date(w.visto).toLocaleString("es-ES")} ·{" "}
                {w.atendidos} trabajos atendidos
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function FilaRevision({
  trabajo,
  onResuelto,
  onError,
}: {
  trabajo: TrabajoEnRevision;
  onResuelto: (trabajos: TrabajoEnRevision[]) => void;
  onError: (error: string | null) => void;
}) {
  const [creditos, setCreditos] = useState("0");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  const numero = Number(creditos);
  const valido = Number.isFinite(numero) && numero >= 0 && motivo.trim().length >= 5;

  const resolver = async () => {
    setGuardando(true);
    onError(null);
    const respuesta = await resolverTrabajoAccion(trabajo.id, numero, motivo);
    setGuardando(false);
    if (!respuesta.ok) {
      onError(respuesta.error);
      return;
    }
    onResuelto(respuesta.trabajos);
  };

  return (
    <li className="flex flex-col gap-3 rounded-tarjeta border border-borde bg-superficie p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-semibold text-texto">
          {trabajo.usuario} ({trabajo.correo})
        </span>
        <span className="text-sm text-texto-suave">
          {trabajo.tipo} · <span className="font-mono">{trabajo.modelo}</span> ·{" "}
          {new Date(trabajo.creadoEn).toLocaleString("es-ES")}
        </span>
      </div>
      <p className="text-sm text-texto-suave">
        Tarea en {trabajo.proveedor}: <span className="font-mono">{trabajo.taskId ?? "sin identificador"}</span> ·
        estimado {formatearCreditos(trabajo.creditosEstimados)} · reservado {formatearCreditos(trabajo.reservado)}
      </p>
      {trabajo.motivo && <p className="text-sm text-texto">{trabajo.motivo}</p>}
      <div className="flex flex-wrap items-end gap-3">
        <Campo etiqueta="Créditos comprobados" ayuda="0 si el proveedor no llegó a cobrar.">
          {(p) => (
            <EntradaTexto
              {...p}
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={creditos}
              onChange={(e) => setCreditos(e.target.value)}
              className="max-w-36"
            />
          )}
        </Campo>
        <Campo etiqueta="Qué has comprobado" ayuda="Queda escrito en el registro de gasto.">
          {(p) => (
            <EntradaTexto
              {...p}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="La tarea no aparece en el panel de KIE: no se cobró."
            />
          )}
        </Campo>
        <Boton icono={<Check className="size-4" />} cargando={guardando} disabled={!valido} onClick={resolver}>
          Cerrar el gasto
        </Boton>
      </div>
    </li>
  );
}
