import { MUESTRA_MINIMA } from "@/lib/coherencia";
import type { MetricasPreguntaVista } from "@/lib/decisiones";

/**
 * Métricas de la sombra por pregunta: aciertos, falsos permisos, bloqueos innecesarios, coincidencia con las
 * reglas, coste y latencia. Con poca muestra se enseña el recuento, **no** el porcentaje: «100 %» sobre dos casos es
 * una cifra cómoda y falsa.
 */

const euros = (n: number) => `${n.toLocaleString("es-ES", { maximumFractionDigits: 4 })} €`;

function Proporcion({ parte, total }: { parte: number; total: number }) {
  if (total < MUESTRA_MINIMA) {
    return (
      <span>
        {parte} de {total}
        <span className="block text-xs">Muestra corta: hacen falta {MUESTRA_MINIMA}.</span>
      </span>
    );
  }
  return <span>{Math.round((parte / total) * 100)} %</span>;
}

export function MetricasSombra({ metricas }: { metricas: readonly MetricasPreguntaVista[] }) {
  return (
    <div className="overflow-x-auto rounded-tarjeta border-2 border-borde">
      <table className="w-full min-w-[60rem] border-collapse text-left">
        <thead className="bg-elevada text-sm text-texto-suave">
          <tr>
            <th className="p-3 font-semibold">Pregunta</th>
            <th className="p-3 font-semibold">Evaluaciones</th>
            <th className="p-3 font-semibold">Con etiqueta humana</th>
            <th className="p-3 font-semibold">Aciertos</th>
            <th className="p-3 font-semibold">Falsos permisos</th>
            <th className="p-3 font-semibold">Bloqueos innecesarios</th>
            <th className="p-3 font-semibold">Coincide con las reglas</th>
            <th className="p-3 font-semibold">Coste y latencia</th>
          </tr>
        </thead>
        <tbody>
          {metricas.map((m) => (
            <tr key={m.pregunta} className="border-t border-borde/60 align-top">
              <td className="p-3">
                <span className="font-semibold text-texto">{m.nombre}</span>
                <span className="block text-xs text-texto-suave">{m.encendida ? "Encendida" : "Apagada"}</span>
              </td>
              <td className="p-3 text-texto-suave">
                {m.total}
                <span className="block text-xs">
                  {m.fallidas} fallidas · {m.sinOpinion} sin opinión
                </span>
              </td>
              <td className="p-3 text-texto-suave">{m.etiquetadas}</td>
              <td className="p-3 text-texto-suave">
                <Proporcion parte={m.aciertos} total={m.etiquetadas} />
              </td>
              <td className="p-3 text-texto-suave">{m.falsosPermisos}</td>
              <td className="p-3 text-texto-suave">{m.bloqueosInnecesarios}</td>
              <td className="p-3 text-texto-suave">
                {m.comparables === 0 ? "—" : <Proporcion parte={m.coincidencias} total={m.comparables} />}
              </td>
              <td className="p-3 text-texto-suave">
                {euros(m.euros)}
                <span className="block text-xs">
                  {m.latenciaMediaMs === null ? "Sin latencia medida" : `${m.latenciaMediaMs} ms de media`}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
