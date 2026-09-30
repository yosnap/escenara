import { TablaDesplazable } from "@/components/ui/tabla-desplazable";
import { NOMBRE_VEREDICTO } from "@/lib/coherencia";
import { ETIQUETA_ESTADO_CONTROL } from "@/lib/controles";
import {
  type DecisionRegistradaVista,
  type EtiquetaHumana,
  NOMBRE_ACCION,
  NOMBRE_PUERTA,
  type OpinionSombraVista,
} from "@/lib/decisiones";
import { fechaYHora } from "@/lib/fechas";

/**
 * Las últimas decisiones del motor, cada una con **qué se miró**, los umbrales, la versión de las reglas, lo que
 * opinó la sombra y la etiqueta humana que le corresponde. Sin nombres ni texto de nadie.
 */

const NOMBRE_SUJETO: Record<string, string> = {
  escena: "Escena",
  trabajo: "Envío de «Crear»",
  montaje: "Montaje",
  proyecto: "Proyecto",
};

const NOMBRE_TIPO: Record<string, string> = {
  fotograma: "fotograma",
  animacion: "clip",
  voz: "voz",
  montaje: "exportación",
  asistente: "asistente de guion",
};

/** Lo que la persona resolvió sobre las afirmaciones de la escena, que es la etiqueta de la sombra. */
const ETIQUETA_AFIRMACIONES: Record<EtiquetaHumana, string> = {
  rechaza: "Había que verificar (verificada o corregida)",
  acepta: "No aplicaba (descartada)",
};

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)} %`);

function Opinion({ opinion }: { opinion: OpinionSombraVista }) {
  if (opinion.error !== "") {
    return <span className="block text-sm text-texto-suave">Falló ({opinion.error}): no opina.</span>;
  }
  const coincide =
    opinion.coincide === null
      ? ""
      : opinion.coincide
        ? " Coincide con la regla de afirmaciones."
        : " No coincide con la regla de afirmaciones.";
  return (
    <span className="block text-sm text-texto-suave">
      <strong className="text-texto">{opinion.veredicto ? NOMBRE_VEREDICTO[opinion.veredicto] : "—"}</strong> ·
      confianza {pct(opinion.confianza)} (umbral {pct(opinion.umbral)}){opinion.reutilizada ? " · reutilizada" : ""}.
      {coincide} {opinion.evidencia}
    </span>
  );
}

export function TablaDecisiones({ decisiones }: { decisiones: readonly DecisionRegistradaVista[] }) {
  return (
    <TablaDesplazable etiqueta="Decisiones registradas" className="rounded-tarjeta border-2 border-borde">
      <table className="w-full min-w-[64rem] border-collapse text-left">
        <thead className="bg-elevada text-sm text-texto-suave">
          <tr>
            <th className="p-3 font-semibold">Cuándo y qué</th>
            <th className="p-3 font-semibold">Decisión</th>
            <th className="p-3 font-semibold">Reglas y evidencia</th>
            <th className="p-3 font-semibold">Sombra</th>
            <th className="p-3 font-semibold">Afirmaciones de la escena</th>
          </tr>
        </thead>
        <tbody>
          {decisiones.map((d) => (
            <tr key={d.id} className="border-t border-borde/60 align-top">
              <td className="p-3 text-sm text-texto-suave">
                <span className="block text-texto">{fechaYHora(d.fecha)}</span>
                {NOMBRE_SUJETO[d.sujeto] ?? d.sujeto} · {NOMBRE_TIPO[d.tipo] ?? d.tipo}
                <span className="block text-xs">Puerta: {NOMBRE_PUERTA[d.puerta]}</span>
              </td>
              <td className="p-3 text-sm">
                <span className="block font-semibold text-texto">{d.accion ? NOMBRE_ACCION[d.accion] : "—"}</span>
                <span className="block text-texto-suave">{ETIQUETA_ESTADO_CONTROL[d.estado]}</span>
                <span className="block text-xs text-texto-suave">Reglas {d.reglasVersion}</span>
              </td>
              <td className="p-3 text-sm text-texto-suave">
                {d.reglas.length === 0 ? (
                  <span className="block">Ninguna regla saltó.</span>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {d.reglas.map((r) => (
                      <li key={r.regla}>
                        <strong className="text-texto">{r.regla}</strong>: {r.motivo}
                      </li>
                    ))}
                  </ul>
                )}
                {(d.evidencia.length > 0 || d.umbrales.length > 0) && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-texto">Qué se miró</summary>
                    <ul className="mt-1 flex flex-col gap-1 text-xs">
                      {/* alerta-permitida: son los hechos que miró el motor, no problemas que haya que resolver. */}
                      {[...d.evidencia, ...d.umbrales].map((linea) => (
                        <li key={linea}>{linea}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </td>
              <td className="p-3">
                {d.sombra.length === 0 ? (
                  <span className="text-sm text-texto-suave">Sin evaluar</span>
                ) : (
                  d.sombra.map((o) => <Opinion key={`${o.pregunta}-${o.evidencia}-${o.error}`} opinion={o} />)
                )}
              </td>
              <td className="p-3 text-sm text-texto-suave">
                {d.etiqueta ? ETIQUETA_AFIRMACIONES[d.etiqueta] : "Nadie las ha resuelto"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TablaDesplazable>
  );
}
