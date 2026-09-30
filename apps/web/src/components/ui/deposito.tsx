import { PiggyBank } from "lucide-react";
import type { ReactNode } from "react";
import { type Deposito, type EstadoCola, enQueEstaRetenido, formatearCreditos, formatearEuros } from "@/lib/generacion";

/**
 * «Depósito de presupuesto» (zona de claridad): superficie neutra, sin degradados ni movimiento, como el
 * panel de coste. Muestra lo que esta instalación te autoriza a comprometer, lo que tienes apartado en
 * trabajos en marcha y lo que ya has gastado.
 *
 * Todo va etiquetado como estimación salvo lo que el proveedor ya ha informado, y se dice expresamente que
 * el presupuesto no es dinero de Escenara: se paga con los créditos de la cuenta del propio usuario.
 */
export function DepositoPresupuesto({
  deposito,
  cola,
  children,
}: {
  deposito: Deposito;
  cola?: EstadoCola | null;
  children?: ReactNode;
}) {
  const {
    autorizado,
    reservado,
    retenido,
    trabajosEnRevision,
    llamadasDeTextoColgadas,
    revisionesColgadas,
    consumido,
    disponible,
    topeTrabajo,
    consumidoEuros,
  } = deposito;
  return (
    <section
      aria-label="Depósito de presupuesto"
      className="flex flex-col gap-4 rounded-tarjeta border-2 border-borde bg-superficie p-5"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-elevada text-texto [&>svg]:size-5"
        >
          <PiggyBank />
        </span>
        <div>
          <h2 className="text-lg font-bold text-texto">Depósito de presupuesto</h2>
          <p className="text-sm text-texto-suave">
            Es un tope por cuenta que fija quien administra esta instalación, igual para todas las cuentas por ahora. No
            es dinero de Escenara: cada trabajo se paga con los créditos de tu propia cuenta del proveedor.
          </p>
        </div>
      </div>

      <dl className="grid gap-3 sm:grid-cols-4">
        <Dato
          etiqueta="Autorizado"
          valor={autorizado === null ? "Sin tope propio" : formatearCreditos(autorizado)}
          destacado
        />
        <Dato etiqueta="Reservado ahora" valor={formatearCreditos(reservado)} />
        <Dato etiqueta="Consumido" valor={formatearCreditos(consumido)} />
        <Dato
          etiqueta="Disponible"
          valor={disponible === null ? "Sin tope propio" : formatearCreditos(disponible)}
          destacado
        />
      </dl>

      {retenido > 0 && (
        <p className="rounded-control bg-elevada p-3 text-sm font-medium text-texto">
          De lo reservado, {formatearCreditos(retenido)} están <strong className="font-semibold">retenidos</strong> en{" "}
          {/*
            El «en qué» lo escribe la misma función que usa el servidor al rechazar un gasto por presupuesto
            (`presupuesto/mensajes.ts`): antes esta frase solo hablaba de trabajos pendientes de revisión, así que
            con una llamada de texto o una revisión colgada decía algo que no era verdad. Una explicación del
            mismo hecho escrita dos veces acaba divergiendo siempre.
          */}
          {enQueEstaRetenido(trabajosEnRevision, llamadasDeTextoColgadas, revisionesColgadas)}: el proveedor no contestó
          y no se sabe si cobró, así que no se sueltan solos.
        </p>
      )}

      {cola && (
        <p className="text-sm text-texto-suave">
          {cola.enCola === 0 && cola.enMarcha === 0
            ? "No tienes trabajos en marcha."
            : `Tienes ${cola.enCola} en cola y ${cola.enMarcha} en el proveedor.`}{" "}
          {cola.workerActivo ? "La cola se está atendiendo." : "Ahora mismo no hay ningún proceso atendiendo la cola."}
        </p>
      )}

      {children}

      <p className="text-sm text-texto-suave">
        Lo reservado es una <strong className="font-semibold text-texto">estimación</strong> del coste máximo de los
        trabajos en marcha; se ajusta al terminar con los créditos que informe el proveedor, que es quien decide el
        precio final. Lo consumido equivale a unos {formatearEuros(consumidoEuros)} con el cambio configurado.
        {topeTrabajo !== null && ` El tope por trabajo es de ${formatearCreditos(topeTrabajo)}.`}
      </p>
    </section>
  );
}

function Dato({ etiqueta, valor, destacado }: { etiqueta: string; valor: string; destacado?: boolean }) {
  return (
    <div className="rounded-control bg-elevada px-3 py-2">
      <dt className="text-sm text-texto-suave">{etiqueta}</dt>
      <dd className={destacado ? "font-mono text-lg font-semibold text-texto" : "font-mono text-base text-texto"}>
        {valor}
      </dd>
    </div>
  );
}
