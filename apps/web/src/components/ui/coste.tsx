import { Coins, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { type Estimacion, formatearCreditos, formatearEuros } from "@/lib/generacion";
import { cn } from "./cn";

/**
 * Panel de coste (zona de claridad): superficie neutra, sin degradados ni movimiento. Muestra los créditos
 * estimados, el saldo del proveedor y el equivalente aproximado en euros, siempre etiquetado como
 * estimación y con la fecha en que se comprobó el precio. Nunca se muestra un importe como si fuera final.
 */
export function PanelCoste({
  estimacion,
  aviso,
  children,
}: {
  estimacion: Estimacion;
  /** Motivo por el que todavía no se puede generar (falta clave, saldo o consentimiento). */
  aviso?: ReactNode;
  /** Controles de confirmación, si los hay. */
  children?: ReactNode;
}) {
  const { creditos, euros, saldo, superaUmbral, umbral, modelo, unidad, fuente, comprobado } = estimacion;
  return (
    <section
      aria-label="Coste estimado"
      className="flex flex-col gap-4 rounded-tarjeta border-2 border-borde bg-superficie p-5"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-elevada text-texto [&>svg]:size-5"
        >
          <Coins />
        </span>
        <div>
          <h3 className="text-lg font-bold text-texto">Coste estimado</h3>
          <p className="text-sm text-texto-suave">
            Se paga con los créditos de tu cuenta de KIE, no con los de Escenara.
          </p>
        </div>
      </div>

      <dl className="grid gap-3 sm:grid-cols-3">
        <Dato etiqueta="Estimación" valor={formatearCreditos(creditos)} destacado />
        <Dato etiqueta="Equivalente aproximado" valor={`≈ ${formatearEuros(euros)}`} />
        <Dato etiqueta="Tu saldo en KIE" valor={saldo === null ? "No se ha podido leer" : formatearCreditos(saldo)} />
      </dl>

      {superaUmbral && (
        <p className="flex items-start gap-2 rounded-control bg-elevada p-3 text-sm font-medium text-texto">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-aviso" aria-hidden />
          Este trabajo pasa del aviso de {formatearCreditos(umbral)} por trabajo. Confirma que quieres gastarlos.
        </p>
      )}

      {aviso && <div className="text-sm font-medium text-texto">{aviso}</div>}
      {children}

      <p className="text-sm text-texto-suave">
        Es una <strong className="font-semibold text-texto">estimación</strong>: el importe final lo decide el proveedor
        y se guarda tal como lo informe. Precio de <span className="font-mono">{modelo}</span> por {unidad}: {fuente},
        comprobado el {comprobado}.
      </p>
    </section>
  );
}

function Dato({ etiqueta, valor, destacado }: { etiqueta: string; valor: string; destacado?: boolean }) {
  return (
    <div className="rounded-control bg-elevada px-3 py-2">
      <dt className="text-sm text-texto-suave">{etiqueta}</dt>
      <dd className={cn("font-mono font-semibold text-texto", destacado ? "text-2xl" : "text-base")}>{valor}</dd>
    </div>
  );
}
