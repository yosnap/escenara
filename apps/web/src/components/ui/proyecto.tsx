import { formatearCreditos, formatearEuros } from "@/lib/generacion";
import {
  type EscenaVista,
  type EstadoAfirmacion,
  type EstadoEscena,
  type EstadoProyecto,
  ETIQUETA_ESTADO_AFIRMACION,
  ETIQUETA_ESTADO_ESCENA,
  ETIQUETA_ESTADO_PROYECTO,
  ETIQUETA_TIPO_AFIRMACION,
  filasDelPlan,
  formatearFecha,
  type PlanVista,
  type TipoAfirmacion,
} from "@/lib/proyectos";
import { Alerta } from "./alerta";
import { cn } from "./cn";

/**
 * Componentes de proyecto: insignias de estado y la tabla de aprobación del plan.
 *
 * Todo lo de aquí es **zona de claridad** y está a propósito sin degradados, sin movimiento y sin color de
 * marca en los bordes: es la pantalla en la que alguien decide gastarse un dinero. Y son componentes puros,
 * sin estado ni efectos, así que la tabla se puede renderizar en un test y comprobar que dice de verdad
 * «estimación» y la fecha del precio con el que se calculó.
 */

const CLASE_INSIGNIA =
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm font-semibold whitespace-nowrap";

const TONO_PROYECTO: Record<EstadoProyecto, string> = {
  borrador: "border-borde text-texto-suave",
  planificado: "border-acento/45 text-acento",
  en_produccion: "border-aviso/45 text-aviso",
  listo: "border-correcto/45 text-correcto",
};

export function InsigniaEstadoProyecto({ estado }: { estado: EstadoProyecto }) {
  return <span className={cn(CLASE_INSIGNIA, TONO_PROYECTO[estado])}>{ETIQUETA_ESTADO_PROYECTO[estado]}</span>;
}

const TONO_ESCENA: Record<EstadoEscena, string> = {
  borrador: "border-borde text-texto-suave",
  aprobada: "border-correcto/45 text-correcto",
  producida: "border-acento/45 text-acento",
};

export function InsigniaEstadoEscena({ estado }: { estado: EstadoEscena }) {
  return <span className={cn(CLASE_INSIGNIA, TONO_ESCENA[estado])}>{ETIQUETA_ESTADO_ESCENA[estado]}</span>;
}

const TONO_AFIRMACION: Record<EstadoAfirmacion, string> = {
  por_verificar: "border-aviso/45 text-aviso",
  verificada: "border-correcto/45 text-correcto",
  corregida: "border-acento/45 text-acento",
  descartada: "border-borde text-texto-suave",
};

/** Etiqueta de una afirmación señalada: qué tipo es y en qué punto de revisión está. */
export function InsigniaAfirmacion({ tipo, estado }: { tipo: TipoAfirmacion; estado: EstadoAfirmacion }) {
  return (
    <span className={cn(CLASE_INSIGNIA, TONO_AFIRMACION[estado])}>
      <span>{ETIQUETA_TIPO_AFIRMACION[tipo]}</span>
      <span aria-hidden>·</span>
      <span>{ETIQUETA_ESTADO_AFIRMACION[estado]}</span>
    </span>
  );
}

/**
 * Tabla de aprobación del plan: una fila por escena con su modelo, su duración y su estimación, el total, el
 * presupuesto autorizado del proyecto y lo que falta para poder aprobar.
 *
 * La palabra «estimación» y la fecha del precio salen de `lib/proyectos.ts`, la misma función que se prueba:
 * no hay forma de que la tabla muestre una cifra de coste sin decir con qué precio se calculó.
 */
export function TablaPlan({ plan, escenas }: { plan: PlanVista; escenas: readonly EscenaVista[] }) {
  const filas = filasDelPlan(escenas);
  const fecha = plan.comprobado === "" ? "" : formatearFecha(plan.comprobado);
  return (
    <section
      aria-label="Plan del proyecto"
      className="flex flex-col gap-3 rounded-tarjeta border-2 border-borde bg-superficie p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold text-texto">Plan y coste</h2>
        <p className="text-sm text-texto-suave">
          {escenas.length === 0
            ? "Añade una escena para ver lo que costaría producirla."
            : fecha === ""
              ? "Los modelos del catálogo no tienen precio registrado, así que no se puede estimar nada: pídeselo a quien administra."
              : `Todas las cifras son una estimación, calculada con el precio del ${fecha}.`}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-left">
          <caption className="sr-only">
            Escenas del proyecto con su modelo, su duración y su coste estimado por escena.
          </caption>
          <thead>
            <tr className="border-b border-borde text-sm text-texto-suave">
              <th scope="col" className="py-2 pr-3 font-semibold">
                Escena
              </th>
              <th scope="col" className="py-2 pr-3 font-semibold">
                Modelos
              </th>
              <th scope="col" className="py-2 pr-3 font-semibold">
                Duración
              </th>
              <th scope="col" className="py-2 pr-3 font-semibold">
                Coste
              </th>
              <th scope="col" className="py-2 font-semibold">
                Estado
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-texto-suave">
                  Todavía no hay escenas que estimar.
                </td>
              </tr>
            )}
            {filas.map((fila) => (
              <tr key={fila.escenaId} className="border-b border-borde/50 align-top">
                <th scope="row" className="py-3 pr-3 font-normal text-texto">
                  <span className="font-mono text-texto-suave">{fila.orden}.</span> {fila.resumen}
                </th>
                <td className="py-3 pr-3 text-texto-suave">{fila.modelos}</td>
                <td className="py-3 pr-3 font-mono text-texto-suave">{fila.segundos} s</td>
                <td className="py-3 pr-3 text-texto">
                  <span className="font-mono">{fila.estimacion}</span>
                  {fila.motivo !== "" && <span className="mt-1 block text-sm text-error">{fila.motivo}</span>}
                </td>
                <td className="py-3">
                  <InsigniaEstadoEscena estado={fila.estado} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold text-texto">
              <th scope="row" colSpan={3} className="py-3 pr-3 text-left">
                Total estimado del proyecto
              </th>
              <td colSpan={2} className="py-3">
                <span className="font-mono">
                  {formatearCreditos(plan.totalCreditos)} (estimación
                  {fecha === "" ? "" : `, precio del ${fecha}`}) ≈ {formatearEuros(plan.totalEuros)}
                </span>
              </td>
            </tr>
            {plan.creditosAsistente > 0 && (
              <tr className="text-texto-suave">
                <th scope="row" colSpan={3} className="py-1 pr-3 text-left font-normal">
                  Ya gastado por el asistente de guion
                </th>
                <td colSpan={2} className="py-1">
                  <span className="font-mono">{formatearCreditos(plan.creditosAsistente)}</span>
                </td>
              </tr>
            )}
            <tr className="text-texto-suave">
              <th scope="row" colSpan={3} className="py-1 pr-3 text-left font-normal">
                Presupuesto autorizado del proyecto
              </th>
              <td colSpan={2} className="py-1">
                <span className="font-mono">
                  {plan.presupuestoCreditos > 0 ? formatearCreditos(plan.presupuestoCreditos) : "sin fijar"}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {plan.margen > 0 && (
        <p className="text-sm text-texto-suave">
          La estimación lleva un margen prudente del {plan.margen} %: alguno de los modelos todavía no tiene el coste
          medido y revisado en esta instalación.
        </p>
      )}
      {plan.impedimentos.length > 0 && (
        <Alerta
          tipo="bloqueo"
          titulo="Para poder aprobar el plan falta esto:"
          anuncio="ninguno"
          protege
          elementos={plan.impedimentos.map((texto) => ({ texto }))}
        />
      )}
      {plan.creditosAsistente > 0 && (
        <p className="text-sm text-texto-suave">
          Lo que ya se ha gastado el asistente escribiendo este guion también cuenta contra el presupuesto del proyecto:
          es dinero del mismo bote.
        </p>
      )}
      <p className="text-sm text-texto-suave">
        El importe final lo decide el proveedor y se paga con tu propia clave. Escenara solo estima con el precio que
        tiene registrado.
      </p>
    </section>
  );
}
