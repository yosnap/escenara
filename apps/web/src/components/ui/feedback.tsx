import { AlertOctagon, CheckCircle2, Eye, Wrench } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";

/** Los cuatro estados de preparación del PRD. Siempre con icono, título y acción concreta. */
export type EstadoPreparacion = "listo" | "ajustes" | "revision" | "bloqueado";

const ESTADO: Record<
  EstadoPreparacion,
  { titulo: string; icono: ReactNode; borde: string; texto: string; circulo: string }
> = {
  listo: {
    titulo: "Listo para generar",
    icono: <CheckCircle2 />,
    borde: "border-correcto/45",
    texto: "text-correcto",
    circulo: "bg-correcto/12",
  },
  ajustes: {
    titulo: "Necesita ajustes",
    icono: <Wrench />,
    borde: "border-aviso/45",
    texto: "text-aviso",
    circulo: "bg-aviso/12",
  },
  revision: {
    titulo: "Requiere revisión",
    icono: <Eye />,
    borde: "border-acento/45",
    texto: "text-acento",
    circulo: "bg-acento/12",
  },
  bloqueado: {
    titulo: "Bloqueado por un requisito",
    icono: <AlertOctagon />,
    borde: "border-error/45",
    texto: "text-error",
    circulo: "bg-error/12",
  },
};

/** Zona de claridad: aviso de estado sin degradados ni animación. */
export function AvisoEstado({
  estado,
  motivo,
  accion,
}: {
  estado: EstadoPreparacion;
  motivo: ReactNode;
  accion?: ReactNode;
}) {
  const e = ESTADO[estado];
  return (
    <div role="status" className={cn("flex gap-3 rounded-tarjeta border-2 bg-superficie p-4", e.borde)}>
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full [&>svg]:size-5",
          e.circulo,
          e.texto,
        )}
        aria-hidden
      >
        {e.icono}
      </span>
      <div className="flex flex-1 flex-col gap-2">
        <p className={cn("font-bold", e.texto)}>{e.titulo}</p>
        <p className="text-texto">{motivo}</p>
        {accion && <div>{accion}</div>}
      </div>
    </div>
  );
}

export interface Etapa {
  nombre: string;
  estado: "hecha" | "en-curso" | "pendiente" | "error";
}

/** Progreso por etapas cualitativas: nunca muestra un porcentaje inventado. */
export function ProgresoEtapas({ etapas, etiqueta }: { etapas: Etapa[]; etiqueta: string }) {
  return (
    <ol aria-label={etiqueta} className="flex flex-col gap-2">
      {etapas.map((e) => (
        <li
          key={e.nombre}
          className="flex items-center gap-3"
          aria-current={e.estado === "en-curso" ? "step" : undefined}
        >
          <span
            aria-hidden
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
              e.estado === "hecha" && "bg-correcto text-superficie",
              e.estado === "en-curso" && "animate-pulse bg-degradado-escenario",
              e.estado === "pendiente" && "border-2 border-borde",
              e.estado === "error" && "bg-error text-superficie",
            )}
          >
            {e.estado === "hecha" ? "✓" : e.estado === "error" ? "!" : ""}
          </span>
          <span className={cn("text-base", e.estado === "pendiente" ? "text-texto-suave" : "text-texto font-medium")}>
            {e.nombre}
            <span className="sr-only">
              {" "}
              ({{ hecha: "hecha", "en-curso": "en curso", pendiente: "pendiente", error: "con error" }[e.estado]})
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Depósito de presupuesto (zona de claridad): gastado, reservado y disponible, siempre como estimación. */
export function DepositoPresupuesto({
  autorizado,
  gastado,
  reservado,
  moneda = "€",
}: {
  autorizado: number;
  gastado: number;
  reservado: number;
  moneda?: string;
}) {
  const f = (n: number) =>
    `${n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda}`;
  const pct = (n: number) => `${Math.min(100, (n / autorizado) * 100)}%`;
  const disponible = Math.max(0, autorizado - gastado - reservado);
  return (
    <section
      aria-label="Presupuesto del proyecto"
      className="flex flex-col gap-2 rounded-tarjeta border border-borde bg-superficie p-4"
    >
      <div className="flex items-baseline justify-between">
        <span className="font-semibold text-texto">Presupuesto autorizado</span>
        <span className="font-mono text-texto">{f(autorizado)}</span>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full bg-elevada" aria-hidden>
        <div className="bg-acento" style={{ width: pct(gastado) }} />
        <div className="bg-acento/40" style={{ width: pct(reservado) }} />
      </div>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        {[
          ["Gastado", gastado],
          ["Reservado", reservado],
          ["Disponible", disponible],
        ].map(([t, v]) => (
          <div key={t as string}>
            <dt className="text-texto-suave">{t}</dt>
            <dd className="font-mono font-semibold text-texto">{f(v as number)}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-texto-suave">Estimación: el importe final depende del proveedor.</p>
    </section>
  );
}

/** Estado vacío con invitación a la acción. */
export function EstadoVacio({
  titulo,
  texto,
  accion,
  icono,
}: {
  titulo: string;
  texto: string;
  accion?: ReactNode;
  icono?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-tarjeta border-2 border-dashed border-borde/60 px-6 py-10 text-center">
      {icono && <div className="text-acento [&>svg]:size-10">{icono}</div>}
      <h3 className="text-xl font-bold text-texto">{titulo}</h3>
      <p className="max-w-sm text-texto-suave">{texto}</p>
      {accion}
    </div>
  );
}
